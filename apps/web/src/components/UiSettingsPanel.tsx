import type { ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Moon,
  RotateCcw,
  Settings2,
  Sun,
  Type
} from "lucide-react";

export type UiThemeMode = "dark" | "light";
export type UiFontPreset = "plex" | "system" | "serif";

type UiSettingsPanelProps = {
  open: boolean;
  theme: UiThemeMode;
  density: number;
  font: UiFontPreset;
  onToggle: () => void;
  onThemeChange: (value: UiThemeMode) => void;
  onDensityChange: (value: number) => void;
  onFontChange: (value: UiFontPreset) => void;
  onReset: () => void;
};

const fontOptions: Array<{ value: UiFontPreset; label: string; caption: string }> = [
  { value: "plex", label: "Plex", caption: "IBM Plex Sans" },
  { value: "system", label: "System", caption: "Segoe UI style" },
  { value: "serif", label: "Serif", caption: "Georgia style" }
];

export function UiSettingsPanel({
  open,
  theme,
  density,
  font,
  onToggle,
  onThemeChange,
  onDensityChange,
  onFontChange,
  onReset
}: UiSettingsPanelProps) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 flex items-end gap-3">
      {open ? (
        <div className="pointer-events-auto app-card w-[320px] shadow-[0_18px_45px_rgba(0,0,0,0.26)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
                <Settings2 className="h-4 w-4 text-cyan-300" />
                <span>UI Settings</span>
              </h2>
              <p className="mt-1 text-xs text-neutral-400">
                Theme, font, and spacing for the whole workspace.
              </p>
            </div>
            <button
              className="rounded border border-neutral-700 bg-neutral-900 px-2.5 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800"
              onClick={onReset}
              type="button"
              title="Reset UI settings"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 space-y-4">
            <section className="space-y-2">
              <div className="text-[11px] uppercase tracking-wide text-neutral-500">Theme</div>
              <div className="grid grid-cols-2 gap-2">
                <ToggleButton
                  active={theme === "dark"}
                  icon={<Moon className="h-4 w-4" />}
                  label="Dark"
                  onClick={() => onThemeChange("dark")}
                />
                <ToggleButton
                  active={theme === "light"}
                  icon={<Sun className="h-4 w-4" />}
                  label="Light"
                  onClick={() => onThemeChange("light")}
                />
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-neutral-500">
                  <Type className="h-3.5 w-3.5" />
                  <span>Spacing</span>
                </div>
                <span className="text-xs text-neutral-400">{Math.round(density * 100)}%</span>
              </div>
              <input
                className="w-full accent-cyan-400"
                max={1.15}
                min={0.75}
                onChange={(event) => onDensityChange(Number(event.target.value))}
                step={0.01}
                type="range"
                value={density}
              />
              <div className="flex justify-between text-[11px] text-neutral-500">
                <span>Compact</span>
                <span>Relaxed</span>
              </div>
            </section>

            <section className="space-y-2">
              <div className="text-[11px] uppercase tracking-wide text-neutral-500">Font</div>
              <div className="grid gap-2">
                {fontOptions.map((option) => (
                  <button
                    key={option.value}
                    className={`rounded border px-3 py-2 text-left transition ${
                      font === option.value
                        ? "border-cyan-700 bg-cyan-500/10 text-cyan-100"
                        : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
                    }`}
                    onClick={() => onFontChange(option.value)}
                    type="button"
                  >
                    <div className="text-sm font-medium">{option.label}</div>
                    <div className="mt-1 text-xs text-neutral-500">{option.caption}</div>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      ) : null}

      <button
        className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 shadow-[0_12px_30px_rgba(0,0,0,0.3)] transition hover:bg-neutral-800"
        onClick={onToggle}
        type="button"
      >
        <Settings2 className="h-4 w-4" />
        <span>{open ? "Hide UI" : "UI Settings"}</span>
        {open ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
    </div>
  );
}

function ToggleButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded border px-3 py-2 text-sm transition ${
        active
          ? "border-cyan-700 bg-cyan-500/10 text-cyan-100"
          : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
      }`}
      onClick={onClick}
      type="button"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
