import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

/**
 * Server-side Postgres client (Drizzle).
 *
 * Uses the Supabase transaction pooler so it works from serverless/Cloud Run.
 * Supabase requires TLS; the pooler terminates it with a self-signed cert,
 * hence rejectUnauthorized: false (the connection is still encrypted).
 */
const connectionString = process.env.DATABASE_URL;

/**
 * Fail with an actionable message instead of pg's opaque
 * "client password must be a string" when the env var is missing.
 */
export function assertDatabaseConfigured(): void {
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and fill in your " +
        "Supabase connection strings, then restart."
    );
  }
}

if (!connectionString && process.env.NODE_ENV === "production") {
  // Surface misconfiguration immediately; the app still runs in guest mode.
  console.warn("[db] DATABASE_URL is not set — server routes will 500.");
}

export const pool = new Pool({
  connectionString,
  max: 10,
  ssl: connectionString ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle({ client: pool, schema });

export type Database = typeof db;
