import { pool } from "../db.js";
import type { Candle, CandleInterval } from "../types.js";
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
    const fromMs = input.from.getTime();
    const toMs = input.to.getTime();
    const windowMs = windowMsByInterval[input.interval];

    let cursor = fromMs;
    while (cursor < toMs) {
      const windowFrom = new Date(cursor);
      const windowTo = new Date(Math.min(cursor + windowMs, toMs));
      const candles = await this.tbank.getCandles({
        env: input.env,
        instrumentId: input.instrumentId,
        interval: input.interval,
        from: windowFrom,
        to: windowTo
      });
      await upsertCandles(input.instrumentId, input.interval, candles);
      cursor = windowTo.getTime();
    }

    return readCandles(input.instrumentId, input.interval, input.from, input.to);
  }
}

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
