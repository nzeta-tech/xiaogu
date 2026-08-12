import { Pool, type QueryResultRow } from "pg";

let pool: Pool | undefined;

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getPool() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!pool) {
    const production = process.env.NODE_ENV === "production" || process.env.APP_ENV === "production";
    pool = new Pool({
      connectionString: databaseUrl,
      // Keep the aggregate connection budget conservative across the three-node
      // production fleet. This prevents one slow query family from consuming 30
      // concurrent RDS connections and starving readiness/authentication probes.
      max: positiveInteger(process.env.DATABASE_POOL_MAX, production ? 5 : 10),
      idleTimeoutMillis: positiveInteger(process.env.DATABASE_POOL_IDLE_TIMEOUT_MS, 30_000),
      connectionTimeoutMillis: positiveInteger(process.env.DATABASE_POOL_CONNECT_TIMEOUT_MS, 5_000),
      query_timeout: positiveInteger(process.env.DATABASE_QUERY_TIMEOUT_MS, production ? 15_000 : 30_000),
    });
  }

  return pool;
}

export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []) {
  return getPool().query<T>(text, values);
}

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}
