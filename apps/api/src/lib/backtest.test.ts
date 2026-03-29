import assert from "node:assert/strict";
import { runBacktest } from "./backtest.js";
import type { Candle, StrategyParams } from "../types.js";

const strategy: StrategyParams = {
  kind: "ma_crossover",
  shortPeriod: 2,
  longPeriod: 3,
  positionSize: 1
};

const buildCandles = (closes: number[]): Candle[] =>
  closes.map((close, index) => ({
    ts: new Date(Date.UTC(2026, 0, index + 1)),
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000
  }));

export const runBacktestTests = () => {
  const candles = buildCandles([10, 10, 10, 11, 12, 11, 9, 8]);

  const first = runBacktest({
    candles,
    strategy,
    initialCash: 10_000,
    feesBps: 3,
    slippageBps: 5
  });

  const second = runBacktest({
    candles,
    strategy,
    initialCash: 10_000,
    feesBps: 3,
    slippageBps: 5
  });

  assert.deepEqual(second, first);
  assert.equal(first.trades.length, 2);
  assert.deepEqual(
    first.trades.map((trade) => trade.side),
    ["BUY", "SELL"]
  );
};

export const runBacktestFinalCloseTests = () => {
  const candles = buildCandles([10, 10, 10, 11, 12, 13, 14]);

  const report = runBacktest({
    candles,
    strategy,
    initialCash: 10_000,
    feesBps: 0,
    slippageBps: 0
  });

  assert.equal(report.trades.length, 2);
  assert.equal(report.trades[0]?.side, "BUY");
  assert.equal(report.trades[1]?.side, "SELL");
  assert.equal(report.trades[1]?.ts, candles[candles.length - 1]?.ts.toISOString());
  assert.equal(report.metrics.tradesCount, 2);
  assert.ok(report.metrics.endEquity > report.metrics.startEquity);
};
