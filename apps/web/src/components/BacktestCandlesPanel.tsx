import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from "react";
import {
  api,
  type ApiBacktestTrade,
  type ApiCandle,
  type ApiCandleRequest
} from "../api";

type BacktestCandlesPanelProps = {
  title?: string;
  subtitle?: string;
  request: ApiCandleRequest | null;
  trades: ApiBacktestTrade[];
};

type DisplayCandle = ApiCandle & {
  sourceCount: number;
};

type DisplayTrade = ApiBacktestTrade & {
  displayIndex: number;
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
  request,
  trades
}: BacktestCandlesPanelProps) {
  const [candles, setCandles] = useState<ApiCandle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadCandles = async () => {
      if (!request) {
        setCandles([]);
        setError("Candle chart is unavailable for runs without saved environment.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await api.loadCandles({
          ...request,
          cacheOnly: true
        });
        if (!isMounted) {
          return;
        }

        setCandles(response.candles);
        setError(
          response.candles.length === 0
            ? "No cached candles were found for this run yet."
            : null
        );
      } catch (err) {
        if (!isMounted) {
          return;
        }

        setError(err instanceof Error ? err.message : "Failed to load candles");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadCandles();

    return () => {
      isMounted = false;
    };
  }, [request]);

  const { displayCandles, displayTrades, bucketSize } = useMemo(() => {
    const maxCandles = 180;
    if (candles.length === 0) {
      return {
        displayCandles: [] as DisplayCandle[],
        displayTrades: [] as DisplayTrade[],
        bucketSize: 1
      };
    }

    const nextBucketSize = Math.max(1, Math.ceil(candles.length / maxCandles));
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
        sourceCount: bucket.length
      });
    }

    const nextDisplayTrades = trades
      .map((trade) => {
        const candleIndex = findNearestCandleIndex(candles, trade.ts);
        const displayIndex = Math.min(
          nextDisplayCandles.length - 1,
          Math.floor(candleIndex / nextBucketSize)
        );

        return {
          ...trade,
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
    <div className="rounded-xl border border-neutral-800 bg-surface-900/70 p-4">
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
            {bucketSize > 1 ? <div>{displayCandles.length} displayed buckets</div> : null}
          </div>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-neutral-400">Loading candle chart...</p>
      ) : null}

      {error ? (
        <div className="rounded border border-red-800 bg-red-900/20 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {!loading && !error && candles.length > 0 ? (
        <BacktestCandlesChart candles={displayCandles} trades={displayTrades} />
      ) : null}
    </div>
  );
}

function BacktestCandlesChart({
  candles,
  trades
}: {
  candles: DisplayCandle[];
  trades: DisplayTrade[];
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<HoveredPoint | null>(null);
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
  const hoveredCandle = hoveredPoint ? candles[hoveredPoint.index] : null;
  const hoveredTrades = hoveredPoint
    ? trades.filter((trade) => trade.displayIndex === hoveredPoint.index)
    : [];
  const tooltipLines = hoveredCandle
    ? [
        formatTooltipDate(hoveredCandle.ts),
        `O ${hoveredCandle.open.toFixed(4)}  H ${hoveredCandle.high.toFixed(4)}`,
        `L ${hoveredCandle.low.toFixed(4)}  C ${hoveredCandle.close.toFixed(4)}`,
        hoveredCandle.sourceCount > 1
          ? `${hoveredCandle.sourceCount} candles in bucket`
          : "Single candle bucket",
        ...hoveredTrades.slice(0, 2).map(
          (trade) =>
            `${trade.side} ${trade.qty} @ ${trade.price.toFixed(4)}${
              typeof trade.pnl === "number" ? `  PnL ${trade.pnl.toFixed(2)}` : ""
            }`
        ),
        ...(hoveredTrades.length > 2
          ? [`+${hoveredTrades.length - 2} more trade(s)`]
          : [])
      ]
    : [];
  const tooltipWidth = 230;
  const tooltipHeight = tooltipLines.length * 16 + 14;
  const tooltipX = hoveredPoint
    ? hoveredPoint.x > chartWidth - tooltipWidth - 16
      ? hoveredPoint.x - tooltipWidth - 12
      : hoveredPoint.x + 12
    : 0;
  const tooltipY = hoveredPoint
    ? hoveredPoint.y < tooltipHeight + 16
      ? hoveredPoint.y + 12
      : hoveredPoint.y - tooltipHeight - 12
    : 0;

  const handleMouseMove = (event: ReactMouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || candles.length === 0) {
      return;
    }

    const rawX = ((event.clientX - rect.left) / rect.width) * chartWidth;
    const rawY = ((event.clientY - rect.top) / rect.height) * chartHeight;
    const clampedX = clamp(rawX, chartPadding.left, chartWidth - chartPadding.right);
    const clampedY = clamp(
      rawY,
      chartPadding.top,
      chartPadding.top + innerHeight
    );
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
    <div className="overflow-x-auto rounded-lg border border-neutral-800 bg-[#0c1017] p-3">
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

          return (
            <g key={`${candle.ts}-${index}`}>
              <title>
                {`${new Date(candle.ts).toLocaleString()}
O ${candle.open.toFixed(4)} H ${candle.high.toFixed(4)} L ${candle.low.toFixed(4)} C ${candle.close.toFixed(4)}`}
              </title>
              <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={fill} strokeWidth="1.2" />
              <rect
                x={x - bodyWidth / 2}
                y={bodyY}
                width={bodyWidth}
                height={bodyHeight}
                fill={fill}
                opacity={0.9}
                rx="1"
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
                stroke={color}
                strokeWidth="1.2"
                opacity={trade.displayIndex === hoveredPoint?.index ? 1 : 0.85}
              />
              <polygon
                points={points}
                fill={color}
                stroke="#020617"
                strokeWidth={trade.displayIndex === hoveredPoint?.index ? "1.8" : "1"}
              />
            </g>
          );
        })}

        {hoveredPoint && hoveredCandle ? (
          <g pointerEvents="none">
            <line
              x1={hoveredPoint.x}
              y1={chartPadding.top}
              x2={hoveredPoint.x}
              y2={chartHeight - chartPadding.bottom}
              stroke="#67e8f9"
              strokeDasharray="5 5"
              opacity="0.85"
            />
            <line
              x1={chartPadding.left}
              y1={hoveredPoint.y}
              x2={chartWidth - chartPadding.right}
              y2={hoveredPoint.y}
              stroke="#67e8f9"
              strokeDasharray="5 5"
              opacity="0.45"
            />
            <circle
              cx={hoveredPoint.x}
              cy={yForPrice(hoveredCandle.close)}
              r="3.5"
              fill="#67e8f9"
              stroke="#082f49"
              strokeWidth="1.2"
            />
            <rect
              x={chartWidth - 68}
              y={hoveredPoint.y - 10}
              width="58"
              height="20"
              rx="4"
              fill="#082f49"
              opacity="0.96"
            />
            <text
              x={chartWidth - 39}
              y={hoveredPoint.y + 4}
              fill="#e0f2fe"
              fontSize="11"
              textAnchor="middle"
            >
              {hoveredPoint.price.toFixed(4)}
            </text>
            <rect
              x={tooltipX}
              y={tooltipY}
              width={tooltipWidth}
              height={tooltipHeight}
              rx="8"
              fill="#020617"
              opacity="0.97"
              stroke={hoveredTrades.length > 0 ? "#22c55e" : "#334155"}
            />
            {tooltipLines.map((line, index) => (
              <text
                key={`${line}-${index}`}
                x={tooltipX + 10}
                y={tooltipY + 18 + index * 16}
                fill={index === 0 ? "#f8fafc" : hoveredTrades.length > 0 && index >= 4 ? "#bbf7d0" : "#cbd5e1"}
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
              {formatAxisDate(candle.ts)}
            </text>
          );
        })}
      </svg>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-neutral-400">
        <LegendDot color="#10b981" label="Bull candle / BUY" />
        <LegendDot color="#f59e0b" label="Bear candle / SELL" />
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
