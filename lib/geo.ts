import type { LatLon, LatLngPair } from "@shared/types";

const EARTH_RADIUS_M = 6371e3;
const WALK_SPEED_MPS = 1.35;
const WALK_SPEED_M_PER_MIN = 80;

export function toLatLon(coords: LatLngPair): LatLon {
  return { latitude: coords.lat, longitude: coords.lng };
}

export function toLatLngPair(point: LatLon): LatLngPair {
  return { lat: point.latitude, lng: point.longitude };
}

export function calculateStraightDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

/** Great-circle distance between two points. */
export function segmentDistance(a: LatLon, b: LatLon): number {
  return calculateStraightDistance(
    a.latitude,
    a.longitude,
    b.latitude,
    b.longitude
  );
}

/** Total length of a polyline in meters. */
export function polylineLength(points: readonly LatLon[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += segmentDistance(points[i - 1], points[i]);
  }
  return total;
}

/** Compass bearing in degrees (0 = north, 90 = east) from `from` to `to`. */
export function initialBearing(from: LatLon, to: LatLon): number {
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const dLng = ((to.longitude - from.longitude) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

export function formatWalkTime(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 1) return "< 1 min";
  return `${minutes} min walk`;
}

export function formatEstimatedWalkTime(distanceMeters: number): string {
  return `~${Math.ceil(distanceMeters / WALK_SPEED_M_PER_MIN)} min walk`;
}

export function estimateWalkSeconds(distanceMeters: number): number {
  return Math.ceil(distanceMeters / WALK_SPEED_MPS);
}

export function decodeOSRMGeometry(encoded: string): LatLon[] {
  const points: LatLon[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

export function boundsOf(points: LatLon[], padding = 0) {
  let minLat = points[0].latitude;
  let maxLat = points[0].latitude;
  let minLng = points[0].longitude;
  let maxLng = points[0].longitude;
  for (const p of points) {
    if (p.latitude < minLat) minLat = p.latitude;
    if (p.latitude > maxLat) maxLat = p.latitude;
    if (p.longitude < minLng) minLng = p.longitude;
    if (p.longitude > maxLng) maxLng = p.longitude;
  }
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(maxLat - minLat + padding * 2, 0.005),
    longitudeDelta: Math.max(maxLng - minLng + padding * 2, 0.005),
  };
}
