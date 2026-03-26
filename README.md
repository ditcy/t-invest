# Invest Codex MVP

Phase-1 MVP from `spec.md`: strategy workspace, T-Bank candle ingestion, instrument search, deterministic backtesting, and optional LLM copilot.

## Open In Codex On Another Computer

Use these files first:

- [`docs/codex-setup.md`](docs/codex-setup.md) machine setup and first run
- [`AGENTS.md`](AGENTS.md) repo-specific guidance for Codex
- [`.env.example`](.env.example) safe environment template

## What is implemented

- Monorepo with two apps:
- `apps/api` (Node.js + Express + TypeScript + Postgres)
- `apps/web` (React + Vite + Tailwind)
- Strategy versioning (TypeScript source + params)
- First strategy auto-seed on API start (if DB has no strategies yet)
- Candle ingestion from T-Bank REST proxy with interval windowing and cache in Postgres
- Deterministic MA crossover backtest with fees/slippage model
- Persisted backtest runs with run parameters and a saved detail page per run
- Candlestick chart for each run with BUY/SELL markers from the trade log
- Accounts API (proxy to T-Bank users service)
- T-Bank-backed instrument search with recent-memory dropdown
- UI for saving strategy versions, syncing candles, running backtests, and querying LLM providers

## Environment

The API reads root `.env` values. Start from [`.env.example`](.env.example).

- `PORT`
- `PG_HOST`, `PG_PORT`, `PG_DATABASE`, `PG_USER`, `PG_PASSWORD`
- `TINV_ENV=sandbox|prod`
- `TINV_SANDBOX_ENDPOINT`, `TINV_PROD_ENDPOINT`
- `TINV_SANDBOX_TOKEN`, `TINV_PROD_TOKEN`
- Legacy fallback: `TBANK_INVEST_API_URL`, `TBANK_INVEST_TOKEN`
- `CLAUDE_API_KEY` (optional, enables Anthropic Claude provider in UI/API)
- `CLAUDE_BASE_URL` (optional, default `https://api.anthropic.com`)
- `CLAUDE_MAX_TOKENS` (optional, default `1200`)

Tokens are used only server-side.

## Run

1. Install dependencies:

```bash
npm install
```

2. Ensure Postgres is available with credentials from `.env`.

3. Start both services in one command:

```bash
npm run dev
```

If T-Bank requests fail with `SELF_SIGNED_CERT_IN_CHAIN`, prefer:

```bash
NODE_EXTRA_CA_CERTS=/path/to/ca.pem npm run dev
```

Or use a dedicated command (defaults to `./certs/ca.pem`, can be overridden):

```bash
npm run dev:ca
# or
NODE_EXTRA_CA_CERTS=/absolute/path/to/ca.pem npm run dev:ca
```

Fallback for local-only debugging:

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 npm run dev
```

or:

```bash
npm run dev:insecure
```

`npm run dev` now auto-cleans occupied ports (`7100/7001`, plus old `7000/3000/5173`) before start.

If you want explicit reset command:

```bash
npm run dev:reset
```

Alternative (separate terminals):

```bash
npm run dev:api
npm run dev:web
```

4. Open the UI at `http://127.0.0.1:7001`.

## API endpoints

- `GET /api/health`
- `GET /api/broker/health?env=sandbox|prod`
- `GET /api/accounts?env=sandbox|prod`
- `GET /api/instruments/search?query=...&env=sandbox|prod&limit=8`
- `GET /api/llm/options`
- `POST /api/llm/chat`
- `GET /api/candles?instrumentId=...&interval=1h&from=...&to=...&env=sandbox|prod`
- `POST /api/strategies`
- `GET /api/strategies`
- `GET /api/strategies/:strategyId/versions`
- `POST /api/backtests`
- `GET /api/backtests?limit=8&strategyId=...&strategyVersionId=...`
- `GET /api/backtests/:backtestId`

## Plan

Detailed phase plan: [`docs/plan.md`](docs/plan.md)
