import { buildGraph } from "../lib/navigation/graph";
import { SEED_PATH_NODES, SEED_PATH_EDGES } from "../lib/data/path-graph-fallback";

const nodes = SEED_PATH_NODES.map((n) => ({ id: n.id, lat: n.lat, lng: n.lng }));
const edges = SEED_PATH_EDGES.map((e) => ({
  fromNodeId: e.from, toNodeId: e.to, distanceM: e.distanceM,
  hasSteps: e.hasSteps ?? false, hasRamp: e.hasRamp ?? false,
  covered: e.covered ?? false, surface: e.surface ?? ("paved" as const),
}));
const g = buildGraph(nodes, edges, {});

const geo = (a: string, b: string) => {
  const na = nodes.find((n) => n.id === a)!;
  const nb = nodes.find((n) => n.id === b)!;
  const R = 6371e3, dLat = (nb.lat - na.lat) * Math.PI / 180;
  const dLng = (nb.lng - na.lng) * Math.PI / 180;
  const la1 = na.lat * Math.PI / 180, la2 = nb.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const goal = "senate-stair";

// Consistency check: is h(u) <= cost(u,v) + h(v) for every edge?
let violations = 0;
for (const [u, refs] of g.adjacency) {
  for (const r of refs) {
    const lhs = geo(u, goal);
    const rhs = r.cost + geo(r.to, goal);
    if (lhs > rhs + 1e-9) {
      violations++;
      if (violations <= 10) console.log(`INCONSISTENT ${u}→${r.to}: h=${lhs.toFixed(1)} > c=${r.cost.toFixed(1)} + h=${geo(r.to, goal).toFixed(1)}`);
    }
  }
}
console.log("consistency violations:", violations);

// Manual A* trace with an explicit priority list.
const best = new Map<string, number>([["court", 0]]);
const cameFrom = new Map<string, string>();
const closed = new Set<string>();
const open: { node: string; f: number; g: number }[] = [
  { node: "court", f: geo("court", goal), g: 0 }
];
let step = 0;
while (open.length) {
  open.sort((a, b) => a.f - b.f);
  const { node, f, g: poppedG } = open.shift()!;
  console.log(`${++step}. pop ${node} f=${f.toFixed(1)} g=${poppedG.toFixed(2)} (best=${(best.get(node) ?? Infinity).toFixed(2)})`);
  if (node === goal) { console.log("   GOAL g =", best.get(goal)); break; }
  if (closed.has(node)) { console.log("   stale, skip"); continue; }
  closed.add(node);
  const currentCost = best.get(node)!;
  for (const ref of g.adjacency.get(node) ?? []) {
    if (closed.has(ref.to)) continue;
    const cand = currentCost + ref.cost;
    if (cand >= (best.get(ref.to) ?? Infinity)) continue;
    best.set(ref.to, cand);
    cameFrom.set(ref.to, node);
    open.push({ node: ref.to, f: cand + geo(ref.to, goal), g: cand });
  }
}
console.log("\nfinal best(senate-stair) =", best.get(goal));
let c = goal; const path = [c];
while (cameFrom.has(c)) { c = cameFrom.get(c)!; path.unshift(c); }
console.log("path:", path.join("→"));
