/**
 * First surveyed campus path graph (Feature 5).
 *
 * §5.7 asks for "a first graph for the NSUK core loop". This is it — a
 * hand-placed skeleton that is *plausible*, not surveyed. It exists so the
 * step-free path is demonstrably different from the shortest one, and so the
 * tables have rows before anyone walks a campus with `collect-paths.ts`.
 *
 * Every coordinate here is invented to sit sensibly between the four seeded
 * buildings. **Treat it as placeholder data**: it is wrong in the details a
 * wheelchair user would care about, and the survey is what replaces it. The
 * point of the shape is the topology, which is the part the engine cares about.
 *
 * Ids are readable slugs; the database assigns its own uuids.
 */

export interface SeedPathNode {
  id: string;
  lat: number;
  lng: number;
  /** Shown when a survey needs to place this node again. */
  label: string;
}

export interface SeedPathEdge {
  from: string;
  to: string;
  /** Surveyed walking distance, used for cost. Draws as a straight segment. */
  distanceM: number;
  hasSteps?: boolean;
  hasRamp?: boolean;
  covered?: boolean;
  surface?: "paved" | "gravel" | "dirt";
  lit?: boolean;
}

export interface SeedEntrance {
  /** Matches the building's `id` in campus-fallback.ts. */
  buildingId: string;
  name: string;
  lat: number;
  lng: number;
  hasRamp?: boolean;
  hasSteps?: boolean;
  stepFree?: boolean;
  gated?: boolean;
  gateClosesAt?: string | null;
}

export const SEED_PATH_NODES: SeedPathNode[] = [
  { id: "law", lat: 8.8465, lng: 7.876, label: "Faculty of Law forecourt" },
  { id: "law-j", lat: 8.8468, lng: 7.8766, label: "Law junction" },
  { id: "lib", lat: 8.8475, lng: 7.877, label: "Main Library forecourt" },
  { id: "ctr", lat: 8.8476, lng: 7.8778, label: "Central junction" },
  { id: "stair", lat: 8.8479, lng: 7.8783, label: "Head of the central steps" },
  { id: "court", lat: 8.8483, lng: 7.8776, label: "Courtyard path" },
  { id: "ramp", lat: 8.8482, lng: 7.8784, label: "Senate ramp landing" },
  { id: "senate-stair", lat: 8.8489, lng: 7.878, label: "Senate stair door" },
  { id: "senate", lat: 8.849, lng: 7.8785, label: "Senate ramp entrance" },
  { id: "conv", lat: 8.8482, lng: 7.8795, label: "Convocation Square" },
  { id: "gate", lat: 8.8488, lng: 7.879, label: "East service gate" },
];

export const SEED_PATH_EDGES: SeedPathEdge[] = [
  // West approach.
  { from: "law", to: "law-j", distanceM: 74, surface: "paved" },
  { from: "law-j", to: "lib", distanceM: 90, surface: "paved", covered: true },
  { from: "law-j", to: "ctr", distanceM: 165, surface: "dirt" },

  // The central spine. The steps are the shortest way up to the Senate block,
  // and the whole point of the feature is that they are not always usable.
  { from: "lib", to: "ctr", distanceM: 89, surface: "paved" },
  { from: "ctr", to: "stair", distanceM: 68, surface: "paved", hasSteps: true },
  { from: "stair", to: "senate-stair", distanceM: 122, surface: "paved" },
  { from: "senate-stair", to: "senate", distanceM: 58, surface: "paved" },

  // The step-free detour: wider, longer, no climbing.
  { from: "ctr", to: "court", distanceM: 81, surface: "gravel" },
  { from: "court", to: "ramp", distanceM: 89, surface: "paved" },
  { from: "ramp", to: "senate", distanceM: 90, surface: "paved", hasRamp: true },

  // North-east loop.
  { from: "court", to: "conv", distanceM: 215, surface: "paved" },
  { from: "conv", to: "gate", distanceM: 92, surface: "dirt" },
  { from: "gate", to: "senate", distanceM: 100, surface: "paved", lit: true },
  { from: "conv", to: "senate", distanceM: 190, surface: "paved", covered: true },
];

/**
 * One building deliberately has both a stair door and a ramp door. That is the
 * case `buildings.isAccessibleEntry` cannot express, and the reason the schema
 * has an `entrances` table at all.
 */
export const SEED_ENTRANCES: SeedEntrance[] = [
  {
    buildingId: "nsuk-faculty-of-law",
    name: "Main entrance",
    lat: 8.84652,
    lng: 7.87596,
    stepFree: true,
  },
  {
    buildingId: "nsuk-main-library",
    name: "Ramp entrance",
    lat: 8.84748,
    lng: 7.87696,
    hasRamp: true,
    stepFree: true,
  },
  {
    buildingId: "nsuk-main-library",
    name: "Front steps",
    lat: 8.84753,
    lng: 7.87704,
    hasSteps: true,
    stepFree: false,
  },
  {
    buildingId: "nsuk-senate",
    name: "Main ramp entrance",
    lat: 8.84898,
    lng: 7.87852,
    hasRamp: true,
    stepFree: true,
  },
  {
    buildingId: "nsuk-senate",
    name: "Stair door",
    lat: 8.84892,
    lng: 7.87798,
    hasSteps: true,
    stepFree: false,
  },
  {
    buildingId: "nsuk-convocation-square",
    name: "Open plaza entrance",
    lat: 8.84818,
    lng: 7.87952,
    stepFree: true,
  },
  {
    buildingId: "nsuk-convocation-square",
    name: "East gate",
    lat: 8.84882,
    lng: 7.87902,
    gated: true,
    gateClosesAt: "20:00",
    stepFree: true,
  },
];
