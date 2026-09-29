import {
  estimateWalkSeconds,
  initialBearing,
  polylineLength,
  segmentDistance,
} from "@/lib/geo";
import {
  compassDirection,
  describeManeuver,
  maneuverIcon,
  type ManeuverIconName,
  type NavStep,
} from "@/lib/navigation/instructions";
import type { LatLon } from "@shared/types";

/**
 * Campus path graph: A* over a hand-surveyed walkable network.
 *
 * §4 asks the public OSRM demo, which cannot express "avoid stairs" or "use the
 * ramp door". This module is the replacement for intra-campus trips, and it is
 * deliberately pure — no database, no fetch, no React — so it runs identically
 * on the server, in the offline bundle, and in a unit test (Feature 16).
 *
 * `server/graph.ts` is the thin layer that loads rows from Postgres and caches
 * them; everything below operates on plain data.
 *
 * Two modelling choices worth knowing:
 *
 * 1. **Reported distance is measured from the drawn geometry, not the survey.**
 *    An edge's `distanceM` feeds *cost* (a winding path should be discouraged),
 *    but the polyline we draw is node-to-node straight lines. Reporting surveyed
 *    metres against a straight-line drawing would make the progress bar and the
 *    arrival radius disagree with what the user sees. So the graph's job is to
 *    place nodes at every turn — see `scripts/collect-paths.ts`.
 * 2. **The A* heuristic is scaled by the cheapest cost-per-metre in the graph.**
 *    `covered` edges get a 0.95 discount, which makes plain great-circle
 *    distance inadmissible and lets A* return a subtly non-optimal path. Scaling
 *    by the global minimum keeps the search optimal for the cost function.
 */

export type PathSurface = "paved" | "gravel" | "dirt";

export interface GraphNodeInput {
  id: string;
  lat: number;
  lng: number;
}

export interface GraphEdgeInput {
  id?: string;
  fromNodeId: string;
  toNodeId: string;
  distanceM: number;
  hasSteps?: boolean;
  hasRamp?: boolean;
  covered?: boolean;
  surface?: PathSurface;
  lit?: boolean;
}

export interface GraphEntranceInput {
  id?: string;
  buildingId: string;
  name: string;
  lat: number;
  lng: number;
  hasRamp?: boolean;
  hasSteps?: boolean;
  stepFree?: boolean;
  gated?: boolean;
  /** Campus-local "HH:MM". */
  gateClosesAt?: string | null;
}

export interface GraphRouteOptions {
  stepFree?: boolean;
  preferCovered?: boolean;
  /**
   * Campus-local "HH:MM" treated as "now" when filtering gates. The server
   * defaults to its own clock, which is wrong for a campus outside UTC — pass
   * the campus time to be exact.
   */
  avoidGatesAfter?: string;
}

export interface GraphNode {
  id: string;
  lat: number;
  lng: number;
}

export interface GraphEdgeRef {
  to: string;
  /** Weighted metres — what A* minimises. */
  cost: number;
  edge: GraphEdgeInput;
}

export interface CampusGraph {
  nodes: Map<string, GraphNode>;
  /** Undirected: every edge is stored once and reachable from both ends. */
  adjacency: Map<string, GraphEdgeRef[]>;
  /**
   * Lower bound on the cost of covering one metre of straight-line distance.
   *
   * This is what makes the A* heuristic admissible, and it is *not* the same as
   * the smallest surface multiplier. A path's surveyed length is normally longer
   * than the straight line between its endpoints, but it never has to be — a
   * covered passage, an indoor link or a mistyped distance can be shorter. Taking
   * the minimum of `cost / chord` over the included edges rather than the minimum
   * multiplier keeps the heuristic a true lower bound even then, so A* still
   * returns an optimal path instead of a plausible-looking near miss.
   */
  minCostPerMeter: number;
  /** Edges dropped because they have stairs and the caller asked step-free. */
  skippedStepEdges: number;
  /** Edges whose surveyed distance is shorter than their straight-line chord. */
  implausibleEdgeCount: number;
}

/** How far a raw GPS fix may sit from the graph before routing gives up. */
export const MAX_SNAP_METERS = 150;

// ─── Cost model ──────────────────────────────────────────────────────────────

const SURFACE_FACTOR: Record<PathSurface, number> = {
  paved: 1,
  gravel: 1.15,
  dirt: 1.3,
};

/** Sheltered ground is nicer in the rain, so it gets a nudge, not a shortcut. */
const COVERED_FACTOR = 0.95;

function edgeCostPerMeter(
  edge: GraphEdgeInput,
  options: GraphRouteOptions
): number {
  const surface = SURFACE_FACTOR[edge.surface ?? "paved"] ?? 1;
  const covered =
    options.preferCovered && edge.covered ? COVERED_FACTOR : 1;
  return surface * covered;
}

// ─── Graph construction ───────────────────────────────────────────────────────

/**
 * Builds a routing graph from surveyed rows.
 *
 * Step-free requests drop every edge flagged `hasSteps` *before* the adjacency
 * lists are built, so a stair can never be reached by a later relaxation — the
 * filtering is structural, not a per-relaxation check that could be missed.
 */
export function buildGraph(
  nodes: readonly GraphNodeInput[],
  edges: readonly GraphEdgeInput[],
  options: GraphRouteOptions = {}
): CampusGraph {
  const graph: CampusGraph = {
    nodes: new Map(),
    adjacency: new Map(),
    minCostPerMeter: Number.POSITIVE_INFINITY,
    skippedStepEdges: 0,
    implausibleEdgeCount: 0,
  };

  for (const node of nodes) {
    if (!Number.isFinite(node.lat) || !Number.isFinite(node.lng)) continue;
    const existing = graph.nodes.get(node.id);
    graph.nodes.set(node.id, existing ?? { id: node.id, lat: node.lat, lng: node.lng });
    if (!graph.adjacency.has(node.id)) graph.adjacency.set(node.id, []);
  }

  for (const edge of edges) {
    const from = graph.nodes.get(edge.fromNodeId);
    const to = graph.nodes.get(edge.toNodeId);
    if (!from || !to) continue; // dangling node id from a partial survey
    if (!Number.isFinite(edge.distanceM) || edge.distanceM <= 0) continue;

    if (options.stepFree && edge.hasSteps) {
      graph.skippedStepEdges += 1;
      continue;
    }

    const costPerMeter = edgeCostPerMeter(edge, options);
    const cost = edge.distanceM * costPerMeter;

    // Bound the heuristic by cost per metre of *chord*, not per metre of
    // surveyed length: the heuristic measures straight-line distance.
    const chord = segmentDistance(toLatLon(from), toLatLon(to));
    if (edge.distanceM < chord * 0.95) graph.implausibleEdgeCount += 1;
    graph.minCostPerMeter = Math.min(
      graph.minCostPerMeter,
      chord > 0 ? cost / chord : costPerMeter
    );

    graph.adjacency.get(edge.fromNodeId)!.push({ to: edge.toNodeId, cost, edge });
    graph.adjacency.get(edge.toNodeId)!.push({ to: edge.fromNodeId, cost, edge });
  }

  // No edges, or every chord is zero: a zero heuristic is admissible.
  if (!Number.isFinite(graph.minCostPerMeter) || graph.minCostPerMeter <= 0) {
    graph.minCostPerMeter = 1;
  }
  return graph;
}

function toLatLon(node: GraphNode): LatLon {
  return { latitude: node.lat, longitude: node.lng };
}

function nodeDistance(graph: CampusGraph, a: string, b: string): number {
  const na = graph.nodes.get(a);
  const nb = graph.nodes.get(b);
  if (!na || !nb) return Number.POSITIVE_INFINITY;
  return segmentDistance(toLatLon(na), toLatLon(nb));
}

export interface NearestNode {
  nodeId: string;
  distanceMeters: number;
}

/**
 * Closest graph node to a raw point. Linear, because a hand-surveyed campus
 * graph is hundreds of nodes, not millions — a spatial index would cost more to
 * maintain than it saves.
 */
export function nearestNode(
  graph: CampusGraph,
  point: LatLon,
  maxMeters = Number.POSITIVE_INFINITY
): NearestNode | null {
  let best: NearestNode | null = null;
  for (const node of graph.nodes.values()) {
    const distanceMeters = segmentDistance(point, toLatLon(node));
    if (distanceMeters > maxMeters) continue;
    if (!best || distanceMeters < best.distanceMeters) {
      best = { nodeId: node.id, distanceMeters };
    }
  }
  return best;
}

// ─── A* ───────────────────────────────────────────────────────────────────────

/** Minimal binary min-heap; the open set is small but a linear scan shows up. */
class MinHeap {
  private nodes: string[] = [];
  private scores: number[] = [];

  get size(): number {
    return this.nodes.length;
  }

  push(node: string, score: number): void {
    this.nodes.push(node);
    this.scores.push(score);
    let i = this.nodes.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.scores[parent] <= this.scores[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): string | null {
    if (this.nodes.length === 0) return null;
    const top = this.nodes[0];
    const lastNode = this.nodes.pop()!;
    const lastScore = this.scores.pop()!;
    if (this.nodes.length > 0) {
      this.nodes[0] = lastNode;
      this.scores[0] = lastScore;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.nodes.length && this.scores[left] < this.scores[smallest]) {
          smallest = left;
        }
        if (right < this.nodes.length && this.scores[right] < this.scores[smallest]) {
          smallest = right;
        }
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.nodes[a], this.nodes[b]] = [this.nodes[b], this.nodes[a]];
    [this.scores[a], this.scores[b]] = [this.scores[b], this.scores[a]];
  }
}

export interface GraphPath {
  nodeIds: string[];
  /** Total weighted cost — what A* minimised, not what the user walks. */
  cost: number;
}

/** A* between two graph nodes. Returns null when the subgraph is disconnected. */
export function findPath(
  graph: CampusGraph,
  fromNodeId: string,
  toNodeId: string
): GraphPath | null {
  if (!graph.nodes.has(fromNodeId) || !graph.nodes.has(toNodeId)) return null;
  if (fromNodeId === toNodeId) return { nodeIds: [fromNodeId], cost: 0 };

  const best = new Map<string, number>();
  const cameFrom = new Map<string, string>();
  const closed = new Set<string>();
  const open = new MinHeap();

  best.set(fromNodeId, 0);
  open.push(fromNodeId, nodeDistance(graph, fromNodeId, toNodeId) * graph.minCostPerMeter);

  while (open.size > 0) {
    const current = open.pop()!;
    if (current === toNodeId) {
      const nodeIds: string[] = [current];
      let cursor = current;
      while (cameFrom.has(cursor)) {
        cursor = cameFrom.get(cursor)!;
        nodeIds.unshift(cursor);
      }
      return { nodeIds, cost: best.get(current) ?? 0 };
    }
    if (closed.has(current)) continue;
    closed.add(current);

    const currentCost = best.get(current) ?? Number.POSITIVE_INFINITY;
    for (const ref of graph.adjacency.get(current) ?? []) {
      if (closed.has(ref.to)) continue;
      const candidate = currentCost + ref.cost;
      if (candidate >= (best.get(ref.to) ?? Number.POSITIVE_INFINITY)) continue;
      best.set(ref.to, candidate);
      cameFrom.set(ref.to, current);
      open.push(
        ref.to,
        candidate + nodeDistance(graph, ref.to, toNodeId) * graph.minCostPerMeter
      );
    }
  }

  return null;
}

// ─── Gates ────────────────────────────────────────────────────────────────────

/** "HH:MM" → minutes since midnight, or null when unparseable. */
export function parseClock(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function currentMinutes(options: GraphRouteOptions): number {
  const override = parseClock(options.avoidGatesAfter);
  if (override !== null) return override;
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * A gated entrance is unusable once its closing time has passed. The check is
 * against arrival-as-now, not arrival-time-plus-walk — without a departure
 * timestamp that is the only sound reading, and it errs towards keeping the
 * entrance open.
 */
export function isEntranceOpen(
  entrance: GraphEntranceInput,
  options: GraphRouteOptions = {}
): boolean {
  if (!entrance.gated) return true;
  const closesAt = parseClock(entrance.gateClosesAt ?? null);
  if (closesAt === null) return true; // gated but no hours recorded: assume open
  return currentMinutes(options) < closesAt;
}

// ─── Turn classification ──────────────────────────────────────────────────────

/** Below this the direction change is GPS noise, not a maneuver. */
const STRAIGHT_TOLERANCE_DEG = 20;
/** Sharper than this and it is a reversal, not a turn. */
const UTURN_TOLERANCE_DEG = 150;

export interface TurnClassification {
  modifier: "left" | "right" | "slight left" | "slight right" | "sharp left" | "sharp right" | "uturn";
  icon: ManeuverIconName;
  instruction: string;
}

/** Signed bearing change in degrees, wrapped to (-180, 180]; + is clockwise. */
export function bearingDelta(before: number, after: number): number {
  return ((((after - before) % 360) + 540) % 360) - 180;
}

/** Maps a direction change to a cue, or null when the walker keeps going. */
export function classifyTurn(
  bearingBefore: number,
  bearingAfter: number
): TurnClassification | null {
  const delta = bearingDelta(bearingBefore, bearingAfter);
  const magnitude = Math.abs(delta);
  if (magnitude < STRAIGHT_TOLERANCE_DEG) return null;

  const modifier =
    magnitude >= UTURN_TOLERANCE_DEG
      ? "uturn"
      : magnitude > 120
        ? delta > 0
          ? "sharp right"
          : "sharp left"
        : magnitude > 45
          ? delta > 0
            ? "right"
            : "left"
          : delta > 0
            ? "slight right"
            : "slight left";

  return {
    modifier,
    icon: maneuverIcon({ type: "turn", modifier }),
    instruction: describeManeuver({ type: "turn", modifier }),
  };
}

// ─── Routing ──────────────────────────────────────────────────────────────────

export interface GraphRouteRequest {
  from: LatLon;
  to: LatLon;
  /** Arrival targets a surveyed entrance of this building when one matches. */
  buildingId?: string | null;
}

export interface GraphRouteResult {
  coordinates: LatLon[];
  steps: NavStep[];
  distanceMeters: number;
  durationSeconds: number;
  entrance: GraphEntranceInput | null;
  /** False when step-free was asked for but no step-free door was reachable. */
  stepFreeSatisfied: boolean;
  nodeIds: string[];
}

export interface GraphRouteFailure {
  reason: "empty-graph" | "origin-off-graph" | "unreachable" | "no-usable-entrance";
  message: string;
}

export type GraphRouteOutcome =
  | { ok: true; route: GraphRouteResult }
  | { ok: false; failure: GraphRouteFailure };

interface Candidate {
  entrance: GraphEntranceInput | null;
  point: LatLon;
  /** Cost of the cheapest path to this candidate, for comparison. */
  cost: number;
  nodeIds: string[];
  stepFreeSatisfied: boolean;
}

/** Deduplicated chain of points; keeps the drawn line free of zero-length legs. */
function appendPoint(points: LatLon[], point: LatLon): LatLon[] {
  const last = points[points.length - 1];
  if (last && segmentDistance(last, point) < 0.5) return points;
  points.push(point);
  return points;
}

interface GeometryPlan {
  points: LatLon[];
  /** Coordinate index at which the leg into each graph node starts. */
  legStartIndex: number[];
}

/**
 * Lays the walk out as an explicit polyline: the access leg from the fix to the
 * first node, the surveyed node-to-node legs, then the egress to the door.
 */
function planGeometry(
  from: LatLon,
  nodeIds: string[],
  graph: CampusGraph,
  to: LatLon
): GeometryPlan {
  const points: LatLon[] = [from];
  const legStartIndex: number[] = [];

  for (const nodeId of nodeIds) {
    const node = graph.nodes.get(nodeId);
    if (!node) continue;
    legStartIndex.push(points.length - 1);
    appendPoint(points, toLatLon(node));
  }

  appendPoint(points, to);
  return { points, legStartIndex };
}

interface StepMarker {
  /** Coordinate index a new step begins at. */
  at: number;
  kind: "depart" | "turn" | "feature" | "arrive";
  turn?: TurnClassification;
  edge?: GraphEdgeInput;
  feature?: "ramp" | "steps";
}

/**
 * Walks the planned geometry and marks where each instruction begins.
 *
 * Markers that land on the same vertex are *merged*, not de-duplicated: turning
 * onto a ramp is one instruction ("Turn left onto the ramp"), not a turn row
 * followed by a ramp row. An arrive marker does win outright, because a step
 * needs geometry of its own and the turn it collides with is a metre of egress
 * from the door.
 */
function markSteps(
  plan: GeometryPlan,
  graph: CampusGraph,
  nodeIds: string[]
): StepMarker[] {
  const { points, legStartIndex } = plan;
  const byIndex = new Map<number, StepMarker>();
  // Deterministic order: arrive steps first, then depart, then everything else.
  const ordered = () =>
    [...byIndex.values()].sort((a, b) => a.at - b.at);

  const bearingAt = (index: number): number | null => {
    // index 0 is the access leg's start, whose "incoming" direction does not
    // exist; index -1 is what the first node asks for.
    if (index < 0 || index + 1 >= points.length) return null;
    return initialBearing(points[index], points[index + 1]);
  };

  byIndex.set(0, { at: 0, kind: "depart" });

  for (let i = 0; i < nodeIds.length; i++) {
    const at = legStartIndex[i];
    if (at === undefined || at === 0) continue;

    const existing = byIndex.get(at);

    const incoming = bearingAt(at - 1);
    const outgoing = bearingAt(at);
    if (incoming !== null && outgoing !== null) {
      const turn = classifyTurn(incoming, outgoing);
      if (turn) {
        if (existing) {
          existing.turn = turn;
          if (existing.kind === "depart") existing.kind = "turn";
        } else {
          byIndex.set(at, { at, kind: "turn", turn });
        }
      }
    }

    // The edge leaving this node is the one that carries the steps or the ramp.
    const edge = graph.adjacency
      .get(nodeIds[i])
      ?.find((ref) => ref.to === nodeIds[i + 1])?.edge;
    const feature = edge?.hasRamp ? ("ramp" as const) : edge?.hasSteps ? ("steps" as const) : null;
    if (feature) {
      const target = existing ?? byIndex.get(at);
      if (target) {
        target.feature = feature;
        target.edge = edge;
      } else {
        byIndex.set(at, { at, kind: "feature", edge, feature });
      }
    }
  }

  const lastNodeIndex = legStartIndex[legStartIndex.length - 1];
  if (lastNodeIndex !== undefined && lastNodeIndex > 0) {
    byIndex.set(lastNodeIndex, { at: lastNodeIndex, kind: "arrive" });
  }

  return ordered();
}

function buildSteps(
  plan: GeometryPlan,
  markers: StepMarker[],
  entranceName: string | null
): NavStep[] {
  const { points } = plan;
  const boundaries = markers.map((marker) => marker.at);
  const slices: NavStep[] = [];

  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i];
    // Steps share their boundary vertex, exactly like OSRM steps, so the §4
    // boundary matcher in geo-nav can align them against the route polyline.
    const end = i + 1 < boundaries.length ? boundaries[i + 1] : points.length - 1;
    const geometry = points.slice(start, end + 1);
    if (geometry.length < 2) continue;

    const marker = markers[i];
    const distance = polylineLength(geometry);

    let instruction: string;
    let type: string;
    let modifier: string | null = null;
    let icon: ManeuverIconName;

    if (i === 0) {
      const heading = compassDirection(initialBearing(geometry[0], geometry[1]));
      instruction = heading ? `Head ${heading}` : "Start walking";
      type = "depart";
      icon = maneuverIcon({ type: "depart" });
    } else if (marker.kind === "arrive") {
      instruction = entranceName ? `Arrive at ${entranceName}` : "You have arrived";
      type = "arrive";
      icon = maneuverIcon({ type: "arrive" });
    } else if (marker.kind === "turn" && marker.turn) {
      instruction = marker.turn.instruction;
      type = "turn";
      modifier = marker.turn.modifier;
      icon = marker.turn.icon;
    } else if (marker.kind === "feature") {
      instruction =
        marker.feature === "ramp" ? "Continue on the ramp" : "Take the steps";
      type = marker.feature === "ramp" ? "ramp" : "steps";
      icon = "straight";
    } else {
      instruction = "Continue on the campus path";
      type = "continue";
      icon = "straight";
    }

    if (marker.feature === "ramp" && type === "turn" && marker.turn) {
      instruction = `${marker.turn.instruction} onto the ramp`;
    } else if (marker.feature === "steps" && type === "turn" && marker.turn) {
      instruction = `${marker.turn.instruction}, then take the steps`;
    }

    slices.push({
      instruction,
      street: null,
      distance,
      duration: 0, // filled in proportionally once the total is known
      location: geometry[0],
      geometry,
      icon,
      type,
      modifier,
    });
  }

  return slices;
}

/**
 * Chooses where the walk ends, then finds the cheapest way there.
 *
 * Entrance selection is the whole point of the feature: a building with a stair
 * door and a ramp door has to pick the ramp when asked, and fall back to the
 * nearest door — reporting that it did — when no step-free door is reachable.
 */
function selectCandidates(
  graph: CampusGraph,
  request: GraphRouteRequest,
  options: GraphRouteOptions,
  fromNodeId: string
): Candidate[] {
  const relevant = request.buildingId
    ? entrancesFor(graph, request.buildingId)
    : [];

  // No surveyed entrances (or no buildingId): the raw point is the destination.
  const targets: Array<{ entrance: GraphEntranceInput | null; point: LatLon }> =
    relevant.length > 0
      ? relevant.map((entrance) => ({
          entrance,
          point: { latitude: entrance.lat, longitude: entrance.lng },
        }))
      : [{ entrance: null, point: request.to }];

  const scored: Candidate[] = [];
  for (const target of targets) {
    if (target.entrance && !isEntranceOpen(target.entrance, options)) continue;
    const snapped = nearestNode(graph, target.point);
    if (!snapped) continue;
    const path = findPath(graph, fromNodeId, snapped.nodeId);
    if (!path) continue;
    scored.push({
      entrance: target.entrance,
      point: target.point,
      cost: path.cost,
      nodeIds: path.nodeIds,
      stepFreeSatisfied: !options.stepFree || target.entrance?.stepFree === true,
    });
  }

  return scored;
}

/**
 * Entrances are attached to the graph as attributes rather than stored on the
 * table, so they travel with the loaded graph. This indirection is what lets
 * `server/graph.ts` cache one graph per campus and swap the entrance set without
 * rebuilding adjacency.
 */
const entrancesKey = "__entrances";

type GraphWithEntrances = CampusGraph & {
  [entrancesKey]?: Map<string, GraphEntranceInput[]>;
};

export function attachEntrances(
  graph: CampusGraph,
  entrances: readonly GraphEntranceInput[]
): CampusGraph {
  const byBuilding = new Map<string, GraphEntranceInput[]>();
  for (const entrance of entrances) {
    if (!Number.isFinite(entrance.lat) || !Number.isFinite(entrance.lng)) continue;
    const list = byBuilding.get(entrance.buildingId) ?? [];
    list.push(entrance);
    byBuilding.set(entrance.buildingId, list);
  }
  (graph as GraphWithEntrances)[entrancesKey] = byBuilding;
  return graph;
}

function entrancesFor(
  graph: CampusGraph,
  buildingId: string
): GraphEntranceInput[] {
  return (graph as GraphWithEntrances)[entrancesKey]?.get(buildingId) ?? [];
}

/**
 * Routes across the campus graph.
 *
 * Preference order: a step-free door when one is reachable, otherwise the
 * cheapest door, otherwise the raw destination point. Every fallback is
 * reported through `stepFreeSatisfied` so the client can say so out loud
 * rather than quietly serving a stair route to someone who asked not to climb.
 */
export function routeOnGraph(
  graph: CampusGraph,
  request: GraphRouteRequest,
  options: GraphRouteOptions = {}
): GraphRouteOutcome {
  if (graph.nodes.size === 0) {
    return {
      ok: false,
      failure: { reason: "empty-graph", message: "No campus path data available." },
    };
  }

  const origin = nearestNode(graph, request.from, MAX_SNAP_METERS);
  if (!origin) {
    return {
      ok: false,
      failure: {
        reason: "origin-off-graph",
        message: "You are too far from a mapped campus path to route step-free.",
      },
    };
  }

  const candidates = selectCandidates(graph, request, options, origin.nodeId);
  if (candidates.length === 0) {
    const hasDoors = request.buildingId
      ? entrancesFor(graph, request.buildingId).length > 0
      : false;
    return {
      ok: false,
      failure: hasDoors
        ? {
            reason: "no-usable-entrance",
            message: "No usable entrance connects to the campus path network.",
          }
        : {
            reason: "unreachable",
            message: "No campus path connects your position to this destination.",
          },
    };
  }

  // Prefer a reachable step-free door; otherwise take the cheapest and admit it.
  const satisfying = candidates.filter((c) => c.stepFreeSatisfied);
  const pool = satisfying.length > 0 ? satisfying : candidates;
  const stepFreeSatisfied = satisfying.length > 0;
  const best = pool.reduce((a, b) => (b.cost < a.cost ? b : a));

  const plan = planGeometry(request.from, best.nodeIds, graph, best.point);
  if (plan.points.length < 2) {
    return {
      ok: false,
      failure: { reason: "unreachable", message: "That route is not walkable." },
    };
  }

  const markers = markSteps(plan, graph, best.nodeIds);
  const steps = buildSteps(plan, markers, best.entrance?.name ?? null);
  const distanceMeters = polylineLength(plan.points);
  const durationSeconds = estimateWalkSeconds(distanceMeters);

  // Spread the walk estimate across steps so the list shows a time per leg.
  for (const step of steps) {
    step.duration =
      distanceMeters > 0
        ? Math.round((step.distance / distanceMeters) * durationSeconds)
        : 0;
  }

  return {
    ok: true,
    route: {
      coordinates: plan.points,
      steps,
      distanceMeters,
      durationSeconds,
      entrance: best.entrance,
      stepFreeSatisfied,
      nodeIds: best.nodeIds,
    },
  };
}
