import type { SearchDropdownOption } from "./SearchDropdown";
import { SearchDropdown } from "./SearchDropdown";

type Env = "sandbox" | "prod";

type BacktestSetupPageProps = {
  env: Env;
  accounts: Array<{ accountId: string; name: string; type: string; status: string }>;
  strategyName: string;
  strategyId: string | undefined;
  strategyVersionId: string | undefined;
  version: number | undefined;
  isStrategyDirty: boolean;
  instrumentId: string;
  selectedInstrument: SearchDropdownOption | null;
  instrumentSearchError: string | null;
  selectedInstrumentCaption: string;
  interval: "1m" | "5m" | "15m" | "1h" | "1d";
  from: string;
  to: string;
  feesBps: number;
  slippageBps: number;
  initialCash: number;
  candlesCount: number | null;
  loading: boolean;
  onEnvChange: (value: Env) => void;
  onLoadAccounts: () => void | Promise<void>;
  onLoadOptions: (query: string) => Promise<SearchDropdownOption[]>;
  onInstrumentSearchError: (value: string | null) => void;
  onInstrumentQueryChange: (query: string) => void;
  onInstrumentSelect: (option: SearchDropdownOption) => void;
  onIntervalChange: (value: BacktestSetupPageProps["interval"]) => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onFeesBpsChange: (value: number) => void;
  onSlippageBpsChange: (value: number) => void;
  onInitialCashChange: (value: number) => void;
  onLoadCandles: () => void | Promise<void>;
  onRunBacktest: () => void | Promise<void>;
  onNavigateWorkspace: () => void;
  onNavigateRuns: () => void;
};

const instrumentRecentStorageKey = "invest-codex:recent-instruments";

export function BacktestSetupPage({
  env,
  accounts,
  strategyName,
  strategyId,
  strategyVersionId,
  version,
  isStrategyDirty,
  selectedInstrument,
  instrumentSearchError,
  selectedInstrumentCaption,
  interval,
  from,
  to,
  feesBps,
  slippageBps,
  initialCash,
  candlesCount,
  loading,
  onEnvChange,
  onLoadAccounts,
  onLoadOptions,
  onInstrumentSearchError,
  onInstrumentQueryChange,
  onInstrumentSelect,
  onIntervalChange,
  onFromChange,
  onToChange,
  onFeesBpsChange,
  onSlippageBpsChange,
  onInitialCashChange,
  onLoadCandles,
  onRunBacktest,
  onNavigateWorkspace,
  onNavigateRuns
}: BacktestSetupPageProps) {
  return (
    <main className="app-page space-y-[var(--ui-stack-gap)]">
      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-4">
          <div className="app-card">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Run Backtest</h2>
                <p className="text-sm text-neutral-400">
                  Backtest setup is isolated from editing so the run flow stays focused.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm hover:bg-neutral-800"
                  onClick={onNavigateWorkspace}
                  type="button"
                >
                  Back to Workspace
                </button>
                <button
                  className="rounded border border-cyan-700 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-500/20"
                  onClick={onNavigateRuns}
                  type="button"
                >
                  Runs History
                </button>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-neutral-400">Environment</span>
                <select
                  className="app-field"
                  value={env}
                  onChange={(event) => onEnvChange(event.target.value as Env)}
                >
                  <option value="sandbox">sandbox</option>
                  <option value="prod">prod</option>
                </select>
              </label>
              <div className="space-y-1">
                <span className="text-neutral-400">Broker Accounts</span>
                <button
                  className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-[calc(var(--ui-compact-pad-y)+2px)] text-sm hover:bg-neutral-800 disabled:opacity-60"
                  onClick={onLoadAccounts}
                  disabled={loading}
                  type="button"
                >
                  Load Accounts
                </button>
              </div>
            </div>
          </div>

          <div className="app-card">
            <h3 className="mb-3 text-sm font-semibold">Market Data</h3>
            <div className="grid grid-cols-1 gap-2 text-sm">
              <label className="space-y-1">
                <span className="text-neutral-400">Instrument Search</span>
                <SearchDropdown
                  value={selectedInstrument}
                  loadOptions={onLoadOptions}
                  storageKey={instrumentRecentStorageKey}
                  placeholder="Ticker, name, UID, or FIGI"
                  onSearchError={onInstrumentSearchError}
                  onQueryChange={(query) => {
                    onInstrumentSearchError(null);
                    onInstrumentQueryChange(query.trim());
                  }}
                  onSelect={(option) => {
                    onInstrumentSearchError(null);
                    onInstrumentSelect(option);
                  }}
                />
                <div className="mt-1 text-xs text-neutral-500">{selectedInstrumentCaption}</div>
                {instrumentSearchError ? (
                  <div className="mt-1 text-xs text-amber-300">{instrumentSearchError}</div>
                ) : null}
              </label>

              <div className="grid gap-2 md:grid-cols-3">
                <label className="space-y-1">
                  <span className="text-neutral-400">Interval</span>
                  <select
                    className="app-field"
                    value={interval}
                    onChange={(event) =>
                      onIntervalChange(event.target.value as BacktestSetupPageProps["interval"])
                    }
                  >
                    <option value="1m">1m</option>
                    <option value="5m">5m</option>
                    <option value="15m">15m</option>
                    <option value="1h">1h</option>
                    <option value="1d">1d</option>
                  </select>
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="text-neutral-400">From</span>
                  <input
                    type="datetime-local"
                    className="app-field"
                    value={from}
                    onChange={(event) => onFromChange(event.target.value)}
                  />
                </label>
              </div>

              <label className="space-y-1">
                <span className="text-neutral-400">To</span>
                <input
                  type="datetime-local"
                  className="app-field"
                  value={to}
                  onChange={(event) => onToChange(event.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="app-card">
            <h3 className="mb-3 text-sm font-semibold">Execution Model</h3>
            <div className="grid gap-2 md:grid-cols-3">
              <label className="space-y-1">
                <span className="text-neutral-400">Fees (bps)</span>
                <input
                  type="number"
                  className="app-field"
                  value={feesBps}
                  onChange={(event) => onFeesBpsChange(Number(event.target.value))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-neutral-400">Slippage (bps)</span>
                <input
                  type="number"
                  className="app-field"
                  value={slippageBps}
                  onChange={(event) => onSlippageBpsChange(Number(event.target.value))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-neutral-400">Initial Cash</span>
                <input
                  type="number"
                  className="app-field"
                  value={initialCash}
                  onChange={(event) => onInitialCashChange(Number(event.target.value))}
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                className="rounded border border-cyan-500 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-60"
                onClick={onLoadCandles}
                disabled={loading}
                type="button"
              >
                Sync Candles
              </button>
              <button
                className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-60"
                onClick={onRunBacktest}
                disabled={loading}
                type="button"
              >
                Run and Open Result
              </button>
              {candlesCount !== null ? (
                <span className="text-xs text-neutral-400">Candles synced: {candlesCount}</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="app-card">
            <h3 className="text-sm font-semibold">Strategy Snapshot</h3>
            <div className="mt-3 grid gap-2">
              <InfoRow label="Strategy" value={strategyName} />
              <InfoRow label="Strategy ID" value={strategyId ?? "Not created yet"} />
              <InfoRow
                label="Version"
                value={
                  strategyVersionId && typeof version === "number"
                    ? `v${version}${isStrategyDirty ? " (new version will be saved)" : ""}`
                    : "First version will be created on run"
                }
              />
              <InfoRow
                label="Save Policy"
                value={
                  isStrategyDirty
                    ? "Unsaved changes detected. Run will save a fresh version first."
                    : "Current saved version will be used."
                }
              />
            </div>
          </div>

          <div className="app-card">
            <h3 className="mb-3 text-sm font-semibold">Loaded Accounts</h3>
            <div className="space-y-2 text-xs text-neutral-300">
              {accounts.length === 0 ? (
                <p className="app-card-compact text-neutral-500">
                  No accounts loaded for the selected environment.
                </p>
              ) : (
                accounts.map((account) => (
                  <div
                    key={account.accountId}
                    className="app-card-compact"
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
          </div>
        </div>
      </section>
    </main>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="app-card-compact">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 break-all text-sm text-neutral-100">{value}</div>
    </div>
  );
}
