export const candleIntervals = ["1m", "5m", "15m", "1h", "1d"] as const;

export type CandleInterval = (typeof candleIntervals)[number];

export type Candle = {
  ts: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type InstrumentSearchResult = {
  instrumentId: string;
  uid: string;
  figi: string;
  ticker: string;
  classCode: string;
  isin: string;
  name: string;
  instrumentType: string;
  apiTradeAvailable: boolean;
};

export const strategyKinds = ["ma_crossover"] as const;

export type StrategyKind = (typeof strategyKinds)[number];

export type StrategyParams = {
  kind: StrategyKind;
  shortPeriod: number;
  longPeriod: number;
  positionSize: number;
};

export type BacktestTrade = {
  side: "BUY" | "SELL";
  ts: string;
  price: number;
  qty: number;
  fee: number;
  pnl?: number;
};

export type BacktestMetrics = {
  startEquity: number;
  endEquity: number;
  returnPct: number;
  maxDrawdownPct: number;
  tradesCount: number;
  winRatePct: number;
};

export type BacktestReport = {
  metrics: BacktestMetrics;
  equityCurve: Array<{ ts: string; equity: number }>;
  trades: BacktestTrade[];
};
