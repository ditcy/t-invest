# Architecture

This document captures the current repo architecture for the MVP as it exists today.

## Repo Shape

The project is a small monorepo with two apps:

- `apps/api`: Express API, T-Bank integration, Postgres persistence, deterministic backtest engine
- `apps/web`: React + Vite UI for editing strategies, configuring runs, browsing history, and reviewing saved results

Supporting docs live in `docs/`.

## High-Level Flow

```text
React UI
  -> calls /api/*
Express API
  -> validates payloads with zod
  -> reads/writes Postgres
  -> calls T-Bank REST proxy when candles/accounts/instrument search need broker data
  -> runs local deterministic MA crossover backtest
Postgres
  -> stores strategies, versions, candle cache, and saved run reports
```

## API Architecture

Main entrypoint:

- `apps/api/src/index.ts`

Main responsibilities:

- route registration
- request validation
- orchestration across persistence, broker client, candles, and backtest engine
- bootstrapping the database and first strategy seed

Key modules:

- `apps/api/src/db.ts`
  creates the schema and owns the shared `pg` pool
- `apps/api/src/lib/tbank.ts`
  wraps broker REST calls, normalizes URLs, and handles search fallback behavior
- `apps/api/src/lib/candles.ts`
  windowed candle ingestion plus local cache reads
- `apps/api/src/lib/backtest.ts`
  deterministic MA crossover simulation
- `apps/api/src/lib/seed.ts`
  ensures an initial strategy exists in an empty database
- `apps/api/src/lib/llm.ts`
  LLM provider abstraction used by the Copilot UI

## Candle Data Flow

When the frontend requests candles in normal mode:

1. `GET /api/candles` validates the query.
2. `CandleIngestionService.ensureCandles()` splits the requested range into interval-sized windows.
3. Each window calls T-Bank `GetCandles`.
4. Returned candles are upserted into Postgres.
5. Final chart data is read back from the local `candles` table.

When the saved result page requests candles in `cacheOnly` mode:

1. API skips T-Bank entirely.
2. API reads only from the local candle cache.
3. This prevents the review screen from hanging on an external broker fetch.

## Backtest Architecture

Runtime engine:

- `apps/api/src/lib/backtest.ts`

Current strategy runtime:

- only `ma_crossover`
- strategy code is stored and shown in the UI, but execution uses the saved `params`

Simulation logic:

- compute SMA short and SMA long on close prices
- `BUY` when the short MA crosses above the long MA and no position is open
- `SELL` when the short MA crosses below the long MA and a position is open
- apply constant-bps slippage and fee models
- force-close an open position on the final candle

Outputs:

- metrics
- equity curve
- trade log

## Frontend Architecture

Main entrypoint:

- `apps/web/src/App.tsx`

`App.tsx` owns global state for:

- route selection
- strategy editing state
- run setup fields
- recent backtests list
- LLM panel state
- global UI settings

Current route model:

- `/workspace`
- `/backtests/new`
- `/runs`
- `/backtests/:backtestId`

Key screens:

- `WorkspacePage`
  strategy authoring and Copilot
- `BacktestSetupPage`
  run parameters and candle sync
- `RunsHistoryPage`
  compact sortable table of saved runs
- `BacktestRunPage`
  detailed review screen for a persisted run

Important review components:

- `BacktestCandlesPanel`
  chart, markers, crosshair, hover tooltip, active playback state
- `BacktestReportView`
  metrics and trade journal
- `UiSettingsPanel`
  global theme, density, and font controls

## Playback And Review Architecture

The result page reconstructs a review timeline from persisted data instead of storing a separate playback artifact.

Main module:

- `apps/web/src/lib/backtestPlayback.ts`

Inputs:

- cached candles for the run window
- persisted backtest report
- saved strategy params
- saved run params

What it does:

- recomputes MA values candle by candle
- rebuilds decision events that explain `BUY` and `SELL`
- maps persisted trades back to playback frames
- condenses very long candle series into a bounded number of frames for UI playback

This allows the UI to:

- step candle by candle or by signal
- keep chart and table synchronized
- explain what triggered each decision

## Browser State

The frontend intentionally persists a few UX preferences in `localStorage`:

- recent instrument selections
- playback speed
- result layout mode
- global UI theme, spacing, and font

These are UI conveniences only; the source of truth for strategies, candles, and runs remains the API + Postgres.

## Current Architectural Constraints

- No dedicated router library yet; navigation is managed with `window.history` and a small route parser in `App.tsx`.
- No migration system yet; schema changes are bootstrapped imperatively in `db.ts`.
- No background jobs or queue; backtests run synchronously inside the API request.
- No auth or multi-user ownership model beyond the local placeholder user id.
- No generic strategy execution sandbox yet; runtime behavior is fixed to MA crossover params.
