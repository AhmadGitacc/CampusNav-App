import { decodeOSRMGeometry, calculateStraightDistance, initialBearing, polylineLength } from "@/lib/geo";
import {
  buildNavSteps,
  describeManeuver,
  maneuverIcon,
  type NavStep,
  type OsrmStep,
} from "@/lib/navigation/instructions";
import { apiRequest, isApiConfigured } from "@/lib/query-client";
import { routeResponseSchema, type RouteEntrance } from "@/lib/route-contract";
import { getCachedRoute, getStaleRoute, setCachedRoute } from "@/lib/route-cache";
import type { RouteCacheKey } from "@/lib/route-cache";
import type { LatLon } from "@shared/types";

export type { NavStep } from "@/lib/navigation/instructions";

/** The door a campus-graph route was aimed at, when one was surveyed. */
export type { RouteEntrance } from "@/lib/route-contract";

export interface WalkingRoute {
  coordinates: LatLon[];
  /** Turn-by-turn cues, already trimmed of sub-2m noise. */
  steps: NavStep[];
  distanceMeters: number;
  durationSeconds: number;
  /**
   * True when the geometry is a straight line rather than a real path — an
   * offline fallback. The sheet uses it to say so instead of implying the
   * line is walkable.
   */
  approximate: boolean;
  /** Which engine produced this route, for the sheet's source note. */
  source?: "osrm" | "graph";
  /** Set when a campus graph routed to a specific door. */
  entrance?: RouteEntrance | null;
  /**
   * False when a step-free route was asked for and the fallback cannot honour
   * it. The sheet turns this into a warning rather than quietly serving a
   * route with stairs in it.
   */
  stepFreeSatisfied?: boolean;
}

export interface RouteRequestOptions {
  /** Avoid every edge and door that involves climbing. */
  stepFree?: boolean;
  /** Campus slug, so the server loads the right surveyed graph. */
  campusId?: string | null;
  /** Lets the graph aim at a surveyed door instead of the building centroid. */
  buildingId?: string | null;
  /** Campus-local "HH:MM", so gate filtering is right outside UTC. */
  now?: string | null;
}

const OSRM_FOOT_PROFILE = "https://router.project-osrm.org/route/v1/foot";

/**
 * Coarse depart → continue → arrive cues for geometry that came from the cache
 * (pre-§4 entries), from a straight line, or from a router that returned no
 * steps. Degraded, but it keeps the step list populated offline instead of
 * collapsing the sheet to a single "route shown" row.
 */
function synthesizeSteps(
  coordinates: LatLon[],
  distanceMeters: number
): NavStep[] {
  if (coordinates.length === 0) return [];

  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  const middleIndex = Math.max(1, Math.floor(coordinates.length / 2));
  const middle = coordinates[middleIndex] ?? last;
  const legDistance = distanceMeters / 2;

  return [
    {
      instruction: describeManeuver({
        type: "depart",
        bearing_after: initialBearing(first, middle),
      }),
      street: null,
      distance: legDistance,
      duration: 0,
      location: first,
      geometry: coordinates.slice(0, middleIndex + 1),
      icon: maneuverIcon({ type: "depart" }),
      type: "depart",
      modifier: null,
    },
    {
      instruction: "Continue on the path",
      street: "the path",
      distance: Math.max(distanceMeters - legDistance * 2, 0),
      duration: 0,
      location: middle,
      geometry: coordinates.slice(middleIndex),
      icon: maneuverIcon({ type: "continue" }),
      type: "continue",
      modifier: null,
    },
    {
      instruction: "You have arrived",
      street: null,
      distance: 0,
      duration: 0,
      location: last,
      geometry: [last],
      icon: maneuverIcon({ type: "arrive" }),
      type: "arrive",
      modifier: null,
    },
  ];
}

/** Last resort when there's no cache and no network. */
function straightLineRoute(from: LatLon, to: LatLon): WalkingRoute {
  const distanceMeters = calculateStraightDistance(
    from.latitude,
    from.longitude,
    to.latitude,
    to.longitude
  );
  return {
    coordinates: [from, to],
    steps: synthesizeSteps([from, to], distanceMeters),
    distanceMeters,
    durationSeconds: 0,
    approximate: true,
    source: "osrm",
    entrance: null,
    stepFreeSatisfied: false,
  };
}

/**
 * Brings a route read from cache up to the current shape. Entries written
 * before §4 have no `steps`, so they get synthesized cues rather than
 * dropping the step list when the app is used offline.
 *
 * `stepFree` is *not* defaulted: a cached OSRM route can satisfy nothing about
 * a step-free request, and the key already keeps the two apart.
 */
function normalizeRoute(route: WalkingRoute | null): WalkingRoute | null {
  if (!route || !Array.isArray(route.coordinates) || route.coordinates.length === 0) {
    return null;
  }

  const coordinates = route.coordinates;
  const distanceMeters =
    typeof route.distanceMeters === "number" && route.distanceMeters > 0
      ? route.distanceMeters
      : polylineLength(coordinates);

  return {
    coordinates,
    steps:
      Array.isArray(route.steps) && route.steps.length > 0
        ? route.steps
        : synthesizeSteps(coordinates, distanceMeters),
    distanceMeters,
    durationSeconds:
      typeof route.durationSeconds === "number" ? route.durationSeconds : 0,
    approximate: route.approximate ?? false,
    source: route.source ?? "osrm",
    entrance: route.entrance ?? null,
    stepFreeSatisfied: route.stepFreeSatisfied ?? false,
  };
}

/** Campus-local HH:MM, which is what gate hours are written in. */
function campusClock(now?: string | null): string | null {
  if (now) return now;
  const date = new Date();
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

/**
 * Asks the server for a route across the surveyed campus graph (Feature 5).
 *
 * This is the only path that can honour `stepFree`, so it runs before OSRM
 * whenever a step-free route was asked for. Every failure mode — no server, no
 * database, 409 because the points are on different subgraphs — returns null
 * rather than throwing, because the caller has a perfectly good fallback and
 * the user should not see a broken sheet for a preference they toggled.
 */
async function fetchCampusGraphRoute(
  from: LatLon,
  to: LatLon,
  options: RouteRequestOptions
): Promise<WalkingRoute | null> {
  if (!isApiConfigured()) return null;

  try {
    const res = await apiRequest("POST", "/api/route", {
      from: { lat: from.latitude, lng: from.longitude },
      to: { lat: to.latitude, lng: to.longitude },
      buildingId: options.buildingId ?? undefined,
      campusId: options.campusId ?? undefined,
      options: {
        stepFree: options.stepFree ?? false,
        avoidGatesAfter: campusClock(options.now),
      },
    });

    const parsed = routeResponseSchema.safeParse(await res.json());
    if (!parsed.success) return null;

    const data = parsed.data;
    return {
      coordinates: data.coordinates,
      steps: data.steps,
      distanceMeters: data.distanceMeters,
      durationSeconds: data.durationSeconds,
      approximate: false,
      source: "graph",
      entrance: data.entrance,
      stepFreeSatisfied: data.stepFreeSatisfied,
    };
  } catch {
    // Offline, unprovisioned, or a validation failure — OSRM still works.
    return null;
  }
}

export async function fetchWalkingRoute(
  from: LatLon,
  to: LatLon,
  options: RouteRequestOptions = {}
): Promise<WalkingRoute> {
  // Fresh cache wins: instant, and works with no connection at all. The key
  // carries the step-free flag, campus and building, so a route with a ramp in
  // it is never handed to someone who did not ask for one, and a route to one
  // building is never served for another.
  const cacheKey: RouteCacheKey = {
    stepFree: options.stepFree,
    campusId: options.campusId,
    buildingId: options.buildingId,
  };

  const cached = normalizeRoute(await getCachedRoute(from, to, cacheKey));
  if (cached) return cached;

  // A step-free request goes to the campus graph first: it is the only engine
  // that can satisfy it. A failed attempt still falls through to OSRM, flagged
  // as not satisfying the preference rather than pretending it does.
  if (options.stepFree) {
    const graphRoute = await fetchCampusGraphRoute(from, to, options);
    if (graphRoute) {
      await setCachedRoute(from, to, graphRoute, cacheKey);
      return graphRoute;
    }
  }

  try {
    const url =
      `${OSRM_FOOT_PROFILE}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}` +
      "?overview=full&geometries=polyline&steps=true";

    const response = await globalThis.fetch(url);
    const data = await response.json();

    if (data.code === "Ok" && data.routes && data.routes.length > 0) {
      const raw = data.routes[0];
      const coordinates = decodeOSRMGeometry(raw.geometry);
      const steps = buildNavSteps(
        raw.legs?.[0]?.steps as OsrmStep[] | undefined,
        coordinates
      );
      const walkingRoute: WalkingRoute = {
        coordinates,
        steps: steps.length > 0 ? steps : synthesizeSteps(coordinates, raw.distance),
        distanceMeters: raw.distance,
        durationSeconds: raw.duration,
        approximate: false,
        source: "osrm",
        entrance: null,
        // OSRM cannot see stairs or doors, so a step-free request answered here
        // is only ever a best guess. The sheet says so.
        stepFreeSatisfied: false,
      };
      await setCachedRoute(from, to, walkingRoute, cacheKey);
      return walkingRoute;
    }
  } catch {
    // Offline or OSRM unreachable — fall through to the stale cache.
  }

  // Expired-but-present beats a straight line.
  return (
    normalizeRoute(await getStaleRoute(from, to, cacheKey)) ??
    straightLineRoute(from, to)
  );
}
