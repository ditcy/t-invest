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

## Current Status Against Global Plan

### Phase 1: Foundation IDE + Backtest MVP

Status: complete for the current local MVP baseline

Clearly in place:

- Monorepo with `apps/api` and `apps/web`
- Local run, typecheck, and build flows
- Root `.env.example` template for onboarding
- API test baseline for candle windowing and backtest determinism
- Lightweight structured observability for HTTP requests, candle sync, and backtest execution
- T-Bank-backed accounts and instrument search
- Candle ingestion with local Postgres cache
- Strategy version persistence with saved code, params, and risk config
- Deterministic MA crossover backtest engine with fees and slippage
- Saved backtest runs with detail page and persisted report payload
- Frontend split into workspace, run setup, history, and saved result review
- Candlestick chart, trade markers, playback, and decision explanations
- Optional LLM Copilot integration with `mock` and `claude`

Partially implemented or simplified versus the broader `spec.md`:

- Strategy authoring is versioned in TypeScript, but runtime still executes only saved MA params instead of arbitrary strategy code
- Backtests run synchronously in-request, not through a worker or job queue
- Observability is still lightweight; there is no dedicated metrics/tracing layer yet
- Auth/RBAC skeleton from the original spec is not present yet
- Testing is still intentionally small and focused on the most failure-prone deterministic paths

### Phase 2: Live Trading MVP

Status: not started

Missing major deliverables:

- OMS with persistent idempotency keys
- Place/cancel/replace execution flow
- Streaming order events and live monitor UI
- Reconciliation loop
- Audit trail
- Risk controls and live kill switch

### Phase 3: AI-First Layer

Status: started only at the foundation level

What exists:

- Copilot entrypoint in the workspace
- Saved result review UX that already supports decision explanations for the deterministic strategy model

What is still missing:

- AI-assisted strategy generation/editing with stronger guardrails
- Backtest explanation endpoint/service beyond local deterministic playback reasoning
- Explicit risk warnings flow
- Predictive model training/inference pipeline
- Explainability/drift monitoring
- Shadow rollout and safety harness testing

## Recommended Next Steps

Recommended order for the next serious milestones:

1. Finish remaining Phase 1 hardening:
- expand the new test baseline toward saved run API contracts and error paths
- keep observability lightweight but start defining the metrics that Phase 2 will need
- keep documentation explicit about the gap between saved strategy code and current runtime execution

2. Prepare the bridge into Phase 2:
- introduce persistence for live-trading entities such as `orders`, `fills`, and `audit_events`
- define the OMS API surface and idempotency model before UI work starts
- choose the streaming approach for market/order events

3. Expand the AI layer only after the execution baseline is safer:
- keep Copilot scoped to authoring/review
- add explicit risk-warning UX and explanation services on top of saved run data
- defer predictive-model work until Phase 2 execution paths are stable

## Current MVP Scope Decisions
- Environment support: sandbox/prod via backend env vars.
- Database: Postgres with minimal schema bootstrap on API start.
- Strategy runtime: deterministic built-in MA crossover model using strategy params while preserving editable TS source.
- Backtest execution: synchronous for MVP, deterministic and reproducible from strategy version + dataset.
