/**
 * Loads `.env` into `process.env` for the standalone scripts (`db:seed`,
 * `admin:grant`, `paths:collect`).
 *
 * Those run under `tsx`, which does not read `.env` the way `drizzle-kit` and
 * Expo do, so without this they see an empty environment and `db:seed` dies on
 * "DATABASE_URL is not set" even though the file is right there.
 *
 * Values already in the environment always win. On Cloud Run the platform
 * injects the real values and there is no `.env` at all, so this is a no-op in
 * production and never overrides an injected secret.
 *
 * Import this *before* anything that reads `process.env` at module scope —
 * `server/db.ts` resolves its connection string on import, so a later import
 * would be too late.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const path = resolve(process.cwd(), ".env");

if (existsSync(path)) {
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) process.env[key] = value;
  }
}
