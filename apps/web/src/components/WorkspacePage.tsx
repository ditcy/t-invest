import type { LlmProvider, LlmProviderOption } from "../api";

type WorkspacePageProps = {
  strategyId: string | undefined;
  strategyVersionId: string | undefined;
  version: number | undefined;
  isStrategyDirty: boolean;
  strategyName: string;
  code: string;
  shortPeriod: number;
  longPeriod: number;
  positionSize: number;
  loading: boolean;
  llmOptions: LlmProviderOption[];
  llmProvider: LlmProvider;
  llmModel: string;
  llmPrompt: string;
  llmSystemPrompt: string;
  llmResponse: string;
  llmLoading: boolean;
  activeProviderModels: string[];
  onStrategyNameChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onShortPeriodChange: (value: number) => void;
  onLongPeriodChange: (value: number) => void;
  onPositionSizeChange: (value: number) => void;
  onSaveStrategy: () => void | Promise<void>;
  onNavigateRun: () => void;
  onNavigateRuns: () => void;
  onLlmProviderChange: (value: LlmProvider) => void;
  onLlmModelChange: (value: string) => void;
  onLlmPromptChange: (value: string) => void;
  onLlmSystemPromptChange: (value: string) => void;
  onUseStrategyContext: () => void;
  onRunCopilot: () => void | Promise<void>;
};

export function WorkspacePage({
  strategyId,
  strategyVersionId,
  version,
  isStrategyDirty,
  strategyName,
  code,
  shortPeriod,
  longPeriod,
  positionSize,
  loading,
  llmOptions,
  llmProvider,
  llmModel,
  llmPrompt,
  llmSystemPrompt,
  llmResponse,
  llmLoading,
  activeProviderModels,
  onStrategyNameChange,
  onCodeChange,
  onShortPeriodChange,
  onLongPeriodChange,
  onPositionSizeChange,
  onSaveStrategy,
  onNavigateRun,
  onNavigateRuns,
  onLlmProviderChange,
  onLlmModelChange,
  onLlmPromptChange,
  onLlmSystemPromptChange,
  onUseStrategyContext,
  onRunCopilot
}: WorkspacePageProps) {
  return (
    <main className="mx-auto max-w-7xl space-y-4 p-4">
      <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-xl border border-neutral-800 bg-surface-900/70 p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Strategy Workspace</h2>
              <p className="text-sm text-neutral-400">
                Edit strategy code and save clean version snapshots before running.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm hover:bg-neutral-800 disabled:opacity-60"
                onClick={onSaveStrategy}
                disabled={loading}
                type="button"
              >
                Save Version
              </button>
              <button
                className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-500"
                onClick={onNavigateRun}
                type="button"
              >
                Run Backtest
              </button>
            </div>
          </div>

          <label className="mb-3 block space-y-1">
            <span className="text-sm text-neutral-400">Strategy Name</span>
            <input
              className="w-full rounded border border-neutral-700 bg-surface-800 px-3 py-2"
              value={strategyName}
              onChange={(event) => onStrategyNameChange(event.target.value)}
            />
          </label>

          <textarea
            className="h-[520px] w-full rounded-lg border border-neutral-800 bg-[#0c1017] p-3 font-mono text-sm text-neutral-200"
            value={code}
            onChange={(event) => onCodeChange(event.target.value)}
          />
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-neutral-800 bg-surface-900/70 p-4">
            <h3 className="text-sm font-semibold">Current Version</h3>
            <div className="mt-3 grid gap-2">
              <InfoRow label="Status" value={isStrategyDirty ? "Unsaved changes" : "Saved"} />
              <InfoRow label="Strategy ID" value={strategyId ?? "Not created yet"} />
              <InfoRow
                label="Version"
                value={
                  strategyVersionId && typeof version === "number"
                    ? `v${version}`
                    : "No saved version yet"
                }
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm hover:bg-neutral-800 disabled:opacity-60"
                onClick={onSaveStrategy}
                disabled={loading}
                type="button"
              >
                Save Snapshot
              </button>
              <button
                className="rounded border border-cyan-700 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-500/20"
                onClick={onNavigateRuns}
                type="button"
              >
                Open Runs History
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-surface-900/70 p-4">
            <h3 className="text-sm font-semibold">Strategy Params</h3>
            <div className="mt-3 grid gap-2">
              <label className="space-y-1">
                <span className="text-sm text-neutral-400">Short MA</span>
                <input
                  type="number"
                  className="w-full rounded border border-neutral-700 bg-surface-800 px-3 py-2"
                  value={shortPeriod}
                  onChange={(event) => onShortPeriodChange(Number(event.target.value))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-neutral-400">Long MA</span>
                <input
                  type="number"
                  className="w-full rounded border border-neutral-700 bg-surface-800 px-3 py-2"
                  value={longPeriod}
                  onChange={(event) => onLongPeriodChange(Number(event.target.value))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-neutral-400">Position Size (0-1)</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="1"
                  className="w-full rounded border border-neutral-700 bg-surface-800 px-3 py-2"
                  value={positionSize}
                  onChange={(event) => onPositionSizeChange(Number(event.target.value))}
                />
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-surface-900/70 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">AI Copilot</h3>
              <span className="text-xs text-neutral-500">Separated from run setup</span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <label className="space-y-1">
                <span className="text-sm text-neutral-400">Provider</span>
                <select
                  className="w-full rounded border border-neutral-700 bg-surface-800 px-3 py-2"
                  value={llmProvider}
                  onChange={(event) => onLlmProviderChange(event.target.value as LlmProvider)}
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
                  onChange={(event) => onLlmModelChange(event.target.value)}
                  disabled={llmLoading}
                >
                  {activeProviderModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-sm text-neutral-400">System Prompt</span>
                <textarea
                  className="h-16 w-full rounded border border-neutral-700 bg-surface-800 px-3 py-2 text-sm"
                  value={llmSystemPrompt}
                  onChange={(event) => onLlmSystemPromptChange(event.target.value)}
                  disabled={llmLoading}
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm text-neutral-400">Prompt</span>
                <textarea
                  className="h-28 w-full rounded border border-neutral-700 bg-surface-800 px-3 py-2 text-sm"
                  value={llmPrompt}
                  onChange={(event) => onLlmPromptChange(event.target.value)}
                  placeholder="Leave empty to auto-use current strategy context"
                  disabled={llmLoading}
                />
              </label>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 disabled:opacity-60"
                onClick={onUseStrategyContext}
                disabled={llmLoading}
                type="button"
              >
                Use Strategy Context
              </button>
              <button
                className="rounded bg-emerald-600 px-3 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-60"
                onClick={onRunCopilot}
                disabled={llmLoading}
                type="button"
              >
                {llmLoading ? "Asking..." : "Ask Copilot"}
              </button>
            </div>

            <div className="mt-3 rounded border border-neutral-800 bg-[#0c1017] p-3">
              <div className="mb-2 text-xs text-neutral-500">Response</div>
              <pre className="whitespace-pre-wrap text-sm text-neutral-200">
                {llmResponse || "No response yet"}
              </pre>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-neutral-800 bg-surface-800 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 break-all text-sm text-neutral-100">{value}</div>
    </div>
  );
}
