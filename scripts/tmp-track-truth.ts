import { segmentDistance, polylineLength } from "../lib/geo";

const pts: { latitude: number; longitude: number }[] = [];
for (let i = 0; i < 400; i++) {
  const t = i / 399;
  pts.push({
    latitude: 8.8465 + t * 0.0026 + Math.sin(i * 2.7) * 0.00003,
    longitude: 7.876 + t * 0.0011 + Math.cos(i * 3.1) * 0.00003,
  });
}

const toLL = pts.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
console.log("true polyline length of the raw track:", polylineLength(toLL).toFixed(1), "m");
console.log("straight-line first->last:", segmentDistance(toLL[0], toLL[399]).toFixed(1), "m");

// Consecutive spacing, to see what de-noising should be doing.
const gaps: number[] = [];
for (let i = 1; i < toLL.length; i++) gaps.push(segmentDistance(toLL[i - 1], toLL[i]));
console.log("consecutive gap  min:", Math.min(...gaps).toFixed(2), " max:", Math.max(...gaps).toFixed(2));
console.log("gaps under 2m:", gaps.filter((g) => g < 2).length, "of", gaps.length);
