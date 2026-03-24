# Codex Setup

This document is for opening the repo on another computer, especially inside Codex.

## Prerequisites

- Node.js 20.x
- npm
- Local Postgres 14+ or any reachable PostgreSQL instance
- T-Bank Invest token for `sandbox` or `prod`
- Optional: `CLAUDE_API_KEY` for Anthropic support in the UI

## First Start On A New Machine

1. Clone the repository.
2. Run `npm install` in the repo root.
3. Copy `.env.example` to `.env`.
4. Fill in PostgreSQL credentials.
5. Fill in T-Bank token values.
6. Start Postgres.
7. Start the app:

```bash
npm run dev
```

If the machine sits behind a corporate proxy or local root CA, T-Bank requests may fail with `SELF_SIGNED_CERT_IN_CHAIN`. In local dev use one of these:

```bash
NODE_EXTRA_CA_CERTS=/path/to/ca.pem npm run dev
```

or, less safe:

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 npm run dev
```

## Local URLs

- Web UI: `http://127.0.0.1:7001`
- API: `http://127.0.0.1:7100`

## Quick Validation

1. Open the UI.
2. Click `Load Accounts`.
3. In `Instrument Search`, type `sber` or `mvi`.
4. Pick a suggestion from the T-Bank-backed dropdown.
5. Click `Run Backtest`.

## Main Scripts

- `npm run dev` starts API and web together and kills stale processes on known ports first
- `npm run dev:api` starts only the API
- `npm run dev:web` starts only the frontend
- `npm run typecheck` runs TypeScript checks for both apps
- `npm run build` builds both apps

## Project Layout

- `apps/api` Express + TypeScript API
- `apps/web` React + Vite frontend
- `docs/plan.md` original implementation plan
- `spec.md` product and technical spec
- `AGENTS.md` Codex-specific repo guidance

## Current Product Scope

- Strategy workspace with saved versions
- Deterministic MA crossover backtest
- Candle sync from T-Bank REST proxy
- Instrument search with recent-memory dropdown
- LLM Copilot with `mock` and optional `claude` providers

## Known Constraints

- Runtime backtest logic currently uses MA params from the form, not arbitrary code execution from the editor
- Instrument suggestions depend on broker API availability and local TLS trust chain
- The search dropdown stores recent selections in browser `localStorage`
- The API loads `.env` from the root repo automatically

## Useful Troubleshooting

### Ports already used

`npm run dev` already runs `npm run stop`, which kills processes on `7100`, `7001`, and older `7000`, `3000`, `5173`.

### Postgres connection issues

Check `PG_HOST`, `PG_PORT`, `PG_DATABASE`, `PG_USER`, `PG_PASSWORD` in `.env`.

### No instrument suggestions

- Confirm the API is running
- Confirm T-Bank token is valid
- Check whether the UI shows a search error under the field
- If the error mentions TLS, use `NODE_EXTRA_CA_CERTS` or the insecure local dev workaround above
