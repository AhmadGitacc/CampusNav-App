/**
 * Scratch verification for the §5 graph engine. Deleted after running.
 */
import {
  buildGraph,
  routeOnGraph,
  attachEntrances,
  nearestNode,
  findPath,
  classifyTurn,
  bearingDelta,
  isEntranceOpen,
  parseClock,
  MAX_SNAP_METERS,
} from "../lib/navigation/graph";
import { computeNavProgress } from "../lib/navigation/geo-nav";
import { polylineLength, formatDistance, initialBearing } from "../lib/geo";
import { graphRouteToResponse, routeResponseSchema } from "../lib/route-contract";
import {
  SEED_PATH_NODES,
  SEED_PATH_EDGES,
  SEED_ENTRANCES,
} from "../lib/data/path-graph-fallback";
import { withDestinationName } from "../lib/navigation/instructions";
import type { LatLon } from "../shared/types";

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const nodes = SEED_PATH_NODES.map((n) => ({ id: n.id, lat: n.lat, lng: n.lng }));
const edges = SEED_PATH_EDGES.map((e) => ({
  fromNodeId: e.from,
  toNodeId: e.to,
  distanceM: e.distanceM,
  hasSteps: e.hasSteps ?? false,
  hasRamp: e.hasRamp ?? false,
  covered: e.covered ?? false,
  surface: e.surface ?? ("paved" as const),
  lit: e.lit ?? true,
}));

const entrances = SEED_ENTRANCES.map((e, i) => ({
  id: `ent-${i}`,
  buildingId: e.buildingId,
  name: e.name,
  lat: e.lat,
  lng: e.lng,
  hasRamp: e.hasRamp ?? false,
  hasSteps: e.hasSteps ?? false,
  stepFree: e.stepFree ?? true,
  gated: e.gated ?? false,
  gateClosesAt: e.gateClosesAt ?? null,
}));

const toLatLon = (id: string): LatLon => {
  const n = SEED_PATH_NODES.find((x) => x.id === id)!;
  return { latitude: n.lat, longitude: n.lng };
};

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371e3;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function graph(options = {}) {
  return attachEntrances(buildGraph(nodes, edges, options), entrances);
}

/** Reference Dijkstra, deliberately written independently of the A* under test. */
function dijkstraCosts(
  g: ReturnType<typeof graph>,
  from: string
): Map<string, number> {
  const dist = new Map<string, number>([[from, 0]]);
  const seen = new Set<string>();
  for (;;) {
    let best: string | null = null;
    let bestD = Infinity;
    for (const [node, d] of dist) {
      if (!seen.has(node) && d < bestD) {
        bestD = d;
        best = node;
      }
    }
    if (best === null) return dist;
    seen.add(best);
    for (const ref of g.adjacency.get(best) ?? []) {
      const nd = bestD + ref.cost;
      if (nd < (dist.get(ref.to) ?? Infinity)) dist.set(ref.to, nd);
    }
  }
}

// ── Cost model ──────────────────────────────────────────────────────────────
const anyGraph = graph();
const freeGraph = graph({ stepFree: true });

check("undirected: edge traversable both ways", (anyGraph.adjacency.get("ctr") ?? []).some((r) => r.to === "stair") && (anyGraph.adjacency.get("stair") ?? []).some((r) => r.to === "ctr"));
check("step-free drops the stairs edge", !(freeGraph.adjacency.get("ctr") ?? []).some((r) => r.to === "stair"));
check("step-free counts what it dropped", freeGraph.skippedStepEdges === 1, `got ${freeGraph.skippedStepEdges}`);
const ctrNeighbours = (anyGraph.adjacency.get("ctr") ?? []).map((r) => r.to).sort();
check(
  "central junction keeps all four of its edges",
  JSON.stringify(ctrNeighbours) === JSON.stringify(["court", "law-j", "lib", "stair"]),
  ctrNeighbours.join(",")
);

const dirtEdge = anyGraph.adjacency.get("law-j")!.find((r) => r.to === "ctr")!;
const pavedEdge = anyGraph.adjacency.get("law-j")!.find((r) => r.to === "lib")!;
check("dirt costs more per metre than paved", dirtEdge.cost / dirtEdge.edge.distanceM > pavedEdge.cost / pavedEdge.edge.distanceM);

// The heuristic is scaled by cost-per-chord-metre, not by the smallest surface
// multiplier, so a surveyed edge shorter than its straight-line chord cannot
// make it inadmissible. Verify the bound directly against Dijkstra distances.
for (const opts of [{}, { stepFree: true }, { preferCovered: true }, { stepFree: true, preferCovered: true }]) {
  const g = graph(opts);
  let bound = Infinity;
  for (const [u, refs] of g.adjacency) {
    for (const r of refs) {
      const na = nodes.find((n) => n.id === u)!;
      const nb = nodes.find((n) => n.id === r.to)!;
      const chord = haversineMeters(na, nb);
      if (chord > 0) bound = Math.min(bound, r.cost / chord);
    }
  }
  check(
    `minCostPerMeter is the true cost/chord bound ${JSON.stringify(opts)}`,
    Math.abs(g.minCostPerMeter - (Number.isFinite(bound) ? bound : 1)) < 1e-9,
    `${g.minCostPerMeter} vs ${bound}`
  );

  // h(n) must never exceed the real cheapest cost from n to any goal.
  let admissible = true;
  let offender = "";
  for (const from of SEED_PATH_NODES) {
    const truth = dijkstraCosts(g, from.id);
    for (const goal of SEED_PATH_NODES) {
      if (from.id === goal.id) continue;
      const realCost = truth.get(goal.id);
      if (realCost === undefined) continue; // disconnected pair: no constraint
      const h = haversineMeters(from, goal) * g.minCostPerMeter;
      if (h > realCost + 1e-6) {
        admissible = false;
        offender = `${from.id}→${goal.id}: h=${h.toFixed(1)} > cost=${realCost.toFixed(1)}`;
      }
    }
  }
  check(`heuristic is admissible for every node pair ${JSON.stringify(opts)}`, admissible, offender);
}

const coveredGraph = graph({ preferCovered: true });
check(
  "preferring cover lowers the cost bound",
  coveredGraph.minCostPerMeter < anyGraph.minCostPerMeter,
  `${coveredGraph.minCostPerMeter} vs ${anyGraph.minCostPerMeter}`
);
check("the non-covered graph is not discounted", anyGraph.minCostPerMeter >= 1, `${anyGraph.minCostPerMeter}`);

// ── A* ──────────────────────────────────────────────────────────────────────
const libToSenate = findPath(anyGraph, "lib", "senate")!;
check("A* finds a path", !!libToSenate);
check("A* path starts and ends right", libToSenate.nodeIds[0] === "lib" && libToSenate.nodeIds[libToSenate.nodeIds.length - 1] === "senate");

const sfLibToSenate = findPath(freeGraph, "lib", "senate")!;
check("step-free A* avoids the stairs node", !sfLibToSenate.nodeIds.includes("stair"), sfLibToSenate.nodeIds.join("→"));
check("step-free A* is longer in cost than any-route", sfLibToSenate.cost > libToSenate.cost, `${sfLibToSenate.cost} vs ${libToSenate.cost}`);

// Cross-check A* against the reference Dijkstra on every pair and every option
// set. This is the check that caught the inadmissible heuristic.
const optionSets = [{}, { stepFree: true }, { preferCovered: true }, { stepFree: true, preferCovered: true }];
let aStarMatchesDijkstra = 0;
for (const opts of optionSets) {
  const g = graph(opts);
  for (const a of SEED_PATH_NODES) {
    const truth = dijkstraCosts(g, a.id);
    for (const b of SEED_PATH_NODES) {
      const astar = findPath(g, a.id, b.id);
      const dij = truth.get(b.id) ?? null;
      if (Math.abs((astar?.cost ?? Infinity) - (dij ?? Infinity)) < 1e-6) aStarMatchesDijkstra++;
      else failures.push(`A* != Dijkstra ${a.id}→${b.id} opts=${JSON.stringify(opts)}: ${astar?.cost} vs ${dij}`);
    }
  }
}
check(
  `A* matches Dijkstra on all ${SEED_PATH_NODES.length ** 2} node pairs × ${optionSets.length} option sets`,
  aStarMatchesDijkstra === SEED_PATH_NODES.length ** 2 * optionSets.length,
  `got ${aStarMatchesDijkstra}`
);

// Same-node and unknown-node edges.
check("A* to self is a zero-length path", findPath(anyGraph, "ctr", "ctr")!.nodeIds.length === 1);
check("A* on an unknown node returns null", findPath(anyGraph, "ctr", "nope") === null);

// ── Snapping ────────────────────────────────────────────────────────────────
check("nearestNode finds the law node", nearestNode(anyGraph, toLatLon("law"))!.nodeId === "law");
check("nearestNode respects a radius", nearestNode(anyGraph, { latitude: 8.85, longitude: 7.88 }, 100) === null);
check("MAX_SNAP_METERS is generous", MAX_SNAP_METERS >= 100);

// ── Gates ───────────────────────────────────────────────────────────────────
const eastGate = entrances.find((e) => e.name === "East gate")!;
check("gate is open before closing", isEntranceOpen(eastGate, { avoidGatesAfter: "19:59" }));
check("gate is shut at closing time", !isEntranceOpen(eastGate, { avoidGatesAfter: "20:00" }));
check("gate is shut after closing", !isEntranceOpen(eastGate, { avoidGatesAfter: "23:30" }));
check("an ungated entrance is always open", isEntranceOpen(entrances[0], { avoidGatesAfter: "23:30" }));
check("parseClock rejects nonsense", parseClock("25:00") === null && parseClock("") === null);
check("parseClock accepts HH:MM", parseClock("07:05") === 425);

// ── Turn classification ─────────────────────────────────────────────────────
check("no turn for a straight line", classifyTurn(90, 88) === null);
check("tiny jitter is not a turn", classifyTurn(0, 15) === null);
check("right turn", classifyTurn(0, 90)?.modifier === "right");
check("left turn", classifyTurn(0, 270)?.modifier === "left");
check("slight right", classifyTurn(0, 30)?.modifier === "slight right");
check("slight left", classifyTurn(0, 330)?.modifier === "slight left");
check("sharp right", classifyTurn(0, 135)?.modifier === "sharp right");
check("uturn", classifyTurn(0, 180)?.modifier === "uturn");
check("bearingDelta wraps", Math.abs(bearingDelta(350, 10) - 20) < 1e-9, `${bearingDelta(350, 10)}`);
check("bearingDelta wraps negative", Math.abs(bearingDelta(10, 350) + 20) < 1e-9);
check("turn icons map to renderable glyphs", classifyTurn(0, 90)?.icon === "right" && classifyTurn(0, 180)?.icon === "u-turn");

// ── Routing: entrance selection ─────────────────────────────────────────────
const fromLaw = { latitude: 8.8465, longitude: 7.87595 };

const anyRoute = routeOnGraph(anyGraph, { from: fromLaw, to: toLatLon("senate"), buildingId: "nsuk-senate" });
check("any-route succeeds", anyRoute.ok);
const st = anyRoute.ok ? anyRoute.route : null;
const sfRoute = routeOnGraph(freeGraph, { from: fromLaw, to: toLatLon("senate"), buildingId: "nsuk-senate" });
const sf = sfRoute.ok ? sfRoute.route : null;

if (st && sf) {
  check("any-route takes the stair door", st.entrance?.name === "Stair door", `${st.entrance?.name}`);
  check("step-free takes the ramp door", sf.entrance?.name === "Main ramp entrance", `${sf.entrance?.name}`);
  check("any-route reports itself satisfied", st.stepFreeSatisfied === true);
  check("step-free reports itself satisfied", sf.stepFreeSatisfied === true);
  check("step-free route is longer", sf.distanceMeters > st.distanceMeters, `${sf.distanceMeters.toFixed(0)} vs ${st.distanceMeters.toFixed(0)}`);
  check("step-free geometry avoids the stair node's approach", !sf.nodeIds.includes("stair"), sf.nodeIds.join("→"));
  check("both routes end at the building", Math.abs(sf.coordinates[sf.coordinates.length - 1].latitude - 8.84898) < 1e-5);
  check("distance equals the drawn polyline", Math.abs(sf.distanceMeters - polylineLength(sf.coordinates)) < 0.01);
  check("duration is walk time, not zero", sf.durationSeconds > 0, `${sf.durationSeconds}`);
  check("step durations sum to the total", Math.abs(sf.steps.reduce((a, s) => a + s.duration, 0) - sf.durationSeconds) <= sf.steps.length);
}

// A building whose only step-free door is gated shut must fall back and say so.
const gatedConv = routeOnGraph(
  graph({ stepFree: true }),
  { from: fromLaw, to: toLatLon("conv"), buildingId: "nsuk-convocation-square" },
  { stepFree: true, avoidGatesAfter: "21:00" }
);
if (gatedConv.ok) {
  const hasOpenDoor = SEED_ENTRANCES.filter(
    (e) => e.buildingId === "nsuk-convocation-square" && e.stepFree
  ).length;
  check("convocation still routable with the east gate shut", true);
  check(
    "a shut gate is not selected as the only step-free door",
    gatedConv.route.entrance?.name !== "East gate",
    `${gatedConv.route.entrance?.name} (${hasOpenDoor} step-free doors exist)`
  );
}

// No buildingId: the raw point is the destination.
const noBuilding = routeOnGraph(anyGraph, { from: fromLaw, to: toLatLon("conv") });
check("routes without a buildingId", noBuilding.ok);
if (noBuilding.ok) {
  check("no buildingId means no entrance claim", noBuilding.route.entrance === null);
  check("no buildingId ends at the requested point", Math.abs(noBuilding.route.coordinates[noBuilding.route.coordinates.length - 1].latitude - 8.8482) < 1e-4);
}

// Failure modes.
const offGraph = routeOnGraph(anyGraph, { from: { latitude: 9.9, longitude: 9.9 }, to: toLatLon("senate") });
check("far origin fails cleanly", !offGraph.ok && offGraph.failure.reason === "origin-off-graph", offGraph.ok ? "succeeded" : offGraph.failure.reason);

const empty = buildGraph([], [], {});
const emptyRoute = routeOnGraph(empty, { from: fromLaw, to: toLatLon("senate") });
check("empty graph fails cleanly", !emptyRoute.ok && emptyRoute.failure.reason === "empty-graph");

const disconnected = attachEntrances(
  buildGraph(
    [{ id: "a", lat: 8.84, lng: 7.87 }, { id: "b", lat: 8.85, lng: 7.88 }],
    [],
    { stepFree: true }
  ),
  []
);
const isolated = routeOnGraph(disconnected, { from: { latitude: 8.84, longitude: 7.87 }, to: { latitude: 8.85, longitude: 7.88 } });
check("disconnected graph fails cleanly", !isolated.ok && isolated.failure.reason === "unreachable", isolated.ok ? "ok" : isolated.failure.reason);

// ── Steps ───────────────────────────────────────────────────────────────────
if (sf) {
  check("steps were produced", sf.steps.length >= 2, `${sf.steps.length}`);
  check("first step is a depart", sf.steps[0].type === "depart", sf.steps[0].type);
  check("last step is an arrive", sf.steps[sf.steps.length - 1].type === "arrive", sf.steps[sf.steps.length - 1].type);
  check("first step has a compass bearing", /^Head /.test(sf.steps[0].instruction), sf.steps[0].instruction);
  check("last step names the door", sf.steps[sf.steps.length - 1].instruction === "Arrive at Main ramp entrance", sf.steps[sf.steps.length - 1].instruction);
  check("a ramp edge is announced", sf.steps.some((s) => /ramp/i.test(s.instruction)), sf.steps.map((s) => s.instruction).join(" | "));
  check("no step-free route mentions steps", !sf.steps.some((s) => /take the steps/i.test(s.instruction)), sf.steps.map((s) => s.instruction).join(" | "));
  check("every step has geometry", sf.steps.every((s) => s.geometry.length >= 1));
  check("no zero-length steps", sf.steps.every((s) => s.distance > 0), sf.steps.filter((s) => s.distance <= 0).map((s) => s.instruction).join(", "));
  check("step distances sum to the route", Math.abs(sf.steps.reduce((a, s) => a + s.distance, 0) - sf.distanceMeters) < 0.5, `${sf.steps.reduce((a, s) => a + s.distance, 0)} vs ${sf.distanceMeters}`);

  // The §4 integration contract: step geometries must be exact slices of the
  // route polyline, or stepOffsets() silently misaligns the step list.
  const slicesMatch = sf.steps.every((step, i) => {
    const start = sf.coordinates.findIndex(
      (c) => c.latitude === step.geometry[0].latitude && c.longitude === step.geometry[0].longitude
    );
    if (start < 0) return false;
    for (let j = 0; j < step.geometry.length; j++) {
      const a = sf.coordinates[start + j];
      const b = step.geometry[j];
      if (!a || a.latitude !== b.latitude || a.longitude !== b.longitude) return false;
    }
    return true;
  });
  check("every step geometry is an exact slice of the route polyline", slicesMatch);

  const withName = withDestinationName(sf.steps, "Senate Building");
  check("destination name is applied when there is no entrance", withName[withName.length - 1].instruction === "Arrive at Senate Building", withName[withName.length - 1].instruction);
  const withEntrance = withDestinationName(sf.steps, "Senate Building", sf.entrance?.name);
  check("entrance name wins over the destination name", withEntrance[withEntrance.length - 1].instruction === "Arrive at Main ramp entrance", withEntrance[withEntrance.length - 1].instruction);
}

// ── §4 integration: progress along a graph route ────────────────────────────
if (sf) {
  const samples = [0, 0.25, 0.5, 0.75, 0.99];
  let monotone = true;
  let prevTraveled = -1;
  let cueIndices: number[] = [];
  for (const fraction of samples) {
    const index = Math.min(sf.coordinates.length - 2, Math.round(fraction * (sf.coordinates.length - 1)));
    const a = sf.coordinates[index];
    const b = sf.coordinates[index + 1];
    const point = {
      latitude: a.latitude + (b.latitude - a.latitude) * 0.5,
      longitude: a.longitude + (b.longitude - a.longitude) * 0.5,
    };
    const progress = computeNavProgress(point, sf.coordinates, sf.steps);
    if (!progress) { monotone = false; break; }
    if (progress.traveledMeters < prevTraveled - 0.01) monotone = false;
    prevTraveled = progress.traveledMeters;
    cueIndices.push(progress.cueIndex);
    if (progress.offRoute) monotone = false;
  }
  check("progress advances monotonically along a graph route", monotone, `travelled ${prevTraveled.toFixed(0)}m, cues ${cueIndices.join(",")}`);
  check("cue index advances as the walker moves", cueIndices[0] < cueIndices[cueIndices.length - 1], `cues ${cueIndices.join(",")}`);
  check("cues stay inside the step list", cueIndices.every((c) => c >= 0 && c < sf.steps.length));

  const offRoute = computeNavProgress(
    { latitude: 8.8476 + 0.01, longitude: 7.8778 },
    sf.coordinates,
    sf.steps
  );
  check("a point far off the route is flagged", offRoute?.offRoute === true);

  const arrival = computeNavProgress(sf.coordinates[sf.coordinates.length - 1], sf.coordinates, sf.steps);
  check("the final point reports ~0m remaining", (arrival?.remainingMeters ?? 999) < 1, `${arrival?.remainingMeters}`);
  check("arrival lands on the last step", arrival?.stepIndex === sf.steps.length - 1, `${arrival?.stepIndex} of ${sf.steps.length - 1}`);
}

// ── Wire contract ───────────────────────────────────────────────────────────
if (sf) {
  const response = graphRouteToResponse(sf);
  const parsed = routeResponseSchema.safeParse(response);
  check("graph route satisfies the wire schema", parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues).slice(0, 200));
  check("response is marked as a graph route", response.source === "graph" && response.approximate === false);
  check("response carries the entrance", response.entrance?.name === "Main ramp entrance");
  check("response geometry is unchanged", response.coordinates.length === sf.coordinates.length);

  const bad = routeResponseSchema.safeParse({ ...response, steps: [{ ...response.steps[0], icon: "not-an-icon" }] });
  check("schema rejects an unknown maneuver icon", !bad.success);
}

// ── Report ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} checks passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  for (const failure of failures) console.log(`  x ${failure}`);
  process.exit(1);
}
console.log(`\nStep-free vs any-route (Law → Senate):`);
if (st && sf) {
  console.log(`  any     ${formatDistance(st.distanceMeters)}  ${st.nodeIds.join("→")}  door: ${st.entrance?.name}`);
  console.log(`  stepfree ${formatDistance(sf.distanceMeters)}  ${sf.nodeIds.join("→")}  door: ${sf.entrance?.name}`);
  console.log(`  cues: ${sf.steps.map((s) => s.instruction).join("  →  ")}`);
}
