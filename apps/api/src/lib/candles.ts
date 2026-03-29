import { pool } from "../db.js";
import type { Candle, CandleInterval } from "../types.js";
import { logger } from "./logger.js";
import { TbankClient } from "./tbank.js";

const windowMsByInterval: Record<CandleInterval, number> = {
  "1m": 24 * 60 * 60 * 1000,
  "5m": 7 * 24 * 60 * 60 * 1000,
  "15m": 14 * 24 * 60 * 60 * 1000,
  "1h": 90 * 24 * 60 * 60 * 1000,
  "1d": 365 * 6 * 24 * 60 * 60 * 1000
};

export class CandleIngestionService {
  constructor(private readonly tbank: TbankClient) {}

  async ensureCandles(input: {
    env: "sandbox" | "prod";
    instrumentId: string;
    interval: CandleInterval;
    from: Date;
    to: Date;
  }): Promise<Candle[]> {
    const startedAt = Date.now();
    const windows = buildCandleWindows({
      interval: input.interval,
      from: input.from,
      to: input.to
    });
    let fetchedCandlesCount = 0;

    try {
      for (const window of windows) {
        const candles = await this.tbank.getCandles({
          env: input.env,
          instrumentId: input.instrumentId,
          interval: input.interval,
          from: window.from,
          to: window.to
        });
        fetchedCandlesCount += candles.length;
        await upsertCandles(input.instrumentId, input.interval, candles);
      }

      const storedCandles = await readCandles(
        input.instrumentId,
        input.interval,
        input.from,
        input.to
      );

      logger.info("candle_sync_completed", {
        env: input.env,
        instrumentId: input.instrumentId,
        interval: input.interval,
        from: input.from.toISOString(),
        to: input.to.toISOString(),
        windows: windows.length,
        fetchedCandlesCount,
        storedCandlesCount: storedCandles.length,
        durationMs: Date.now() - startedAt
      });

      return storedCandles;
    } catch (error) {
      logger.error("candle_sync_failed", error, {
        env: input.env,
        instrumentId: input.instrumentId,
        interval: input.interval,
        from: input.from.toISOString(),
        to: input.to.toISOString(),
        windows: windows.length,
        fetchedCandlesCount,
        durationMs: Date.now() - startedAt
      });
      throw error;
    }
  }
}

export const buildCandleWindows = (input: {
  interval: CandleInterval;
  from: Date;
  to: Date;
}) => {
  const windows: Array<{ from: Date; to: Date }> = [];
  const fromMs = input.from.getTime();
  const toMs = input.to.getTime();
  const windowMs = windowMsByInterval[input.interval];

  let cursor = fromMs;
  while (cursor < toMs) {
    const windowFrom = new Date(cursor);
    const windowTo = new Date(Math.min(cursor + windowMs, toMs));
    windows.push({ from: windowFrom, to: windowTo });
    cursor = windowTo.getTime();
  }

  return windows;
};

const upsertCandles = async (
  instrumentId: string,
  interval: CandleInterval,
  candles: Candle[]
) => {
  if (candles.length === 0) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const candle of candles) {
      await client.query(
        `
          insert into candles (instrument_id, interval, ts, open, high, low, close, volume)
          values ($1,$2,$3,$4,$5,$6,$7,$8)
          on conflict (instrument_id, interval, ts)
          do update set
            open = excluded.open,
            high = excluded.high,
            low = excluded.low,
            close = excluded.close,
            volume = excluded.volume
        `,
        [
          instrumentId,
          interval,
          candle.ts.toISOString(),
          candle.open,
          candle.high,
          candle.low,
          candle.close,
          candle.volume
        ]
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
};

export const readCandles = async (
  instrumentId: string,
  interval: CandleInterval,
  from: Date,
  to: Date
): Promise<Candle[]> => {
  const result = await pool.query<{
    ts: string;
    open: string | number;
    high: string | number;
    low: string | number;
    close: string | number;
    volume: string | number | null;
  }>(
    `
      select ts, open, high, low, close, volume
      from candles
      where instrument_id = $1
        and interval = $2
        and ts >= $3
        and ts <= $4
      order by ts asc
    `,
    [instrumentId, interval, from.toISOString(), to.toISOString()]
  );

  return result.rows.map((row) => ({
    ts: new Date(row.ts),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume ?? 0)
  }));
};
