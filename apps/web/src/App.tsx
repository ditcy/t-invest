import { useEffect, useMemo, useState } from "react";
import {
  api,
  type ApiBacktestRunResponse,
  type ApiBacktestSummary,
  type ApiCandleRequest,
  type ApiInstrumentSearchResult,
  type ApiStrategyCreateRequest,
  type LlmProvider,
  type LlmProviderOption
} from "./api";
import { BacktestRunPage } from "./components/BacktestRunPage";
import { BacktestCandlesPanel } from "./components/BacktestCandlesPanel";
import { BacktestReportView } from "./components/BacktestReportView";
import {
  SearchDropdown,
  type SearchDropdownOption
} from "./components/SearchDropdown";

type Env = "sandbox" | "prod";

type AppRoute =
  | { name: "workspace" }
  | { name: "backtest"; backtestId: string };

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

const defaultRiskConfig = {
  maxPositionNotional: 500_000,
  killSwitchEnabled: true
} satisfies Record<string, unknown>;

const instrumentRecentStorageKey = "invest-codex:recent-instruments";

const parseRoute = (pathname: string): AppRoute => {
  const match = pathname.match(/^\/backtests\/([0-9a-f-]+)$/i);
  if (match?.[1]) {
    return { name: "backtest", backtestId: match[1] };
  }

  return { name: "workspace" };
};

const toInstrumentOption = (
  instrument: ApiInstrumentSearchResult
): SearchDropdownOption => ({
  id: instrument.instrumentId,
  label:
    instrument.ticker && instrument.name
      ? `${instrument.ticker} - ${instrument.name}`
      : instrument.name || instrument.ticker || instrument.instrumentId,
  description: [
    instrument.classCode || null,
    instrument.instrumentType || null,
    instrument.uid ? `uid ${instrument.uid}` : null,
    instrument.figi ? `figi ${instrument.figi}` : null
  ]
    .filter((part): part is string => Boolean(part))
    .join(" - ")
});

const fallbackInstrumentOption = (instrumentId: string): SearchDropdownOption => ({
  id: instrumentId,
  label: instrumentId,
  description: "Manual instrument ID"
});

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() => parseRoute(window.location.pathname));

  const [env, setEnv] = useState<Env>("sandbox");
  const [accounts, setAccounts] = useState<
    Array<{ accountId: string; name: string; type: string; status: string }>
  >([]);
  const [strategyId, setStrategyId] = useState<string | undefined>();
  const [strategyVersionId, setStrategyVersionId] = useState<string | undefined>();
  const [version, setVersion] = useState<number | undefined>();
  const [savedStrategyFingerprint, setSavedStrategyFingerprint] = useState<string | null>(null);

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
  const [result, setResult] = useState<ApiBacktestRunResponse | null>(null);
  const [lastBacktestCandleRequest, setLastBacktestCandleRequest] =
    useState<ApiCandleRequest | null>(null);
  const [recentBacktests, setRecentBacktests] = useState<ApiBacktestSummary[]>([]);
  const [recentBacktestsLoading, setRecentBacktestsLoading] = useState(false);
  const [recentBacktestsError, setRecentBacktestsError] = useState<string | null>(null);
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

  const strategyDefinition = useMemo(
    () => ({
      name: strategyName,
      code,
      params: {
        kind: "ma_crossover" as const,
        shortPeriod,
        longPeriod,
        positionSize
      },
      riskConfig: defaultRiskConfig
    }),
    [code, longPeriod, positionSize, shortPeriod, strategyName]
  );

  const strategyFingerprint = useMemo(
    () => JSON.stringify(strategyDefinition),
    [strategyDefinition]
  );

  const isStrategyDirty = useMemo(() => {
    if (!strategyVersionId || !savedStrategyFingerprint) {
      return true;
    }

    return savedStrategyFingerprint !== strategyFingerprint;
  }, [savedStrategyFingerprint, strategyFingerprint, strategyVersionId]);

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
    const onPopState = () => {
      setRoute(parseRoute(window.location.pathname));
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

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

  useEffect(() => {
    let isMounted = true;

    const loadRecentBacktests = async () => {
      setRecentBacktestsLoading(true);
      setRecentBacktestsError(null);

      try {
        const response = await api.listBacktests({ limit: 8 });
        if (!isMounted) {
          return;
        }

        setRecentBacktests(response.backtests);
      } catch (err) {
        if (!isMounted) {
          return;
        }

        setRecentBacktestsError(
          err instanceof Error ? err.message : "Failed to load saved runs"
        );
      } finally {
        if (isMounted) {
          setRecentBacktestsLoading(false);
        }
      }
    };

    void loadRecentBacktests();

    return () => {
      isMounted = false;
    };
  }, []);

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

  const navigateToWorkspace = () => {
    window.history.pushState({}, "", "/");
    setRoute({ name: "workspace" });
  };

  const navigateToBacktest = (backtestId: string) => {
    window.history.pushState({}, "", `/backtests/${backtestId}`);
    setRoute({ name: "backtest", backtestId });
  };

  const refreshRecentBacktests = async () => {
    setRecentBacktestsLoading(true);
    setRecentBacktestsError(null);

    try {
      const response = await api.listBacktests({ limit: 8 });
      setRecentBacktests(response.backtests);
    } catch (err) {
      setRecentBacktestsError(
        err instanceof Error ? err.message : "Failed to load saved runs"
      );
    } finally {
      setRecentBacktestsLoading(false);
    }
  };

  const buildStrategyPayload = (): ApiStrategyCreateRequest => ({
    ...(strategyId ? { strategyId } : {}),
    ...strategyDefinition
  });

  const buildCandleRequest = () => ({
    instrumentId,
    interval,
    from: dateRangeIso.from,
    to: dateRangeIso.to,
    env
  });

  const persistStrategyVersion = async () => {
    const response = await api.createStrategy(buildStrategyPayload());
    setStrategyId(response.strategyId);
    setStrategyVersionId(response.strategyVersionId);
    setVersion(response.version);
    setSavedStrategyFingerprint(strategyFingerprint);
    return response;
  };

  const saveStrategy = async () => {
    setLoading(true);
    setError(null);

    try {
      await persistStrategyVersion();
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
      if (!versionId || isStrategyDirty) {
        const saveResponse = await persistStrategyVersion();
        versionId = saveResponse.strategyVersionId;
      }

      const candleRequest = buildCandleRequest();

      const response = await api.runBacktest({
        strategyVersionId: versionId,
        ...candleRequest,
        feesBps,
        slippageBps,
        initialCash,
      });

      setCandlesCount(response.candlesCount);
      setResult(response);
      setLastBacktestCandleRequest(candleRequest);
      void refreshRecentBacktests();
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

  if (route.name === "backtest") {
    return (
      <BacktestRunPage
        backtestId={route.backtestId}
        onNavigateHome={navigateToWorkspace}
      />
    );
  }

  return (
    <div className="min-h-screen text-neutral-100">
      <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Invest Codex IDE by Codex</h1>
            <p className="text-xs text-neutral-400">
              Phase 1 MVP: strategy versioning, saved backtest runs, deterministic reports
            </p>
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
              type="button"
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
                <p className="rounded border border-neutral-800 bg-surface-800 p-2 text-neutral-500">
                  No accounts loaded
                </p>
              ) : (
                accounts.map((account) => (
                  <div
                    key={account.accountId}
                    className="rounded border border-neutral-800 bg-surface-800 p-2"
                  >
                    <div className="font-medium">{account.name}</div>
                    <div className="text-neutral-400">{account.accountId}</div>
                    <div className="text-neutral-500">
                      {account.type} - {account.status}
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
                  type="button"
                >
                  Sync Candles
                </button>
                <button
                  className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-60"
                  onClick={runBacktest}
                  disabled={loading}
                  type="button"
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
                    Strategy: <span className="text-neutral-200">{strategyId}</span> - v
                    {version}
                    {isStrategyDirty ? " - unsaved changes" : ""}
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

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 disabled:opacity-60"
                onClick={saveStrategy}
                disabled={loading}
                type="button"
              >
                Save Version
              </button>
              {candlesCount !== null ? (
                <span className="text-xs text-neutral-400">Candles synced: {candlesCount}</span>
              ) : null}
              {result ? (
                <button
                  className="rounded border border-cyan-700 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-500/20"
                  onClick={() => navigateToBacktest(result.backtestId)}
                  type="button"
                >
                  Open Saved Run
                </button>
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
                    <option
                      key={option.provider}
                      value={option.provider}
                      disabled={!option.enabled}
                    >
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
                type="button"
              >
                Use Strategy Context
              </button>
              <button
                className="rounded bg-emerald-600 px-3 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-60"
                onClick={runCopilot}
                disabled={llmLoading}
                type="button"
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
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Backtest Report</h2>
              {result ? (
                <button
                  className="text-xs text-cyan-300 hover:text-cyan-200"
                  onClick={() => navigateToBacktest(result.backtestId)}
                  type="button"
                >
                  View saved page
                </button>
              ) : null}
            </div>
            {result ? (
              <div className="space-y-4">
                <BacktestCandlesPanel
                  title="Candles + Trades"
                  subtitle="Current run chart with entry and exit markers from the trade log."
                  request={lastBacktestCandleRequest}
                  trades={result.report.trades}
                />
                <BacktestReportView report={result.report} />
              </div>
            ) : (
              <p className="text-sm text-neutral-400">
                Run a backtest to see metrics and trade log.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-neutral-800 bg-surface-900/70 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Saved Runs</h2>
              <button
                className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs hover:bg-neutral-800 disabled:opacity-60"
                onClick={refreshRecentBacktests}
                disabled={recentBacktestsLoading}
                type="button"
              >
                Refresh
              </button>
            </div>

            {recentBacktestsError ? (
              <div className="mb-3 rounded border border-red-800 bg-red-900/20 px-3 py-2 text-sm text-red-200">
                {recentBacktestsError}
              </div>
            ) : null}

            {recentBacktestsLoading && recentBacktests.length === 0 ? (
              <p className="text-sm text-neutral-400">Loading saved runs...</p>
            ) : recentBacktests.length === 0 ? (
              <p className="text-sm text-neutral-400">No saved runs yet.</p>
            ) : (
              <div className="space-y-2">
                {recentBacktests.map((backtest) => (
                  <button
                    key={backtest.backtestId}
                    className="w-full rounded-lg border border-neutral-800 bg-surface-800 px-3 py-3 text-left transition hover:border-cyan-700 hover:bg-surface-800/80"
                    onClick={() => navigateToBacktest(backtest.backtestId)}
                    type="button"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-neutral-100">
                          {backtest.strategy.name} - v{backtest.strategyVersion.version}
                        </div>
                        <div className="mt-1 text-xs text-neutral-400">
                          {backtest.runParams.instrumentId} - {backtest.runParams.interval} -{" "}
                          {formatDateTime(backtest.createdAt)}
                        </div>
                      </div>
                      <div className="text-right text-xs text-neutral-400">
                        <div>{backtest.status}</div>
                        <div className="mt-1 text-neutral-500">
                          {backtest.backtestId.slice(0, 8)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                      <SummaryPill
                        label="Return"
                        value={
                          backtest.metrics
                            ? `${backtest.metrics.returnPct.toFixed(2)}%`
                            : "-"
                        }
                      />
                      <SummaryPill
                        label="Trades"
                        value={
                          backtest.metrics
                            ? String(backtest.metrics.tradesCount)
                            : "-"
                        }
                      />
                      <SummaryPill
                        label="End Equity"
                        value={
                          backtest.metrics
                            ? backtest.metrics.endEquity.toFixed(2)
                            : "-"
                        }
                      />
                      <SummaryPill
                        label="Candles"
                        value={
                          backtest.candlesCount === null
                            ? "-"
                            : String(backtest.candlesCount)
                        }
                      />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {error ? (
            <div className="rounded border border-red-800 bg-red-900/25 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-neutral-700 bg-neutral-900/70 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-neutral-100">{value}</div>
    </div>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
