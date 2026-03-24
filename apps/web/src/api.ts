export type ApiStrategyCreateRequest = {
  strategyId?: string;
  name: string;
  code: string;
  params: {
    kind: "ma_crossover";
    shortPeriod: number;
    longPeriod: number;
    positionSize: number;
  };
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
      `/api/instruments/search?query=${encodeURIComponent(params.query)}&env=${params.env}&limit=${params.limit ?? 8}`
    ),

  createStrategy: (payload: ApiStrategyCreateRequest) =>
    request<{ strategyId: string; strategyVersionId: string; version: number }>("/api/strategies", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  loadCandles: (params: {
    instrumentId: string;
    interval: ApiBacktestRequest["interval"];
    from: string;
    to: string;
    env: "sandbox" | "prod";
  }) =>
    request<{ candles: Array<{ ts: string; close: number }>; count: number }>(
      `/api/candles?instrumentId=${encodeURIComponent(params.instrumentId)}&interval=${params.interval}&from=${encodeURIComponent(params.from)}&to=${encodeURIComponent(params.to)}&env=${params.env}`
    ),

  runBacktest: (payload: ApiBacktestRequest) =>
    request<{
      backtestId: string;
      candlesCount: number;
      report: {
        metrics: {
          startEquity: number;
          endEquity: number;
          returnPct: number;
          maxDrawdownPct: number;
          tradesCount: number;
          winRatePct: number;
        };
        trades: Array<{ side: string; ts: string; price: number; qty: number; fee: number; pnl?: number }>;
      };
    }>("/api/backtests", {
      method: "POST",
      body: JSON.stringify(payload)
    })
};
