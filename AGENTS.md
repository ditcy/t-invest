# AGENTS.md

## Repo Purpose

This repository is a local trading/backtesting MVP for T-Bank Invest API:

- `apps/api`: Express control API, candle ingestion, strategy persistence, deterministic backtest, LLM proxy endpoints
- `apps/web`: React UI for strategy editing, instrument search, backtest runs, and AI Copilot

## What A New Codex Session Should Know First

1. Read `README.md` for the high-level overview.
2. Read `docs/codex-setup.md` for machine setup and run flow.
3. Read `spec.md` only when product intent or upstream constraints matter.
4. Prefer changing code over writing speculative plans unless the user explicitly asks for planning only.

## Run Commands

Run from repo root:

- `npm install`
- `npm run dev`
- `npm run typecheck`
- `npm run build`

Ports:

- API: `7100`
- Web: `7001`

`npm run dev` already kills stale processes on `7100`, `7001`, `7000`, `3000`, `5173`.

## Cross-platform (Windows & macOS)

When you add or change **npm scripts**, **tooling**, or anything that looks like a shell one-liner, keep **Windows and macOS** in mind (npm on Windows runs scripts through `cmd.exe`, not Bash).

- Prefer portable patterns: `cross-env` for environment variables, packages like `kill-port` or small Node scripts instead of `sh`/`lsof`/`xargs`, and runners like `tsx` instead of Bash-only `node --import 'data:…'` quoting.
- Avoid Unix-only syntax in scripts (`VAR=value command`, `${VAR:-default}`, single-quoted multi-part arguments) unless you document a WSL/Git-Bash-only workflow.

## Environment

The root `.env` is the source of truth. Use `.env.example` as a template.

Important variables:

- `PORT`
- `PG_HOST`, `PG_PORT`, `PG_DATABASE`, `PG_USER`, `PG_PASSWORD`
- `TINV_SANDBOX_TOKEN`, `TINV_PROD_TOKEN`
- `TINV_SANDBOX_ENDPOINT`, `TINV_PROD_ENDPOINT`
- `CLAUDE_API_KEY` optional

The API auto-loads `.env` from the repo root.

## Known Local Dev Issue

T-Bank calls may fail with `SELF_SIGNED_CERT_IN_CHAIN` on some machines. Preferred fix:

```bash
NODE_EXTRA_CA_CERTS=/path/to/ca.pem npm run dev
```

Fallback for local-only debugging:

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 npm run dev
```

## Current Functional Scope

- Strategy version persistence in Postgres
- First strategy auto-seed on API startup
- Candle cache in Postgres
- Deterministic MA crossover backtest
- Instrument search backed by T-Bank API with local recent-memory dropdown in the UI
- LLM provider selection in UI with `mock` and optional `claude`

## Important Product / Code Constraints

- The editor stores strategy code, but runtime backtest logic currently executes the MA crossover params, not arbitrary user code
- Instrument search uses T-Bank API first, then a cached instrument catalog fallback if direct search returns empty
- Recent instrument selections are stored in browser `localStorage`
- Frontend proxies `/api` to `http://127.0.0.1:7100`

## High-Value Files

- `apps/api/src/index.ts` main API routes
- `apps/api/src/lib/tbank.ts` T-Bank transport and instrument search
- `apps/api/src/lib/backtest.ts` backtest engine
- `apps/web/src/App.tsx` current main screen
- `apps/web/src/components/SearchDropdown.tsx` reusable async dropdown with memory
- `docs/codex-setup.md` onboarding on a new machine

## Change Guidance

- Prefer small, surgical changes
- Keep root docs in sync when changing ports, env vars, startup flow, or architecture
- If changing search/backtest behavior, update the user-facing docs
- Do not commit secrets or copy `.env` values into tracked files
