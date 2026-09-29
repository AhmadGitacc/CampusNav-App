import { buildGraph, findPath } from "../lib/navigation/graph";
import { SEED_PATH_NODES, SEED_PATH_EDGES } from "../lib/data/path-graph-fallback";

const nodes = SEED_PATH_NODES.map((n) => ({ id: n.id, lat: n.lat, lng: n.lng }));
const edges = SEED_PATH_EDGES.map((e) => ({
  fromNodeId: e.from,
  toNodeId: e.to,
  distanceM: e.distanceM,
  hasSteps: e.hasSteps ?? false,
  hasRamp: e.hasRamp ?? false,
  covered: e.covered ?? false,
  surface: e.surface ?? ("paved" as const),
}));

const g = buildGraph(nodes, edges, {});
console.log("minCostPerMeter:", g.minCostPerMeter);

const astar = findPath(g, "court", "senate-stair")!;
console.log("A*  cost", astar.cost, astar.nodeIds.join("→"));

// Reconstruct edge costs along the A* path.
let total = 0;
for (let i = 1; i < astar.nodeIds.length; i++) {
  const from = astar.nodeIds[i - 1];
  const to = astar.nodeIds[i];
  const ref = (g.adjacency.get(from) ?? []).find((r) => r.to === to);
  console.log(`   ${from}→${to}  dist=${ref?.edge.distanceM}  cost=${ref?.cost}`);
  total += ref?.cost ?? 0;
}
console.log("   sum =", total);

function dijkstra(from: string, to: string): { cost: number; path: string[] } | null {
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const seen = new Set<string>();
  for (;;) {
    let best: string | null = null;
    let bestD = Infinity;
    for (const [node, d] of dist) {
      if (!seen.has(node) && d < bestD) { bestD = d; best = node; }
    }
    if (!best) return null;
    if (best === to) {
      const path = [best];
      let c = best;
      while (prev.has(c)) { c = prev.get(c)!; path.unshift(c); }
      return { cost: bestD, path };
    }
    seen.add(best);
    for (const ref of g.adjacency.get(best) ?? []) {
      const nd = bestD + ref.cost;
      if (nd < (dist.get(ref.to) ?? Infinity)) { dist.set(ref.to, nd); prev.set(ref.to, best); }
    }
  }
}
console.log("Dijkstra", JSON.stringify(dijkstra("court", "senate-stair")));
