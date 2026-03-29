# Data Model

This document describes the current persisted model in Postgres.

Schema bootstrap happens in `apps/api/src/db.ts` on API start.

## Overview

The MVP persists four main entities:

1. `strategies`
2. `strategy_versions`
3. `candles`
4. `backtest_runs`

The design keeps strategy metadata, version snapshots, market data cache, and saved run results separate.

## `strategies`

Represents a logical strategy owned by the local user.

Columns:

- `id uuid primary key`
- `user_id text not null`
- `name text not null`
- `created_at timestamptz not null default now()`

Notes:

- Current MVP uses a single local user id.
- Name can be updated when saving a new version through `POST /api/strategies`.

## `strategy_versions`

Immutable snapshots of strategy source plus param config.

Columns:

- `id uuid primary key`
- `strategy_id uuid not null references strategies(id)`
- `version int not null`
- `language text not null default 'typescript'`
- `code text not null`
- `params jsonb not null default '{}'::jsonb`
- `risk_config jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

Constraint:

- `unique(strategy_id, version)`

Stored meaning:

- `code` is the saved source snapshot shown later on the result page.
- `params` is the runtime config actually used by the deterministic backtest engine.
- `risk_config` is currently persisted for inspection only.

## `candles`

Local OHLCV cache keyed by instrument, interval, and timestamp.

Columns:

- `instrument_id text not null`
- `interval text not null`
- `ts timestamptz not null`
- `open numeric not null`
- `high numeric not null`
- `low numeric not null`
- `close numeric not null`
- `volume numeric`

Primary key:

- `(instrument_id, interval, ts)`

Behavior:

- Candle ingestion upserts rows fetched from T-Bank.
- The result page reads this table in `cacheOnly` mode to avoid re-fetching broker data.

## `backtest_runs`

Persisted backtest execution records plus the saved report payload.

Columns:

- `id uuid primary key`
- `strategy_version_id uuid not null references strategy_versions(id)`
- `status text not null`
- `from_ts timestamptz not null`
- `to_ts timestamptz not null`
- `candle_interval text not null`
- `instruments text[] not null`
- `fees_model jsonb not null`
- `slippage_model jsonb not null`
- `metrics jsonb`
- `report jsonb`
- `error text`
- `created_at timestamptz not null default now()`
- `run_params jsonb not null default '{}'::jsonb`
- `candles_count int`

Stored meaning:

- `run_params` keeps the original launch payload from the UI.
- `metrics` stores the compact summary used by history screens.
- `report` stores the detailed backtest payload with equity curve and trades.
- `candles_count` avoids recomputing simple counts for saved runs.
- `status` is currently written as `succeeded` on the normal path.

## Relationships

```text
strategies 1 --- n strategy_versions 1 --- n backtest_runs
candles is independent cache data keyed by market identity
```

Typical flow:

1. User creates or updates a strategy.
2. API writes a new `strategy_versions` row.
3. Candle sync fills `candles`.
4. Backtest saves one `backtest_runs` row pointing to the exact `strategy_versions` snapshot.

## Runtime JSON Shapes

### Strategy params

Current supported shape:

```json
{
  "kind": "ma_crossover",
  "shortPeriod": 20,
  "longPeriod": 50,
  "positionSize": 1
}
```

### Example `risk_config`

```json
{
  "maxPositionNotional": 500000,
  "killSwitchEnabled": true
}
```

### Example `fees_model` and `slippage_model`

```json
{
  "model": "constant_bps",
  "bps": 3
}
```

### Example `metrics`

```json
{
  "startEquity": 100000,
  "endEquity": 104210.41,
  "returnPct": 4.21,
  "maxDrawdownPct": 2.34,
  "tradesCount": 8,
  "winRatePct": 50
}
```

### Example `report`

```json
{
  "metrics": {
    "startEquity": 100000,
    "endEquity": 104210.41,
    "returnPct": 4.21,
    "maxDrawdownPct": 2.34,
    "tradesCount": 8,
    "winRatePct": 50
  },
  "equityCurve": [
    {
      "ts": "2026-03-01T10:00:00.000Z",
      "equity": 100320.11
    }
  ],
  "trades": [
    {
      "side": "BUY",
      "ts": "2026-03-01T10:00:00.000Z",
      "price": 312.8,
      "qty": 100,
      "fee": 9.38
    }
  ]
}
```

## Current Data Limits

- There is no migration framework yet; schema evolves with `create table if not exists` and `alter table ... add column if not exists`.
- `backtest_runs` currently stores a single instrument id inside the `instruments` array, even though the column is an array.
- `risk_config` is persisted and displayed, but not enforced by the runtime backtest engine.
- There is no separate table for trades or equity curve; both are embedded in `report`.
