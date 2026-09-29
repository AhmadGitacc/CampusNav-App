import { buildGraph } from "../lib/navigation/graph";
import { segmentDistance } from "../lib/geo";
import { SEED_PATH_NODES, SEED_PATH_EDGES } from "../lib/data/path-graph-fallback";

const nodes = SEED_PATH_NODES.map((n) => ({ id: n.id, lat: n.lat, lng: n.lng }));
const g = buildGraph(nodes, SEED_PATH_EDGES.map((e) => ({
  fromNodeId: e.from, toNodeId: e.to, distanceM: e.distanceM,
  hasSteps: e.hasSteps ?? false, hasRamp: e.hasRamp ?? false,
  covered: e.covered ?? false, surface: e.surface ?? ("paved" as const),
})), {});

console.log("edge                              surveyed  chord   ratio");
for (const [u, refs] of g.adjacency) {
  for (const r of refs) {
    if (u > r.to) continue; // print each undirected edge once
    const na = nodes.find((n) => n.id === u)!;
    const nb = nodes.find((n) => n.id === r.to)!;
    const chord = segmentDistance({ latitude: na.lat, longitude: na.lng }, { latitude: nb.lat, longitude: nb.lng });
    const flag = r.edge.distanceM < chord * 0.95 ? "  <-- SURVEYED < CHORD" : "";
    console.log(
      `${(u + "→" + r.to).padEnd(32)} ${r.edge.distanceM.toFixed(0).padStart(8)} ${chord.toFixed(0).padStart(7)} ${(r.edge.distanceM / chord).toFixed(2).padStart(6)}${flag}`
    );
  }
}
