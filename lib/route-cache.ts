import AsyncStorage from "@react-native-async-storage/async-storage";
import type { LatLon } from "@shared/types";
import type { WalkingRoute } from "@/lib/routing";

/**
 * Cache for OSRM walking routes.
 *
 * Campus paths change rarely, so a cached route is better than nothing when
 * the network is gone — a slightly stale path beats a straight line. The TTL
 * is deliberately long; entries are also garbage-collected opportunistically.
 */

const ROUTE_TTL = 6 * 60 * 60_000; // 6h
const LOCATION_TTL = 10 * 60_000; // 10m
const ROUTE_PREFIX = "route:";
const LAST_LOCATION_KEY = "last:location";

interface Envelope<T> {
  at: number;
  value: T;
}

/** Rounded to ~11m so tiny GPS jitter doesn't create a new key per request. */
function coordKey(point: LatLon): string {
  return `${point.latitude.toFixed(4)},${point.longitude.toFixed(4)}`;
}

/**
 * Everything that changes *which* route is correct, not just how it is drawn.
 *
 * The step-free flag is not a detail of the value: a route routed around a
 * staircase is a different answer to the user's question, and serving it to
 * someone who did not ask would be a routing bug, not a cache hit. The same
 * goes for the campus and the destination building — the campus graph resolves
 * a building to a specific entrance, so two buildings at similar coordinates
 * are not interchangeable, and two campuses are not even close.
 */
export interface RouteCacheKey {
  stepFree?: boolean;
  campusId?: string | null;
  buildingId?: string | null;
}

function routeKey(from: LatLon, to: LatLon, variant: RouteCacheKey): string {
  const parts = [
    coordKey(from),
    coordKey(to),
    variant.stepFree ? "sf" : "any",
    variant.campusId ?? "-",
    variant.buildingId ?? "-",
  ];
  return `${ROUTE_PREFIX}${parts.join("|")}`;
}

async function readEnvelope<T>(key: string): Promise<Envelope<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Envelope<T>;
    if (typeof parsed?.at !== "number" || parsed.value == null) return null;
    return parsed;
  } catch {
    // Corrupt entry or storage unavailable — treat as a miss.
    return null;
  }
}

async function writeEnvelope<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ at: Date.now(), value }));
  } catch {
    // Full or unavailable storage must never break routing.
  }
}

function isFresh(envelope: Envelope<unknown>, ttl: number): boolean {
  return Date.now() - envelope.at < ttl;
}

/** Returns a cached route if one exists and hasn't expired. */
export async function getCachedRoute(
  from: LatLon,
  to: LatLon,
  variant: RouteCacheKey = {}
): Promise<WalkingRoute | null> {
  const envelope = await readEnvelope<WalkingRoute>(routeKey(from, to, variant));
  if (!envelope || !isFresh(envelope, ROUTE_TTL)) return null;
  return envelope.value;
}

/** Returns a cached route regardless of age — the offline last resort. */
export async function getStaleRoute(
  from: LatLon,
  to: LatLon,
  variant: RouteCacheKey = {}
): Promise<WalkingRoute | null> {
  const envelope = await readEnvelope<WalkingRoute>(routeKey(from, to, variant));
  return envelope?.value ?? null;
}

export async function setCachedRoute(
  from: LatLon,
  to: LatLon,
  route: WalkingRoute,
  variant: RouteCacheKey = {}
): Promise<void> {
  await writeEnvelope(routeKey(from, to, variant), route);
}

/** Last known position, so a cold offline start can still draw a route. */
export async function getLastLocation(): Promise<LatLon | null> {
  const envelope = await readEnvelope<LatLon>(LAST_LOCATION_KEY);
  if (!envelope || !isFresh(envelope, LOCATION_TTL)) return null;
  return envelope.value;
}

export async function setLastLocation(point: LatLon): Promise<void> {
  await writeEnvelope(LAST_LOCATION_KEY, point);
}
