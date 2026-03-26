import { Pool } from "pg";
import { config } from "./config.js";

export const pool = new Pool({
  host: config.PG_HOST,
  port: config.PG_PORT,
  database: config.PG_DATABASE,
  user: config.PG_USER,
  password: config.PG_PASSWORD,
  max: 8
});

export const initDb = async () => {
  await pool.query(`
    create table if not exists strategies (
      id uuid primary key,
      user_id text not null,
      name text not null,
      created_at timestamptz not null default now()
    );
  `);

  await pool.query(`
    create table if not exists strategy_versions (
      id uuid primary key,
      strategy_id uuid not null references strategies(id),
      version int not null,
      language text not null default 'typescript',
      code text not null,
      params jsonb not null default '{}'::jsonb,
      risk_config jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      unique(strategy_id, version)
    );
  `);

  await pool.query(`
    create table if not exists candles (
      instrument_id text not null,
      interval text not null,
      ts timestamptz not null,
      open numeric not null,
      high numeric not null,
      low numeric not null,
      close numeric not null,
      volume numeric,
      primary key (instrument_id, interval, ts)
    );
  `);

  await pool.query(`
    create table if not exists backtest_runs (
      id uuid primary key,
      strategy_version_id uuid not null references strategy_versions(id),
      status text not null,
      from_ts timestamptz not null,
      to_ts timestamptz not null,
      candle_interval text not null,
      instruments text[] not null,
      fees_model jsonb not null,
      slippage_model jsonb not null,
      metrics jsonb,
      report jsonb,
      error text,
      created_at timestamptz not null default now()
    );
  `);

  await pool.query(`
    alter table backtest_runs
    add column if not exists run_params jsonb not null default '{}'::jsonb;
  `);

  await pool.query(`
    alter table backtest_runs
    add column if not exists candles_count int;
  `);
};

export const closeDb = async () => {
  await pool.end();
};
