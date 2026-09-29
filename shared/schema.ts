import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
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
