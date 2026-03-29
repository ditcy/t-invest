import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode
} from "react";
import {
  ChevronDown,
  ChevronRight,
  Pause,
  Play,
  SkipBack,
  SkipForward
} from "lucide-react";
import {
  api,
  type ApiBacktestDetail,
  type ApiCandle,
  type ApiCandleRequest
} from "../api";
import {
  buildBacktestPlayback,
  type PlaybackFrame
} from "../lib/backtestPlayback";
import { BacktestCandlesPanel } from "./BacktestCandlesPanel";
import { BacktestReportView } from "./BacktestReportView";

const playbackSpeedStorageKey = "invest.backtest.playbackSpeed";
const resultLayoutStorageKey = "invest.backtest.resultLayout";
const defaultPlaybackSpeed = 1;
const playbackSpeedOptions = [0.5, 1, 2, 4] as const;
const resultLayoutOptions = ["stacked", "split"] as const;

type ResultLayoutMode = (typeof resultLayoutOptions)[number];

type BacktestRunPageProps = {
  backtestId: string;
  onNavigateRuns: () => void;
};

export function BacktestRunPage({
  backtestId,
  onNavigateRuns
}: BacktestRunPageProps) {
  const [backtest, setBacktest] = useState<ApiBacktestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candles, setCandles] = useState<ApiCandle[]>([]);
  const [candlesLoading, setCandlesLoading] = useState(false);
  const [candlesError, setCandlesError] = useState<string | null>(null);
  const [riskConfigExpanded, setRiskConfigExpanded] = useState(false);
  const [codeSnapshotExpanded, setCodeSnapshotExpanded] = useState(false);
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(() => readPlaybackSpeed());
  const [resultLayout, setResultLayout] = useState<ResultLayoutMode>(() =>
    readResultLayout()
  );

  const candleRequest = useMemo<ApiCandleRequest | null>(() => {
    if (!backtest?.runParams.env) {
      return null;
    }

    return {
      instrumentId: backtest.runParams.instrumentId,
      interval: backtest.runParams.interval,
      from: backtest.runParams.from,
      to: backtest.runParams.to,
      env: backtest.runParams.env
    };
  }, [backtest]);

  const playback = useMemo(
    () =>
      buildBacktestPlayback({
        candles,
        report: backtest?.report ?? null,
        strategyParams:
          backtest?.strategyVersion.params ?? {
            kind: "ma_crossover",
            shortPeriod: 0,
            longPeriod: 0,
            positionSize: 0
          },
        runParams:
          backtest?.runParams ?? {
            strategyVersionId: "",
            instrumentId: "",
            interval: "1d",
            from: "",
            to: "",
            feesBps: 0,
            slippageBps: 0,
            initialCash: 0,
            env: null
          }
      }),
    [backtest, candles]
  );

  const activeFrame = playback.frames[activeFrameIndex] ?? null;
  const decisionFrameIndices = useMemo(
    () =>
      playback.frames
        .filter((frame) => frame.decisionEvents.length > 0)
        .map((frame) => frame.frameIndex),
    [playback.frames]
  );
  const previousDecisionFrameIndex = useMemo(
    () =>
      [...decisionFrameIndices]
        .reverse()
        .find((frameIndex) => frameIndex < activeFrameIndex) ?? null,
    [activeFrameIndex, decisionFrameIndices]
  );
  const nextDecisionFrameIndex = useMemo(
    () => decisionFrameIndices.find((frameIndex) => frameIndex > activeFrameIndex) ?? null,
    [activeFrameIndex, decisionFrameIndices]
  );

  useEffect(() => {
    let isMounted = true;

    const loadBacktest = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await api.getBacktest(backtestId);
        if (!isMounted) {
          return;
        }

        setBacktest(response.backtest);
      } catch (err) {
        if (!isMounted) {
          return;
        }

        setError(err instanceof Error ? err.message : "Failed to load backtest");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadBacktest();

    return () => {
      isMounted = false;
    };
  }, [backtestId]);

  useEffect(() => {
    let isMounted = true;

    const loadCandles = async () => {
      if (!candleRequest) {
        setCandles([]);
        setCandlesError("Candle chart is unavailable for runs without saved environment.");
        setCandlesLoading(false);
        return;
      }

      setCandlesLoading(true);
      setCandlesError(null);

      try {
        const response = await api.loadCandles({
          ...candleRequest,
          cacheOnly: true
        });
        if (!isMounted) {
          return;
        }

        setCandles(response.candles);
        setCandlesError(
          response.candles.length === 0
            ? "No cached candles were found for this run yet."
            : null
        );
      } catch (err) {
        if (!isMounted) {
          return;
        }

        setCandlesError(err instanceof Error ? err.message : "Failed to load candles");
      } finally {
        if (isMounted) {
          setCandlesLoading(false);
        }
      }
    };

    void loadCandles();

    return () => {
      isMounted = false;
    };
  }, [candleRequest]);

  useEffect(() => {
    setRiskConfigExpanded(false);
    setCodeSnapshotExpanded(false);
    setIsPlaying(false);
  }, [backtestId]);

  useEffect(() => {
    window.localStorage.setItem(playbackSpeedStorageKey, String(playbackSpeed));
  }, [playbackSpeed]);

  useEffect(() => {
    window.localStorage.setItem(resultLayoutStorageKey, resultLayout);
  }, [resultLayout]);

  useEffect(() => {
    setActiveFrameIndex(playback.frames.length > 0 ? playback.frames.length - 1 : 0);
    setIsPlaying(false);
  }, [backtestId, playback.frames.length]);

  useEffect(() => {
    if (!isPlaying || playback.frames.length === 0) {
      return;
    }

    if (activeFrameIndex >= playback.frames.length - 1) {
      setIsPlaying(false);
      return;
    }

    const timerId = window.setInterval(() => {
      setActiveFrameIndex((current) => Math.min(current + 1, playback.frames.length - 1));
    }, getPlaybackIntervalMs(playbackSpeed));

    return () => {
      window.clearInterval(timerId);
    };
  }, [activeFrameIndex, isPlaying, playback.frames.length, playbackSpeed]);

  useEffect(() => {
    if (isPlaying && activeFrameIndex >= playback.frames.length - 1) {
      setIsPlaying(false);
    }
  }, [activeFrameIndex, isPlaying, playback.frames.length]);

  const handlePlayPause = () => {
    if (playback.frames.length === 0) {
      return;
    }

    if (isPlaying) {
      setIsPlaying(false);
      return;
    }

    if (activeFrameIndex >= playback.frames.length - 1) {
      setActiveFrameIndex(0);
    }

    setIsPlaying(true);
  };

  const handleStepChange = (nextIndex: number) => {
    setIsPlaying(false);
    setActiveFrameIndex(clamp(nextIndex, 0, Math.max(playback.frames.length - 1, 0)));
  };

  const handleSliderChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleStepChange(Number(event.target.value));
  };

  const handleTradeSelect = (tradeIndex: number) => {
    const frameIndex = playback.tradeToFrameIndex[tradeIndex] ?? -1;
    if (frameIndex < 0) {
      return;
    }

    setIsPlaying(false);
    setActiveFrameIndex(frameIndex);
  };

  const handlePreviousDecision = () => {
    if (previousDecisionFrameIndex === null) {
      return;
    }

    setIsPlaying(false);
    setActiveFrameIndex(previousDecisionFrameIndex);
  };

  const handleNextDecision = () => {
    if (nextDecisionFrameIndex === null) {
      return;
    }

    setIsPlaying(false);
    setActiveFrameIndex(nextDecisionFrameIndex);
  };

  return (
    <main className="app-page space-y-[var(--ui-stack-gap)]">
      <section className="app-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-400">
              <button
                className="rounded px-1 py-0.5 transition hover:bg-neutral-800/80 hover:text-neutral-100"
                onClick={onNavigateRuns}
                type="button"
              >
                Runs History
              </button>
              <ChevronRight className="h-4 w-4 text-neutral-600" />
              <span className="text-neutral-200">
                Result {formatShortId(backtest?.backtestId ?? backtestId)}
              </span>
            </div>
            <div>
              <h2 className="text-base font-semibold">
                {backtest?.strategy.name ?? "Saved Backtest Run"}
              </h2>
              <p className="text-sm text-neutral-400">
                {backtest
                  ? `Version v${backtest.strategyVersion.version} / ${backtest.runParams.instrumentId} / ${backtest.runParams.interval}`
                  : "Version snapshot, run parameters, price action, and persisted report"}
              </p>
            </div>
          </div>
          {backtest ? (
            <div className="rounded-full border border-neutral-700 px-3 py-1 text-xs uppercase tracking-wide text-neutral-300">
              {backtest.status}
            </div>
          ) : null}
        </div>
      </section>

      {loading ? (
        <div className="app-card text-sm text-neutral-400">
          Loading saved run...
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-800 bg-red-900/20 p-[var(--ui-card-pad)] text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {backtest && !loading ? (
        <>
          <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="app-card">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-neutral-100">
                    {backtest.strategy.name}
                  </h2>
                  <p className="text-sm text-neutral-400">
                    Strategy version v{backtest.strategyVersion.version}
                  </p>
                </div>
                <div className="rounded-full border border-neutral-700 px-3 py-1 text-xs uppercase tracking-wide text-neutral-300">
                  {backtest.status}
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <DetailItem label="Strategy ID" value={backtest.strategy.strategyId} />
                <DetailItem
                  label="Version ID"
                  value={backtest.strategyVersion.strategyVersionId}
                />
                <DetailItem
                  label="Saved At"
                  value={formatDateTime(backtest.strategyVersion.createdAt)}
                />
                <DetailItem label="Run ID" value={backtest.backtestId} />
              </div>

              <div className="mt-4 grid gap-2 md:grid-cols-3">
                <DetailItem
                  label="Short MA"
                  value={String(backtest.strategyVersion.params.shortPeriod)}
                />
                <DetailItem
                  label="Long MA"
                  value={String(backtest.strategyVersion.params.longPeriod)}
                />
                <DetailItem
                  label="Position Size"
                  value={formatNumber(backtest.strategyVersion.params.positionSize, 2)}
                />
              </div>

              <div className="mt-4">
                <CollapsibleSection
                  title="Risk Config"
                  subtitle="Saved risk configuration for this strategy version"
                  expanded={riskConfigExpanded}
                  onToggle={() => setRiskConfigExpanded((value) => !value)}
                >
                  <JsonBlock value={backtest.strategyVersion.riskConfig} />
                </CollapsibleSection>
              </div>

              <div className="mt-4">
                <CollapsibleSection
                  title="Code Snapshot"
                  subtitle="Stored source code for the exact strategy version used in this run"
                  expanded={codeSnapshotExpanded}
                  onToggle={() => setCodeSnapshotExpanded((value) => !value)}
                >
                  <pre className="app-code-block max-h-[420px] overflow-auto text-sm text-neutral-200">
                    {backtest.strategyVersion.code}
                  </pre>
                </CollapsibleSection>
              </div>
            </div>

            <div>
              <div className="app-card">
                <h2 className="mb-3 text-sm font-semibold">Run Parameters</h2>
                <div className="grid gap-2 md:grid-cols-2">
                  <DetailItem
                    label="Started At"
                    value={formatDateTime(backtest.createdAt)}
                  />
                  <DetailItem
                    label="Environment"
                    value={backtest.runParams.env ?? "-"}
                  />
                  <DetailItem
                    label="Instrument"
                    value={backtest.runParams.instrumentId}
                  />
                  <DetailItem label="Interval" value={backtest.runParams.interval} />
                  <DetailItem
                    label="From"
                    value={formatDateTime(backtest.runParams.from)}
                  />
                  <DetailItem label="To" value={formatDateTime(backtest.runParams.to)} />
                  <DetailItem
                    label="Initial Cash"
                    value={formatNumber(backtest.runParams.initialCash, 2)}
                  />
                  <DetailItem
                    label="Candles"
                    value={
                      backtest.candlesCount === null ? "-" : String(backtest.candlesCount)
                    }
                  />
                  <DetailItem
                    label="Fees (bps)"
                    value={formatNumber(backtest.runParams.feesBps, 2)}
                  />
                  <DetailItem
                    label="Slippage (bps)"
                    value={formatNumber(backtest.runParams.slippageBps, 2)}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="app-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Analysis Workspace</h2>
                <p className="text-xs text-neutral-400">
                  Choose how chart and trade journal are arranged while reviewing the run.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide text-neutral-500">
                  Layout
                </span>
                {resultLayoutOptions.map((layout) => {
                  const active = resultLayout === layout;
                  return (
                    <button
                      key={layout}
                      className={`rounded border px-3 py-1.5 text-sm transition ${
                        active
                          ? "border-cyan-700 bg-cyan-500/10 text-cyan-100"
                          : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
                      }`}
                      onClick={() => setResultLayout(layout)}
                      type="button"
                    >
                      {layout === "split" ? "Side by Side" : "Stacked"}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section
            className={
              resultLayout === "split"
                ? "grid gap-4 2xl:grid-cols-[minmax(0,1.18fr)_minmax(0,0.92fr)]"
                : "space-y-4"
            }
          >
            <div className="min-w-0 space-y-4">
              <BacktestCandlesPanel
                title="Price Action"
                subtitle="Saved candle range for this run with entry and exit markers. Playback steps stay synced with the trade journal."
                candles={candles}
                loading={candlesLoading}
                error={candlesError}
                trades={backtest.report?.trades ?? []}
                activeFrameIndex={activeFrame?.frameIndex ?? null}
                activeTradeIndices={activeFrame?.selectedTradeIndices ?? []}
                activeDecisionEvents={activeFrame?.decisionEvents ?? []}
              />

              {backtest.report ? (
                <PlaybackPanel
                  activeFrame={activeFrame}
                  frameCount={playback.frames.length}
                  frameSize={playback.frameSize}
                  isPlaying={isPlaying}
                  playbackSpeed={playbackSpeed}
                  decisionFrameCount={decisionFrameIndices.length}
                  loading={candlesLoading}
                  error={candlesError}
                  onPlayPause={handlePlayPause}
                  onPrevious={() => handleStepChange(activeFrameIndex - 1)}
                  onNext={() => handleStepChange(activeFrameIndex + 1)}
                  onPreviousDecision={handlePreviousDecision}
                  onNextDecision={handleNextDecision}
                  onPlaybackSpeedChange={setPlaybackSpeed}
                  onSliderChange={handleSliderChange}
                  hasPreviousDecision={previousDecisionFrameIndex !== null}
                  hasNextDecision={nextDecisionFrameIndex !== null}
                  sliderValue={activeFrameIndex}
                />
              ) : null}
            </div>

            <div className="min-w-0 app-card">
              <h2 className="mb-3 text-sm font-semibold">Run Outcome</h2>
              {backtest.report ? (
                <BacktestReportView
                  report={backtest.report}
                  tradeLimit={50}
                  selectedTradeIndices={activeFrame?.selectedTradeIndices ?? []}
                  tradeInsights={playback.tradeInsights}
                  onSelectTradeIndex={handleTradeSelect}
                  tableContainerClassName={
                    resultLayout === "split" ? "max-h-[620px]" : "max-h-[460px]"
                  }
                />
              ) : (
                <p className="text-sm text-neutral-400">
                  {backtest.error || "No persisted report found for this run."}
                </p>
              )}
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}

function PlaybackPanel({
  activeFrame,
  frameCount,
  frameSize,
  isPlaying,
  playbackSpeed,
  decisionFrameCount,
  loading,
  error,
  onPlayPause,
  onPrevious,
  onNext,
  onPreviousDecision,
  onNextDecision,
  onPlaybackSpeedChange,
  onSliderChange,
  hasPreviousDecision,
  hasNextDecision,
  sliderValue
}: {
  activeFrame: PlaybackFrame | null;
  frameCount: number;
  frameSize: number;
  isPlaying: boolean;
  playbackSpeed: number;
  decisionFrameCount: number;
  loading: boolean;
  error: string | null;
  onPlayPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onPreviousDecision: () => void;
  onNextDecision: () => void;
  onPlaybackSpeedChange: (speed: number) => void;
  onSliderChange: (event: ChangeEvent<HTMLInputElement>) => void;
  hasPreviousDecision: boolean;
  hasNextDecision: boolean;
  sliderValue: number;
}) {
  return (
    <div className="app-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Playback</h2>
          <p className="text-xs text-neutral-400">
            Step through the saved run and inspect what triggered each trade.
          </p>
        </div>
        {activeFrame ? (
          <div className="rounded-full border border-cyan-800 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100">
            Step {activeFrame.frameIndex + 1} / {frameCount}
          </div>
        ) : null}
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-neutral-400">Preparing playback timeline...</p>
      ) : null}

      {error ? (
        <div className="mt-4 rounded border border-red-800 bg-red-900/20 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {!loading && !error && activeFrame ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.18fr)_minmax(320px,0.82fr)]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="inline-flex items-center gap-2 rounded border border-cyan-700 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/20"
                onClick={onPlayPause}
                type="button"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                <span>{isPlaying ? "Pause" : "Play"}</span>
              </button>
              <button
                className="inline-flex items-center gap-2 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={onPrevious}
                disabled={sliderValue <= 0}
                type="button"
              >
                <SkipBack className="h-4 w-4" />
                <span>Prev</span>
              </button>
              <button
                className="inline-flex items-center gap-2 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={onNext}
                disabled={sliderValue >= frameCount - 1}
                type="button"
              >
                <SkipForward className="h-4 w-4" />
                <span>Next</span>
              </button>
              <button
                className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={onPreviousDecision}
                disabled={!hasPreviousDecision}
                type="button"
              >
                Prev Signal
              </button>
              <button
                className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={onNextDecision}
                disabled={!hasNextDecision}
                type="button"
              >
                Next Signal
              </button>
            </div>

            <div className="space-y-2">
              <input
                className="w-full accent-cyan-400"
                max={Math.max(frameCount - 1, 0)}
                min={0}
                onChange={onSliderChange}
                type="range"
                value={sliderValue}
              />
              <div className="flex flex-wrap justify-between gap-2 text-xs text-neutral-500">
                <span>{formatStepRange(activeFrame)}</span>
                <span>
                  {activeFrame.sourceCount > 1
                    ? `${activeFrame.sourceCount} candles per step`
                    : "1 candle per step"}
                  {frameSize > 1 ? ` / playback condensed from raw data` : ""}
                </span>
                <span>{decisionFrameCount} decision step(s) in this run</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-neutral-500">Speed</span>
              {playbackSpeedOptions.map((speed) => {
                const active = speed === playbackSpeed;
                return (
                  <button
                    key={speed}
                    className={`rounded border px-2.5 py-1.5 text-xs transition ${
                      active
                        ? "border-cyan-700 bg-cyan-500/10 text-cyan-100"
                        : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
                    }`}
                    onClick={() => onPlaybackSpeedChange(speed)}
                    type="button"
                  >
                    {formatPlaybackSpeed(speed)}
                  </button>
                );
              })}
              <span className="text-xs text-neutral-500">
                Saved locally for future sessions
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <DetailItem label="Close" value={formatNumber(activeFrame.close, 4)} />
              <DetailItem
                label="Position Qty"
                value={formatNumber(activeFrame.positionQty, 0)}
              />
              <DetailItem
                label="Short MA"
                value={formatNumber(activeFrame.shortMa, 4)}
              />
              <DetailItem label="Long MA" value={formatNumber(activeFrame.longMa, 4)} />
              <DetailItem label="Cash" value={formatNumber(activeFrame.cash, 2)} />
              <DetailItem
                label="Decision Points"
                value={String(activeFrame.decisionEvents.length)}
              />
            </div>

            <div className="rounded-lg border border-neutral-800 bg-surface-800/60 p-[var(--ui-code-pad)]">
              <div className="text-[11px] uppercase tracking-wide text-neutral-500">
                Decision Inspector
              </div>
              {activeFrame.decisionEvents.length > 0 ? (
                <div className="mt-2 space-y-3">
                  {activeFrame.decisionEvents.map((event, index) => (
                    <div
                      key={`${event.ts}-${event.side}-${index}`}
                      className="rounded border border-neutral-800 bg-surface-900/60 p-[var(--ui-code-pad)]"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            event.side === "BUY"
                              ? "bg-emerald-500/10 text-emerald-200"
                              : "bg-amber-500/10 text-amber-200"
                          }`}
                        >
                          {event.side}
                        </span>
                        <span className="text-sm font-semibold text-neutral-100">
                          {event.title}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-neutral-200">{event.summary}</p>
                      <div className="mt-2 space-y-1 text-xs text-neutral-400">
                        {event.details.map((line) => (
                          <div key={line}>{line}</div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-neutral-400">
                  No trade fired on this step. Playback is following candle movement until the
                  next crossover event.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="app-card-compact">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 break-all text-sm text-neutral-100">{value}</div>
    </div>
  );
}

function JsonBlock({ value }: { value: Record<string, unknown> }) {
  return (
    <pre className="app-code-block overflow-auto text-xs text-neutral-200">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function CollapsibleSection({
  title,
  subtitle,
  expanded,
  onToggle,
  children
}: {
  title: string;
  subtitle: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const Icon = expanded ? ChevronDown : ChevronRight;

  return (
    <div className="rounded-lg border border-neutral-800 bg-surface-800/50">
      <button
        className="flex w-full items-center justify-between gap-3 px-[var(--ui-compact-pad-x)] py-[var(--ui-compact-pad-y)] text-left transition hover:bg-surface-800"
        onClick={onToggle}
        type="button"
      >
        <div>
          <div className="text-sm font-semibold text-neutral-200">{title}</div>
          <div className="mt-1 text-xs text-neutral-500">{subtitle}</div>
        </div>
        <div className="inline-flex items-center gap-2 text-xs text-neutral-400">
          <span>{expanded ? "Hide" : "Show"}</span>
          <Icon className="h-4 w-4" />
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-neutral-800 p-[var(--ui-code-pad)]">{children}</div>
      ) : null}
    </div>
  );
}

function formatDateTime(value: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatNumber(value: number | null, digits: number) {
  if (typeof value !== "number") {
    return "-";
  }

  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatShortId(value: string) {
  return value.length > 10 ? value.slice(0, 8) : value;
}

function formatStepRange(frame: PlaybackFrame) {
  if (frame.sourceCount <= 1) {
    return formatDateTime(frame.endTs);
  }

  return `${formatDateTime(frame.startTs)} -> ${formatDateTime(frame.endTs)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function readPlaybackSpeed() {
  if (typeof window === "undefined") {
    return defaultPlaybackSpeed;
  }

  const rawValue = Number(window.localStorage.getItem(playbackSpeedStorageKey));
  return playbackSpeedOptions.includes(rawValue as (typeof playbackSpeedOptions)[number])
    ? rawValue
    : defaultPlaybackSpeed;
}

function getPlaybackIntervalMs(speed: number) {
  return Math.max(140, Math.round(700 / speed));
}

function formatPlaybackSpeed(speed: number) {
  return `${speed}x`;
}

function readResultLayout(): ResultLayoutMode {
  if (typeof window === "undefined") {
    return "stacked";
  }

  const rawValue = window.localStorage.getItem(resultLayoutStorageKey);
  return resultLayoutOptions.includes(rawValue as ResultLayoutMode) ? rawValue as ResultLayoutMode : "stacked";
}
