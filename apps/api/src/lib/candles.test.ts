import assert from "node:assert/strict";
import { buildCandleWindows } from "./candles.js";

export const runSingleWindowTests = () => {
  const from = new Date("2026-01-01T00:00:00.000Z");
  const to = new Date("2026-02-15T00:00:00.000Z");

  const windows = buildCandleWindows({
    interval: "1h",
    from,
    to
  });

  assert.equal(windows.length, 1);
  assert.equal(windows[0]?.from.toISOString(), from.toISOString());
  assert.equal(windows[0]?.to.toISOString(), to.toISOString());
};

export const runMultiWindowTests = () => {
  const from = new Date("2026-01-01T00:00:00.000Z");
  const to = new Date("2026-07-15T00:00:00.000Z");

  const windows = buildCandleWindows({
    interval: "1h",
    from,
    to
  });

  assert.equal(windows.length, 3);
  assert.equal(windows[0]?.from.toISOString(), from.toISOString());
  assert.equal(windows[windows.length - 1]?.to.toISOString(), to.toISOString());

  for (let index = 1; index < windows.length; index += 1) {
    const previous = windows[index - 1];
    const current = windows[index];

    assert.ok(previous);
    assert.ok(current);
    assert.equal(previous.to.getTime(), current.from.getTime());
  }
};
