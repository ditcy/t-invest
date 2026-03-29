# UI Workflow

This document captures the current frontend workflow and review UX for the local backtesting MVP.

## Main Navigation

The app is split into dedicated screens instead of one long page:

- `Workspace`
- `Run Backtest`
- `Runs History`
- `Saved Result` (`/backtests/:backtestId`)

This keeps editing, setup, history browsing, and result analysis separated.

## Workspace

`Workspace` is the editing screen for the current strategy.

It includes:

- Strategy code editor
- Strategy name
- MA crossover params (`shortPeriod`, `longPeriod`, `positionSize`)
- Current saved version status
- `AI Copilot` panel with provider/model selection and saved response area

Key behavior:

- Saving creates a new persisted strategy version
- Running a backtest from the run page will save a fresh version first if the strategy has unsaved changes

## Run Backtest

`Run Backtest` is the isolated setup screen for backtests.

It includes:

- Environment selection (`sandbox` or `prod`)
- Broker account loading
- Instrument search with recent-memory dropdown
- Market data range and interval
- Fees, slippage, and initial cash
- Strategy snapshot showing which saved/new version will be used

Key behavior:

- `Sync Candles` fetches or warms the candle cache
- `Run and Open Result` starts the backtest and navigates directly to the saved result page

## Runs History

`Runs History` shows compact saved runs in a sortable table.

It includes:

- Search by strategy name, strategy/version ID, instrument, or run ID
- Sortable columns for date, strategy, instrument, return, trades, end equity, and status
- Row click navigation into the saved result page

The table is meant for fast lookup rather than detailed analysis.

## Saved Result Page

`Saved Result` is the main review screen for a persisted backtest run.

It includes:

- Breadcrumb back to `Runs History`
- Strategy/version snapshot
- Run parameters
- Collapsible `Risk Config`
- Collapsible `Code Snapshot`
- Candlestick chart with BUY/SELL markers
- Playback controls and decision inspector
- Trade table and summary metrics

### Chart

The candlestick chart is based on the saved candle range for the run.

It supports:

- OHLC candle rendering
- BUY and SELL markers
- Hover crosshair
- Hover tooltip with candle values and nearby trade labels
- Active playback step highlight

If the run contains many candles, the chart is condensed into display buckets while preserving trade markers.

### Playback

Playback sits under the chart and is used to replay the run step by step.

Controls include:

- `Play / Pause`
- `Prev / Next`
- `Prev Signal / Next Signal`
- Speed selector (`0.5x / 1x / 2x / 4x`)
- Step slider

Current playback state shows:

- Active step range
- Close, position qty, short MA, long MA, cash
- Number of decision points in the step
- `Decision Inspector` explaining what triggered the BUY or SELL

Playback state persists partially in browser storage:

- Playback speed is saved in `localStorage`

### Playback Internals

Playback is reconstructed on the frontend from persisted data instead of being stored as a separate backend artifact.

The review screen combines:

- cached candles for the saved run window
- the persisted run report
- saved strategy params
- saved run params

From that, the frontend rebuilds:

- MA values per step
- decision points for `BUY` and `SELL`
- mapping from trade rows to playback steps
- a condensed frame timeline when the raw candle count is large

This is why the page can explain decision triggers and stay synchronized between chart and trade table without requiring an extra playback table in the database.

### Analysis Layout

The result page contains an `Analysis Workspace` selector.

Available layouts:

- `Stacked`
- `Side by Side`

In `Side by Side`, the chart and playback stay on the left and the trade table stays on the right.

## Global UI Settings

A floating, collapsible `UI Settings` panel is available across the app.

It currently controls:

- Theme: `dark` / `light`
- Spacing density
- Font preset

These settings are persisted in browser `localStorage` and applied globally through CSS variables and theme tokens.

## Persisted Browser State

The frontend currently uses browser storage for several convenience features:

- Recent instrument selections in the search dropdown
- Playback speed
- Result page layout
- Global UI settings (theme, spacing, font)
