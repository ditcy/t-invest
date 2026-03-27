import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  History,
  Plus,
  RefreshCcw,
  Search
} from "lucide-react";
import type { ApiBacktestSummary } from "../api";

type RunsHistoryPageProps = {
  backtests: ApiBacktestSummary[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void | Promise<void>;
  onOpenBacktest: (backtestId: string) => void;
  onNavigateRun: () => void;
};

type SortKey =
  | "createdAt"
  | "strategy"
  | "instrument"
  | "returnPct"
  | "tradesCount"
  | "endEquity"
  | "status";

type SortState = {
  key: SortKey;
  direction: "asc" | "desc";
};

const defaultSort: SortState = {
  key: "createdAt",
  direction: "desc"
};

export function RunsHistoryPage({
  backtests,
  loading,
  error,
  onRefresh,
  onOpenBacktest,
  onNavigateRun
}: RunsHistoryPageProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>(defaultSort);

  const filteredBacktests = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return backtests;
    }

    return backtests.filter((backtest) =>
      [
        backtest.strategy.name,
        backtest.strategy.strategyId,
        backtest.strategyVersion.strategyVersionId,
        backtest.runParams.instrumentId,
        backtest.backtestId
      ].some((value) => value.toLowerCase().includes(normalized))
    );
  }, [backtests, query]);

  const sortedBacktests = useMemo(() => {
    const items = [...filteredBacktests];

    items.sort((left, right) => {
      const result = compareValues(sort.key, left, right);
      return sort.direction === "asc" ? result : -result;
    });

    return items;
  }, [filteredBacktests, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((current) => {
      if (current.key === key) {
        return {
          key,
          direction: current.direction === "asc" ? "desc" : "asc"
        };
      }

      return {
        key,
        direction: key === "createdAt" ? "desc" : "asc"
      };
    });
  };

  return (
    <main className="mx-auto max-w-7xl space-y-4 p-4">
      <section className="rounded-xl border border-neutral-800 bg-surface-900/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <History className="h-4 w-4 text-cyan-300" />
              <span>Runs History</span>
            </h2>
            <p className="text-sm text-neutral-400">
              Compact table for saved runs with sortable columns and fast result lookup.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex items-center gap-2 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm hover:bg-neutral-800"
              onClick={onRefresh}
              disabled={loading}
              type="button"
            >
              <RefreshCcw className="h-4 w-4" />
              <span>Refresh</span>
            </button>
            <button
              className="inline-flex items-center gap-2 rounded bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-500"
              onClick={onNavigateRun}
              type="button"
            >
              <Plus className="h-4 w-4" />
              <span>New Backtest</span>
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
          <label className="block space-y-1">
            <span className="text-sm text-neutral-400">Search runs</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
              <input
                className="w-full rounded border border-neutral-700 bg-surface-800 py-2 pl-9 pr-3"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Strategy, instrument, version ID, or run ID"
              />
            </div>
          </label>
          <div className="text-xs text-neutral-500">
            Click table headers to sort. Default sort: newest runs first.
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded border border-red-800 bg-red-900/25 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {loading && backtests.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-surface-900/70 p-4 text-sm text-neutral-400">
          Loading saved runs...
        </div>
      ) : null}

      {!loading && sortedBacktests.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-surface-900/70 p-4 text-sm text-neutral-400">
          {query.trim() ? "No runs matched the current search." : "No saved runs yet."}
        </div>
      ) : null}

      {sortedBacktests.length > 0 ? (
        <section className="overflow-hidden rounded-xl border border-neutral-800 bg-surface-900/70">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-surface-800 text-neutral-300">
                <tr>
                  <SortableHeader
                    label="Started"
                    sortKey="createdAt"
                    currentSort={sort}
                    onSort={toggleSort}
                  />
                  <SortableHeader
                    label="Strategy"
                    sortKey="strategy"
                    currentSort={sort}
                    onSort={toggleSort}
                  />
                  <SortableHeader
                    label="Instrument"
                    sortKey="instrument"
                    currentSort={sort}
                    onSort={toggleSort}
                  />
                  <th className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Interval
                  </th>
                  <SortableHeader
                    label="Return"
                    sortKey="returnPct"
                    currentSort={sort}
                    onSort={toggleSort}
                    align="right"
                  />
                  <SortableHeader
                    label="Trades"
                    sortKey="tradesCount"
                    currentSort={sort}
                    onSort={toggleSort}
                    align="right"
                  />
                  <SortableHeader
                    label="End Equity"
                    sortKey="endEquity"
                    currentSort={sort}
                    onSort={toggleSort}
                    align="right"
                  />
                  <SortableHeader
                    label="Status"
                    sortKey="status"
                    currentSort={sort}
                    onSort={toggleSort}
                  />
                  <th className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Run
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedBacktests.map((backtest) => (
                  <tr
                    key={backtest.backtestId}
                    className="cursor-pointer border-t border-neutral-800 text-neutral-200 transition hover:bg-surface-800/80"
                    onClick={() => onOpenBacktest(backtest.backtestId)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpenBacktest(backtest.backtestId);
                      }
                    }}
                    tabIndex={0}
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-neutral-400">
                      {formatDateTime(backtest.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="max-w-[240px] truncate font-medium" title={backtest.strategy.name}>
                        {backtest.strategy.name}
                      </div>
                      <div className="text-xs text-neutral-500">
                        v{backtest.strategyVersion.version}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-neutral-300">
                      {backtest.runParams.instrumentId}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-neutral-400">
                      {backtest.runParams.interval}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium">
                      {formatMetric(backtest.metrics?.returnPct, "%")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {typeof backtest.metrics?.tradesCount === "number"
                        ? backtest.metrics.tradesCount
                        : "-"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {formatMetric(backtest.metrics?.endEquity, "")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs uppercase tracking-wide text-neutral-400">
                      {backtest.status}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-neutral-500">
                      <div className="flex items-center justify-between gap-2">
                        <span>{backtest.backtestId.slice(0, 8)}</span>
                        <ChevronRight className="h-4 w-4 text-neutral-600" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function SortableHeader({
  label,
  sortKey,
  currentSort,
  onSort,
  align = "left"
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortState;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const isActive = currentSort.key === sortKey;
  const Icon = !isActive ? ArrowUpDown : currentSort.direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <th className={`px-3 py-2 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        className={`inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide transition hover:text-neutral-200 ${
          isActive ? "text-cyan-300" : "text-neutral-500"
        } ${align === "right" ? "justify-end" : ""}`}
        onClick={() => onSort(sortKey)}
        type="button"
      >
        <span>{label}</span>
        <Icon className="h-3.5 w-3.5" />
      </button>
    </th>
  );
}

function compareValues(
  key: SortKey,
  left: ApiBacktestSummary,
  right: ApiBacktestSummary
) {
  switch (key) {
    case "createdAt":
      return toTimestamp(left.createdAt) - toTimestamp(right.createdAt);
    case "strategy":
      return left.strategy.name.localeCompare(right.strategy.name);
    case "instrument":
      return left.runParams.instrumentId.localeCompare(right.runParams.instrumentId);
    case "returnPct":
      return (left.metrics?.returnPct ?? Number.NEGATIVE_INFINITY) -
        (right.metrics?.returnPct ?? Number.NEGATIVE_INFINITY);
    case "tradesCount":
      return (left.metrics?.tradesCount ?? Number.NEGATIVE_INFINITY) -
        (right.metrics?.tradesCount ?? Number.NEGATIVE_INFINITY);
    case "endEquity":
      return (left.metrics?.endEquity ?? Number.NEGATIVE_INFINITY) -
        (right.metrics?.endEquity ?? Number.NEGATIVE_INFINITY);
    case "status":
      return left.status.localeCompare(right.status);
    default:
      return 0;
  }
}

function toTimestamp(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatMetric(value: number | undefined, suffix: string) {
  if (typeof value !== "number") {
    return "-";
  }

  const formatted = value.toFixed(2);
  return suffix ? `${formatted}${suffix}` : formatted;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
