import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { toBuilding } from "@/lib/api/campuses";
import {
  insertCorrectionSchema,
  type CorrectionField,
  type CorrectionStatus,
  type InsertCorrection,
} from "@shared/schema";
import type { Building } from "@shared/types";
import { coerceCorrectionValue } from "@/lib/import/correction-values";

/**
 * Public corrections and the admin moderation queue (Feature 10 §7.6).
 *
 * Two sides, one table. Anyone — signed in or not — can propose a fix; only an
 * admin can decide. RLS is the boundary: the insert policy lets a row in when
 * `user_id` matches the caller (or is absent, for a guest), and there is no
 * update policy for anybody but an admin, so a reporter can never approve their
 * own suggestion.
 *
 * `correctionFields` in shared/schema.ts is what the modal offers, and it is
 * also the only set of columns an approval can write to. Adding a field means
 * adding it in one place, not in two that can drift. The labels and the
 * string-to-column coercion live in `lib/import/correction-values.ts` — pure
 * functions, so the public modal and the moderator screen share them.
 */

export const CORRECTIONS_KEY = "corrections";

type QueryResult<T> = { data: T | null; error: { message: string } | null };

function unwrap<T>(result: QueryResult<T>): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("No data returned");
  return result.data;
}

/** Human labels and value coercion live in lib/import/correction-values.ts */

// ─── Public side ──────────────────────────────────────────────────────────────

/**
 * Files a correction.
 *
 * Guests submit with no `user_id`; the RLS policy allows it on purpose (see
 * migration 0005) so a typo can be reported without creating an account.
 */
export function useSubmitCorrection() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (values: InsertCorrection) => {
      const parsed = insertCorrectionSchema.safeParse(values);
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "Invalid correction");
      }
      const { error } = await getSupabase().from("corrections").insert({
        building_id: parsed.data.buildingId,
        field: parsed.data.field,
        new_value: parsed.data.newValue,
        note: parsed.data.note ?? null,
        user_id: user?.id ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CORRECTIONS_KEY] });
      // A reporter can see their own rows; the queue count is the same query.
      void queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });
}

// ─── Admin side ───────────────────────────────────────────────────────────────

/**
 * A queue row, joined to the building it refers to.
 *
 * Declared here rather than derived from `CorrectionRow` because Drizzle's
 * `$inferSelect` types timestamps as `Date`, while PostgREST sends strings — the
 * same split `lib/api/favorites.ts` makes.
 */
export interface CorrectionItem {
  id: string;
  /** Null only if the building was hard-deleted out from under the report. */
  buildingId: string | null;
  userId: string | null;
  field: CorrectionField;
  newValue: string;
  note: string | null;
  status: CorrectionStatus;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  building: Building | null;
}

interface CorrectionRowWithBuilding extends Record<string, unknown> {
  buildings: Record<string, unknown> | null;
}

/**
 * The moderation queue, newest first. Admins only — RLS refuses the read for
 * everyone else, and the admin layout already gates the screen.
 */
export function useCorrections(status: CorrectionStatus = "pending") {
  return useQuery({
    queryKey: [CORRECTIONS_KEY, status],
    enabled: isSupabaseConfigured,
    staleTime: 30_000,
    queryFn: async (): Promise<CorrectionItem[]> => {
      const result = (await getSupabase()
        .from("corrections")
        .select(
          "id, building_id, user_id, field, new_value, note, status, " +
            "review_note, created_at, reviewed_at, " +
            "buildings ( id, name, description, category, lat, lng, icon, " +
            "aliases, opening_hours, is_accessible_entry, campus_id )"
        )
        .eq("status", status)
        .order("created_at", { ascending: false })) as QueryResult<
        CorrectionRowWithBuilding[]
      >;

      return unwrap(result).map((row) => ({
        id: row.id as string,
        // A correction whose building was hard-deleted still belongs in the
        // queue: dropping it would silently discard someone's report.
        buildingId: (row.building_id as string | null) ?? null,
        userId: (row.user_id as string | null) ?? null,
        field: row.field as CorrectionField,
        newValue: row.new_value as string,
        note: (row.note as string | null) ?? null,
        status: row.status as CorrectionStatus,
        reviewNote: (row.review_note as string | null) ?? null,
        createdAt: row.created_at as string,
        reviewedAt: (row.reviewed_at as string | null) ?? null,
        building: row.buildings ? toBuilding(row.buildings) : null,
      }));
    },
  });
}

function invalidateModeration(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: [CORRECTIONS_KEY] });
  void queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
  void queryClient.invalidateQueries({ queryKey: ["audit-log"] });
  void queryClient.invalidateQueries({ queryKey: ["admin-buildings"] });
  void queryClient.invalidateQueries({ queryKey: ["buildings"] });
  void queryClient.invalidateQueries({ queryKey: ["campus"] });
}

export interface ModerationArgs {
  correction: CorrectionItem;
  decision: Extract<CorrectionStatus, "approved" | "rejected">;
  reviewNote?: string;
}

/**
 * Approve or reject a correction.
 *
 * Approval applies the value to the building *and* flips the status. There is no
 * transaction available from a PostgREST client, so the two writes are ordered:
 * the building is updated first, and if that fails the row stays `pending`
 * rather than being marked done against a value that never landed. The audit
 * trigger sees the building change on its own; this only records the decision.
 */
export function useModerateCorrection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ correction, decision, reviewNote }: ModerationArgs) => {
      if (decision === "approved" && correction.buildingId) {
        if (!correction.building) {
          throw new Error("That building no longer exists — reject this report.");
        }
        const coerced = coerceCorrectionValue(correction.field, correction.newValue);
        if (!coerced.ok) throw new Error(coerced.reason);

        const { error } = await getSupabase()
          .from("buildings")
          .update({ [correction.field]: coerced.value })
          .eq("id", correction.buildingId);
        if (error) throw new Error(error.message);
      }

      const { error } = await getSupabase()
        .from("corrections")
        .update({
          status: decision,
          review_note: reviewNote ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", correction.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => invalidateModeration(queryClient),
  });
}
