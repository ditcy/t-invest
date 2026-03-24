import { v4 as uuidv4 } from "uuid";
import { pool } from "../db.js";

const FIRST_STRATEGY_CODE = `// First strategy
// MA crossover template for Invest Codex MVP

export const strategy = {
  kind: "ma_crossover",
  shortPeriod: 20,
  longPeriod: 50,
  positionSize: 1
};
`;

const FIRST_STRATEGY_PARAMS = {
  kind: "ma_crossover",
  shortPeriod: 20,
  longPeriod: 50,
  positionSize: 1
} as const;

const FIRST_STRATEGY_RISK = {
  maxPositionNotional: 500_000,
  killSwitchEnabled: true
} as const;

export const ensureFirstStrategy = async () => {
  const countResult = await pool.query<{ count: number | string }>(
    "select count(*) as count from strategies"
  );
  const existingCount = Number(countResult.rows[0]?.count ?? 0);

  if (existingCount > 0) {
    return null;
  }

  const strategyId = uuidv4();
  const versionId = uuidv4();

  const client = await pool.connect();
  try {
    await client.query("begin");

    await client.query(
      `
      insert into strategies (id, user_id, name)
      values ($1, $2, $3)
      `,
      [strategyId, "local-user", "First Strategy: MA Crossover"]
    );

    await client.query(
      `
      insert into strategy_versions (id, strategy_id, version, language, code, params, risk_config)
      values ($1, $2, 1, 'typescript', $3, $4::jsonb, $5::jsonb)
      `,
      [
        versionId,
        strategyId,
        FIRST_STRATEGY_CODE,
        JSON.stringify(FIRST_STRATEGY_PARAMS),
        JSON.stringify(FIRST_STRATEGY_RISK)
      ]
    );

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  return {
    strategyId,
    strategyVersionId: versionId
  };
};
