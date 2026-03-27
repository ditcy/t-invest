export type ApiStrategyParams = {
  kind: "ma_crossover";
  shortPeriod: number;
  longPeriod: number;
  positionSize: number;
};

export type ApiStrategyCreateRequest = {
  strategyId?: string;
  name: string;
  code: string;
  params: ApiStrategyParams;
  riskConfig?: Record<string, unknown>;
};

export type ApiBacktestRequest = {
  strategyVersionId: string;
  instrumentId: string;
  interval: "1m" | "5m" | "15m" | "1h" | "1d";
  from: string;
  to: string;
  feesBps: number;
  slippageBps: number;
  initialCash: number;
  env: "sandbox" | "prod";
};

export type ApiBacktestMetrics = {
  startEquity: number;
  endEquity: number;
  returnPct: number;
  maxDrawdownPct: number;
  tradesCount: number;
  winRatePct: number;
};

export type ApiBacktestTrade = {
  side: string;
  ts: string;
  price: number;
  qty: number;
  fee: number;
  pnl?: number;
};

export type ApiCandle = {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export type ApiCandleRequest = {
  instrumentId: string;
  interval: ApiBacktestRequest["interval"];
  from: string;
  to: string;
  env: "sandbox" | "prod";
  cacheOnly?: boolean;
};

export type ApiBacktestReport = {
  metrics: ApiBacktestMetrics;
  equityCurve?: Array<{ ts: string; equity: number }>;
  trades: ApiBacktestTrade[];
};

export type ApiBacktestRunParams = {
  strategyVersionId: string;
  instrumentId: string;
  interval: ApiBacktestRequest["interval"];
  from: string;
  to: string;
  feesBps: number | null;
  slippageBps: number | null;
  initialCash: number | null;
  env: "sandbox" | "prod" | null;
};

export type ApiBacktestSummary = {
  backtestId: string;
  status: string;
  createdAt: string;
  candlesCount: number | null;
  error: string | null;
  strategy: {
    strategyId: string;
    name: string;
  };
  strategyVersion: {
    strategyVersionId: string;
    version: number;
  };
  runParams: ApiBacktestRunParams;
  metrics: ApiBacktestMetrics | null;
};

export type ApiBacktestDetail = ApiBacktestSummary & {
  strategyVersion: ApiBacktestSummary["strategyVersion"] & {
    createdAt: string;
    code: string;
    params: ApiStrategyParams;
    riskConfig: Record<string, unknown>;
  };
  report: ApiBacktestReport | null;
};

export type ApiBacktestRunResponse = {
  backtestId: string;
  candlesCount: number;
  report: ApiBacktestReport;
};

export type LlmProvider = "mock" | "claude";

export type LlmProviderOption = {
  provider: LlmProvider;
  models: string[];
  enabled: boolean;
};

export type ApiInstrumentSearchResult = {
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

const parseError = async (response: Response) => {
  try {
    const payload = (await response.json()) as { error?: unknown };
    return typeof payload.error === "string" ? payload.error : JSON.stringify(payload.error);
  } catch {
    return response.statusText;
  }
};

const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return (await response.json()) as T;
};

const withQuery = (
  url: string,
  params: Record<string, string | number | boolean | undefined>
) => {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }

    search.set(key, String(value));
  }

  const queryString = search.toString();
  return queryString ? `${url}?${queryString}` : url;
};

export const api = {
  getLlmOptions: () =>
    request<{
      providers: LlmProviderOption[];
      defaultProvider: LlmProvider;
      defaultModel: string;
    }>("/api/llm/options"),

  chatLlm: (payload: {
    provider: LlmProvider;
    model: string;
    prompt: string;
    systemPrompt?: string;
  }) =>
    request<{
      provider: LlmProvider;
      model: string;
      text: string;
      usage: { inputTokens: number | null; outputTokens: number | null };
    }>("/api/llm/chat", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  listAccounts: (env: "sandbox" | "prod") =>
    request<{ accounts: Array<{ accountId: string; name: string; type: string; status: string; env: string }> }>(
      `/api/accounts?env=${env}`
    ),

  searchInstruments: (params: {
    query: string;
    env: "sandbox" | "prod";
    limit?: number;
  }) =>
    request<{ instruments: ApiInstrumentSearchResult[] }>(
      withQuery("/api/instruments/search", {
        query: params.query,
        env: params.env,
        limit: params.limit ?? 8
      })
    ),

  createStrategy: (payload: ApiStrategyCreateRequest) =>
    request<{ strategyId: string; strategyVersionId: string; version: number }>("/api/strategies", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  loadCandles: (params: ApiCandleRequest) =>
    request<{ candles: ApiCandle[]; count: number }>(
      withQuery("/api/candles", {
        instrumentId: params.instrumentId,
        interval: params.interval,
        from: params.from,
        to: params.to,
        env: params.env,
        cacheOnly: params.cacheOnly
      })
    ),

  runBacktest: (payload: ApiBacktestRequest) =>
    request<ApiBacktestRunResponse>("/api/backtests", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  listBacktests: (params?: {
    strategyId?: string;
    strategyVersionId?: string;
    limit?: number;
  }) =>
    request<{ backtests: ApiBacktestSummary[] }>(
      withQuery("/api/backtests", {
        strategyId: params?.strategyId,
        strategyVersionId: params?.strategyVersionId,
        limit: params?.limit ?? 8
      })
    ),

  getBacktest: (backtestId: string) =>
    request<{ backtest: ApiBacktestDetail }>(`/api/backtests/${backtestId}`)
};
