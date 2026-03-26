import { useEffect, useMemo, useState } from "react";
import { api, type ApiBacktestDetail, type ApiCandleRequest } from "../api";
import { BacktestCandlesPanel } from "./BacktestCandlesPanel";
import { BacktestReportView } from "./BacktestReportView";

type BacktestRunPageProps = {
  backtestId: string;
  onNavigateHome: () => void;
};

export function BacktestRunPage({
  backtestId,
  onNavigateHome
}: BacktestRunPageProps) {
  const [backtest, setBacktest] = useState<ApiBacktestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="min-h-screen text-neutral-100">
      <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Saved Backtest Run</h1>
            <p className="text-xs text-neutral-400">
              Version snapshot, run parameters, and persisted report
            </p>
          </div>
          <button
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm hover:bg-neutral-800"
            onClick={onNavigateHome}
            type="button"
          >
            Back to Workspace
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 p-4">
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
                  <div className="mb-2 text-sm font-semibold text-neutral-200">Risk Config</div>
                  <JsonBlock value={backtest.strategyVersion.riskConfig} />
                </div>

                <div className="mt-4">
                  <div className="mb-2 text-sm font-semibold text-neutral-200">Code Snapshot</div>
                  <pre className="max-h-[420px] overflow-auto rounded-lg border border-neutral-800 bg-[#0c1017] p-3 text-sm text-neutral-200">
                    {backtest.strategyVersion.code}
                  </pre>
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
    </div>
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
