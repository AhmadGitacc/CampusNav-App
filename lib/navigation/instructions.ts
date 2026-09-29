import type { LatLon } from "@shared/types";

/**
 * Turns OSRM maneuvers into spoken-style walking instructions.
 *
 * Everything here is a pure function over the raw router response, so the whole
 * mapping table is unit-testable without a network or a device (Feature 16).
 */

/** Lucide glyph to render for a maneuver. */
export type ManeuverIconName =
  | "depart"
  | "left"
  | "slight-left"
  | "sharp-left"
  | "right"
  | "slight-right"
  | "sharp-right"
  | "u-turn"
  | "straight"
  | "roundabout"
  | "merge"
  | "arrive";

/** Runtime mirror of `ManeuverIconName`, for validating data off the network. */
export const MANEUVER_ICON_NAMES = [
  "depart",
  "left",
  "slight-left",
  "sharp-left",
  "right",
  "slight-right",
  "sharp-right",
  "u-turn",
  "straight",
  "roundabout",
  "merge",
  "arrive",
] as const satisfies readonly ManeuverIconName[];

export interface NavStep {
  /** Human-readable cue, e.g. "Turn left onto Faculty Rd". */
  instruction: string;
  /** Road or path this step continues along, when the router named one. */
  street: string | null;
  /** Step length in meters. */
  distance: number;
  /** Step duration in seconds. */
  duration: number;
  /** Where the maneuver happens — the first vertex of the step. */
  location: LatLon;
  /** Polyline for this step alone. */
  geometry: LatLon[];
  icon: ManeuverIconName;
  type: string;
  modifier: string | null;
}

export interface OsrmManeuver {
  type?: string;
  modifier?: string;
  bearing_after?: number;
  exit?: number;
  /** GeoJSON order: [longitude, latitude]. */
  location?: [number, number];
}

export interface OsrmStep {
  distance?: number;
  duration?: number;
  name?: string;
  maneuver?: OsrmManeuver;
  geometry?: { coordinates?: [number, number][] };
}

/**
 * OSRM emits sub-2m steps wherever a way is split; they render as "continue on
 * nothing" rows. The first and last steps are always kept — they carry the
 * depart and arrive cues.
 */
const MIN_STEP_DISTANCE_M = 2;

const COMPASS_POINTS = [
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
];

const TURN_PHRASES: Record<string, string> = {
  left: "Turn left",
  right: "Turn right",
  "slight left": "Slight left",
  "slight right": "Slight right",
  "sharp left": "Sharp left",
  "sharp right": "Sharp right",
  straight: "Continue straight",
  uturn: "Turn back",
};

/** Eight-point compass label for a bearing in degrees. */
export function compassDirection(bearing: number | undefined): string | null {
  if (typeof bearing !== "number" || !Number.isFinite(bearing)) return null;
  const normalized = ((bearing % 360) + 360) % 360;
  return COMPASS_POINTS[Math.round(normalized / 45) % 8];
}

function turnPhrase(modifier: string | null | undefined): string {
  if (!modifier) return "Continue";
  return TURN_PHRASES[modifier] ?? `Turn ${modifier}`;
}

function withStreet(base: string, street: string | null): string {
  return street ? `${base} onto ${street}` : base;
}

/** Maps a maneuver to the cue text shown in the sheet. */
export function describeManeuver(
  maneuver: OsrmManeuver = {},
  name?: string | null
): string {
  const type = maneuver.type ?? "continue";
  const modifier = maneuver.modifier ?? null;
  const street = name?.trim() ? name.trim() : null;

  switch (type) {
    case "depart": {
      const heading = compassDirection(maneuver.bearing_after);
      return heading ? `Head ${heading}` : "Start walking";
    }
    case "arrive":
      // The destination name is unknown to the router, so the display layer
      // patches it in via withDestinationName().
      return "You have arrived";
    case "turn":
    case "end of road":
      return withStreet(turnPhrase(modifier), street);
    case "continue":
      // The foot profile emits U-turns as a continue step with a uturn modifier.
      if (modifier === "uturn") return withStreet("Turn back", street);
      return street ? `Continue on ${street}` : "Continue";
    case "new name":
      return street ? `Continue onto ${street}` : "Continue";
    case "roundabout":
    case "rotary": {
      const exit = maneuver.exit;
      return exit
        ? `Enter the roundabout and take exit ${exit}`
        : "Enter the roundabout";
    }
    case "fork":
      if (modifier === "left") return "Keep left";
      if (modifier === "right") return "Keep right";
      return street ? `Keep going onto ${street}` : "Keep going";
    case "merge":
      return street ? `Merge onto ${street}` : "Merge";
    default:
      return street ? `Continue on ${street}` : "Continue";
  }
}

/** Maps a maneuver to the glyph shown next to the cue. */
export function maneuverIcon(maneuver: OsrmManeuver = {}): ManeuverIconName {
  const type = maneuver.type ?? "continue";
  const modifier = maneuver.modifier ?? "";

  // A U-turn arrives as a continue step with a uturn modifier.
  if (modifier === "uturn" && type !== "arrive" && type !== "depart") {
    return "u-turn";
  }

  switch (type) {
    case "depart":
      return "depart";
    case "arrive":
      return "arrive";
    case "roundabout":
    case "rotary":
      return "roundabout";
    case "fork":
    case "merge":
      return "merge";
    case "turn":
    case "end of road":
      if (modifier.includes("slight") && modifier.includes("left")) return "slight-left";
      if (modifier.includes("slight") && modifier.includes("right")) return "slight-right";
      if (modifier.includes("sharp") && modifier.includes("left")) return "sharp-left";
      if (modifier.includes("sharp") && modifier.includes("right")) return "sharp-right";
      if (modifier === "left") return "left";
      if (modifier === "right") return "right";
      if (modifier === "uturn") return "u-turn";
      return "straight";
    default:
      return "straight";
  }
}

function toLatLonList(coordinates: [number, number][] | undefined): LatLon[] {
  if (!Array.isArray(coordinates)) return [];
  const points: LatLon[] = [];
  for (const pair of coordinates) {
    const [longitude, latitude] = pair;
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      points.push({ latitude, longitude });
    }
  }
  return points;
}

/**
 * Converts `routes[0].legs[0].steps[]` into navigation steps.
 * Returns an empty array when the router gave us nothing usable, which lets
 * callers fall back to synthesized steps.
 */
export function buildNavSteps(
  rawSteps: OsrmStep[] | undefined | null,
  fallbackGeometry: readonly LatLon[]
): NavStep[] {
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) return [];

  const steps: NavStep[] = [];

  rawSteps.forEach((raw, index) => {
    const maneuver: OsrmManeuver = raw?.maneuver ?? {};
    const type = maneuver.type ?? "continue";
    const distance = typeof raw?.distance === "number" ? raw.distance : 0;
    const isLast = index === rawSteps.length - 1;

    if (distance < MIN_STEP_DISTANCE_M && steps.length > 0 && !isLast) return;

    const geometry = toLatLonList(raw?.geometry?.coordinates);
    const maneuverLocation =
      maneuver.location &&
      Number.isFinite(maneuver.location[0]) &&
      Number.isFinite(maneuver.location[1])
        ? { latitude: maneuver.location[1], longitude: maneuver.location[0] }
        : null;
    const location = maneuverLocation ?? geometry[0] ?? fallbackGeometry[0];

    if (!location) return;

    steps.push({
      instruction: describeManeuver(maneuver, raw?.name),
      street: raw?.name?.trim() ? raw.name.trim() : null,
      distance,
      duration: typeof raw?.duration === "number" ? raw.duration : 0,
      location,
      geometry: geometry.length > 0 ? geometry : [location],
      icon: maneuverIcon(maneuver),
      type,
      modifier: maneuver.modifier ?? null,
    });
  });

  return steps;
}

/**
 * Names the destination on the final step. Applied at the display layer so a
 * cached route keeps working for every destination it was requested for.
 *
 * An `entranceName` wins when present (Feature 5): a step-free route that ends
 * at the ramp door should say so, because the building centroid is not where the
 * user is actually being asked to go.
 */
export function withDestinationName(
  steps: NavStep[],
  destinationName?: string | null,
  entranceName?: string | null
): NavStep[] {
  const name = entranceName?.trim() || destinationName?.trim();
  if (!name) return steps;
  return steps.map((step) =>
    step.type === "arrive" ? { ...step, instruction: `Arrive at ${name}` } : step
  );
}
