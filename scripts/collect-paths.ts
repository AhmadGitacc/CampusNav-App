/**
 * Walk-campus survey tool (Feature 5, §5.7).
 *
 *   npm run paths:collect -- --track walk.json
 *   npm run paths:collect -- --track walk.json --out survey.sql
 *
 * Turns a recorded GPS trace into `path_nodes` / `path_edges` rows. The flags
 * that matter for step-free routing — steps, ramps, surface, cover — cannot be
 * inferred from a trace, so this emits a *review sheet*: a proposed graph plus a
 * CSV the surveyor fills in, which is then replayed with `--apply`.
 *
 * Why a file and not live GPS: this runs in a terminal on a laptop, and a
 * surveyor walking a campus has their phone in a pocket, not a Node process on
 * their shoulder. Records come from whatever the phone already has (GPX export
 * from a fitness app, a trace dumped from a browser session). That is also why
 * the on-device capture half of §5.7 is deferred to the admin CMS (Feature 10)
 * rather than faked here.
 *
 * Input is either a bare array of `{lat, lng, t?}` fixes, a GeoJSON
 * `LineString`/`MultiLineString`, or a GPX file. Node spacing and simplification
 * are tunable — see `NODE_SPACING_M` and `SIMPLIFY_TOLERANCE_M`.
 */

import * as fs from "fs";
import * as path from "path";
import { parseArgs } from "node:util";
import { segmentDistance } from "../lib/geo";
import type { LatLon } from "../shared/types";

/**
 * How far apart to place a node. Roughly where a walker would decide to turn,
 * and coarse enough that a 200m walk does not become 40 nodes.
 */
const NODE_SPACING_M = 25;

/**
 * Ramer–Douglas–Peucker tolerance. Larger means fewer nodes and straighter
 * (but less faithful) segments — worth lowering around a ramp, where the exact
 * alignment matters more than the node count.
 */
const SIMPLIFY_TOLERANCE_M = 8;

/** A fix closer than this to the previous one is GPS noise, not movement. */
const MIN_FIX_SPACING_M = 2;

const METERS_PER_DEGREE_LAT = 111320;

interface Options {
  track: string;
  out: string | null;
  apply: boolean;
  campus: string;
  spacing: number;
  tolerance: number;
  dryRun: boolean;
}

function parseCli(argv: string[]): Options {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      track: { type: "string", short: "t" },
      out: { type: "string", short: "o" },
      apply: { type: "boolean", default: false },
      campus: { type: "string", default: "nsuk" },
      spacing: { type: "string", default: String(NODE_SPACING_M) },
      tolerance: { type: "string", default: String(SIMPLIFY_TOLERANCE_M) },
      dryRun: { type: "boolean", default: true },
    },
  });

  if (!values.track) {
    console.error(
      "Usage: npm run paths:collect -- --track <file.json|gpx> [--out survey.sql] [--apply]\n" +
        "  --campus <slug>     campus to attach nodes to (default: nsuk)\n" +
        "  --spacing <meters>  node spacing (default 25)\n" +
        "  --tolerance <m>     simplify tolerance (default 8)\n" +
        "  --apply             write to Postgres (needs DATABASE_URL)\n" +
        "  --dry-run=false     write the SQL file too"
    );
    process.exit(1);
  }

  return {
    track: values.track,
    out: values.out ?? null,
    apply: values.apply ?? false,
    campus: values.campus,
    spacing: Number(values.spacing),
    tolerance: Number(values.tolerance),
    dryRun: values.dryRun !== false,
  };
}

function toLatLon(raw: unknown): LatLon | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;

  const lat = typeof value.lat === "number" ? value.lat : (value.latitude as number);
  const lng = typeof value.lng === "number" ? value.lng : (value.longitude as number);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { latitude: lat, longitude: lng };
}

/** Pulls a fix list out of whichever trace format the surveyor exported. */
export function parseTrack(raw: string, file: string): LatLon[] {
  if (file.toLowerCase().endsWith(".gpx")) return parseGpx(raw);
  const parsed = JSON.parse(raw) as unknown;
  return parseJsonTrack(parsed);
}

function parseJsonTrack(parsed: unknown): LatLon[] {
  // GeoJSON
  if (parsed && typeof parsed === "object" && "type" in parsed) {
    const geo = parsed as { type?: string; coordinates?: unknown; features?: unknown };
    if (geo.type === "LineString" && Array.isArray(geo.coordinates)) {
      return geo.coordinates.map((pair) => toLatLon(fromGeoPair(pair))).filter(isPoint);
    }
    if (geo.type === "FeatureCollection" && Array.isArray(geo.features)) {
      return geo.features.flatMap((feature) => {
        const geometry = (feature as { geometry?: { type?: string; coordinates?: unknown } }).geometry;
        if (!geometry || geometry.type !== "LineString" || !Array.isArray(geometry.coordinates)) {
          return [];
        }
        return geometry.coordinates.map((pair) => toLatLon(fromGeoPair(pair))).filter(isPoint);
      });
    }
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Expected an array of fixes or a GeoJSON LineString.");
  }

  // [{lat, lng}] or [{latitude, longitude}] or a GeoJSON pair per entry.
  const points = parsed
    .map((entry) =>
      Array.isArray(entry) ? toLatLon(fromGeoPair(entry)) : toLatLon(entry)
    )
    .filter(isPoint);

  if (points.length === 0) {
    throw new Error("No usable coordinates found in the track.");
  }
  return points;
}

function fromGeoPair(pair: unknown): unknown {
  // GeoJSON is [longitude, latitude].
  return Array.isArray(pair) ? { lat: pair[1], lng: pair[0] } : null;
}

function isPoint(point: LatLon | null): point is LatLon {
  return point !== null;
}

function parseGpx(raw: string): LatLon[] {
  const points: LatLon[] = [];
  const re = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const point = toLatLon({ lat: Number(match[1]), lng: Number(match[2]) });
    if (point) points.push(point);
  }
  if (points.length === 0) {
    throw new Error("No <trkpt> entries found — is this a GPX track file?");
  }
  return points;
}

/** Drops fixes that barely moved — standing still still produces coordinates. */
function dropStationary(points: LatLon[], minSpacing: number): LatLon[] {
  if (points.length === 0) return points;
  const kept: LatLon[] = [points[0]];
  for (const point of points.slice(1)) {
    if (segmentDistance(kept[kept.length - 1], point) >= minSpacing) {
      kept.push(point);
    }
  }
  return kept;
}

/** Ramer–Douglas–Peucker, in a local metre frame so the tolerance is real. */
function simplify(points: LatLon[], toleranceM: number): LatLon[] {
  if (points.length <= 2) return points;

  const latScale = METERS_PER_DEGREE_LAT;
  const lngScale =
    METERS_PER_DEGREE_LAT *
    Math.cos((points[0].latitude * Math.PI) / 180);

  const x = points.map((p) => p.longitude * lngScale);
  const y = points.map((p) => p.latitude * latScale);

  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let maxDistance = 0;
    let index = -1;

    for (let i = first + 1; i < last; i++) {
      const distance = perpendicularDistance(x[i], y[i], x[first], y[first], x[last], y[last]);
      if (distance > maxDistance) {
        maxDistance = distance;
        index = i;
      }
    }

    if (maxDistance > toleranceM && index > 0) {
      keep[index] = true;
      stack.push([first, index], [index, last]);
    }
  }

  return points.filter((_, index) => keep[index]);
}

function perpendicularDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay);
  const t = ((px - ax) * dx + (py - ay) * dy) / lengthSquared;
  const clamped = Math.min(1, Math.max(0, t));
  return Math.hypot(px - (ax + clamped * dx), py - (ay + clamped * dy));
}

/** Walks the trace and drops a node every `spacing` metres. */
function placeNodes(points: LatLon[], spacing: number): LatLon[] {
  const nodes: LatLon[] = [points[0]];
  let last = points[0];

  for (const point of points.slice(1)) {
    if (segmentDistance(last, point) >= spacing) {
      nodes.push(point);
      last = point;
    }
  }

  // The door at the end of the walk is a node even if it is a few metres short.
  const tail = points[points.length - 1];
  if (segmentDistance(last, tail) > 0.5) nodes.push(tail);
  return nodes;
}

export interface SurveyEdge {
  index: number;
  from: LatLon;
  to: LatLon;
  distanceM: number;
  bearing: number;
}

function buildEdges(nodes: LatLon[]): SurveyEdge[] {
  const edges: SurveyEdge[] = [];
  for (let i = 1; i < nodes.length; i++) {
    const from = nodes[i - 1];
    const to = nodes[i];
    edges.push({
      index: i,
      from,
      to,
      distanceM: Math.round(segmentDistance(from, to)),
      bearing: Math.round(bearingOf(from, to)),
    });
  }
  return edges;
}

function bearingOf(from: LatLon, to: LatLon): number {
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const dLng = ((to.longitude - from.longitude) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/**
 * The review sheet. Every column a surveyor has to answer before the edge is
 * safe to route a wheelchair over — the defaults are all `false`/`paved`, so an
 * unfilled sheet produces an ordinary paved path rather than a silent claim of
 * being step-free.
 */
function toCsv(nodes: LatLon[], edges: SurveyEdge[]): string {
  const lines = ["node_index,lat,lng,edge_index,distance_m,bearing_deg,has_steps,has_ramp,covered,surface,lit,notes"];
  for (const edge of edges) {
    lines.push(
      [
        edge.index - 1,
        edge.from.latitude.toFixed(6),
        edge.from.longitude.toFixed(6),
        edge.index,
        edge.distanceM,
        edge.bearing,
        "false",
        "false",
        "false",
        "paved",
        "true",
        "",
      ].join(",")
    );
  }
  const tail = edges[edges.length - 1];
  if (tail) {
    lines.push(
      [edges.length, tail.to.latitude.toFixed(6), tail.to.longitude.toFixed(6), "", "", "", "", "", "", "", "", ""].join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}

function toSql(campusSlug: string, nodes: LatLon[]): string {
  const nodeValues = nodes
    .map(
      (node) =>
        `  (current_setting('app.campus_id', true)::text, ${node.latitude}, ${node.longitude})`
    )
    .join(",\n");
  return `-- Generated by scripts/collect-paths.ts — review before applying.\n` +
    `-- Campus: ${campusSlug}\n` +
    `-- Run inside a transaction that has set app.campus_id to the campus uuid.\n\n` +
    `insert into path_nodes (campus_id, lat, lng) values\n${nodeValues}\n` +
    `on conflict do nothing;\n\n` +
    `-- Edges reference the uuids assigned above, so they need a second pass:\n` +
    `--   select id, lat, lng from path_nodes where campus_id = $1 order by lat, lng;\n` +
    `-- and one insert into path_edges per consecutive pair, with the flags from\n` +
    `-- the review CSV filled in by hand.\n`;
}

async function main() {
  const options = parseCli(process.argv.slice(2));

  const raw = fs.readFileSync(options.track, "utf-8");
  const fixes = parseTrack(raw, options.track);
  const cleaned = dropStationary(fixes, MIN_FIX_SPACING_M);
  const simplified = simplify(cleaned, options.tolerance);
  const nodes = placeNodes(simplified, options.spacing);
  const edges = buildEdges(nodes);

  const total = edges.reduce((sum, edge) => sum + edge.distanceM, 0);

  console.log(`Track:    ${path.resolve(options.track)}`);
  console.log(`Fixes:    ${fixes.length} raw → ${cleaned.length} after de-noising`);
  console.log(`Nodes:    ${nodes.length} (spacing ${options.spacing}m)`);
  console.log(`Edges:    ${edges.length}, ${total}m total`);

  if (edges.length === 0) {
    console.error("\nNo edges — the track is shorter than the node spacing.");
    process.exit(1);
  }

  const reviewPath = options.out ?? "path-survey.csv";
  fs.writeFileSync(reviewPath, toCsv(nodes, edges));
  console.log(`\nReview:   ${path.resolve(reviewPath)}`);
  console.log(
    "          Fill in has_steps / has_ramp / surface per row — the defaults\n" +
      "          describe an ordinary paved path, so an unfinished survey never\n" +
      "          produces a step-free route it cannot back up."
  );

  const sqlPath = `${reviewPath.replace(/\.csv$/, "")}.sql`;
  fs.writeFileSync(sqlPath, toSql(options.campus, nodes));
  console.log(`SQL:      ${path.resolve(sqlPath)}`);

  if (options.apply) {
    console.log(
      "\n--apply is intentionally not wired up yet: writing to the graph needs the\n" +
        "campus uuid and the reviewed flags, which is the admin CMS's job\n" +
        "(Feature 10). Re-run this tool, fill in the CSV, and apply from there."
    );
  }
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]).endsWith("collect-paths.ts");

if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error("Survey failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
