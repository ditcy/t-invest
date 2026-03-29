import cors from "cors";
import express, { type Request, type Response, type NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { config } from "./config.js";
import { closeDb, initDb, pool } from "./db.js";
import { runBacktest } from "./lib/backtest.js";
import { CandleIngestionService, readCandles } from "./lib/candles.js";
import { LlmService } from "./lib/llm.js";
import { logger } from "./lib/logger.js";
import { ensureFirstStrategy } from "./lib/seed.js";
import { TbankClient } from "./lib/tbank.js";
import { candleIntervals, strategyKinds, type StrategyParams } from "./types.js";

const app = express();
const tbank = new TbankClient();
const candlesService = new CandleIngestionService(tbank);
const llmService = new LlmService();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = uuidv4();
  const startedAt = Date.now();

  res.setHeader("X-Request-Id", requestId);
  res.on("finish", () => {
    logger.info("http_request", {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt
    });
  });

  next();
});

const envSchema = z.enum(["sandbox", "prod"]);

const strategyParamsSchema = z
  .object({
    kind: z.enum(strategyKinds).default("ma_crossover"),
    shortPeriod: z.number().int().min(2).max(200).default(20),
    longPeriod: z.number().int().min(3).max(500).default(50),
    positionSize: z.number().min(0.1).max(1).default(1)
  })
  .superRefine((params, ctx) => {
    if (params.longPeriod <= params.shortPeriod) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "longPeriod must be greater than shortPeriod"
      });
    }
  });

const createStrategySchema = z.object({
  strategyId: z.string().uuid().optional(),
  name: z.string().min(2).max(120),
  code: z.string().min(5),
  params: strategyParamsSchema.default({
    kind: "ma_crossover",
    shortPeriod: 20,
    longPeriod: 50,
    positionSize: 1
  }),
  riskConfig: z.record(z.unknown()).default({})
});

const candlesQuerySchema = z.object({
  instrumentId: z.string().min(2),
  interval: z.enum(candleIntervals),
  from: z.string(),
  to: z.string(),
  env: envSchema.default("sandbox"),
  cacheOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true")
});

const instrumentsSearchQuerySchema = z.object({
  query: z.string().min(1).max(120),
  env: envSchema.default("sandbox"),
  limit: z.coerce.number().int().min(1).max(20).default(8)
});

const startBacktestSchema = z.object({
  strategyVersionId: z.string().uuid(),
  instrumentId: z.string().min(2),
  interval: z.enum(candleIntervals),
  from: z.string(),
  to: z.string(),
  feesBps: z.number().min(0).max(1000).default(3),
  slippageBps: z.number().min(0).max(1000).default(5),
  initialCash: z.number().positive().default(100_000),
  env: envSchema.default("sandbox")
});

const backtestsQuerySchema = z.object({
  strategyId: z.string().uuid().optional(),
  strategyVersionId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(12)
});

const llmProviderSchema = z.enum(["mock", "claude"]);

const llmChatSchema = z.object({
  provider: llmProviderSchema,
  model: z.string().min(1),
  prompt: z.string().min(1),
  systemPrompt: z.string().optional()
});

type StoredRunParams = Partial<z.infer<typeof startBacktestSchema>>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toIsoString = (value: unknown) => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }

  return "";
};

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const getModelBps = (value: unknown) => {
  if (!isRecord(value)) {
    return null;
  }

  return toNumber(value.bps);
};

const getCandlesCount = (candlesCount: unknown, report: unknown) => {
  const directCount = toNumber(candlesCount);
  if (directCount !== null) {
    return directCount;
  }

  if (!isRecord(report) || !Array.isArray(report.equityCurve)) {
    return null;
  }

  return report.equityCurve.length;
};

const normalizeRunParams = (input: {
  strategyVersionId: string;
  runParams: unknown;
  fromTs: unknown;
  toTs: unknown;
  interval: string;
  instruments: string[];
  feesModel: unknown;
  slippageModel: unknown;
  metrics: unknown;
}) => {
  const params = isRecord(input.runParams) ? (input.runParams as StoredRunParams) : {};
  const metrics = isRecord(input.metrics) ? input.metrics : {};
  const instrumentId =
    typeof params.instrumentId === "string" && params.instrumentId.length > 0
      ? params.instrumentId
      : (input.instruments[0] ?? "");

  const interval =
    typeof params.interval === "string" && candleIntervals.includes(params.interval as (typeof candleIntervals)[number])
      ? params.interval
      : input.interval;

  return {
    strategyVersionId: input.strategyVersionId,
    instrumentId,
    interval,
    from:
      typeof params.from === "string" && params.from.length > 0
        ? params.from
        : toIsoString(input.fromTs),
    to:
      typeof params.to === "string" && params.to.length > 0
        ? params.to
        : toIsoString(input.toTs),
    feesBps: toNumber(params.feesBps) ?? getModelBps(input.feesModel),
    slippageBps: toNumber(params.slippageBps) ?? getModelBps(input.slippageModel),
    initialCash: toNumber(params.initialCash) ?? toNumber(metrics.startEquity),
    env: params.env === "sandbox" || params.env === "prod" ? params.env : null
  };
};

app.get("/api/health", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await pool.query("select 1");
    res.json({ status: "ok", db: "ok" });
  } catch (error) {
    next(error);
  }
});

app.get("/api/llm/options", (_req: Request, res: Response) => {
  res.json(llmService.getOptions());
});

app.post("/api/llm/chat", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = llmChatSchema.parse(req.body);
    const output = await llmService.chat(payload);
    res.json(output);
  } catch (error) {
    next(error);
  }
});

app.get("/api/accounts", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = envSchema.default("sandbox").safeParse(req.query.env);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const accounts = await tbank.listAccounts(parsed.data);
    res.json({ accounts });
  } catch (error) {
    next(error);
  }
});

app.get("/api/instruments/search", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = instrumentsSearchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const instruments = await tbank.findInstruments(parsed.data);
    res.json({ instruments });
  } catch (error) {
    next(error);
  }
});

app.get("/api/broker/health", async (req: Request, res: Response) => {
  const parsed = envSchema.default("sandbox").safeParse(req.query.env);
  if (!parsed.success) {
    res.status(400).json({ status: "error", error: parsed.error.flatten() });
    return;
  }

  try {
    const accounts = await tbank.listAccounts(parsed.data);
    res.json({
      status: "ok",
      env: parsed.data,
      accountsCount: accounts.length
    });
  } catch (error) {
    res.status(502).json({
      status: "error",
      env: parsed.data,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

app.get("/api/candles", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = candlesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const from = new Date(parsed.data.from);
    const to = new Date(parsed.data.to);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      res.status(400).json({ error: "Invalid date range" });
      return;
    }

    const candles = parsed.data.cacheOnly
      ? await readCandles(parsed.data.instrumentId, parsed.data.interval, from, to)
      : await candlesService.ensureCandles({
          env: parsed.data.env,
          instrumentId: parsed.data.instrumentId,
          interval: parsed.data.interval,
          from,
          to
        });

    res.json({ candles, interval: parsed.data.interval, count: candles.length });
  } catch (error) {
    next(error);
  }
});

app.get("/api/strategies", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      `
      select s.id as strategy_id,
             s.name,
             s.created_at,
             v.id as latest_version_id,
             v.version as latest_version,
             v.params as latest_params
      from strategies s
      left join lateral (
        select id, version, params
        from strategy_versions
        where strategy_id = s.id
        order by version desc
        limit 1
      ) v on true
      order by s.created_at desc
      `
    );

    res.json({ strategies: result.rows });
  } catch (error) {
    next(error);
  }
});

app.get(
  "/api/strategies/:strategyId/versions",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const strategyId = z.string().uuid().parse(req.params.strategyId);
      const versions = await pool.query(
        `
        select id, strategy_id, version, code, params, risk_config, created_at
        from strategy_versions
        where strategy_id = $1
        order by version desc
        `,
        [strategyId]
      );

      res.json({ versions: versions.rows });
    } catch (error) {
      next(error);
    }
  }
);

app.post("/api/strategies", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = createStrategySchema.parse(req.body);
    const client = await pool.connect();

    try {
      await client.query("begin");

      let strategyId = payload.strategyId;
      if (!strategyId) {
        strategyId = uuidv4();
        await client.query(
          `
          insert into strategies (id, user_id, name)
          values ($1, $2, $3)
          `,
          [strategyId, "local-user", payload.name]
        );
      } else {
        await client.query(
          `
          update strategies
          set name = $2
          where id = $1
          `,
          [strategyId, payload.name]
        );
      }

      const versionResult = await client.query<{ next_version: number }>(
        `
        select coalesce(max(version), 0) + 1 as next_version
        from strategy_versions
        where strategy_id = $1
        `,
        [strategyId]
      );

      const nextVersion = versionResult.rows[0]?.next_version ?? 1;
      const versionId = uuidv4();

      await client.query(
        `
        insert into strategy_versions (id, strategy_id, version, code, params, risk_config)
        values ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
        `,
        [versionId, strategyId, nextVersion, payload.code, JSON.stringify(payload.params), JSON.stringify(payload.riskConfig)]
      );

      await client.query("commit");

      res.status(201).json({
        strategyId,
        strategyVersionId: versionId,
        version: nextVersion
      });
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
});

app.get("/api/backtests", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = backtestsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const conditions: string[] = [];
    const values: Array<string | number> = [];

    if (parsed.data.strategyId) {
      values.push(parsed.data.strategyId);
      conditions.push(`sv.strategy_id = $${values.length}`);
    }

    if (parsed.data.strategyVersionId) {
      values.push(parsed.data.strategyVersionId);
      conditions.push(`br.strategy_version_id = $${values.length}`);
    }

    values.push(parsed.data.limit);

    const whereClause = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";

    const result = await pool.query<{
      backtest_id: string;
      status: string;
      created_at: Date;
      strategy_id: string;
      strategy_name: string;
      strategy_version_id: string;
      strategy_version: number;
      metrics: unknown;
      error: string | null;
      run_params: unknown;
      from_ts: Date;
      to_ts: Date;
      candle_interval: string;
      instruments: string[];
      fees_model: unknown;
      slippage_model: unknown;
      candles_count: number | null;
    }>(
      `
      select br.id as backtest_id,
             br.status,
             br.created_at,
             br.strategy_version_id,
             br.metrics,
             br.error,
             br.run_params,
             br.from_ts,
             br.to_ts,
             br.candle_interval,
             br.instruments,
             br.fees_model,
             br.slippage_model,
             br.candles_count,
             sv.strategy_id,
             sv.version as strategy_version,
             s.name as strategy_name
      from backtest_runs br
      join strategy_versions sv on sv.id = br.strategy_version_id
      join strategies s on s.id = sv.strategy_id
      ${whereClause}
      order by br.created_at desc
      limit $${values.length}
      `,
      values
    );

    res.json({
      backtests: result.rows.map((row) => ({
        backtestId: row.backtest_id,
        status: row.status,
        createdAt: toIsoString(row.created_at),
        candlesCount: getCandlesCount(row.candles_count, null),
        error: row.error,
        strategy: {
          strategyId: row.strategy_id,
          name: row.strategy_name
        },
        strategyVersion: {
          strategyVersionId: row.strategy_version_id,
          version: row.strategy_version
        },
        runParams: normalizeRunParams({
          strategyVersionId: row.strategy_version_id,
          runParams: row.run_params,
          fromTs: row.from_ts,
          toTs: row.to_ts,
          interval: row.candle_interval,
          instruments: row.instruments,
          feesModel: row.fees_model,
          slippageModel: row.slippage_model,
          metrics: row.metrics
        }),
        metrics: isRecord(row.metrics) ? row.metrics : null
      }))
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/backtests", async (req: Request, res: Response, next: NextFunction) => {
  const startedAt = Date.now();

  try {
    const payload = startBacktestSchema.parse(req.body);
    const from = new Date(payload.from);
    const to = new Date(payload.to);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      res.status(400).json({ error: "Invalid date range" });
      return;
    }

    const strategyVersionResult = await pool.query<{
      strategy_id: string;
      id: string;
      params: StrategyParams;
    }>(
      `
      select id, strategy_id, params
      from strategy_versions
      where id = $1
      limit 1
      `,
      [payload.strategyVersionId]
    );

    const strategyVersion = strategyVersionResult.rows[0];
    if (!strategyVersion) {
      res.status(404).json({ error: "Strategy version not found" });
      return;
    }

    const strategyParams = strategyParamsSchema.parse(strategyVersion.params);

    const candles = await candlesService.ensureCandles({
      env: payload.env,
      instrumentId: payload.instrumentId,
      interval: payload.interval,
      from,
      to
    });

    if (candles.length === 0) {
      res.status(422).json({ error: "No candles loaded for selected range" });
      return;
    }

    const report = runBacktest({
      candles,
      strategy: strategyParams,
      initialCash: payload.initialCash,
      feesBps: payload.feesBps,
      slippageBps: payload.slippageBps
    });

    const backtestId = uuidv4();

    await pool.query(
      `
      insert into backtest_runs (
        id,
        strategy_version_id,
        status,
        from_ts,
        to_ts,
        candle_interval,
        instruments,
        fees_model,
        slippage_model,
        run_params,
        candles_count,
        metrics,
        report
      )
      values (
        $1,
        $2,
        'succeeded',
        $3,
        $4,
        $5,
        $6,
        $7::jsonb,
        $8::jsonb,
        $9::jsonb,
        $10,
        $11::jsonb,
        $12::jsonb
      )
      `,
      [
        backtestId,
        payload.strategyVersionId,
        from.toISOString(),
        to.toISOString(),
        payload.interval,
        [payload.instrumentId],
        JSON.stringify({ model: "constant_bps", bps: payload.feesBps }),
        JSON.stringify({ model: "constant_bps", bps: payload.slippageBps }),
        JSON.stringify(payload),
        candles.length,
        JSON.stringify(report.metrics),
        JSON.stringify(report)
      ]
    );

    res.status(201).json({
      backtestId,
      strategyVersionId: payload.strategyVersionId,
      candlesCount: candles.length,
      report
    });

    logger.info("backtest_completed", {
      backtestId,
      strategyVersionId: payload.strategyVersionId,
      instrumentId: payload.instrumentId,
      interval: payload.interval,
      env: payload.env,
      candlesCount: candles.length,
      tradesCount: report.metrics.tradesCount,
      returnPct: report.metrics.returnPct,
      durationMs: Date.now() - startedAt
    });
  } catch (error) {
    logger.error("backtest_failed", error, {
      durationMs: Date.now() - startedAt
    });
    next(error);
  }
});

app.get("/api/backtests/:backtestId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const backtestId = z.string().uuid().parse(req.params.backtestId);

    const result = await pool.query<{
      backtest_id: string;
      strategy_version_id: string;
      status: string;
      created_at: Date;
      from_ts: Date;
      to_ts: Date;
      candle_interval: string;
      instruments: string[];
      fees_model: unknown;
      slippage_model: unknown;
      run_params: unknown;
      candles_count: number | null;
      metrics: unknown;
      report: unknown;
      error: string | null;
      strategy_id: string;
      strategy_name: string;
      strategy_version: number;
      strategy_version_created_at: Date;
      strategy_code: string;
      strategy_params: StrategyParams;
      strategy_risk_config: Record<string, unknown>;
    }>(
      `
      select br.id as backtest_id,
             br.strategy_version_id,
             br.status,
             br.created_at,
             br.from_ts,
             br.to_ts,
             br.candle_interval,
             br.instruments,
             br.fees_model,
             br.slippage_model,
             br.run_params,
             br.candles_count,
             br.metrics,
             br.report,
             br.error,
             sv.strategy_id,
             sv.version as strategy_version,
             sv.created_at as strategy_version_created_at,
             sv.code as strategy_code,
             sv.params as strategy_params,
             sv.risk_config as strategy_risk_config,
             s.name as strategy_name
      from backtest_runs br
      join strategy_versions sv on sv.id = br.strategy_version_id
      join strategies s on s.id = sv.strategy_id
      where br.id = $1
      limit 1
      `,
      [backtestId]
    );

    const row = result.rows[0];
    if (!row) {
      res.status(404).json({ error: "Backtest not found" });
      return;
    }

    res.json({
      backtest: {
        backtestId: row.backtest_id,
        status: row.status,
        createdAt: toIsoString(row.created_at),
        candlesCount: getCandlesCount(row.candles_count, row.report),
        error: row.error,
        strategy: {
          strategyId: row.strategy_id,
          name: row.strategy_name
        },
        strategyVersion: {
          strategyVersionId: row.strategy_version_id,
          version: row.strategy_version,
          createdAt: toIsoString(row.strategy_version_created_at),
          code: row.strategy_code,
          params: row.strategy_params,
          riskConfig: row.strategy_risk_config
        },
        runParams: normalizeRunParams({
          strategyVersionId: row.strategy_version_id,
          runParams: row.run_params,
          fromTs: row.from_ts,
          toTs: row.to_ts,
          interval: row.candle_interval,
          instruments: row.instruments,
          feesModel: row.fees_model,
          slippageModel: row.slippage_model,
          metrics: row.metrics
        }),
        metrics: isRecord(row.metrics) ? row.metrics : null,
        report: isRecord(row.report) ? row.report : null
      }
    });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : "Unknown error";

  if (error instanceof z.ZodError) {
    res.status(400).json({ error: error.flatten() });
    return;
  }

  logger.error("api_error", error, { message });
  res.status(500).json({ error: message });
});

const start = async () => {
  await initDb();
  const seeded = await ensureFirstStrategy();
  if (seeded) {
    logger.info("seeded_first_strategy", {
      strategyId: seeded.strategyId,
      strategyVersionId: seeded.strategyVersionId
    });
  }

  app.listen(config.PORT, () => {
    logger.info("api_started", {
      port: config.PORT
    });
  });
};

start().catch((error) => {
  logger.error("api_start_failed", error);
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await closeDb();
    logger.info("api_stopped", { signal });
    process.exit(0);
  });
}
