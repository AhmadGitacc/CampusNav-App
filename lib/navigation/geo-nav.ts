import { polylineLength, segmentDistance } from "@/lib/geo";
import type { NavStep } from "@/lib/navigation/instructions";
import type { LatLon } from "@shared/types";

/**
 * Projects a GPS fix onto the route polyline and derives navigation progress.
 *
 * All pure functions over `{ point, path, steps }` — the hook wires them to the
 * location watcher, which keeps the geometry math testable on its own.
 */

/** Straight-line offset beyond which the walker counts as off-route. */
export const OFF_ROUTE_THRESHOLD_M = 30;
/** Consecutive off-route fixes required before a re-route (~6s at 2s cadence). */
export const OFF_ROUTE_CONFIRMATIONS = 3;
/** Buffer around a maneuver so GPS jitter can't skip or double-fire a step. */
export const STEP_HYSTERESIS_M = 5;
/** Straight-line distance to the destination that counts as arrival. */
export const ARRIVAL_RADIUS_M = 15;

const METERS_PER_DEGREE_LAT = 111320;

export interface SnappedPoint {
  /** Index of the route segment the fix projects onto. */
  index: number;
  /** 0–1 position within that segment. */
  t: number;
  /** Closest point on the route. */
  snapped: LatLon;
  /** Perpendicular distance from the fix to the route, in meters. */
  offsetMeters: number;
  /** Distance walked along the route to reach the snapped point. */
  traveledMeters: number;
}

export interface NavProgress {
  traveledMeters: number;
  remainingMeters: number;
  /** Step whose geometry the walker is currently on. */
  stepIndex: number;
  /** Step whose maneuver is next — what the sheet should prompt with. */
  cueIndex: number;
  distanceToCueMeters: number;
  offRoute: boolean;
  offsetMeters: number;
}

export interface NavProgressOptions {
  offRouteThresholdM?: number;
  hysteresisM?: number;
}

function metersPerDegreeLng(latitude: number): number {
  return METERS_PER_DEGREE_LAT * Math.cos((latitude * Math.PI) / 180);
}

/**
 * Cumulative distance to each vertex. Cached per array so a fix arriving every
 * two seconds doesn't re-measure the whole polyline.
 */
const cumulativeCache = new WeakMap<readonly LatLon[], number[]>();

export function cumulativeDistances(path: readonly LatLon[]): number[] {
  const cached = cumulativeCache.get(path);
  if (cached) return cached;

  const cumulative: number[] = new Array(path.length).fill(0);
  for (let i = 1; i < path.length; i++) {
    cumulative[i] = cumulative[i - 1] + segmentDistance(path[i - 1], path[i]);
  }
  cumulativeCache.set(path, cumulative);
  return cumulative;
}

export function totalPathLength(path: readonly LatLon[]): number {
  if (path.length < 2) return 0;
  return polylineLength(path);
}

/**
 * Nearest point on the route, found by projecting the fix onto every segment
 * in a local equirectangular frame (accurate to well under a metre at campus
 * scale, where a full spherical projection per segment would be wasted work).
 */
export function snapToRoute(
  point: LatLon,
  path: readonly LatLon[]
): SnappedPoint | null {
  if (path.length === 0) return null;

  if (path.length === 1) {
    return {
      index: 0,
      t: 0,
      snapped: path[0],
      offsetMeters: segmentDistance(point, path[0]),
      traveledMeters: 0,
    };
  }

  const cumulative = cumulativeDistances(path);
  let bestIndex = 0;
  let bestT = 0;
  let bestOffset = Number.POSITIVE_INFINITY;

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const mPerDegLng = metersPerDegreeLng((a.latitude + b.latitude) / 2);

    // Local frame with `a` at the origin.
    const bx = (b.longitude - a.longitude) * mPerDegLng;
    const by = (b.latitude - a.latitude) * METERS_PER_DEGREE_LAT;
    const px = (point.longitude - a.longitude) * mPerDegLng;
    const py = (point.latitude - a.latitude) * METERS_PER_DEGREE_LAT;

    const lengthSquared = bx * bx + by * by;
    const t =
      lengthSquared === 0
        ? 0
        : Math.min(1, Math.max(0, (px * bx + py * by) / lengthSquared));

    const dx = px - t * bx;
    const dy = py - t * by;
    const offset = Math.sqrt(dx * dx + dy * dy);

    if (offset < bestOffset) {
      bestOffset = offset;
      bestIndex = i;
      bestT = t;
    }
  }

  const a = path[bestIndex];
  const b = path[bestIndex + 1];

  return {
    index: bestIndex,
    t: bestT,
    snapped: {
      latitude: a.latitude + (b.latitude - a.latitude) * bestT,
      longitude: a.longitude + (b.longitude - a.longitude) * bestT,
    },
    offsetMeters: bestOffset,
    traveledMeters:
      cumulative[bestIndex] +
      (cumulative[bestIndex + 1] - cumulative[bestIndex]) * bestT,
  };
}

/** First vertex at or after `from` that matches `target`, within a metre. */
function nearestVertexIndex(
  path: readonly LatLon[],
  target: LatLon,
  from: number
): number {
  let bestIndex = from;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = from; i < path.length; i++) {
    const distance = segmentDistance(path[i], target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
      if (distance < 1) break;
    }
  }

  return bestIndex;
}

interface StepOffsets {
  start: number[];
  end: number[];
}

const stepOffsetCache = new WeakMap<readonly NavStep[], StepOffsets>();

/**
 * Distance along the route at which each step begins and ends.
 *
 * OSRM step geometries concatenate into the route geometry, so the boundaries
 * are found by walking the polyline and matching each step's last vertex.
 */
export function stepOffsets(
  path: readonly LatLon[],
  steps: readonly NavStep[]
): StepOffsets {
  const cached = stepOffsetCache.get(steps);
  if (cached) return cached;

  const cumulative = cumulativeDistances(path);
  const start: number[] = [];
  const end: number[] = [];
  let cursor = 0;

  steps.forEach((step, index) => {
    if (index > 0) {
      const first = step.geometry[0];
      if (first) cursor = nearestVertexIndex(path, first, cursor);
    }
    start.push(cumulative[cursor] ?? 0);

    const last = step.geometry[step.geometry.length - 1];
    if (last) cursor = nearestVertexIndex(path, last, cursor);
    end.push(cumulative[cursor] ?? 0);
  });

  const offsets: StepOffsets = { start, end };
  stepOffsetCache.set(steps, offsets);
  return offsets;
}

/**
 * Full progress for one fix: distance walked, distance left, the current step
 * and the maneuver to prompt with next.
 */
export function computeNavProgress(
  point: LatLon,
  path: readonly LatLon[],
  steps: readonly NavStep[],
  options: NavProgressOptions = {}
): NavProgress | null {
  const snap = snapToRoute(point, path);
  if (!snap) return null;

  const hysteresis = options.hysteresisM ?? STEP_HYSTERESIS_M;
  const offRouteThreshold = options.offRouteThresholdM ?? OFF_ROUTE_THRESHOLD_M;
  const traveled = snap.traveledMeters;

  const progress: NavProgress = {
    traveledMeters: traveled,
    remainingMeters: Math.max(totalPathLength(path) - traveled, 0),
    stepIndex: 0,
    cueIndex: 0,
    distanceToCueMeters: 0,
    offRoute: snap.offsetMeters > offRouteThreshold,
    offsetMeters: snap.offsetMeters,
  };

  if (steps.length === 0) return progress;

  const { start, end } = stepOffsets(path, steps);

  // Hysteresis on the step boundary: the walker has to be 5m past a maneuver
  // before it counts as done, so a fix hovering on the line can't skip a step.
  let stepIndex = 0;
  while (stepIndex < steps.length - 1 && end[stepIndex] + hysteresis <= traveled) {
    stepIndex++;
  }

  let cueIndex = stepIndex;
  let distanceToCueMeters = 0;

  if (traveled - start[stepIndex] > hysteresis) {
    // Mid-step: the next maneuver is what the walker should be told about.
    if (stepIndex + 1 < steps.length) {
      cueIndex = stepIndex + 1;
      distanceToCueMeters = Math.max(start[cueIndex] - traveled, 0);
    } else {
      distanceToCueMeters = Math.max(end[stepIndex] - traveled, 0);
    }
  } else if (stepIndex + 1 >= steps.length) {
    // Final step (arrive): the cue is the destination itself.
    distanceToCueMeters = Math.max(end[stepIndex] - traveled, 0);
  }

  progress.stepIndex = stepIndex;
  progress.cueIndex = cueIndex;
  progress.distanceToCueMeters = distanceToCueMeters;

  return progress;
}
