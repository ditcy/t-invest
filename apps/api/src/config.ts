import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

const candidateEnvFiles = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../.env"),
  path.resolve(process.cwd(), "../../../.env")
];

for (const envPath of candidateEnvFiles) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
    break;
  }
}

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(7100),
  PG_HOST: z.string().min(1).default("localhost"),
  PG_PORT: z.coerce.number().int().default(5432),
  PG_DATABASE: z.string().min(1).default("invest_dev"),
  PG_USER: z.string().min(1).default("invest"),
  PG_PASSWORD: z.string().default("invest"),
  TINV_ENV: z.enum(["sandbox", "prod"]).default("sandbox"),
  TINV_PROD_ENDPOINT: z.string().url().default("https://invest-public-api.tbank.ru/rest"),
  TINV_SANDBOX_ENDPOINT: z.string().url().default("https://sandbox-invest-public-api.tbank.ru/rest"),
  TINV_PROD_TOKEN: z.string().optional(),
  TINV_SANDBOX_TOKEN: z.string().optional(),
  TBANK_INVEST_API_URL: z.string().url().optional(),
  TBANK_INVEST_TOKEN: z.string().optional(),
  CLAUDE_API_KEY: z.string().optional(),
  CLAUDE_BASE_URL: z.string().url().default("https://api.anthropic.com"),
  CLAUDE_MAX_TOKENS: z.coerce.number().int().min(64).max(8192).default(1200),
  TBANK_INVEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15000)
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("Invalid environment configuration", parsedEnv.error.flatten());
  process.exit(1);
}

export const config = parsedEnv.data;

export type AppConfig = typeof config;
