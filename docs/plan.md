# Invest Codex Plan

## Goal
Build a web AI-first trading IDE MVP based on `spec.md` with a secure backend that keeps T-Bank tokens server-side, supports candle ingestion, strategy versioning, and deterministic backtests.

## Phase Plan

1. Phase 1 (current target): Foundation IDE + Backtest MVP
- Monorepo and CI-ready scripts.
- Backend API with env config and T-Bank connector wrapper.
- Candle ingestion with interval windowing and local cache in Postgres.
- Strategy versioning (TypeScript source + params).
- Backtest runner (MA crossover + fees/slippage) and report API.
- Frontend workspace (editor + forms + report + accounts panel).

2. Phase 2: Live Trading MVP
- OMS, idempotency key persistence, place/cancel/replace.
- Stream order events and reconciliation loop.
- Audit trail and kill switch.

3. Phase 3: AI-first Layer
- Copilot for strategy authoring and review.
- Explainability and risk warnings.
- Optional predictive models and shadow rollout.

## Current MVP Scope Decisions
- Environment support: sandbox/prod via backend env vars.
- Database: Postgres with minimal schema bootstrap on API start.
- Strategy runtime: deterministic built-in MA crossover model using strategy params while preserving editable TS source.
- Backtest execution: synchronous for MVP, deterministic and reproducible from strategy version + dataset.
