import { eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "./db";
import { buildings, campuses, entrances, pathEdges, pathNodes } from "@shared/schema";
import {
  attachEntrances,
  buildGraph,
  type CampusGraph,
  type GraphEntranceInput,
  type GraphRouteOptions,
  type GraphRouteRequest,
  routeOnGraph,
  type GraphRouteOutcome,
} from "@/lib/navigation/graph";
import type { LatLon } from "@shared/types";

/**
 * Database-backed wrapper around the pure campus graph.
 *
 * The whole graph is a few hundred rows, so it is loaded once per campus and
 * kept in memory. A* over it is then pure CPU work with no query per relaxation —
 * which matters because the client re-routes on every off-route confirmation.
 */

export class GraphUnavailableError extends Error {
  /** Surfaces as a 503 through the shared error handler in server/index.ts. */
  readonly status = 503;

  constructor(message = "Campus path data is not available.") {
    super(message);
    this.name = "GraphUnavailableError";
  }
}

/** A campus with no surveyed graph is a normal state, not an error condition. */
export class GraphNotSurveyedError extends GraphUnavailableError {}

interface CacheEntry {
  graph: CampusGraph;
  loadedAt: number;
}

/**
 * Graphs change only when the admin CMS edits them (Feature 10), so a generous
 * TTL plus an explicit invalidation hook is enough — no need to re-query on a
 * timer. The cache is keyed on campus *and* the options that alter the topology,
 * because a step-free graph is a genuinely different graph, not a filter applied
 * later.
 */
const CACHE_TTL_MS = 15 * 60_000;

const cache = new Map<string, CacheEntry>();

function cacheKey(campusId: string, options: GraphRouteOptions): string {
  return [
    campusId,
    options.stepFree ? "stepfree" : "any",
    options.preferCovered ? "covered" : "plain",
  ].join(":");
}

/**
 * Called after any admin write to the graph. Exported so the CMS route can drop
 * the cache without this module having to know the CMS exists.
 */
export function invalidateGraphCache(campusId?: string): void {
  if (!campusId) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${campusId}:`)) cache.delete(key);
  }
}

/**
 * Postgres `time` comes back as "20:00:00"; the graph engine works in "HH:MM".
 * Trimming rather than re-parsing keeps the engine's single HH:MM contract.
 */
function normalizeClock(value: string | null): string | null {
  if (typeof value !== "string") return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(value.trim());
  return match ? `${match[1]}:${match[2]}` : null;
}

function campusFilter(
  column: PgColumn,
  campusId: string
): SQL<unknown> | undefined {
  // A null campusId means "shared graph" from before campuses were distinguished.
  return campusId === "*" ? undefined : or(eq(column, campusId), isNull(column));
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Links carry the campus slug, columns carry the uuid.
 *
 * `/map?campusId=nsuk` is what the map screen owns: it stays shareable and it
 * survives a re-seed, which the assigned uuid does not. `path_nodes`,
 * `path_edges` and `buildings` are all keyed on that uuid, so the lookup happens
 * here — once — instead of being pushed up into every caller.
 *
 * `loadGraph` resolves before consulting the cache, so a campus reached by slug
 * and by uuid share one graph entry rather than loading it twice. `"*"` (the
 * "any campus, including legacy shared rows" escape hatch) and an
 * already-canonical uuid pass straight through with no query.
 */
async function resolveCampusRef(ref: string): Promise<string | null> {
  if (ref === "*" || UUID_PATTERN.test(ref)) return ref;
  const rows = await db
    .select({ id: campuses.id })
    .from(campuses)
    .where(or(eq(campuses.slug, ref), eq(campuses.id, ref)))
    .limit(1);
  return rows[0]?.id ?? null;
}

async function loadGraph(
  campusRef: string,
  options: GraphRouteOptions
): Promise<CampusGraph> {
  const campusId = await resolveCampusRef(campusRef);
  if (campusId === null) {
    throw new GraphNotSurveyedError("No campus path data has been surveyed yet.");
  }

  const key = cacheKey(campusId, options);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.graph;

  const nodeRows = await db
    .select({ id: pathNodes.id, lat: pathNodes.lat, lng: pathNodes.lng })
    .from(pathNodes)
    .where(campusFilter(pathNodes.campusId, campusId));

  if (nodeRows.length === 0) {
    throw new GraphNotSurveyedError(
      "No campus path data has been surveyed yet."
    );
  }

  const edgeRows = await db
    .select({
      fromNodeId: pathEdges.fromNodeId,
      toNodeId: pathEdges.toNodeId,
      distanceM: pathEdges.distanceM,
      hasSteps: pathEdges.hasSteps,
      hasRamp: pathEdges.hasRamp,
      covered: pathEdges.covered,
      surface: pathEdges.surface,
      lit: pathEdges.lit,
    })
    .from(pathEdges)
    .where(campusFilter(pathEdges.campusId, campusId));

  const buildingRows = await db
    .select({ id: buildings.id })
    .from(buildings)
    .where(campusId === "*" ? undefined : eq(buildings.campusId, campusId));

  const entranceRows = buildingRows.length
    ? await db
        .select({
          buildingId: entrances.buildingId,
          name: entrances.name,
          lat: entrances.lat,
          lng: entrances.lng,
          hasRamp: entrances.hasRamp,
          hasSteps: entrances.hasSteps,
          stepFree: entrances.stepFree,
          gated: entrances.gated,
          gateClosesAt: entrances.gateClosesAt,
        })
        .from(entrances)
        .where(
          inArray(
            entrances.buildingId,
            buildingRows.map((row) => row.id)
          )
        )
    : [];

  const entranceInputs: GraphEntranceInput[] = entranceRows.map((row) => ({
    buildingId: row.buildingId,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    hasRamp: row.hasRamp,
    hasSteps: row.hasSteps,
    stepFree: row.stepFree,
    gated: row.gated,
    gateClosesAt: normalizeClock(row.gateClosesAt),
  }));

  const graph = attachEntrances(
    buildGraph(nodeRows, edgeRows, options),
    entranceInputs
  );

  cache.set(key, { graph, loadedAt: Date.now() });
  return graph;
}

export interface CampusRouteRequest extends GraphRouteRequest {
  campusId?: string;
  options?: GraphRouteOptions;
}

/**
 * Loads the campus graph and routes across it. The caller supplies the campus
 * because the map screen already knows its own slug.
 */
export async function routeOnCampusGraph({
  campusId,
  from,
  to,
  buildingId,
  options = {},
}: CampusRouteRequest): Promise<GraphRouteOutcome> {
  const graph = await loadGraph(campusId ?? "*", options);
  return routeOnGraph(graph, { from, to, buildingId }, options);
}

/** Exposed for admin previews and for Feature 16's tests. */
export async function getCampusGraph(
  campusId = "*",
  options: GraphRouteOptions = {}
): Promise<CampusGraph> {
  return loadGraph(campusId, options);
}

export function toLatLonFromRow(row: {
  lat: number;
  lng: number;
}): LatLon {
  return { latitude: row.lat, longitude: row.lng };
}
