import { z } from "zod";
import {
  MANEUVER_ICON_NAMES,
  type NavStep,
} from "@/lib/navigation/instructions";
import type { GraphRouteResult } from "@/lib/navigation/graph";
import type { LatLon } from "@shared/types";

/**
 * The wire contract for `POST /api/route` (Feature 5).
 *
 * Lives in `lib/` but is pure — it imports nothing that touches React Native —
 * so the Express handler and the app can share one definition. The client
 * validates the response before trusting it, which matters because this is the
 * first place the app's route geometry comes from a server rather than from a
 * third-party router.
 *
 * The payload is deliberately the same shape `fetchWalkingRoute` already
 * returns, so `useWalkingNavigation` cannot tell a campus-graph route from an
 * OSRM one.
 */

export interface RouteEntrance {
  name: string;
  lat: number;
  lng: number;
  hasRamp: boolean;
  /** False when the door cannot be used without climbing. */
  stepFree: boolean;
}

export interface RouteResponse {
  coordinates: LatLon[];
  steps: NavStep[];
  distanceMeters: number;
  durationSeconds: number;
  /** Campus paths are surveyed, so they are never an approximation. */
  approximate: false;
  entrance: RouteEntrance | null;
  /**
   * False when a step-free route was requested and none existed. The client
   * surfaces this rather than silently handing someone a stair route.
   */
  stepFreeSatisfied: boolean;
  /** Which router answered — lets the sheet label the source honestly. */
  source: "graph";
}

const latLonSchema = z.object({
  latitude: z.number().finite(),
  longitude: z.number().finite(),
});

const navStepSchema = z.object({
  instruction: z.string(),
  street: z.string().nullable(),
  distance: z.number().finite(),
  duration: z.number().finite(),
  location: latLonSchema,
  geometry: z.array(latLonSchema).min(1),
  // Enumerated rather than a bare string: an unrecognised glyph would render as
  // a blank cell in the step list, which is exactly the kind of silent
  // corruption this schema exists to catch.
  icon: z.enum(MANEUVER_ICON_NAMES),
  type: z.string(),
  modifier: z.string().nullable(),
});

export const routeResponseSchema = z.object({
  coordinates: z.array(latLonSchema).min(2),
  steps: z.array(navStepSchema),
  distanceMeters: z.number().finite().nonnegative(),
  durationSeconds: z.number().finite().nonnegative(),
  approximate: z.literal(false),
  entrance: z
    .object({
      name: z.string(),
      lat: z.number(),
      lng: z.number(),
      hasRamp: z.boolean(),
      stepFree: z.boolean(),
    })
    .nullable(),
  stepFreeSatisfied: z.boolean(),
  source: z.literal("graph"),
});

/** Projects a graph route onto the wire shape. */
export function graphRouteToResponse(route: GraphRouteResult): RouteResponse {
  return {
    coordinates: route.coordinates,
    steps: route.steps,
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    approximate: false,
    entrance: route.entrance
      ? {
          name: route.entrance.name,
          lat: route.entrance.lat,
          lng: route.entrance.lng,
          hasRamp: route.entrance.hasRamp ?? false,
          stepFree: route.entrance.stepFree ?? true,
        }
      : null,
    stepFreeSatisfied: route.stepFreeSatisfied,
    source: "graph",
  };
}
