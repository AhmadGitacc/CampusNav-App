import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/**
 * Legacy table. Retained only so pre-existing rows survive; the plaintext
 * `password` column was removed in favour of Supabase Auth (see
 * supabase/migrations/0001_auth_profiles.sql). New code must use `profiles`.
 */
export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const profileRoles = ["student", "admin"] as const;

export const pathSurfaces = ["paved", "gravel", "dirt"] as const;

/**
 * Application profile, 1:1 with a Supabase Auth user.
 * `id` mirrors auth.users.id; the foreign key is declared in SQL because
 * Drizzle cannot reference the `auth` schema.
 */
export const profiles = pgTable("profiles", {
  id: varchar("id").primaryKey(),
  role: varchar("role", { enum: profileRoles }).notNull().default("student"),
  displayName: text("display_name"),
  homeLat: doublePrecision("home_lat"),
  homeLng: doublePrecision("home_lng"),
  /**
   * Mirrors the client's `pref:stepFree` so a preference set on one device
   * follows the user to the next. AsyncStorage stays the source of truth for a
   * signed-out user, since the app has to work before (and without) a session.
   */
  prefStepFree: boolean("pref_step_free").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const insertProfileSchema = createInsertSchema(profiles).pick({
  role: true,
  displayName: true,
  homeLat: true,
  homeLng: true,
  prefStepFree: true,
});

export const updateProfileSchema = insertProfileSchema.partial();
export const homeLocationSchema = z.object({
  homeLat: z.number().min(-90).max(90),
  homeLng: z.number().min(-180).max(180),
});

export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type UpdateProfile = z.infer<typeof updateProfileSchema>;
export type Profile = typeof profiles.$inferSelect;
export type ProfileRole = (typeof profileRoles)[number];

// ─── Campus content ───────────────────────────────────────────────────────────

/** Stable, URL-friendly identifier. Routes carry the slug, never the uuid. */
export const campuses = pgTable("campuses", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  zoom: doublePrecision("zoom").notNull().default(0.008),
  icon: varchar("icon").notNull().default("map-pin"),
});

export const buildingCategories = [
  "admin",
  "faculty",
  "library",
  "event",
  "hostel",
  "cafeteria",
  "sports",
  "health",
  "parking",
  "toilet",
] as const;

export const buildings = pgTable("buildings", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  campusId: varchar("campus_id")
    .notNull()
    .references(() => campuses.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  category: varchar("category", { enum: buildingCategories })
    .notNull()
    .default("faculty"),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  icon: varchar("icon").notNull().default("map-pin"),
  /** Alternative names people actually type ("VC's lodge", "main lib"). */
  aliases: text("aliases")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  openingHours: text("opening_hours"),
  isAccessibleEntry: boolean("is_accessible_entry").notNull().default(true),
  /**
   * Soft delete (Feature 10). Public reads filter on `deleted_at is null`, so a
   * withdrawn building disappears from the map without taking its entrances,
   * path edges or audit history with it.
   */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (table) => [
  // Makes `npm run db:seed` idempotent: buildings are upserted by name.
  unique("buildings_campus_name").on(table.campusId, table.name),
]);

export const insertCampusSchema = createInsertSchema(campuses);
export const insertBuildingSchema = createInsertSchema(buildings);
export const searchBuildingsSchema = z.object({
  campusId: z.string().min(1),
  q: z.string().trim().max(120).optional(),
});

export type CampusRow = typeof campuses.$inferSelect;
export type BuildingRow = typeof buildings.$inferSelect;
export type InsertCampus = z.infer<typeof insertCampusSchema>;
export type InsertBuilding = z.infer<typeof insertBuildingSchema>;
export type BuildingCategory = (typeof buildingCategories)[number];

// ─── Favorites (Feature 7) ────────────────────────────────────────────────────

/**
 * A saved building, scoped to a specific user. RLS (`auth.uid() = user_id`)
 * means only the row's owner can read or mutate it — see
 * supabase/migrations/0004_favorites.sql.
 */
export const favorites = pgTable(
  "favorites",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    buildingId: varchar("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Tapping the heart twice updates the row, it never duplicates it.
    unique("favorites_user_building").on(table.userId, table.buildingId),
  ],
);

export type FavoriteRow = typeof favorites.$inferSelect;

// ─── Path graph (Feature 5) ────────────────────────────────────────────────────
//
// A hand-surveyed walkable graph, so step-free routing can avoid stairs and
// pick the right door. Each edge is stored once and traversed both ways.

// ─── Entrances ───────────────────────────────────────────────────────────

export const entrances = pgTable(
  "entrances",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    buildingId: varchar("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "cascade" }),
    /** "Main ramp entrance" — shown in the final navigation step. */
    name: text("name").notNull().default("Main entrance"),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    hasRamp: boolean("has_ramp").notNull().default(false),
    hasSteps: boolean("has_steps").notNull().default(false),
    /** Usable without climbing. The one flag step-free routing filters on. */
    stepFree: boolean("step_free").notNull().default(true),
    gated: boolean("gated").notNull().default(false),
    /** Local campus time, e.g. "20:00". Past this the gate is treated as shut. */
    gateClosesAt: time("gate_closes_at"),
  },
  (table) => [
    unique("entrances_building_name").on(table.buildingId, table.name),
  ],
);

export const insertEntranceSchema = createInsertSchema(entrances);
export type InsertEntrance = z.infer<typeof insertEntranceSchema>;
export type EntranceRow = typeof entrances.$inferSelect;

// ─── Path nodes & edges ──────────────────────────────────────────────────

export const pathNodes = pgTable(
  "path_nodes",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    campusId: varchar("campus_id").references(() => campuses.id, {
      onDelete: "cascade",
    }),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
  },
  (table) => [
    // A survey re-run must not duplicate the junction it just re-measured.
    unique("path_nodes_campus_lat_lng").on(table.campusId, table.lat, table.lng),
  ],
);

export const pathEdges = pgTable(
  "path_edges",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    campusId: varchar("campus_id").references(() => campuses.id, {
      onDelete: "cascade",
    }),
    fromNodeId: varchar("from_node_id")
      .notNull()
      .references(() => pathNodes.id, { onDelete: "cascade" }),
    toNodeId: varchar("to_node_id")
      .notNull()
      .references(() => pathNodes.id, { onDelete: "cascade" }),
    distanceM: doublePrecision("distance_m").notNull(),
    hasSteps: boolean("has_steps").notNull().default(false),
    hasRamp: boolean("has_ramp").notNull().default(false),
    /** Sheltered — a mild cost discount when the route prefers cover. */
    covered: boolean("covered").notNull().default(false),
    surface: varchar("surface", {
      enum: pathSurfaces,
    })
      .notNull()
      .default("paved"),
    lit: boolean("lit").notNull().default(true),
  },
  (table) => [
    unique("path_edges_from_to").on(table.fromNodeId, table.toNodeId),
  ],
);

export const insertPathNodeSchema = createInsertSchema(pathNodes);
export const insertPathEdgeSchema = createInsertSchema(pathEdges);
export type InsertPathNode = z.infer<typeof insertPathNodeSchema>;
export type InsertPathEdge = z.infer<typeof insertPathEdgeSchema>;
export type PathNodeRow = typeof pathNodes.$inferSelect;
export type PathEdgeRow = typeof pathEdges.$inferSelect;
export type PathSurface = (typeof pathSurfaces)[number];

// ─── POST /api/route ─────────────────────────────────────────────────────

const pointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/** Route preferences. Defaults match the client: off unless asked for. */
export const routeOptionsSchema = z
  .object({
    stepFree: z.boolean().default(false),
    preferCovered: z.boolean().default(false),
    /** Local campus time; gated entrances closing before it are avoided. */
    avoidGatesAfter: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM")
      .optional(),
  })
  .default({});

export const insertRouteSchema = z.object({
  from: pointSchema,
  to: pointSchema,
  /** When present, arrival targets a surveyed entrance rather than the centroid. */
  buildingId: z.string().min(1).max(64).optional(),
  /** Omitted for a single-campus deployment; the graph loader then spans all. */
  campusId: z.string().min(1).max(64).optional(),
  options: routeOptionsSchema,
});

export type RouteRequest = z.infer<typeof insertRouteSchema>;
export type RouteOptions = z.infer<typeof routeOptionsSchema>;

// ─── Public corrections (Feature 10) ──────────────────────────────────────────

export const correctionStatuses = ["pending", "approved", "rejected"] as const;

/**
 * The `buildings` columns a member of the public is allowed to propose a change
 * to. A correction can only ever touch one of these, so approving a row can
 * never write to an arbitrary column.
 */
export const correctionFields = [
  "name",
  "description",
  "category",
  "lat",
  "lng",
  "opening_hours",
  "aliases",
] as const;

export type CorrectionField = (typeof correctionFields)[number];
export type CorrectionStatus = (typeof correctionStatuses)[number];

/**
 * A proposed fix from a user, reviewed by an admin (Feature 10).
 *
 * `buildingId` cascades on delete so corrections never outlive the thing they
 * were about; `userId` is a plain reference with no cascade, so deleting an
 * account must not delete the moderation history attached to it.
 */
export const corrections = pgTable(
  "corrections",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    buildingId: varchar("building_id").references(() => buildings.id, {
      onDelete: "cascade",
    }),
    userId: varchar("user_id").references(() => profiles.id),
    field: varchar("field", { enum: correctionFields }).notNull(),
    newValue: text("new_value").notNull(),
    note: text("note"),
    status: varchar("status", { enum: correctionStatuses })
      .notNull()
      .default("pending"),
    /** Why an admin approved or rejected it — surfaced in the queue. */
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => [
    // The queue is always "pending first, newest first", filtered on status.
    index("corrections_status_created_at").on(table.status, table.createdAt),
  ],
);

export const insertCorrectionSchema = z.object({
  buildingId: z.string().min(1, "Pick a building").max(64),
  field: z.enum(correctionFields, {
    errorMap: () => ({ message: "Pick a field to correct" }),
  }),
  newValue: z
    .string()
    .trim()
    .min(1, "Enter the corrected value")
    .max(500),
  note: z.string().trim().max(500).optional(),
});

export type InsertCorrection = z.infer<typeof insertCorrectionSchema>;
export type CorrectionRow = typeof corrections.$inferSelect;

// ─── Audit log (Feature 10) ───────────────────────────────────────────────────

/**
 * Append-only trail of every content edit. Written by the admin mutations in
 * `lib/api/admin.ts` and read back on the dashboard; the SQL trigger in
 * migration 0005 is the belt-and-braces half for writes made outside the app.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    actorId: varchar("actor_id"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    diff: jsonb("diff"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // The dashboard shows the most recent entries, always.
    index("audit_log_created_at").on(table.createdAt),
  ],
);

export type AuditLogRow = typeof auditLog.$inferSelect;

// ─── Admin building form (Feature 10) ─────────────────────────────────────────

/** Marker icon keys, mirroring the `MarkerIconName` union in shared/types.ts. */
export const markerIconNames = [
  "building",
  "book",
  "library",
  "flag",
  "map-pin",
] as const;

/**
 * A coordinate from a spreadsheet cell.
 *
 * `z.coerce.number()` alone is a trap here: it runs `Number("")`, which is `0`,
 * so a row with a blank latitude would import a building at Null Island instead
 * of being reported as a broken row. Rejecting blank first costs one line and
 * keeps an empty cell an error a human can see.
 */
const coordinate = (label: string, limit: number) =>
  z
    .union([z.number(), z.string()])
    .refine((value) => typeof value === "number" || value.trim().length > 0, {
      message: `${label} is required`,
    })
    .transform((value) => (typeof value === "number" ? value : Number(value.trim())))
    .refine((value) => Number.isFinite(value), {
      message: `${label} must be a number`,
    })
    .refine((value) => Math.abs(value) <= limit, {
      message: `${label} must be between -${limit} and ${limit}`,
    });

/**
 * The building payload an import row or an admin form submits.
 *
 * `campusId` is omitted on purpose: an import targets one campus per run, and a
 * form is opened from inside that campus. Callers supply the resolved uuid.
 */
export const importBuildingSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().max(500).default(""),
  category: z
    .enum(buildingCategories, { errorMap: () => ({ message: "Unknown category" }) })
    .default("faculty"),
  lat: coordinate("Latitude", 90),
  lng: coordinate("Longitude", 180),
  icon: z.enum(markerIconNames).default("map-pin"),
  aliases: z.array(z.string().trim().min(1)).max(12).default([]),
  openingHours: z.string().trim().max(120).nullish(),
  isAccessibleEntry: z.boolean().default(true),
});

export type ImportBuilding = z.infer<typeof importBuildingSchema>;

