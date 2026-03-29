# API Contract

This document captures the current HTTP contract exposed by `apps/api`.

Base URL in local dev:

- Web proxy target: `http://127.0.0.1:7100`
- Frontend usually calls the same routes through `/api`

## Conventions

- All bodies are JSON.
- Validation is handled with `zod`.
- Validation failures return `400`.
- Unexpected server errors return `500` with `{ "error": "..." }`.
- Dates are exchanged as ISO 8601 strings.

## Health And Broker

### `GET /api/health`

Checks API and Postgres reachability.

Response:

```json
{
  "status": "ok",
  "db": "ok"
}
```

### `GET /api/broker/health?env=sandbox|prod`

Checks whether the selected T-Bank environment is reachable by attempting to read accounts.

Successful response:

```json
{
  "status": "ok",
  "env": "sandbox",
  "accountsCount": 1
}
```

Broker transport failures return `502`.

### `GET /api/accounts?env=sandbox|prod`

Returns broker accounts for the selected environment.

Response:

```json
{
  "accounts": [
    {
      "accountId": "123",
      "name": "Sandbox",
      "type": "ACCOUNT_TYPE_TINKOFF",
      "status": "ACCOUNT_STATUS_OPEN",
      "env": "sandbox"
    }
  ]
}
```

## Instruments And Candles

### `GET /api/instruments/search`

Query params:

- `query` required
- `env` optional, default `sandbox`
- `limit` optional, default `8`, max `20`

Response:

```json
{
  "instruments": [
    {
      "instrumentId": "BBG004730N88",
      "uid": "a1b2",
      "figi": "BBG004730N88",
      "ticker": "SBER",
      "classCode": "TQBR",
      "isin": "RU0009029540",
      "name": "Sberbank",
      "instrumentType": "share",
      "apiTradeAvailable": true
    }
  ]
}
```

Behavior:

- API tries T-Bank `FindInstrument` first.
- If direct results are empty, it falls back to a cached instrument catalog.

### `GET /api/candles`

Query params:

- `instrumentId` required
- `interval` required: `1m | 5m | 15m | 1h | 1d`
- `from` required ISO string
- `to` required ISO string
- `env` optional, default `sandbox`
- `cacheOnly` optional boolean-like string

Normal mode:

- API fetches missing candle windows from T-Bank and upserts them into Postgres.

`cacheOnly=true` mode:

- API reads only from the local `candles` table.
- No outbound broker request is made.

Response:

```json
{
  "candles": [
    {
      "ts": "2026-03-01T10:00:00.000Z",
      "open": 312.4,
      "high": 313.1,
      "low": 311.9,
      "close": 312.8,
      "volume": 105320
    }
  ],
  "interval": "1h",
  "count": 1
}
```

## Strategies

### `GET /api/strategies`

Returns strategies with their latest saved version.

Response shape:

```json
{
  "strategies": [
    {
      "strategy_id": "uuid",
      "name": "MA Crossover MVP",
      "created_at": "2026-03-29T09:00:00.000Z",
      "latest_version_id": "uuid",
      "latest_version": 3,
      "latest_params": {
        "kind": "ma_crossover",
        "shortPeriod": 20,
        "longPeriod": 50,
        "positionSize": 1
      }
    }
  ]
}
```

### `GET /api/strategies/:strategyId/versions`

Returns every saved version for a strategy, newest first.

Response:

```json
{
  "versions": [
    {
      "id": "uuid",
      "strategy_id": "uuid",
      "version": 3,
      "code": "export const strategy = ...",
      "params": {
        "kind": "ma_crossover",
        "shortPeriod": 20,
        "longPeriod": 50,
        "positionSize": 1
      },
      "risk_config": {},
      "created_at": "2026-03-29T09:00:00.000Z"
    }
  ]
}
```

### `POST /api/strategies`

Creates a new strategy or appends a new version to an existing one.

Request:

```json
{
  "strategyId": "optional-uuid",
  "name": "MA Crossover MVP",
  "code": "export const strategy = {...}",
  "params": {
    "kind": "ma_crossover",
    "shortPeriod": 20,
    "longPeriod": 50,
    "positionSize": 1
  },
  "riskConfig": {
    "maxPositionNotional": 500000,
    "killSwitchEnabled": true
  }
}
```

Response:

```json
{
  "strategyId": "uuid",
  "strategyVersionId": "uuid",
  "version": 4
}
```

Notes:

- If `strategyId` is omitted, a new strategy row is created.
- If `strategyId` is present, the strategy name is updated and a new version row is appended.

## Backtests

### `POST /api/backtests`

Runs a deterministic MA crossover backtest and persists the result.

Request:

```json
{
  "strategyVersionId": "uuid",
  "instrumentId": "BBG004730N88",
  "interval": "1h",
  "from": "2026-02-01T00:00:00.000Z",
  "to": "2026-03-01T00:00:00.000Z",
  "feesBps": 3,
  "slippageBps": 5,
  "initialCash": 100000,
  "env": "sandbox"
}
```

Successful response:

```json
{
  "backtestId": "uuid",
  "strategyVersionId": "uuid",
  "candlesCount": 240,
  "report": {
    "metrics": {
      "startEquity": 100000,
      "endEquity": 104210.41,
      "returnPct": 4.21,
      "maxDrawdownPct": 2.34,
      "tradesCount": 8,
      "winRatePct": 50
    },
    "equityCurve": [],
    "trades": []
  }
}
```

Special cases:

- `404` if the strategy version does not exist.
- `422` if no candles are available for the selected range after sync.

### `GET /api/backtests`

Returns compact saved runs for history view.

Query params:

- `strategyId` optional
- `strategyVersionId` optional
- `limit` optional, default `12`, max `50`

Response shape:

```json
{
  "backtests": [
    {
      "backtestId": "uuid",
      "status": "succeeded",
      "createdAt": "2026-03-29T09:00:00.000Z",
      "candlesCount": 240,
      "error": null,
      "strategy": {
        "strategyId": "uuid",
        "name": "MA Crossover MVP"
      },
      "strategyVersion": {
        "strategyVersionId": "uuid",
        "version": 4
      },
      "runParams": {
        "strategyVersionId": "uuid",
        "instrumentId": "BBG004730N88",
        "interval": "1h",
        "from": "2026-02-01T00:00:00.000Z",
        "to": "2026-03-01T00:00:00.000Z",
        "feesBps": 3,
        "slippageBps": 5,
        "initialCash": 100000,
        "env": "sandbox"
      },
      "metrics": {
        "startEquity": 100000,
        "endEquity": 104210.41,
        "returnPct": 4.21,
        "maxDrawdownPct": 2.34,
        "tradesCount": 8,
        "winRatePct": 50
      }
    }
  ]
}
```

### `GET /api/backtests/:backtestId`

Returns a persisted run plus the exact saved strategy snapshot used for that run.

Response shape:

```json
{
  "backtest": {
    "backtestId": "uuid",
    "status": "succeeded",
    "createdAt": "2026-03-29T09:00:00.000Z",
    "candlesCount": 240,
    "error": null,
    "strategy": {
      "strategyId": "uuid",
      "name": "MA Crossover MVP"
    },
    "strategyVersion": {
      "strategyVersionId": "uuid",
      "version": 4,
      "createdAt": "2026-03-29T08:55:00.000Z",
      "code": "export const strategy = {...}",
      "params": {
        "kind": "ma_crossover",
        "shortPeriod": 20,
        "longPeriod": 50,
        "positionSize": 1
      },
      "riskConfig": {
        "maxPositionNotional": 500000,
        "killSwitchEnabled": true
      }
    },
    "runParams": {
      "strategyVersionId": "uuid",
      "instrumentId": "BBG004730N88",
      "interval": "1h",
      "from": "2026-02-01T00:00:00.000Z",
      "to": "2026-03-01T00:00:00.000Z",
      "feesBps": 3,
      "slippageBps": 5,
      "initialCash": 100000,
      "env": "sandbox"
    },
    "metrics": {},
    "report": {
      "metrics": {},
      "equityCurve": [],
      "trades": []
    }
  }
}
```

## LLM Endpoints

### `GET /api/llm/options`

Returns provider and model options available to the frontend.

### `POST /api/llm/chat`

Request:

```json
{
  "provider": "mock",
  "model": "mock-echo-v1",
  "prompt": "Review this strategy",
  "systemPrompt": "optional"
}
```

Response:

```json
{
  "provider": "mock",
  "model": "mock-echo-v1",
  "text": "response text",
  "usage": {
    "inputTokens": null,
    "outputTokens": null
  }
}
```

## Current Contract Limits

- Runtime execution supports only `ma_crossover`, even though strategy code is stored as text.
- Runs are persisted only after a successful synchronous backtest path.
- There is no dedicated cancel, rerun, or delete API for saved runs yet.
