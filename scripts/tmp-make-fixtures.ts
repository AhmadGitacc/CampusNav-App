import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const dir = process.env.TEMP + "\\opencode\\pathtest";
mkdirSync(dir, { recursive: true });

// A jittery walk: GPS noise on top of a straight-ish line, so de-noising and
// simplification have something real to remove.
const pts: { latitude: number; longitude: number }[] = [];
for (let i = 0; i < 400; i++) {
  const t = i / 399;
  pts.push({
    latitude: 8.8465 + t * 0.0026 + Math.sin(i * 2.7) * 0.00003,
    longitude: 7.876 + t * 0.0011 + Math.cos(i * 3.1) * 0.00003,
  });
}

writeFileSync(join(dir, "track.json"), JSON.stringify({ points: pts }));

const gpx = [
  '<?xml version="1.0"?>',
  '<gpx version="1.1" creator="test">',
  "<trk><name>walk</name><trkseg>",
  ...pts.map(
    (p) => `  <trkpt lat="${p.latitude}" lon="${p.longitude}"></trkpt>`
  ),
  "</trkseg></trk>",
  "</gpx>",
].join("\n");
writeFileSync(join(dir, "track.gpx"), gpx);

writeFileSync(
  join(dir, "track.geojson"),
  JSON.stringify({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: pts.map((p) => [p.longitude, p.latitude]) },
      },
    ],
  })
);

console.log("wrote 3 fixtures to", dir);
