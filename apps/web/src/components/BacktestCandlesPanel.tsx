import {
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from "react";
import type { ApiBacktestTrade, ApiCandle } from "../api";
import {
  maxPlaybackFrames,
  type PlaybackDecisionEvent
} from "../lib/backtestPlayback";

type BacktestCandlesPanelProps = {
  title?: string;
  subtitle?: string;
  candles: ApiCandle[];
  loading: boolean;
  error: string | null;
  trades: ApiBacktestTrade[];
  activeFrameIndex?: number | null;
  activeTradeIndices?: number[];
  activeDecisionEvents?: PlaybackDecisionEvent[];
};

type DisplayCandle = ApiCandle & {
  sourceCount: number;
  sourceStartIndex: number;
  sourceEndIndex: number;
  endTs: string;
};

type DisplayTrade = ApiBacktestTrade & {
  displayIndex: number;
  tradeIndex: number;
};

type HoveredPoint = {
  index: number;
  x: number;
  y: number;
  price: number;
};

const chartHeight = 320;
const chartPadding = {
  top: 18,
  right: 18,
  bottom: 34,
  left: 56
};

export function BacktestCandlesPanel({
  title = "Candles + Trades",
  subtitle,
  candles,
  loading,
  error,
  trades,
  activeFrameIndex = null,
  activeTradeIndices = [],
  activeDecisionEvents = []
}: BacktestCandlesPanelProps) {
  const { displayCandles, displayTrades, bucketSize } = useMemo(() => {
    if (candles.length === 0) {
      return {
        displayCandles: [] as DisplayCandle[],
        displayTrades: [] as DisplayTrade[],
        bucketSize: 1
      };
    }

    const nextBucketSize = Math.max(1, Math.ceil(candles.length / maxPlaybackFrames));
    const nextDisplayCandles: DisplayCandle[] = [];

    for (let index = 0; index < candles.length; index += nextBucketSize) {
      const bucket = candles.slice(index, index + nextBucketSize);
      const first = bucket[0];
      const last = bucket[bucket.length - 1];
      if (!first || !last) {
        continue;
      }

      let high = first.high;
      let low = first.low;
      let volume = 0;

      for (const candle of bucket) {
        high = Math.max(high, candle.high);
        low = Math.min(low, candle.low);
        volume += candle.volume ?? 0;
      }

      nextDisplayCandles.push({
        ts: first.ts,
        open: first.open,
        high,
        low,
        close: last.close,
        volume,
        sourceCount: bucket.length,
        sourceStartIndex: index,
        sourceEndIndex: index + bucket.length - 1,
        endTs: last.ts
      });
    }

    const nextDisplayTrades = trades
      .map((trade, tradeIndex) => {
        const candleIndex = findNearestCandleIndex(candles, trade.ts);
        const displayIndex = Math.min(
          nextDisplayCandles.length - 1,
          Math.floor(candleIndex / nextBucketSize)
        );

        return {
          ...trade,
          tradeIndex,
          displayIndex
        };
      })
      .filter((trade) => trade.displayIndex >= 0);

    return {
      displayCandles: nextDisplayCandles,
      displayTrades: nextDisplayTrades,
      bucketSize: nextBucketSize
    };
  }, [candles, trades]);

  return (
    <div className="app-card">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-neutral-400">
            {subtitle ||
              "Candlestick view with trade markers. Green triangles are BUY, amber triangles are SELL."}
          </p>
        </div>
        {candles.length > 0 ? (
          <div className="text-right text-xs text-neutral-500">
            <div>{candles.length} raw candles</div>
            {bucketSize > 1 ? <div>{displayCandles.length} playback steps</div> : null}
          </div>
        ) : null}
      </div>

      {loading ? <p className="text-sm text-neutral-400">Loading candle chart...</p> : null}

      {error ? (
        <div className="rounded border border-red-800 bg-red-900/20 px-[var(--ui-compact-pad-x)] py-[var(--ui-compact-pad-y)] text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {!loading && !error && candles.length > 0 ? (
        <BacktestCandlesChart
          candles={displayCandles}
          trades={displayTrades}
          activeFrameIndex={activeFrameIndex}
          activeTradeIndices={activeTradeIndices}
          activeDecisionEvents={activeDecisionEvents}
        />
      ) : null}
    </div>
  );
}

function BacktestCandlesChart({
  candles,
  trades,
  activeFrameIndex,
  activeTradeIndices,
  activeDecisionEvents
}: {
  candles: DisplayCandle[];
  trades: DisplayTrade[];
  activeFrameIndex: number | null;
  activeTradeIndices: number[];
  activeDecisionEvents: PlaybackDecisionEvent[];
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<HoveredPoint | null>(null);
  const activeTradeSet = useMemo(() => new Set(activeTradeIndices), [activeTradeIndices]);
  const slotWidth = candles.length > 120 ? 8 : 10;
  const chartWidth = Math.max(
    720,
    chartPadding.left + chartPadding.right + candles.length * slotWidth
  );
  const innerHeight = chartHeight - chartPadding.top - chartPadding.bottom;
  const priceValues = [
    ...candles.flatMap((candle) => [candle.high, candle.low]),
    ...trades.map((trade) => trade.price)
  ];
  const rawMin = Math.min(...priceValues);
  const rawMax = Math.max(...priceValues);
  const pricePadding = Math.max((rawMax - rawMin) * 0.08, rawMax * 0.002, 0.01);
  const minPrice = rawMin - pricePadding;
  const maxPrice = rawMax + pricePadding;
  const priceRange = Math.max(maxPrice - minPrice, 0.0001);

  const yForPrice = (price: number) =>
    chartPadding.top + ((maxPrice - price) / priceRange) * innerHeight;

  const xForIndex = (index: number) =>
    chartPadding.left + index * slotWidth + slotWidth / 2;

  const bodyWidth = Math.max(3, slotWidth * 0.62);
  const guideLines = 4;
  const labelStep = Math.max(1, Math.floor(candles.length / 4));
  const selectedIndex =
    typeof activeFrameIndex === "number" && candles.length > 0
      ? clamp(activeFrameIndex, 0, candles.length - 1)
      : null;
  const selectedCandle = selectedIndex !== null ? candles[selectedIndex] : null;
  const selectedPoint =
    selectedIndex !== null && selectedCandle
      ? {
          index: selectedIndex,
          x: xForIndex(selectedIndex),
          y: yForPrice(selectedCandle.close),
          price: selectedCandle.close
        }
      : null;
  const focusPoint = hoveredPoint ?? selectedPoint;
  const focusCandle = focusPoint ? candles[focusPoint.index] : null;
  const focusTrades = focusPoint
    ? trades.filter((trade) => trade.displayIndex === focusPoint.index)
    : [];
  const playbackNotes =
    hoveredPoint === null && activeDecisionEvents.length > 0
      ? activeDecisionEvents.slice(0, 2).map((event) => `${event.side}: ${event.summary}`)
      : [];
  const tooltipLines = focusCandle
    ? [
        focusCandle.sourceCount > 1
          ? `${formatTooltipDate(focusCandle.ts)} -> ${formatTooltipDate(focusCandle.endTs)}`
          : formatTooltipDate(focusCandle.ts),
        `O ${focusCandle.open.toFixed(4)}  H ${focusCandle.high.toFixed(4)}`,
        `L ${focusCandle.low.toFixed(4)}  C ${focusCandle.close.toFixed(4)}`,
        focusCandle.sourceCount > 1
          ? `${focusCandle.sourceCount} candles in step`
          : "Single candle step",
        ...focusTrades.slice(0, 2).map(
          (trade) =>
            `${trade.side} ${trade.qty} @ ${trade.price.toFixed(4)}${
              typeof trade.pnl === "number" ? `  PnL ${trade.pnl.toFixed(2)}` : ""
            }`
        ),
        ...(focusTrades.length > 2 ? [`+${focusTrades.length - 2} more trade(s)`] : []),
        ...playbackNotes,
        ...(hoveredPoint === null && activeDecisionEvents.length > 2
          ? [`+${activeDecisionEvents.length - 2} more decision(s)`]
          : [])
      ]
    : [];
  const tooltipWidth = 236;
  const tooltipHeight = tooltipLines.length * 16 + 14;
  const tooltipX = focusPoint
    ? focusPoint.x > chartWidth - tooltipWidth - 16
      ? focusPoint.x - tooltipWidth - 12
      : focusPoint.x + 12
    : 0;
  const tooltipY = focusPoint
    ? focusPoint.y < tooltipHeight + 16
      ? focusPoint.y + 12
      : focusPoint.y - tooltipHeight - 12
    : 0;

  const handleMouseMove = (event: ReactMouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || candles.length === 0) {
      return;
    }

    const rawX = ((event.clientX - rect.left) / rect.width) * chartWidth;
    const rawY = ((event.clientY - rect.top) / rect.height) * chartHeight;
    const clampedX = clamp(rawX, chartPadding.left, chartWidth - chartPadding.right);
    const clampedY = clamp(rawY, chartPadding.top, chartPadding.top + innerHeight);
    const nearestIndex = clamp(
      Math.round((clampedX - chartPadding.left - slotWidth / 2) / slotWidth),
      0,
      candles.length - 1
    );
    const snappedX = xForIndex(nearestIndex);
    const hoveredPrice =
      maxPrice - ((clampedY - chartPadding.top) / innerHeight) * priceRange;

    setHoveredPoint({
      index: nearestIndex,
      x: snappedX,
      y: clampedY,
      price: hoveredPrice
    });
  };

  return (
    <div className="app-code-block overflow-x-auto">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="h-[340px] w-full min-w-[720px]"
        role="img"
        aria-label="Candlestick chart with trade markers"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredPoint(null)}
      >
        <rect x="0" y="0" width={chartWidth} height={chartHeight} fill="#0c1017" />

        {selectedIndex !== null ? (
          <rect
            x={xForIndex(selectedIndex) - slotWidth / 2}
            y={chartPadding.top}
            width={slotWidth}
            height={innerHeight}
            fill="#0891b2"
            opacity="0.12"
          />
        ) : null}

        {Array.from({ length: guideLines + 1 }, (_, index) => {
          const ratio = index / guideLines;
          const y = chartPadding.top + innerHeight * ratio;
          const price = maxPrice - priceRange * ratio;

          return (
            <g key={`guide-${index}`}>
              <line
                x1={chartPadding.left}
                y1={y}
                x2={chartWidth - chartPadding.right}
                y2={y}
                stroke="#1f2937"
                strokeDasharray="4 4"
              />
              <text
                x={chartPadding.left - 10}
                y={y + 4}
                fill="#94a3b8"
                fontSize="11"
                textAnchor="end"
              >
                {price.toFixed(2)}
              </text>
            </g>
          );
        })}

        {candles.map((candle, index) => {
          const x = xForIndex(index);
          const yOpen = yForPrice(candle.open);
          const yClose = yForPrice(candle.close);
          const yHigh = yForPrice(candle.high);
          const yLow = yForPrice(candle.low);
          const bodyY = Math.min(yOpen, yClose);
          const bodyHeight = Math.max(Math.abs(yClose - yOpen), 1.5);
          const isUp = candle.close >= candle.open;
          const fill = isUp ? "#10b981" : "#f59e0b";
          const isActiveCandle = index === selectedIndex;

          return (
            <g key={`${candle.ts}-${index}`}>
              <title>
                {`${new Date(candle.ts).toLocaleString()}
O ${candle.open.toFixed(4)} H ${candle.high.toFixed(4)} L ${candle.low.toFixed(4)} C ${candle.close.toFixed(4)}`}
              </title>
              <line
                x1={x}
                y1={yHigh}
                x2={x}
                y2={yLow}
                stroke={fill}
                strokeWidth={isActiveCandle ? "1.8" : "1.2"}
              />
              <rect
                x={x - bodyWidth / 2}
                y={bodyY}
                width={bodyWidth}
                height={bodyHeight}
                fill={fill}
                opacity={isActiveCandle ? 1 : 0.9}
                rx="1"
                stroke={isActiveCandle ? "#67e8f9" : "none"}
                strokeWidth={isActiveCandle ? "1" : "0"}
              />
            </g>
          );
        })}

        {trades.map((trade, index) => {
          const x = xForIndex(trade.displayIndex);
          const y = yForPrice(trade.price);
          const points =
            trade.side === "BUY"
              ? `${x},${y - 10} ${x - 7},${y + 4} ${x + 7},${y + 4}`
              : `${x},${y + 10} ${x - 7},${y - 4} ${x + 7},${y - 4}`;
          const color = trade.side === "BUY" ? "#22c55e" : "#f59e0b";
          const isHoveredTrade = trade.displayIndex === hoveredPoint?.index;
          const isActiveTrade = activeTradeSet.has(trade.tradeIndex);

          return (
            <g key={`${trade.ts}-${trade.side}-${index}`}>
              <title>
                {`${trade.side} ${new Date(trade.ts).toLocaleString()}
Price ${trade.price.toFixed(4)} Qty ${trade.qty}`}
              </title>
              <line
                x1={x}
                y1={y}
                x2={x}
                y2={trade.side === "BUY" ? y + 14 : y - 14}
                stroke={isActiveTrade ? "#67e8f9" : color}
                strokeWidth={isActiveTrade ? "1.8" : "1.2"}
                opacity={isActiveTrade ? 1 : isHoveredTrade ? 1 : 0.85}
              />
              <polygon
                points={points}
                fill={isActiveTrade ? "#67e8f9" : color}
                stroke="#020617"
                strokeWidth={isActiveTrade || isHoveredTrade ? "1.8" : "1"}
              />
            </g>
          );
        })}

        {focusPoint && focusCandle ? (
          <g pointerEvents="none">
            <line
              x1={focusPoint.x}
              y1={chartPadding.top}
              x2={focusPoint.x}
              y2={chartHeight - chartPadding.bottom}
              stroke="#67e8f9"
              strokeDasharray="5 5"
              opacity="0.85"
            />
            <line
              x1={chartPadding.left}
              y1={focusPoint.y}
              x2={chartWidth - chartPadding.right}
              y2={focusPoint.y}
              stroke="#67e8f9"
              strokeDasharray="5 5"
              opacity="0.45"
            />
            <circle
              cx={focusPoint.x}
              cy={yForPrice(focusCandle.close)}
              r="3.5"
              fill="#67e8f9"
              stroke="#082f49"
              strokeWidth="1.2"
            />
            <rect
              x={chartWidth - 68}
              y={focusPoint.y - 10}
              width="58"
              height="20"
              rx="4"
              fill="#082f49"
              opacity="0.96"
            />
            <text
              x={chartWidth - 39}
              y={focusPoint.y + 4}
              fill="#e0f2fe"
              fontSize="11"
              textAnchor="middle"
            >
              {focusPoint.price.toFixed(4)}
            </text>
            <rect
              x={tooltipX}
              y={tooltipY}
              width={tooltipWidth}
              height={tooltipHeight}
              rx="8"
              fill="#020617"
              opacity="0.97"
              stroke={
                activeTradeIndices.length > 0 || focusTrades.length > 0 ? "#22c55e" : "#334155"
              }
            />
            {tooltipLines.map((line, index) => (
              <text
                key={`${line}-${index}`}
                x={tooltipX + 10}
                y={tooltipY + 18 + index * 16}
                fill={
                  index === 0
                    ? "#f8fafc"
                    : index >= tooltipLines.length - playbackNotes.length && playbackNotes.length > 0
                      ? "#bbf7d0"
                      : "#cbd5e1"
                }
                fontSize="11"
              >
                {line}
              </text>
            ))}
          </g>
        ) : null}

        {candles.map((candle, index) => {
          if (index !== 0 && index !== candles.length - 1 && index % labelStep !== 0) {
            return null;
          }

          const x = xForIndex(index);

          return (
            <text
              key={`label-${candle.ts}-${index}`}
              x={x}
              y={chartHeight - 10}
              fill="#94a3b8"
              fontSize="11"
              textAnchor="middle"
            >
              {formatAxisDate(candle.endTs)}
            </text>
          );
        })}
      </svg>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-neutral-400">
        <LegendDot color="#10b981" label="Bull candle / BUY" />
        <LegendDot color="#f59e0b" label="Bear candle / SELL" />
        <LegendDot color="#67e8f9" label="Active playback step" />
        <span>Hover chart for crosshair, OHLC, and trade labels.</span>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </span>
  );
}

function formatAxisDate(value: string) {
  const date = new Date(value);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${day}.${month}`;
}

function formatTooltipDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function findNearestCandleIndex(candles: ApiCandle[], timestamp: string) {
  const target = new Date(timestamp).getTime();
  if (candles.length === 0 || Number.isNaN(target)) {
    return -1;
  }

  let closestIndex = 0;
  let closestDistance = Math.abs(new Date(candles[0]?.ts ?? timestamp).getTime() - target);

  for (let index = 1; index < candles.length; index += 1) {
    const distance = Math.abs(new Date(candles[index]?.ts ?? timestamp).getTime() - target);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  }

  return closestIndex;
}
