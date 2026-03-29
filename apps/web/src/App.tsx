import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  api,
  type ApiBacktestSummary,
  type ApiInstrumentSearchResult,
  type ApiStrategyCreateRequest,
  type LlmProvider,
  type LlmProviderOption
} from "./api";
import { BacktestRunPage } from "./components/BacktestRunPage";
import { BacktestSetupPage } from "./components/BacktestSetupPage";
import { RunsHistoryPage } from "./components/RunsHistoryPage";
import {
  UiSettingsPanel,
  type UiFontPreset,
  type UiThemeMode
} from "./components/UiSettingsPanel";
import { WorkspacePage } from "./components/WorkspacePage";
import type { SearchDropdownOption } from "./components/SearchDropdown";

type Env = "sandbox" | "prod";

type AppRoute =
  | { name: "workspace" }
  | { name: "run" }
  | { name: "runs" }
  | { name: "backtest"; backtestId: string };

const fallbackProviderOptions: LlmProviderOption[] = [
  { provider: "mock", models: ["mock-echo-v1"], enabled: true },
  { provider: "claude", models: ["claude-3-5-haiku-latest"], enabled: false }
];

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

const uiSettingsStorageKey = "invest.ui.settings";
const defaultUiDensity = 0.88;
const defaultUiTheme: UiThemeMode = "dark";
const defaultUiFont: UiFontPreset = "plex";

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

const parseRoute = (pathname: string): AppRoute => {
  if (pathname === "/" || pathname === "/workspace") {
    return { name: "workspace" };
  }

  if (pathname === "/backtests/new") {
    return { name: "run" };
  }

  if (pathname === "/runs") {
    return { name: "runs" };
  }

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
  const [uiPanelOpen, setUiPanelOpen] = useState(false);
  const [uiTheme, setUiTheme] = useState<UiThemeMode>(() => readUiSettings().theme);
  const [uiDensity, setUiDensity] = useState<number>(() => readUiSettings().density);
  const [uiFont, setUiFont] = useState<UiFontPreset>(() => readUiSettings().font);

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
  const [candlesCount, setCandlesCount] = useState<number | null>(null);

  const [llmOptions, setLlmOptions] = useState<LlmProviderOption[]>(fallbackProviderOptions);
  const [llmProvider, setLlmProvider] = useState<LlmProvider>("mock");
  const [llmModel, setLlmModel] = useState("mock-echo-v1");
  const [llmPrompt, setLlmPrompt] = useState("");
  const [llmSystemPrompt, setLlmSystemPrompt] = useState(
    "You are a practical trading copilot. Suggest safer and testable improvements."
  );
  const [llmResponse, setLlmResponse] = useState("");
  const [llmLoading, setLlmLoading] = useState(false);

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

  const activeProviderModels = useMemo(
    () => llmOptions.find((option) => option.provider === llmProvider)?.models ?? [],
    [llmOptions, llmProvider]
  );

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
    void refreshRecentBacktests();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = uiTheme;
    root.style.setProperty("--ui-density", String(uiDensity));
    root.style.setProperty("--app-font-family", getUiFontFamily(uiFont));

    window.localStorage.setItem(
      uiSettingsStorageKey,
      JSON.stringify({
        theme: uiTheme,
        density: uiDensity,
        font: uiFont
      })
    );
  }, [uiDensity, uiFont, uiTheme]);

  const navigate = (nextRoute: AppRoute, pathname: string) => {
    window.history.pushState({}, "", pathname);
    setRoute(nextRoute);
  };

  const navigateToWorkspace = () => navigate({ name: "workspace" }, "/workspace");
  const navigateToRun = () => navigate({ name: "run" }, "/backtests/new");
  const navigateToRuns = () => navigate({ name: "runs" }, "/runs");
  const navigateToBacktest = (backtestId: string) =>
    navigate({ name: "backtest", backtestId }, `/backtests/${backtestId}`);

  const buildCopilotPrompt = () =>
    [
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

  const refreshRecentBacktests = async () => {
    setRecentBacktestsLoading(true);
    setRecentBacktestsError(null);

    try {
      const response = await api.listBacktests({ limit: 16 });
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

  const buildCandleRequest = () => ({
    instrumentId,
    interval,
    from: dateRangeIso.from,
    to: dateRangeIso.to,
    env
  });

  const loadCandles = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.loadCandles(buildCandleRequest());
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
        initialCash
      });

      setCandlesCount(response.candlesCount);
      await refreshRecentBacktests();
      navigateToBacktest(response.backtestId);
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

  let content: ReactNode;

  if (route.name === "workspace") {
    content = (
      <WorkspacePage
        strategyId={strategyId}
        strategyVersionId={strategyVersionId}
        version={version}
        isStrategyDirty={isStrategyDirty}
        strategyName={strategyName}
        code={code}
        shortPeriod={shortPeriod}
        longPeriod={longPeriod}
        positionSize={positionSize}
        loading={loading}
        llmOptions={llmOptions}
        llmProvider={llmProvider}
        llmModel={llmModel}
        llmPrompt={llmPrompt}
        llmSystemPrompt={llmSystemPrompt}
        llmResponse={llmResponse}
        llmLoading={llmLoading}
        activeProviderModels={activeProviderModels}
        onStrategyNameChange={setStrategyName}
        onCodeChange={setCode}
        onShortPeriodChange={setShortPeriod}
        onLongPeriodChange={setLongPeriod}
        onPositionSizeChange={setPositionSize}
        onSaveStrategy={saveStrategy}
        onNavigateRun={navigateToRun}
        onNavigateRuns={navigateToRuns}
        onLlmProviderChange={setLlmProvider}
        onLlmModelChange={setLlmModel}
        onLlmPromptChange={setLlmPrompt}
        onLlmSystemPromptChange={setLlmSystemPrompt}
        onUseStrategyContext={() => setLlmPrompt(buildCopilotPrompt())}
        onRunCopilot={runCopilot}
      />
    );
  } else if (route.name === "run") {
    content = (
      <BacktestSetupPage
        env={env}
        accounts={accounts}
        strategyName={strategyName}
        strategyId={strategyId}
        strategyVersionId={strategyVersionId}
        version={version}
        isStrategyDirty={isStrategyDirty}
        instrumentId={instrumentId}
        selectedInstrument={selectedInstrument}
        instrumentSearchError={instrumentSearchError}
        selectedInstrumentCaption={selectedInstrumentCaption}
        interval={interval}
        from={from}
        to={to}
        feesBps={feesBps}
        slippageBps={slippageBps}
        initialCash={initialCash}
        candlesCount={candlesCount}
        loading={loading}
        onEnvChange={setEnv}
        onLoadAccounts={loadAccounts}
        onLoadOptions={loadInstrumentOptions}
        onInstrumentSearchError={setInstrumentSearchError}
        onInstrumentQueryChange={(query) => {
          setInstrumentId(query);
          setSelectedInstrument(null);
        }}
        onInstrumentSelect={(option) => {
          setSelectedInstrument(option);
          setInstrumentId(option.id);
        }}
        onIntervalChange={setInterval}
        onFromChange={setFrom}
        onToChange={setTo}
        onFeesBpsChange={setFeesBps}
        onSlippageBpsChange={setSlippageBps}
        onInitialCashChange={setInitialCash}
        onLoadCandles={loadCandles}
        onRunBacktest={runBacktest}
        onNavigateWorkspace={navigateToWorkspace}
        onNavigateRuns={navigateToRuns}
      />
    );
  } else if (route.name === "runs") {
    content = (
      <RunsHistoryPage
        backtests={recentBacktests}
        loading={recentBacktestsLoading}
        error={recentBacktestsError}
        onRefresh={refreshRecentBacktests}
        onOpenBacktest={navigateToBacktest}
        onNavigateRun={navigateToRun}
      />
    );
  } else {
    content = (
      <BacktestRunPage
        backtestId={route.backtestId}
        onNavigateRuns={navigateToRuns}
      />
    );
  }

  return (
    <div className="min-h-screen text-neutral-100">
      <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/85 backdrop-blur">
        <div className="mx-auto max-w-7xl px-[var(--ui-page-pad)] py-[calc(var(--ui-page-pad)-2px)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Invest Codex IDE by Codex</h1>
              <p className="text-xs text-neutral-400">
                Separate workflow for editing, running, reviewing, and browsing history
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <NavButton
                active={route.name === "workspace"}
                label="Workspace"
                onClick={navigateToWorkspace}
              />
              <NavButton
                active={route.name === "run"}
                label="Run Backtest"
                onClick={navigateToRun}
              />
              <NavButton
                active={route.name === "runs"}
                label="Runs History"
                onClick={navigateToRuns}
              />
            </div>
          </div>
        </div>
      </header>

      {error ? (
        <div className="mx-auto max-w-7xl px-[var(--ui-page-pad)] pt-[var(--ui-page-pad)]">
          <div className="rounded border border-red-800 bg-red-900/25 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        </div>
      ) : null}

      {content}

      <UiSettingsPanel
        open={uiPanelOpen}
        theme={uiTheme}
        density={uiDensity}
        font={uiFont}
        onToggle={() => setUiPanelOpen((value) => !value)}
        onThemeChange={setUiTheme}
        onDensityChange={setUiDensity}
        onFontChange={setUiFont}
        onReset={() => {
          setUiTheme(defaultUiTheme);
          setUiDensity(defaultUiDensity);
          setUiFont(defaultUiFont);
        }}
      />
    </div>
  );
}

function NavButton({
  active,
  label,
  onClick
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded px-3 py-2 text-sm transition ${
        active
          ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-700"
          : "border border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function readUiSettings() {
  if (typeof window === "undefined") {
    return {
      theme: defaultUiTheme,
      density: defaultUiDensity,
      font: defaultUiFont
    };
  }

  try {
    const rawValue = window.localStorage.getItem(uiSettingsStorageKey);
    if (!rawValue) {
      return {
        theme: defaultUiTheme,
        density: defaultUiDensity,
        font: defaultUiFont
      };
    }

    const parsed = JSON.parse(rawValue) as {
      theme?: unknown;
      density?: unknown;
      font?: unknown;
    };

    return {
      theme: parsed.theme === "light" ? "light" : defaultUiTheme,
      density:
        typeof parsed.density === "number" && parsed.density >= 0.75 && parsed.density <= 1.15
          ? parsed.density
          : defaultUiDensity,
      font:
        parsed.font === "system" || parsed.font === "serif" || parsed.font === "plex"
          ? parsed.font
          : defaultUiFont
    };
  } catch {
    return {
      theme: defaultUiTheme,
      density: defaultUiDensity,
      font: defaultUiFont
    };
  }
}

function getUiFontFamily(font: UiFontPreset) {
  switch (font) {
    case "system":
      return '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
    case "serif":
      return 'Georgia, "Times New Roman", serif';
    case "plex":
    default:
      return '"IBM Plex Sans", "Segoe UI", sans-serif';
  }
}
