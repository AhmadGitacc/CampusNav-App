/**
 * Grants or revokes admin rights for the CMS (Feature 10 §7.1).
 *
 *   npm run admin:grant -- admin@university.edu.ng
 *   npm run admin:grant -- admin@university.edu.ng --revoke
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (or in
 * .env — see .env.example), plus the DATABASE_URL every other script uses. The
 * service-role key is the only credential that can set `app_metadata`, which is
 * exactly what the RLS policies test, so this cannot be done from the app or
 * with the anon key.
 *
 * `profiles.role` is kept in step for display; `app_metadata.role` is what
 * actually authorises writes.
 */
import "./load-env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { assertDatabaseConfigured, db, pool } from "../server/db";
import { profiles } from "@shared/schema";

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

function adminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    fail(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.\n" +
        "  Supabase dashboard → Project Settings → API → service_role key."
    );
  }
  return createClient(url!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * The Admin API has no getUserByEmail, so the user list is scanned page by page.
 * In practice that is a handful of rows; the page cap stops a runaway loop on a
 * large project.
 */
async function findUserIdByEmail(
  supabase: SupabaseClient,
  email: string
): Promise<string | null> {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) fail(`Could not list users: ${error.message}`);
    const match = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === target
    );
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  const argv = process.argv.slice(2);
  const revoking = argv.includes("--revoke");
  const email = argv.find((arg) => !arg.startsWith("--"));
  const role = revoking ? "student" : "admin";

  if (!email) {
    fail(`Usage: npm run admin:grant -- <email>${revoking ? "" : " [--revoke]"}`);
  }

  // The profile mirror is written through Drizzle, which needs the same
  // DATABASE_URL every other script uses.
  assertDatabaseConfigured();

  const supabase = adminClient();
  const userId = await findUserIdByEmail(supabase, email);
  if (!userId) {
    fail(
      `No user with the email ${email}.\n` +
        "  They have to sign in through the app once before they can be made an admin."
    );
  }

  // Checked first: half-applying the change would leave an admin who cannot be
  // told about it, or a half-revoked one who still believes they have access.
  const existing = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.id, userId));
  if (existing.length === 0) {
    fail(
      `app_metadata was left untouched: no profiles row exists for ${email}.\n` +
        "  The signup trigger in migration 0001 creates one; check that it ran."
    );
  }

  const { error } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { role },
  });
  if (error) fail(`Could not update app_metadata: ${error.message}`);

  await db.update(profiles).set({ role }).where(eq(profiles.id, userId));

  console.log(
    `\n✓ ${email} is now ${role === "admin" ? "an admin" : "no longer an admin"}.`
  );
  if (role === "admin") {
    console.log("  Sign out and back in — the role claim is read from the session.");
  }
}

main()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error("Grant failed:", error);
    await pool.end();
    process.exit(1);
  });
