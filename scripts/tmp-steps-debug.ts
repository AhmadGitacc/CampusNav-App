import { buildGraph, attachEntrances, routeOnGraph } from "../lib/navigation/graph";
import { SEED_PATH_NODES, SEED_PATH_EDGES, SEED_ENTRANCES } from "../lib/data/path-graph-fallback";

const nodes = SEED_PATH_NODES.map((n) => ({ id: n.id, lat: n.lat, lng: n.lng }));
const edges = SEED_PATH_EDGES.map((e) => ({
  fromNodeId: e.from, toNodeId: e.to, distanceM: e.distanceM,
  hasSteps: e.hasSteps ?? false, hasRamp: e.hasRamp ?? false,
  covered: e.covered ?? false, surface: e.surface ?? ("paved" as const),
  lit: e.lit ?? true,
}));
const entrances = SEED_ENTRANCES.map((e, i) => ({
  id: `ent-${i}`, buildingId: e.buildingId, name: e.name, lat: e.lat, lng: e.lng,
  hasRamp: e.hasRamp ?? false, hasSteps: e.hasSteps ?? false,
  stepFree: e.stepFree ?? true, gated: e.gated ?? false, gateClosesAt: e.gateClosesAt ?? null,
}));

const g = attachEntrances(buildGraph(nodes, edges, { stepFree: true }), entrances);
const r = routeOnGraph(g, {
  from: { latitude: 8.8465, longitude: 7.87595 },
  to: { latitude: 8.849, longitude: 7.8785 },
  buildingId: "nsuk-senate",
}, { stepFree: true });

if (!r.ok) { console.log("FAILED", r.failure); process.exit(1); }
const route = r.route;
console.log("nodes:", route.nodeIds.join("→"));
console.log("geometry points:", route.coordinates.length);
route.coordinates.forEach((c, i) => console.log(`  [${i}] ${c.latitude}, ${c.longitude}`));
console.log("\nsteps:");
route.steps.forEach((s, i) =>
  console.log(`  ${i} type=${s.type.padEnd(8)} icon=${s.icon.padEnd(8)} d=${s.distance.toFixed(0).padStart(4)} "${s.instruction}"`)
);
console.log("\nENTRANCE:", JSON.stringify(route.entrance));
