import { config } from "../config.js";
import type { Candle, CandleInterval, InstrumentSearchResult } from "../types.js";

type Quotation = {
  units?: string | number;
  nano?: string | number;
};

const intervalMap: Record<CandleInterval, string> = {
  "1m": "CANDLE_INTERVAL_1_MIN",
  "5m": "CANDLE_INTERVAL_5_MIN",
  "15m": "CANDLE_INTERVAL_15_MIN",
  "1h": "CANDLE_INTERVAL_HOUR",
  "1d": "CANDLE_INTERVAL_DAY"
};

const toBaseUrl = (rawUrl: string) => rawUrl.replace(/\/+$/, "");

const normalizeInvestRestUrl = (rawUrl: string) => {
  const url = new URL(rawUrl);

  if (url.hostname === "sandbox-invest-public-api.tinkoff.ru") {
    url.hostname = "sandbox-invest-public-api.tbank.ru";
  }

  if (url.hostname === "invest-public-api.tinkoff.ru") {
    url.hostname = "invest-public-api.tbank.ru";
  }

  return toBaseUrl(url.toString());
};

const describeFetchError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return "unknown fetch error";
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const typedCause = cause as Record<string, unknown>;
    const code = typeof typedCause.code === "string" ? typedCause.code : undefined;
    const errno =
      typeof typedCause.errno === "number" || typeof typedCause.errno === "string"
        ? String(typedCause.errno)
        : undefined;
    const syscall =
      typeof typedCause.syscall === "string" ? typedCause.syscall : undefined;
    const hostname =
      typeof typedCause.hostname === "string" ? typedCause.hostname : undefined;
    const address =
      typeof typedCause.address === "string" ? typedCause.address : undefined;

    const parts = [
      error.message,
      code ? `code=${code}` : null,
      errno ? `errno=${errno}` : null,
      syscall ? `syscall=${syscall}` : null,
      hostname ? `hostname=${hostname}` : null,
      address ? `address=${address}` : null
    ].filter((part): part is string => Boolean(part));

    return parts.join(", ");
  }

  return error.message;
};

const transportHint = (message: string) => {
  if (!message.includes("SELF_SIGNED_CERT_IN_CHAIN")) {
    return "";
  }

  return " Hint: add your corporate/root CA via NODE_EXTRA_CA_CERTS=/path/to/ca.pem (recommended for local dev).";
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (value && typeof value === "object") {
    const quote = value as Quotation;
    const units = Number(quote.units ?? 0);
    const nano = Number(quote.nano ?? 0) / 1_000_000_000;
    return units + nano;
  }

  return 0;
};

const normalizeText = (value: string) => value.trim().toLowerCase();
const INSTRUMENT_CATALOG_TTL_MS = 15 * 60 * 1000;

const methodPaths = {
  bonds: "tinkoff.public.invest.api.contract.v1.InstrumentsService/Bonds",
  currencies: "tinkoff.public.invest.api.contract.v1.InstrumentsService/Currencies",
  etfs: "tinkoff.public.invest.api.contract.v1.InstrumentsService/Etfs",
  futures: "tinkoff.public.invest.api.contract.v1.InstrumentsService/Futures",
  shares: "tinkoff.public.invest.api.contract.v1.InstrumentsService/Shares"
} as const;

const instrumentScore = (query: string, instrument: InstrumentSearchResult) => {
  const q = normalizeText(query);
  const fields = [
    instrument.ticker,
    instrument.name,
    instrument.uid,
    instrument.figi,
    instrument.isin,
    instrument.classCode
  ].map(normalizeText);

  if (fields.some((field) => field === q)) {
    return 0;
  }

  if (fields.some((field) => field.startsWith(q))) {
    return 1;
  }

  if (fields.some((field) => field.includes(q))) {
    return 2;
  }

  return 3;
};

export class TbankClient {
  private instrumentCatalogCache = new Map<
    "sandbox" | "prod",
    { expiresAt: number; instruments: InstrumentSearchResult[] }
  >();

  private resolveCredentials(env: "sandbox" | "prod") {
    const baseUrl =
      env === "prod"
        ? normalizeInvestRestUrl(config.TINV_PROD_ENDPOINT)
        : normalizeInvestRestUrl(config.TINV_SANDBOX_ENDPOINT);

    const tokenFromEnv =
      env === "prod" ? config.TINV_PROD_TOKEN : config.TINV_SANDBOX_TOKEN;

    const fallbackToken = config.TBANK_INVEST_TOKEN;
    const token = tokenFromEnv ?? fallbackToken;

    if (!token) {
      throw new Error(`T-Bank token for ${env} is not set`);
    }

    return { baseUrl, token };
  }

  private async request<T>(
    env: "sandbox" | "prod",
    methodPath: string,
    body: object
  ): Promise<T> {
    const { baseUrl, token } = this.resolveCredentials(env);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.TBANK_INVEST_TIMEOUT_MS);

    try {
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/${methodPath}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });
      } catch (error) {
        const reason = describeFetchError(error);
        throw new Error(
          `T-Bank transport error for ${env} (${baseUrl}): ${reason}${transportHint(reason)}`
        );
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `T-Bank request failed (${response.status}) for ${env} (${baseUrl}/${methodPath}): ${text.slice(0, 300)}`
        );
      }

      const json = (await response.json()) as T & { payload?: T };
      return json.payload ?? json;
    } finally {
      clearTimeout(timeout);
    }
  }

  async listAccounts(env: "sandbox" | "prod") {
    const payload = await this.request<{ accounts?: Array<Record<string, unknown>> }>(
      env,
      "tinkoff.public.invest.api.contract.v1.UsersService/GetAccounts",
      {}
    );

    return (payload.accounts ?? []).map((account) => ({
      accountId: String(account.id ?? account.accountId ?? ""),
      name: String(account.name ?? account.type ?? "Account"),
      type: String(account.type ?? "unknown"),
      status: String(account.status ?? "unknown"),
      env
    }));
  }

  async getCandles(input: {
    env: "sandbox" | "prod";
    instrumentId: string;
    interval: CandleInterval;
    from: Date;
    to: Date;
  }): Promise<Candle[]> {
    const payload = await this.request<{ candles?: Array<Record<string, unknown>> }>(
      input.env,
      "tinkoff.public.invest.api.contract.v1.MarketDataService/GetCandles",
      {
        instrumentId: input.instrumentId,
        interval: intervalMap[input.interval],
        from: input.from.toISOString(),
        to: input.to.toISOString()
      }
    );

    const candles = payload.candles ?? [];

    return candles
      .map((candle) => {
        const tsRaw = candle.time ?? candle.ts ?? candle.timestamp;
        if (!tsRaw) {
          return null;
        }

        return {
          ts: new Date(String(tsRaw)),
          open: toNumber(candle.open),
          high: toNumber(candle.high),
          low: toNumber(candle.low),
          close: toNumber(candle.close),
          volume: toNumber(candle.volume)
        } satisfies Candle;
      })
      .filter((candle): candle is Candle => Boolean(candle));
  }

  private normalizeInstrumentRecord(instrument: Record<string, unknown>) {
    const uid = String(instrument.uid ?? "");
    const figi = String(instrument.figi ?? "");
    const instrumentId = uid || figi;
    if (!instrumentId) {
      return null;
    }

    return {
      instrumentId,
      uid,
      figi,
      ticker: String(instrument.ticker ?? ""),
      classCode: String(instrument.classCode ?? instrument.class_code ?? ""),
      isin: String(instrument.isin ?? ""),
      name: String(instrument.name ?? ""),
      instrumentType: String(
        instrument.instrumentType ??
          instrument.instrument_type ??
          instrument.instrumentKind ??
          instrument.instrument_kind ??
          "unknown"
      ),
      apiTradeAvailable: Boolean(
        instrument.apiTradeAvailableFlag ?? instrument.api_trade_available_flag ?? true
      )
    } satisfies InstrumentSearchResult;
  }

  private filterInstrumentMatches(query: string, instruments: InstrumentSearchResult[], limit: number) {
    const q = normalizeText(query);
    return instruments
      .filter((instrument) => {
        const fields = [
          instrument.ticker,
          instrument.name,
          instrument.uid,
          instrument.figi,
          instrument.isin,
          instrument.classCode
        ].map(normalizeText);

        return fields.some((field) => field.includes(q));
      })
      .sort((left, right) => {
        const scoreDiff = instrumentScore(query, left) - instrumentScore(query, right);
        if (scoreDiff !== 0) {
          return scoreDiff;
        }

        return left.name.localeCompare(right.name);
      })
      .slice(0, limit);
  }

  private async loadInstrumentCatalog(env: "sandbox" | "prod") {
    const cached = this.instrumentCatalogCache.get(env);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.instruments;
    }

    const requestBody = {
      instrumentStatus: "INSTRUMENT_STATUS_BASE"
    };

    const responses = await Promise.all(
      Object.values(methodPaths).map((methodPath) =>
        this.request<{ instruments?: Array<Record<string, unknown>> }>(env, methodPath, requestBody)
      )
    );

    const seen = new Set<string>();
    const instruments = responses
      .flatMap((response) => response.instruments ?? [])
      .map((instrument) => this.normalizeInstrumentRecord(instrument))
      .filter((instrument): instrument is InstrumentSearchResult => Boolean(instrument))
      .filter((instrument) => {
        if (seen.has(instrument.instrumentId)) {
          return false;
        }

        seen.add(instrument.instrumentId);
        return true;
      });

    this.instrumentCatalogCache.set(env, {
      expiresAt: Date.now() + INSTRUMENT_CATALOG_TTL_MS,
      instruments
    });

    return instruments;
  }

  async findInstruments(input: {
    env: "sandbox" | "prod";
    query: string;
    limit?: number;
  }): Promise<InstrumentSearchResult[]> {
    const normalizedQuery = input.query.trim();
    const queries = Array.from(new Set([normalizedQuery, normalizedQuery.toUpperCase()])).filter(Boolean);
    const payloads = await Promise.all(
      queries.map((query) =>
        this.request<{ instruments?: Array<Record<string, unknown>> }>(
          input.env,
          "tinkoff.public.invest.api.contract.v1.InstrumentsService/FindInstrument",
          {
            query,
            instrumentKind: "INSTRUMENT_TYPE_UNSPECIFIED",
            apiTradeAvailableFlag: true
          }
        )
      )
    );

    const rawInstruments = payloads.flatMap((payload) => payload.instruments ?? []);
    const seen = new Set<string>();
    const instruments = rawInstruments
      .map((instrument) => this.normalizeInstrumentRecord(instrument))
      .filter((instrument): instrument is InstrumentSearchResult => Boolean(instrument))
      .filter((instrument) => {
        if (seen.has(instrument.instrumentId)) {
          return false;
        }

        seen.add(instrument.instrumentId);
        return true;
      })
      .sort((left, right) => {
        const scoreDiff = instrumentScore(normalizedQuery, left) - instrumentScore(normalizedQuery, right);
        if (scoreDiff !== 0) {
          return scoreDiff;
        }

        return left.name.localeCompare(right.name);
      });

    const limit = input.limit ?? 8;
    const directMatches = instruments.slice(0, limit);
    if (directMatches.length > 0) {
      return directMatches;
    }

    const catalog = await this.loadInstrumentCatalog(input.env);
    return this.filterInstrumentMatches(normalizedQuery, catalog, limit);
  }
}
