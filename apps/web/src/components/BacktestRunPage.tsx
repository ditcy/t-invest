import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { api, type ApiBacktestDetail, type ApiCandleRequest } from "../api";
import { BacktestCandlesPanel } from "./BacktestCandlesPanel";
import { BacktestReportView } from "./BacktestReportView";

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
  const [riskConfigExpanded, setRiskConfigExpanded] = useState(false);
  const [codeSnapshotExpanded, setCodeSnapshotExpanded] = useState(false);

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
    setRiskConfigExpanded(false);
    setCodeSnapshotExpanded(false);
  }, [backtestId]);

  return (
    <main className="mx-auto max-w-7xl space-y-4 p-4">
      <section className="rounded-xl border border-neutral-800 bg-surface-900/70 p-4">
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
        <div className="rounded-xl border border-neutral-800 bg-surface-900/70 p-4 text-sm text-neutral-400">
          Loading saved run...
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-800 bg-red-900/20 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {backtest && !loading ? (
        <>
          <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-xl border border-neutral-800 bg-surface-900/70 p-4">
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
                  <pre className="max-h-[420px] overflow-auto rounded-lg border border-neutral-800 bg-[#0c1017] p-3 text-sm text-neutral-200">
                    {backtest.strategyVersion.code}
                  </pre>
                </CollapsibleSection>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-neutral-800 bg-surface-900/70 p-4">
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

              <BacktestCandlesPanel
                title="Price Action"
                subtitle="Saved candle range for this run with entry and exit markers."
                request={candleRequest}
                trades={backtest.report?.trades ?? []}
              />

              <div className="rounded-xl border border-neutral-800 bg-surface-900/70 p-4">
                <h2 className="mb-3 text-sm font-semibold">Run Outcome</h2>
                {backtest.report ? (
                  <BacktestReportView report={backtest.report} tradeLimit={50} />
                ) : (
                  <p className="text-sm text-neutral-400">
                    {backtest.error || "No persisted report found for this run."}
                  </p>
                )}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-neutral-800 bg-surface-800 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 break-all text-sm text-neutral-100">{value}</div>
    </div>
  );
}

function JsonBlock({ value }: { value: Record<string, unknown> }) {
  return (
    <pre className="overflow-auto rounded-lg border border-neutral-800 bg-[#0c1017] p-3 text-xs text-neutral-200">
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
        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition hover:bg-surface-800"
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

      {expanded ? <div className="border-t border-neutral-800 p-3">{children}</div> : null}
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
