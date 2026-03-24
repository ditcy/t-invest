import type {
  BacktestMetrics,
  BacktestReport,
  BacktestTrade,
  Candle,
  StrategyParams
} from "../types.js";

const bpsToFraction = (bps: number) => bps / 10_000;

const sma = (values: number[], index: number, period: number): number | null => {
  if (period <= 0 || index + 1 < period) {
    return null;
  }

  let sum = 0;
  for (let i = index - period + 1; i <= index; i += 1) {
    sum += values[i] ?? 0;
  }

  return sum / period;
};

const calcMaxDrawdownPct = (curve: Array<{ equity: number }>): number => {
  let peak = -Infinity;
  let maxDrawdown = 0;

  for (const point of curve) {
    if (point.equity > peak) {
      peak = point.equity;
    }
    if (peak <= 0) {
      continue;
    }
    const drawdown = (peak - point.equity) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return maxDrawdown * 100;
};

export const runBacktest = (input: {
  candles: Candle[];
  strategy: StrategyParams;
  initialCash: number;
  feesBps: number;
  slippageBps: number;
}): BacktestReport => {
  const closes = input.candles.map((candle) => candle.close);
  const trades: BacktestTrade[] = [];
  const equityCurve: Array<{ ts: string; equity: number }> = [];

  let cash = input.initialCash;
  let qty = 0;
  let avgEntry = 0;

  const feeRate = bpsToFraction(input.feesBps);
  const slippageRate = bpsToFraction(input.slippageBps);

  for (let i = 0; i < input.candles.length; i += 1) {
    const candle = input.candles[i];
    if (!candle) {
      continue;
    }
    const close = candle.close;

    const prevShort = sma(closes, i - 1, input.strategy.shortPeriod);
    const prevLong = sma(closes, i - 1, input.strategy.longPeriod);
    const currShort = sma(closes, i, input.strategy.shortPeriod);
    const currLong = sma(closes, i, input.strategy.longPeriod);

    if (
      prevShort !== null &&
      prevLong !== null &&
      currShort !== null &&
      currLong !== null
    ) {
      const crossUp = prevShort <= prevLong && currShort > currLong;
      const crossDown = prevShort >= prevLong && currShort < currLong;

      if (crossUp && qty === 0) {
        const buyPrice = close * (1 + slippageRate);
        const budget = cash * input.strategy.positionSize;
        const buyQty = Math.floor(budget / buyPrice);

        if (buyQty > 0) {
          const gross = buyQty * buyPrice;
          const fee = gross * feeRate;

          cash -= gross + fee;
          qty = buyQty;
          avgEntry = buyPrice;

          trades.push({
            side: "BUY",
            ts: candle.ts.toISOString(),
            price: buyPrice,
            qty: buyQty,
            fee
          });
        }
      }

      if (crossDown && qty > 0) {
        const sellPrice = close * (1 - slippageRate);
        const gross = qty * sellPrice;
        const fee = gross * feeRate;
        const pnl = gross - fee - qty * avgEntry;

        cash += gross - fee;

        trades.push({
          side: "SELL",
          ts: candle.ts.toISOString(),
          price: sellPrice,
          qty,
          fee,
          pnl
        });

        qty = 0;
        avgEntry = 0;
      }
    }

    const equity = cash + qty * close;
    equityCurve.push({ ts: candle.ts.toISOString(), equity });
  }

  if (qty > 0 && input.candles.length > 0) {
    const lastCandle = input.candles[input.candles.length - 1];
    if (!lastCandle) {
      return {
        metrics: {
          startEquity: input.initialCash,
          endEquity: cash,
          returnPct: 0,
          maxDrawdownPct: calcMaxDrawdownPct(equityCurve),
          tradesCount: trades.length,
          winRatePct: 0
        },
        equityCurve,
        trades
      };
    }
    const sellPrice = lastCandle.close * (1 - slippageRate);
    const gross = qty * sellPrice;
    const fee = gross * feeRate;
    const pnl = gross - fee - qty * avgEntry;

    cash += gross - fee;

    trades.push({
      side: "SELL",
      ts: lastCandle.ts.toISOString(),
      price: sellPrice,
      qty,
      fee,
      pnl
    });

    qty = 0;

    equityCurve.push({ ts: lastCandle.ts.toISOString(), equity: cash });
  }

  const startEquity = input.initialCash;
  const endEquity = cash;
  const sellTrades = trades.filter((trade) => trade.side === "SELL");
  const winTrades = sellTrades.filter((trade) => (trade.pnl ?? 0) > 0);

  const metrics: BacktestMetrics = {
    startEquity,
    endEquity,
    returnPct: startEquity === 0 ? 0 : ((endEquity - startEquity) / startEquity) * 100,
    maxDrawdownPct: calcMaxDrawdownPct(equityCurve),
    tradesCount: trades.length,
    winRatePct: sellTrades.length === 0 ? 0 : (winTrades.length / sellTrades.length) * 100
  };

  return {
    metrics,
    equityCurve,
    trades
  };
};
