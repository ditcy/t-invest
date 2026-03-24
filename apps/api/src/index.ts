import cors from "cors";
import express, { type Request, type Response, type NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { config } from "./config.js";
import { closeDb, initDb, pool } from "./db.js";
import { runBacktest } from "./lib/backtest.js";
import { CandleIngestionService } from "./lib/candles.js";
import { LlmService } from "./lib/llm.js";
import { ensureFirstStrategy } from "./lib/seed.js";
import { TbankClient } from "./lib/tbank.js";
import { candleIntervals, strategyKinds, type StrategyParams } from "./types.js";

const app = express();
const tbank = new TbankClient();
const candlesService = new CandleIngestionService(tbank);
const llmService = new LlmService();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

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
  env: envSchema.default("sandbox")
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

const llmProviderSchema = z.enum(["mock", "claude"]);

const llmChatSchema = z.object({
  provider: llmProviderSchema,
  model: z.string().min(1),
  prompt: z.string().min(1),
  systemPrompt: z.string().optional()
});

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

    const candles = await candlesService.ensureCandles({
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

app.post("/api/backtests", async (req: Request, res: Response, next: NextFunction) => {
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
        $10::jsonb
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
  } catch (error) {
    next(error);
  }
});

app.get("/api/backtests/:backtestId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const backtestId = z.string().uuid().parse(req.params.backtestId);

    const result = await pool.query(
      `
      select id, strategy_version_id, status, created_at, metrics, report
      from backtest_runs
      where id = $1
      limit 1
      `,
      [backtestId]
    );

    const row = result.rows[0];
    if (!row) {
      res.status(404).json({ error: "Backtest not found" });
      return;
    }

    res.json({ backtest: row });
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

  console.error("API error", message);
  res.status(500).json({ error: message });
});

const start = async () => {
  await initDb();
  const seeded = await ensureFirstStrategy();
  if (seeded) {
    console.log(
      `Seeded first strategy: strategyId=${seeded.strategyId}, versionId=${seeded.strategyVersionId}`
    );
  }

  app.listen(config.PORT, () => {
    console.log(`API listening on :${config.PORT}`);
  });
};

start().catch((error) => {
  console.error("Failed to start API", error);
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await closeDb();
    process.exit(0);
  });
}
