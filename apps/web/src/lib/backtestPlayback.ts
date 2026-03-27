import type {
  ApiBacktestReport,
  ApiBacktestRunParams,
  ApiCandle,
  ApiStrategyParams
} from "../api";

export const maxPlaybackFrames = 180;

export type PlaybackTradeInsight = {
  title: string;
  summary: string;
  details: string[];
};

export type PlaybackDecisionEvent = PlaybackTradeInsight & {
  side: "BUY" | "SELL";
  ts: string;
  tradeIndex: number | null;
};

export type PlaybackFrame = {
  frameIndex: number;
  sourceStartIndex: number;
  sourceEndIndex: number;
  sourceCount: number;
  startTs: string;
  endTs: string;
  close: number;
  shortMa: number | null;
  longMa: number | null;
  cash: number;
  positionQty: number;
  decisionEvents: PlaybackDecisionEvent[];
  selectedTradeIndices: number[];
};

export type BacktestPlayback = {
  frameSize: number;
  frames: PlaybackFrame[];
  tradeInsights: Array<PlaybackTradeInsight | null>;
  tradeToFrameIndex: number[];
};

type RawStepState = {
  shortMa: number | null;
  longMa: number | null;
  cash: number;
  positionQty: number;
};

const bpsToFraction = (bps: number | null) => (typeof bps === "number" ? bps / 10_000 : 0);

const sma = (values: number[], index: number, period: number): number | null => {
  if (period <= 0 || index + 1 < period) {
    return null;
  }

  let sum = 0;
  for (let pointer = index - period + 1; pointer <= index; pointer += 1) {
    sum += values[pointer] ?? 0;
  }

  return sum / period;
};

export function buildBacktestPlayback(input: {
  candles: ApiCandle[];
  report: ApiBacktestReport | null;
  strategyParams: ApiStrategyParams;
  runParams: ApiBacktestRunParams;
}): BacktestPlayback {
  const { candles, report, strategyParams, runParams } = input;

  if (candles.length === 0) {
    return {
      frameSize: 1,
      frames: [],
      tradeInsights: report ? report.trades.map(() => null) : [],
      tradeToFrameIndex: report ? report.trades.map(() => -1) : []
    };
  }

  const closes = candles.map((candle) => candle.close);
  const feeRate = bpsToFraction(runParams.feesBps);
  const slippageRate = bpsToFraction(runParams.slippageBps);
  const initialCash = typeof runParams.initialCash === "number" ? runParams.initialCash : 0;
  const reportTrades = report?.trades ?? [];
  const usedTradeIndexes = new Set<number>();
  const rawDecisionMap = new Map<number, PlaybackDecisionEvent[]>();
  const rawStates: RawStepState[] = [];
  const tradeInsights = reportTrades.map<PlaybackTradeInsight | null>(() => null);
  const tradeToFrameIndex = reportTrades.map(() => -1);

  let cash = initialCash;
  let qty = 0;
  let avgEntry = 0;

  const pushEvent = (candleIndex: number, event: PlaybackDecisionEvent) => {
    const current = rawDecisionMap.get(candleIndex) ?? [];
    current.push(event);
    rawDecisionMap.set(candleIndex, current);

    if (event.tradeIndex !== null) {
      tradeInsights[event.tradeIndex] = {
        title: event.title,
        summary: event.summary,
        details: event.details
      };
    }
  };

  const findTradeIndex = (side: "BUY" | "SELL", ts: string) => {
    for (let index = 0; index < reportTrades.length; index += 1) {
      const trade = reportTrades[index];
      if (!trade || usedTradeIndexes.has(index)) {
        continue;
      }
      if (trade.side === side && trade.ts === ts) {
        usedTradeIndexes.add(index);
        return index;
      }
    }

    return null;
  };

  for (let candleIndex = 0; candleIndex < candles.length; candleIndex += 1) {
    const candle = candles[candleIndex];
    if (!candle) {
      continue;
    }

    const prevShort = sma(closes, candleIndex - 1, strategyParams.shortPeriod);
    const prevLong = sma(closes, candleIndex - 1, strategyParams.longPeriod);
    const shortMa = sma(closes, candleIndex, strategyParams.shortPeriod);
    const longMa = sma(closes, candleIndex, strategyParams.longPeriod);

    if (
      prevShort !== null &&
      prevLong !== null &&
      shortMa !== null &&
      longMa !== null
    ) {
      const crossUp = prevShort <= prevLong && shortMa > longMa;
      const crossDown = prevShort >= prevLong && shortMa < longMa;

      if (crossUp && qty === 0) {
        const buyPrice = candle.close * (1 + slippageRate);
        const budget = cash * strategyParams.positionSize;
        const buyQty = Math.floor(budget / buyPrice);

        if (buyQty > 0) {
          const gross = buyQty * buyPrice;
          const fee = gross * feeRate;
          const tradeIndex = findTradeIndex("BUY", candle.ts);

          cash -= gross + fee;
          qty = buyQty;
          avgEntry = buyPrice;

          pushEvent(candleIndex, {
            side: "BUY",
            ts: candle.ts,
            tradeIndex,
            title: "BUY executed",
            summary: "Bullish MA crossover opened a new position.",
            details: [
              `Prev short ${formatFixed(prevShort)} <= prev long ${formatFixed(prevLong)}.`,
              `Current short ${formatFixed(shortMa)} > current long ${formatFixed(longMa)}.`,
              `Entry ${buyQty} @ ${formatFixed(buyPrice)} with fee ${formatFixed(fee)} from budget ${formatFixed(budget)}.`
            ]
          });
        }
      }

      if (crossDown && qty > 0) {
        const sellPrice = candle.close * (1 - slippageRate);
        const gross = qty * sellPrice;
        const fee = gross * feeRate;
        const pnl = gross - fee - qty * avgEntry;
        const tradeIndex = findTradeIndex("SELL", candle.ts);
        const sellQty = qty;

        cash += gross - fee;

        pushEvent(candleIndex, {
          side: "SELL",
          ts: candle.ts,
          tradeIndex,
          title: "SELL executed",
          summary: "Bearish MA crossover closed the open position.",
          details: [
            `Prev short ${formatFixed(prevShort)} >= prev long ${formatFixed(prevLong)}.`,
            `Current short ${formatFixed(shortMa)} < current long ${formatFixed(longMa)}.`,
            `Exit ${sellQty} @ ${formatFixed(sellPrice)} with fee ${formatFixed(fee)} and realized PnL ${formatFixed(pnl)}.`
          ]
        });

        qty = 0;
        avgEntry = 0;
      }
    }

    rawStates[candleIndex] = {
      shortMa,
      longMa,
      cash,
      positionQty: qty
    };
  }

  if (qty > 0 && candles.length > 0) {
    const lastIndex = candles.length - 1;
    const lastCandle = candles[lastIndex];

    if (lastCandle) {
      const sellPrice = lastCandle.close * (1 - slippageRate);
      const gross = qty * sellPrice;
      const fee = gross * feeRate;
      const pnl = gross - fee - qty * avgEntry;
      const sellQty = qty;
      const tradeIndex = findTradeIndex("SELL", lastCandle.ts);

      cash += gross - fee;
      qty = 0;
      avgEntry = 0;

      pushEvent(lastIndex, {
        side: "SELL",
        ts: lastCandle.ts,
        tradeIndex,
        title: "Final close executed",
        summary: "Open position was force-closed on the final candle.",
        details: [
          "No bearish crossover arrived before the test window ended.",
          `Final exit ${sellQty} @ ${formatFixed(sellPrice)} with fee ${formatFixed(fee)} and realized PnL ${formatFixed(pnl)}.`,
          "This forced close is used to calculate final end-of-test equity."
        ]
      });

      rawStates[lastIndex] = {
        shortMa: rawStates[lastIndex]?.shortMa ?? null,
        longMa: rawStates[lastIndex]?.longMa ?? null,
        cash,
        positionQty: qty
      };
    }
  }

  const frameSize = Math.max(1, Math.ceil(candles.length / maxPlaybackFrames));
  const frames: PlaybackFrame[] = [];

  for (
    let sourceStartIndex = 0, frameIndex = 0;
    sourceStartIndex < candles.length;
    sourceStartIndex += frameSize, frameIndex += 1
  ) {
    const sourceEndIndex = Math.min(candles.length - 1, sourceStartIndex + frameSize - 1);
    const firstCandle = candles[sourceStartIndex];
    const lastCandle = candles[sourceEndIndex];
    const state = rawStates[sourceEndIndex];

    if (!firstCandle || !lastCandle || !state) {
      continue;
    }

    const decisionEvents: PlaybackDecisionEvent[] = [];
    const selectedTradeIndices: number[] = [];

    for (let candleIndex = sourceStartIndex; candleIndex <= sourceEndIndex; candleIndex += 1) {
      const candleEvents = rawDecisionMap.get(candleIndex) ?? [];
      for (const event of candleEvents) {
        decisionEvents.push(event);
        if (event.tradeIndex !== null) {
          selectedTradeIndices.push(event.tradeIndex);
          tradeToFrameIndex[event.tradeIndex] = frameIndex;
        }
      }
    }

    frames.push({
      frameIndex,
      sourceStartIndex,
      sourceEndIndex,
      sourceCount: sourceEndIndex - sourceStartIndex + 1,
      startTs: firstCandle.ts,
      endTs: lastCandle.ts,
      close: lastCandle.close,
      shortMa: state.shortMa,
      longMa: state.longMa,
      cash: state.cash,
      positionQty: state.positionQty,
      decisionEvents,
      selectedTradeIndices
    });
  }

  return {
    frameSize,
    frames,
    tradeInsights,
    tradeToFrameIndex
  };
}

function formatFixed(value: number) {
  return value.toFixed(4);
}
