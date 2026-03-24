import { useEffect, useMemo, useState } from "react";
import {
  api,
  type ApiInstrumentSearchResult,
  type LlmProvider,
  type LlmProviderOption
} from "./api";
import {
  SearchDropdown,
  type SearchDropdownOption
} from "./components/SearchDropdown";

type Env = "sandbox" | "prod";

type BacktestResult = {
  backtestId: string;
  candlesCount: number;
  report: {
    metrics: {
      startEquity: number;
      endEquity: number;
      returnPct: number;
      maxDrawdownPct: number;
      tradesCount: number;
      winRatePct: number;
    };
    trades: Array<{ side: string; ts: string; price: number; qty: number; fee: number; pnl?: number }>;
  };
};

const reportMetricHelp = {
  Return: "Portfolio return for the full backtest period: (end equity - start equity) / start equity.",
  "Max DD": "Maximum drawdown: the largest drop in equity from a previous peak during the test.",
  Trades: "Total trade log entries. In the current implementation this counts both BUY and SELL rows.",
  "Win Rate": "Share of profitable SELL trades among all SELL trades.",
  "End Equity": "Final portfolio value after all trades, fees, slippage, and forced close of any open position."
} satisfies Record<string, string>;

const tradeColumnHelp = {
  Side: "Trade direction: BUY opens a position, SELL closes it.",
  Time: "Timestamp of the candle where the moving-average signal triggered the trade.",
  Price: "Execution price after slippage is applied.",
  Qty: "Quantity bought or sold. Rounded down to fit available cash.",
  Fee: "Commission charged for this trade.",
  PnL: "Realized profit or loss on SELL. BUY rows do not have realized PnL yet."
} satisfies Record<string, string>;

const fallbackProviderOptions: LlmProviderOption[] = [
  { provider: "mock", models: ["mock-echo-v1"], enabled: true },
  { provider: "claude", models: ["claude-3-5-haiku-latest"], enabled: false }
];

const daysAgoLocal = (days: number) => {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const tzOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - tzOffsetMs).toISOString().slice(0, 16);
};

const nowLocal = () => {
  const date = new Date();
  const tzOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - tzOffsetMs).toISOString().slice(0, 16);
};

const strategyTemplate = `// Strategy template (phase 1):
// Code is versioned and stored, runtime uses params below for MA crossover simulation.

export const strategy = {
  kind: "ma_crossover",
  shortPeriod: 20,
  longPeriod: 50,
  positionSize: 1
};
`;

const instrumentRecentStorageKey = "invest-codex:recent-instruments";

const toInstrumentOption = (instrument: ApiInstrumentSearchResult): SearchDropdownOption => ({
  id: instrument.instrumentId,
  label:
    instrument.ticker && instrument.name
      ? `${instrument.ticker} · ${instrument.name}`
      : instrument.name || instrument.ticker || instrument.instrumentId,
  description: [
    instrument.classCode || null,
    instrument.instrumentType || null,
    instrument.uid ? `uid ${instrument.uid}` : null,
    instrument.figi ? `figi ${instrument.figi}` : null
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ")
});

const fallbackInstrumentOption = (instrumentId: string): SearchDropdownOption => ({
  id: instrumentId,
  label: instrumentId,
  description: "Manual instrument ID"
});

export default function App() {
  const [env, setEnv] = useState<Env>("sandbox");
  const [accounts, setAccounts] = useState<Array<{ accountId: string; name: string; type: string; status: string }>>([]);
  const [strategyId, setStrategyId] = useState<string | undefined>();
  const [strategyVersionId, setStrategyVersionId] = useState<string | undefined>();
  const [version, setVersion] = useState<number | undefined>();

  const [strategyName, setStrategyName] = useState("MA Crossover MVP");
  const [code, setCode] = useState(strategyTemplate);
  const [shortPeriod, setShortPeriod] = useState(20);
  const [longPeriod, setLongPeriod] = useState(50);
  const [positionSize, setPositionSize] = useState(1);

  const [instrumentId, setInstrumentId] = useState("BBG004730N88");
  const [selectedInstrument, setSelectedInstrument] = useState<SearchDropdownOption | null>(
    fallbackInstrumentOption("BBG004730N88")
  );
  const [instrumentSearchError, setInstrumentSearchError] = useState<string | null>(null);
  const [interval, setInterval] = useState<"1m" | "5m" | "15m" | "1h" | "1d">("1h");
  const [from, setFrom] = useState(daysAgoLocal(30));
  const [to, setTo] = useState(nowLocal());
  const [feesBps, setFeesBps] = useState(3);
  const [slippageBps, setSlippageBps] = useState(5);
  const [initialCash, setInitialCash] = useState(100_000);

  const [llmOptions, setLlmOptions] = useState<LlmProviderOption[]>(fallbackProviderOptions);
  const [llmProvider, setLlmProvider] = useState<LlmProvider>("mock");
  const [llmModel, setLlmModel] = useState("mock-echo-v1");
  const [llmPrompt, setLlmPrompt] = useState("");
  const [llmSystemPrompt, setLlmSystemPrompt] = useState(
    "You are a practical trading copilot. Suggest safer and testable improvements."
  );
  const [llmResponse, setLlmResponse] = useState("");
  const [llmLoading, setLlmLoading] = useState(false);

  const [candlesCount, setCandlesCount] = useState<number | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateRangeIso = useMemo(
    () => ({
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString()
    }),
    [from, to]
  );

  const activeProviderModels = useMemo(
    () => llmOptions.find((option) => option.provider === llmProvider)?.models ?? [],
    [llmOptions, llmProvider]
  );

  const selectedInstrumentCaption = useMemo(() => {
    if (selectedInstrument) {
      return selectedInstrument.description || `id ${selectedInstrument.id}`;
    }

    if (instrumentId.trim()) {
      return `Manual ID: ${instrumentId.trim()}`;
    }

    return "Type ticker, name, UID, or FIGI and pick a suggestion.";
  }, [instrumentId, selectedInstrument]);

  useEffect(() => {
    let isMounted = true;

    const loadOptions = async () => {
      try {
        const options = await api.getLlmOptions();
        if (!isMounted) {
          return;
        }

        setLlmOptions(options.providers);
        setLlmProvider(options.defaultProvider);
        setLlmModel(options.defaultModel);
      } catch {
        if (!isMounted) {
          return;
        }
        setLlmOptions(fallbackProviderOptions);
        setLlmProvider("mock");
        setLlmModel("mock-echo-v1");
      }
    };

    void loadOptions();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (activeProviderModels.length === 0) {
      return;
    }

    if (!activeProviderModels.includes(llmModel)) {
      setLlmModel(activeProviderModels[0] ?? "");
    }
  }, [activeProviderModels, llmModel]);

  const buildCopilotPrompt = () => {
    return [
      "Review this strategy and suggest improvements:",
      "",
      "Strategy code:",
      code,
      "",
      "Current params:",
      JSON.stringify(
        {
          shortPeriod,
          longPeriod,
          positionSize,
          interval,
          instrumentId,
          feesBps,
          slippageBps
        },
        null,
        2
      )
    ].join("\n");
  };

  const saveStrategy = async () => {
    setLoading(true);
    setError(null);
    try {
      const strategyPayload = {
        ...(strategyId ? { strategyId } : {}),
        name: strategyName,
        code,
        params: {
          kind: "ma_crossover" as const,
          shortPeriod,
          longPeriod,
          positionSize
        },
        riskConfig: {
          maxPositionNotional: 500_000,
          killSwitchEnabled: true
        }
      };

      const response = await api.createStrategy({
        ...strategyPayload
      });

      setStrategyId(response.strategyId);
      setStrategyVersionId(response.strategyVersionId);
      setVersion(response.version);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save strategy");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const loadAccounts = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.listAccounts(env);
      setAccounts(response.accounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  };

  const loadCandles = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.loadCandles({
        instrumentId,
        interval,
        from: dateRangeIso.from,
        to: dateRangeIso.to,
        env
      });
      setCandlesCount(response.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load candles");
    } finally {
      setLoading(false);
    }
  };

  const runBacktest = async () => {
    setLoading(true);
    setError(null);

    try {
      let versionId = strategyVersionId;
      if (!versionId) {
        const strategyPayload = {
          ...(strategyId ? { strategyId } : {}),
          name: strategyName,
          code,
          params: {
            kind: "ma_crossover" as const,
            shortPeriod,
            longPeriod,
            positionSize
          }
        };

        const saveResponse = await api.createStrategy({
          ...strategyPayload
        });

        setStrategyId(saveResponse.strategyId);
        setStrategyVersionId(saveResponse.strategyVersionId);
        setVersion(saveResponse.version);
        versionId = saveResponse.strategyVersionId;
      }

      const response = await api.runBacktest({
        strategyVersionId: versionId,
        instrumentId,
        interval,
        from: dateRangeIso.from,
        to: dateRangeIso.to,
        feesBps,
        slippageBps,
        initialCash,
        env
      });

      setCandlesCount(response.candlesCount);
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run backtest");
    } finally {
      setLoading(false);
    }
  };

  const runCopilot = async () => {
    setLlmLoading(true);
    setError(null);

    try {
      const prompt = llmPrompt.trim() || buildCopilotPrompt();
      const systemPrompt = llmSystemPrompt.trim();

      const response = await api.chatLlm({
        provider: llmProvider,
        model: llmModel,
        prompt,
        ...(systemPrompt ? { systemPrompt } : {})
      });

      setLlmResponse(response.text);
      if (!llmPrompt.trim()) {
        setLlmPrompt(prompt);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to query LLM");
    } finally {
      setLlmLoading(false);
    }
  };

  const loadInstrumentOptions = async (query: string) => {
    const response = await api.searchInstruments({
      query,
      env,
      limit: 8
    });

    return response.instruments.map(toInstrumentOption);
  };

  return (
    <div className="min-h-screen text-neutral-100">
      <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Invest Codex IDE by Codex</h1>
            <p className="text-xs text-neutral-400">Phase 1 MVP: strategy versioning, candles ingestion, deterministic backtest</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-neutral-400">Env</label>
            <select
              className="rounded border border-neutral-700 bg-surface-900 px-3 py-1 text-sm"
              value={env}
              onChange={(event) => setEnv(event.target.value as Env)}
            >
              <option value="sandbox">sandbox</option>
              <option value="prod">prod</option>
            </select>
            <button
              className="rounded bg-emerald-600 px-3 py-1 text-sm font-medium hover:bg-emerald-500 disabled:opacity-60"
              onClick={loadAccounts}
              disabled={loading}
            >
              Load Accounts
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-4 p-4 lg:grid-cols-[340px_1fr]">
        <aside className="space-y-4 rounded-xl border border-neutral-800 bg-surface-900/80 p-4">
          <section>
            <h2 className="mb-2 text-sm font-semibold">Broker Accounts</h2>
            <div className="space-y-2 text-xs text-neutral-300">
              {accounts.length === 0 ? (
                <p className="rounded border border-neutral-800 bg-surface-800 p-2 text-neutral-500">No accounts loaded</p>
              ) : (
                accounts.map((account) => (
                  <div key={account.accountId} className="rounded border border-neutral-800 bg-surface-800 p-2">
                    <div className="font-medium">{account.name}</div>
                    <div className="text-neutral-400">{account.accountId}</div>
                    <div className="text-neutral-500">
                      {account.type} · {account.status}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold">Backtest Setup</h2>
            <div className="grid grid-cols-1 gap-2 text-sm">
              <label className="space-y-1">
                <span className="text-neutral-400">Instrument Search</span>
                <SearchDropdown
                  value={selectedInstrument}
                  loadOptions={loadInstrumentOptions}
                  storageKey={instrumentRecentStorageKey}
                  placeholder="Ticker, name, UID, or FIGI"
                  onSearchError={setInstrumentSearchError}
                  onQueryChange={(query) => {
                    setInstrumentSearchError(null);
                    setInstrumentId(query.trim());
                    setSelectedInstrument(null);
                  }}
                  onSelect={(option) => {
                    setInstrumentSearchError(null);
                    setSelectedInstrument(option);
                    setInstrumentId(option.id);
                  }}
                />
                <div className="mt-1 text-xs text-neutral-500">{selectedInstrumentCaption}</div>
                {instrumentSearchError ? (
                  <div className="mt-1 text-xs text-amber-300">{instrumentSearchError}</div>
                ) : null}
              </label>

              <label className="space-y-1">
                <span className="text-neutral-400">Interval</span>
                <select
                  className="w-full rounded border border-neutral-700 bg-surface-800 px-3 py-2"
                  value={interval}
                  onChange={(event) => setInterval(event.target.value as typeof interval)}
                >
                  <option value="1m">1m</option>
                  <option value="5m">5m</option>
                  <option value="15m">15m</option>
                  <option value="1h">1h</option>
                  <option value="1d">1d</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-neutral-400">From</span>
                <input
                  type="datetime-local"
                  className="w-full rounded border border-neutral-700 bg-surface-800 px-3 py-2"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </label>

              <label className="space-y-1">
                <span className="text-neutral-400">To</span>
                <input
                  type="datetime-local"
                  className="w-full rounded border border-neutral-700 bg-surface-800 px-3 py-2"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                />
              </label>

              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1">
                  <span className="text-neutral-400">Fees (bps)</span>
                  <input
                    type="number"
                    className="w-full rounded border border-neutral-700 bg-surface-800 px-2 py-2"
                    value={feesBps}
                    onChange={(event) => setFeesBps(Number(event.target.value))}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-neutral-400">Slip (bps)</span>
                  <input
                    type="number"
                    className="w-full rounded border border-neutral-700 bg-surface-800 px-2 py-2"
                    value={slippageBps}
                    onChange={(event) => setSlippageBps(Number(event.target.value))}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-neutral-400">Cash</span>
                  <input
                    type="number"
                    className="w-full rounded border border-neutral-700 bg-surface-800 px-2 py-2"
                    value={initialCash}
                    onChange={(event) => setInitialCash(Number(event.target.value))}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  className="rounded border border-cyan-500 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-60"
                  onClick={loadCandles}
                  disabled={loading}
                >
                  Sync Candles
                </button>
                <button
                  className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-60"
                  onClick={runBacktest}
                  disabled={loading}
                >
                  Run Backtest
                </button>
              </div>
            </div>
          </section>
        </aside>

        <section className="space-y-4">
          <div className="rounded-xl border border-neutral-800 bg-surface-900/70 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Strategy Workspace</h2>
              <div className="text-xs text-neutral-400">
                {strategyVersionId ? (
                  <span>
                    Strategy: <span className="text-neutral-200">{strategyId}</span> · v{version}
                  </span>
                ) : (
                  <span>Not saved yet</span>
                )}
              </div>
            </div>

            <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-4">
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm text-neutral-400">Name</span>
                <input
                  className="w-full rounded border border-neutral-700 bg-surface-800 px-3 py-2"
                  value={strategyName}
                  onChange={(event) => setStrategyName(event.target.value)}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-neutral-400">Short MA</span>
                <input
                  type="number"
                  className="w-full rounded border border-neutral-700 bg-surface-800 px-3 py-2"
                  value={shortPeriod}
                  onChange={(event) => setShortPeriod(Number(event.target.value))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-neutral-400">Long MA</span>
                <input
                  type="number"
                  className="w-full rounded border border-neutral-700 bg-surface-800 px-3 py-2"
                  value={longPeriod}
                  onChange={(event) => setLongPeriod(Number(event.target.value))}
                />
              </label>
            </div>

            <label className="mb-3 block space-y-1">
              <span className="text-sm text-neutral-400">Position Size (0-1)</span>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="1"
                className="w-48 rounded border border-neutral-700 bg-surface-800 px-3 py-2"
                value={positionSize}
                onChange={(event) => setPositionSize(Number(event.target.value))}
              />
            </label>

            <textarea
              className="h-80 w-full rounded-lg border border-neutral-800 bg-[#0c1017] p-3 font-mono text-sm text-neutral-200"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />

            <div className="mt-3 flex items-center gap-2">
              <button
                className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 disabled:opacity-60"
                onClick={saveStrategy}
                disabled={loading}
              >
                Save Version
              </button>
              {candlesCount !== null ? (
                <span className="text-xs text-neutral-400">Candles synced: {candlesCount}</span>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-surface-900/70 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">AI Copilot</h2>
              <span className="text-xs text-neutral-500">Provider + model selectable</span>
            </div>

            <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm text-neutral-400">Provider</span>
                <select
                  className="w-full rounded border border-neutral-700 bg-surface-800 px-3 py-2"
                  value={llmProvider}
                  onChange={(event) => setLlmProvider(event.target.value as LlmProvider)}
                  disabled={llmLoading}
                >
                  {llmOptions.map((option) => (
                    <option key={option.provider} value={option.provider} disabled={!option.enabled}>
                      {option.provider}
                      {option.enabled ? "" : " (missing key)"}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-sm text-neutral-400">Model</span>
                <select
                  className="w-full rounded border border-neutral-700 bg-surface-800 px-3 py-2"
                  value={llmModel}
                  onChange={(event) => setLlmModel(event.target.value)}
                  disabled={llmLoading}
                >
                  {activeProviderModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="mb-3 block space-y-1">
              <span className="text-sm text-neutral-400">System Prompt</span>
              <textarea
                className="h-16 w-full rounded border border-neutral-700 bg-surface-800 px-3 py-2 text-sm"
                value={llmSystemPrompt}
                onChange={(event) => setLlmSystemPrompt(event.target.value)}
                disabled={llmLoading}
              />
            </label>

            <label className="mb-3 block space-y-1">
              <span className="text-sm text-neutral-400">Prompt</span>
              <textarea
                className="h-28 w-full rounded border border-neutral-700 bg-surface-800 px-3 py-2 text-sm"
                value={llmPrompt}
                onChange={(event) => setLlmPrompt(event.target.value)}
                placeholder="Leave empty to auto-use current strategy context"
                disabled={llmLoading}
              />
            </label>

            <div className="mb-3 flex gap-2">
              <button
                className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 disabled:opacity-60"
                onClick={() => setLlmPrompt(buildCopilotPrompt())}
                disabled={llmLoading}
              >
                Use Strategy Context
              </button>
              <button
                className="rounded bg-emerald-600 px-3 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-60"
                onClick={runCopilot}
                disabled={llmLoading}
              >
                {llmLoading ? "Asking..." : "Ask Copilot"}
              </button>
            </div>

            <div className="rounded border border-neutral-800 bg-[#0c1017] p-3">
              <div className="mb-2 text-xs text-neutral-500">Response</div>
              <pre className="whitespace-pre-wrap text-sm text-neutral-200">
                {llmResponse || "No response yet"}
              </pre>
            </div>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-surface-900/70 p-4">
            <h2 className="mb-3 text-sm font-semibold">Backtest Report</h2>
            {result ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                  <Metric
                    label="Return"
                    value={`${result.report.metrics.returnPct.toFixed(2)}%`}
                    hint={reportMetricHelp.Return}
                  />
                  <Metric
                    label="Max DD"
                    value={`${result.report.metrics.maxDrawdownPct.toFixed(2)}%`}
                    hint={reportMetricHelp["Max DD"]}
                  />
                  <Metric
                    label="Trades"
                    value={String(result.report.metrics.tradesCount)}
                    hint={reportMetricHelp.Trades}
                  />
                  <Metric
                    label="Win Rate"
                    value={`${result.report.metrics.winRatePct.toFixed(2)}%`}
                    hint={reportMetricHelp["Win Rate"]}
                  />
                  <Metric
                    label="End Equity"
                    value={result.report.metrics.endEquity.toFixed(2)}
                    hint={reportMetricHelp["End Equity"]}
                  />
                </div>

                <div className="overflow-auto rounded border border-neutral-800">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-surface-800 text-neutral-300">
                      <tr>
                        <th className="px-3 py-2">
                          <HeaderWithHint label="Side" hint={tradeColumnHelp.Side} />
                        </th>
                        <th className="px-3 py-2">
                          <HeaderWithHint label="Time" hint={tradeColumnHelp.Time} />
                        </th>
                        <th className="px-3 py-2">
                          <HeaderWithHint label="Price" hint={tradeColumnHelp.Price} />
                        </th>
                        <th className="px-3 py-2">
                          <HeaderWithHint label="Qty" hint={tradeColumnHelp.Qty} />
                        </th>
                        <th className="px-3 py-2">
                          <HeaderWithHint label="Fee" hint={tradeColumnHelp.Fee} />
                        </th>
                        <th className="px-3 py-2">
                          <HeaderWithHint label="PnL" hint={tradeColumnHelp.PnL} />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.report.trades.slice(0, 30).map((trade, index) => (
                        <tr key={`${trade.ts}-${index}`} className="border-t border-neutral-800">
                          <td className={`px-3 py-2 ${trade.side === "BUY" ? "text-emerald-300" : "text-amber-300"}`}>{trade.side}</td>
                          <td className="px-3 py-2 text-neutral-300">{new Date(trade.ts).toLocaleString()}</td>
                          <td className="px-3 py-2">{trade.price.toFixed(4)}</td>
                          <td className="px-3 py-2">{trade.qty}</td>
                          <td className="px-3 py-2">{trade.fee.toFixed(4)}</td>
                          <td className="px-3 py-2">{typeof trade.pnl === "number" ? trade.pnl.toFixed(4) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-sm text-neutral-400">Run a backtest to see metrics and trade log.</p>
            )}
          </div>

          {error ? <div className="rounded border border-red-800 bg-red-900/25 px-3 py-2 text-sm text-red-200">{error}</div> : null}
        </section>
      </main>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded border border-neutral-800 bg-surface-800 px-3 py-2">
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-neutral-500">
        <span>{label}</span>
        {hint ? <InfoHint text={hint} /> : null}
      </div>
      <div className="mt-1 text-sm font-semibold text-neutral-100">{value}</div>
    </div>
  );
}

function HeaderWithHint({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex items-center gap-1">
      <span>{label}</span>
      <InfoHint text={hint} />
    </div>
  );
}

function InfoHint({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex items-center">
      <span
        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-neutral-600 text-[10px] leading-none text-neutral-400 transition-colors group-hover:border-neutral-400 group-hover:text-neutral-200"
        tabIndex={0}
        aria-label={text}
        title={text}
      >
        ?
      </span>
      <span className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-20 hidden w-56 -translate-x-1/2 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-[11px] normal-case tracking-normal text-neutral-200 shadow-lg group-hover:block group-focus-within:block">
        {text}
      </span>
    </span>
  );
}
