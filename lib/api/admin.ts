import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { toBuilding, useCampus } from "@/lib/api/campuses";
import {
  entranceKinds,
  importBuildingSchema,
  type EntranceKind,
  type ImportBuilding,
} from "@shared/schema";
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
const ADMIN_ENTRANCES_KEY = "admin-entrances";
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
  /** Surveyed doors on published buildings of this campus. */
  entrances: number;
  exits: number;
  stepFreeEntrances: number;
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

      const [buildings, unpublished, pendingCorrections, entranceResult] =
        await Promise.all([
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
          // Entrances have no campus column of their own; the inner join both
          // scopes them to this campus and — because it's an inner join —
          // drops doors that belong to unpublished buildings. Rows, not a head
          // count, because the card also needs the kind and step-free split.
          (async () => {
            const result = (await supabase
              .from("entrances")
              .select("kind, step_free,buildings!inner(campus_id,deleted_at)")
              .eq("buildings.campus_id", campusId)
              .is("buildings.deleted_at", null)) as QueryResult<
              Record<string, unknown>[]
            >;
            return unwrap(result);
          })(),
        ]);

      const entrances = entranceResult;
      return {
        buildings,
        unpublished,
        pendingCorrections,
        entrances: entrances.length,
        exits: entrances.filter((row) => row.kind === "exit").length,
        stepFreeEntrances: entrances.filter((row) => row.step_free === true)
          .length,
      };
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

// ─── Entrances ───────────────────────────────────────────────────────────────

/**
 * One surveyed door, as read back from PostgREST.
 *
 * `gateClosesAt` stays a plain `"20:00"`-style string: the `time` column is
 * text on the wire, and every consumer (the router's gate check, the editor's
 * input) wants it in that shape, not as a Date.
 */
export interface AdminEntrance {
  id: string;
  buildingId: string;
  name: string;
  kind: EntranceKind;
  lat: number;
  lng: number;
  hasRamp: boolean;
  hasSteps: boolean;
  stepFree: boolean;
  gated: boolean;
  gateClosesAt: string | null;
}

/** What the editor submits; `buildingId` rides along separately. */
export interface EntranceInput {
  name: string;
  kind: EntranceKind;
  lat: number;
  lng: number;
  hasRamp: boolean;
  hasSteps: boolean;
  stepFree: boolean;
  gated: boolean;
  gateClosesAt: string | null;
}

const ENTRANCE_COLUMNS =
  "id, building_id, name, kind, lat, lng, has_ramp, has_steps, step_free, gated, gate_closes_at";

function toEntrance(row: Record<string, unknown>): AdminEntrance {
  return {
    id: row.id as string,
    buildingId: row.building_id as string,
    name: row.name as string,
    kind: (row.kind as EntranceKind) ?? "entrance",
    lat: Number(row.lat),
    lng: Number(row.lng),
    hasRamp: row.has_ramp === true,
    hasSteps: row.has_steps === true,
    stepFree: row.step_free === true,
    gated: row.gated === true,
    gateClosesAt: (row.gate_closes_at as string | null) ?? null,
  };
}

function toEntranceRow(values: EntranceInput) {
  return {
    name: values.name,
    kind: values.kind,
    lat: values.lat,
    lng: values.lng,
    has_ramp: values.hasRamp,
    has_steps: values.hasSteps,
    step_free: values.stepFree,
    gated: values.gated,
    gate_closes_at: values.gated ? values.gateClosesAt : null,
  };
}

/**
 * Shared validation for create and update — the DB CHECK and NOT NULLs would
 * catch all of this eventually, but a round trip to be told "invalid input" is
 * a worse error than a sentence that says which field is wrong.
 */
function parseEntranceInput(values: EntranceInput): void {
  if (!values.name.trim()) throw new Error("Give the entrance a name.");
  if (!entranceKinds.includes(values.kind)) {
    throw new Error("Pick an entrance kind.");
  }
  if (!Number.isFinite(values.lat) || Math.abs(values.lat) > 90) {
    throw new Error("Latitude must be a number between -90 and 90.");
  }
  if (!Number.isFinite(values.lng) || Math.abs(values.lng) > 180) {
    throw new Error("Longitude must be a number between -180 and 180.");
  }
  if (
    values.gated &&
    values.gateClosesAt &&
    !/^([01]?\d|2[0-3]):[0-5]\d$/.test(values.gateClosesAt)
  ) {
    throw new Error("Gate closing time must look like 20:00.");
  }
}

/** Postgres 23505 — the (building_id, name) unique index. */
function describeEntranceError(error: { code?: string; message: string }): Error {
  if (error.code === "23505") {
    return new Error(
      "An entrance with that name already exists for this building."
    );
  }
  return describeWriteError(error);
}

/** Everything an entrance write makes stale. */
function invalidateEntranceQueries(
  queryClient: ReturnType<typeof useQueryClient>
) {
  void queryClient.invalidateQueries({ queryKey: [ADMIN_ENTRANCES_KEY] });
  void queryClient.invalidateQueries({ queryKey: [ADMIN_STATS_KEY] });
}

/** Doors on one building, in list order. Read by the building edit screen. */
export function useEntrances(buildingId: string | undefined) {
  return useQuery({
    queryKey: [ADMIN_ENTRANCES_KEY, buildingId],
    enabled: isSupabaseConfigured && !!buildingId,
    staleTime: 30_000,
    queryFn: async (): Promise<AdminEntrance[]> => {
      const result = (await getSupabase()
        .from("entrances")
        .select(ENTRANCE_COLUMNS)
        .eq("building_id", buildingId!)
        .order("name")) as QueryResult<Record<string, unknown>[]>;
      return unwrap(result).map(toEntrance);
    },
  });
}

export function useCreateEntrance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      buildingId,
      values,
    }: {
      buildingId: string;
      values: EntranceInput;
    }) => {
      parseEntranceInput(values);
      const { error } = await getSupabase()
        .from("entrances")
        .insert({ ...toEntranceRow(values), building_id: buildingId });
      if (error) throw describeEntranceError(error);
    },
    onSuccess: () => invalidateEntranceQueries(queryClient),
  });
}

export function useUpdateEntrance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string;
      values: EntranceInput;
    }) => {
      parseEntranceInput(values);
      const { error } = await getSupabase()
        .from("entrances")
        .update(toEntranceRow(values))
        .eq("id", id);
      if (error) throw describeEntranceError(error);
    },
    onSuccess: () => invalidateEntranceQueries(queryClient),
  });
}

export function useDeleteEntrance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase().from("entrances").delete().eq("id", id);
      if (error) throw describeEntranceError(error);
    },
    onSuccess: () => invalidateEntranceQueries(queryClient),
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
