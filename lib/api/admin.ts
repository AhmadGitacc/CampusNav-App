import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { toBuilding, useCampus } from "@/lib/api/campuses";
import { importBuildingSchema, type ImportBuilding } from "@shared/schema";
import type { Building } from "@shared/types";

/**
 * Admin content management (Feature 10 §7.4).
 *
 * Every write goes straight to Supabase and is gated by RLS, not by this file:
 * `app_metadata.role = 'admin'` is what the policies test, so a client that
 * skipped this module entirely would still be refused. The cache invalidation
 * below is a UX affordance, not the enforcement.
 *
 * **Audit log.** Nothing here writes to `audit_log`. The trigger in
 * supabase/migrations/0005_admin_cms.sql records every buildings and
 * corrections change with a per-column diff and the JWT subject as the actor,
 * which also covers edits made from the SQL editor or a script. Writing the rows
 * from the client as well would only double every entry.
 */

/** PostgREST rejects a bulk payload this large; 500 keeps one request small. */
const IMPORT_CHUNK = 500;

export type AdminBuilding = Building & {
  deletedAt: string | null;
  createdAt: string;
};

type QueryResult<T> = { data: T | null; error: { message: string } | null };
type CountResult = { count: number | null; error: { message: string } | null };

function unwrap<T>(result: QueryResult<T>): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("No data returned");
  return result.data;
}

async function exactCount(request: PromiseLike<CountResult>): Promise<number> {
  const { count, error } = await request;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

function toAdminBuilding(row: Record<string, unknown>): AdminBuilding {
  return {
    ...toBuilding(row),
    deletedAt: (row.deleted_at as string | null) ?? null,
    createdAt: (row.created_at as string) ?? "",
  };
}

/** snake_case payload shape the PostgREST client expects. */
function toRow(values: ImportBuilding) {
  return {
    name: values.name,
    description: values.description,
    category: values.category,
    lat: values.lat,
    lng: values.lng,
    icon: values.icon,
    aliases: values.aliases,
    opening_hours: values.openingHours ?? null,
    is_accessible_entry: values.isAccessibleEntry,
  };
}

/** Postgres 23505 — the (campus_id, name) unique index. */
function describeWriteError(error: { code?: string; message: string }): Error {
  if (error.code === "23505") {
    return new Error("A building with that name already exists on this campus.");
  }
  // RLS refusals surface as an empty result with a permission message, which is
  // the one failure an admin genuinely needs explained.
  if (/row-level security|permission denied/i.test(error.message)) {
    return new Error(
      "The database refused this change. Your session may have expired — sign out and back in."
    );
  }
  return new Error(error.message);
}

const ADMIN_BUILDINGS_KEY = "admin-buildings";
const ADMIN_STATS_KEY = "admin-stats";
const AUDIT_LOG_KEY = "audit-log";

/** Everything a buildings write makes stale. Prefixes, so the slug is implicit. */
function invalidateBuildingQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: [ADMIN_BUILDINGS_KEY] });
  void queryClient.invalidateQueries({ queryKey: [ADMIN_STATS_KEY] });
  void queryClient.invalidateQueries({ queryKey: [AUDIT_LOG_KEY] });
  // Public reads: the map, the search index and the campus name.
  void queryClient.invalidateQueries({ queryKey: ["buildings"] });
  void queryClient.invalidateQueries({ queryKey: ["campus"] });
  void queryClient.invalidateQueries({ queryKey: ["favorites"] });
}

// ─── Buildings ────────────────────────────────────────────────────────────────

/**
 * Every building on a campus, soft-deleted ones included.
 *
 * The map's own `useBuildings` filters them out; an admin has to be able to see
 * and restore them, which is the entire point of a soft delete.
 */
export function useAdminBuildings(campusSlug: string | undefined) {
  const campus = useCampus(campusSlug);

  return useQuery({
    queryKey: [ADMIN_BUILDINGS_KEY, campusSlug],
    enabled: isSupabaseConfigured && !!campus.data,
    staleTime: 30_000,
    queryFn: async (): Promise<AdminBuilding[]> => {
      const supabase = getSupabase();
      const result = (await supabase
        .from("buildings")
        .select("*")
        .eq("campus_id", campus.data!.id)
        .order("name")) as QueryResult<Record<string, unknown>[]>;
      return (await unwrap(result)).map(toAdminBuilding);
    },
  });
}

export interface AdminStats {
  buildings: number;
  unpublished: number;
  pendingCorrections: number;
}

export function useAdminStats(campusSlug: string | undefined) {
  const campus = useCampus(campusSlug);

  return useQuery({
    queryKey: [ADMIN_STATS_KEY, campusSlug],
    enabled: isSupabaseConfigured && !!campus.data,
    staleTime: 30_000,
    queryFn: async (): Promise<AdminStats> => {
      const supabase = getSupabase();
      const campusId = campus.data!.id;

      const [buildings, unpublished, pendingCorrections] = await Promise.all([
        exactCount(
          supabase
            .from("buildings")
            .select("id", { count: "exact", head: true })
            .eq("campus_id", campusId)
            .is("deleted_at", null) as unknown as PromiseLike<CountResult>
        ),
        exactCount(
          supabase
            .from("buildings")
            .select("id", { count: "exact", head: true })
            .eq("campus_id", campusId)
            .not("deleted_at", "is", null) as unknown as PromiseLike<CountResult>
        ),
        exactCount(
          supabase
            .from("corrections")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending") as unknown as PromiseLike<CountResult>
        ),
      ]);

      return { buildings, unpublished, pendingCorrections };
    },
  });
}

// ─── Building mutations ───────────────────────────────────────────────────────

export interface BuildingInput {
  campusId: string;
  values: ImportBuilding;
}

export function useCreateBuilding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ campusId, values }: BuildingInput): Promise<string> => {
      const parsed = importBuildingSchema.safeParse(values);
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "Invalid building");
      }

      const { data, error } = await getSupabase()
        .from("buildings")
        .insert({ ...toRow(parsed.data), campus_id: campusId })
        .select("id")
        .maybeSingle();
      if (error) throw describeWriteError(error);
      if (!data) throw new Error("The building could not be saved.");
      return data.id as string;
    },
    onSuccess: () => invalidateBuildingQueries(queryClient),
  });
}

export interface BuildingUpdate {
  id: string;
  values: ImportBuilding;
}

export function useUpdateBuilding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, values }: BuildingUpdate) => {
      const parsed = importBuildingSchema.safeParse(values);
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "Invalid building");
      }
      const { error } = await getSupabase()
        .from("buildings")
        .update(toRow(parsed.data))
        .eq("id", id);
      if (error) throw describeWriteError(error);
    },
    onSuccess: () => invalidateBuildingQueries(queryClient),
  });
}

/**
 * Publish / unpublish.
 *
 * A soft delete, not a `DELETE`: entrances, path edges and moderation history
 * reference the row, and losing a surveyed door because a building was briefly
 * wrong is a far worse outcome than a stale row in the table.
 */
export function useSetBuildingPublished() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, published }: { id: string; published: boolean }) => {
      const { error } = await getSupabase()
        .from("buildings")
        .update({ deleted_at: published ? null : new Date().toISOString() })
        .eq("id", id);
      if (error) throw describeWriteError(error);
    },
    onSuccess: () => invalidateBuildingQueries(queryClient),
  });
}

export interface ImportArgs {
  campusId: string;
  rows: ImportBuilding[];
}

/**
 * Bulk insert, upserted on (campus, name) so re-running a corrected sheet
 * updates the rows it already wrote instead of failing on the unique index.
 */
export function useImportBuildings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ campusId, rows }: ImportArgs): Promise<number> => {
      const supabase = getSupabase();
      let imported = 0;

      for (let start = 0; start < rows.length; start += IMPORT_CHUNK) {
        const chunk = rows
          .slice(start, start + IMPORT_CHUNK)
          .map((values) => importBuildingSchema.parse(values));
        const { error } = await supabase.from("buildings").upsert(
          chunk.map((values) => ({ ...toRow(values), campus_id: campusId })),
          { onConflict: "campus_id,name" }
        );
        if (error) throw describeWriteError(error);
        imported += chunk.length;
      }

      return imported;
    },
    onSuccess: () => invalidateBuildingQueries(queryClient),
  });
}

// ─── Audit log ────────────────────────────────────────────────────────────────

/**
 * One audit row as read from PostgREST.
 *
 * `createdAt` is a string, not a `Date`, for the same reason as the rest of this
 * file's rows: `$inferSelect` types it as `Date`, but the wire format is ISO
 * text. `diff` is the trigger's `{ column, old, new }` list, kept as `unknown`
 * because the shape is the trigger's business, not ours.
 */
export interface AuditEntry {
  id: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  diff: unknown;
  createdAt: string;
}

/** Most recent edits, newest first. Read-only, so it needs no mutation. */
export function useAdminAudit(limit = 12) {
  return useQuery({
    queryKey: [AUDIT_LOG_KEY, limit],
    enabled: isSupabaseConfigured,
    staleTime: 30_000,
    queryFn: async (): Promise<AuditEntry[]> => {
      const result = (await getSupabase()
        .from("audit_log")
        .select("id, actor_id, action, entity, entity_id, diff, created_at")
        .order("created_at", { ascending: false })
        .limit(limit)) as QueryResult<Record<string, unknown>[]>;
      return unwrap(result).map((row) => ({
        id: row.id as string,
        actorId: (row.actor_id as string | null) ?? null,
        action: row.action as string,
        entity: row.entity as string,
        entityId: (row.entity_id as string | null) ?? null,
        diff: row.diff ?? null,
        createdAt: row.created_at as string,
      }));
    },
  });
}
