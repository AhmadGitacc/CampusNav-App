import { useAuth } from "@/lib/useAuth";
import type { ProfileRole } from "@shared/schema";

/**
 * The signed-in user's role (Feature 10).
 *
 * `app_metadata.role` is the only value that means anything: it is the claim
 * every RLS policy in `supabase/migrations` tests, and it can only be written
 * by the Supabase Admin API (`scripts/make-admin.ts`), so a client cannot
 * forge it. `profiles.role` exists for display and for the seed script, and is
 * deliberately *not* consulted here — a profile row claiming `admin` while the
 * JWT says otherwise would show a staff UI whose every write is rejected.
 */
export interface RoleState {
  role: ProfileRole;
  isAdmin: boolean;
  /** True while the session is still being restored. */
  loading: boolean;
  /** False when Supabase is not configured at all (guest mode). */
  configured: boolean;
}

export function useRole(): RoleState {
  const { user, loading, configured } = useAuth();
  const role: ProfileRole =
    user?.app_metadata?.role === "admin" ? "admin" : "student";

  return { role, isAdmin: role === "admin", loading, configured };
}
