import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import { boundsOf } from "@/lib/geo";
import {
  getCurrentUserLocation,
  LocationPermissionError,
  watchUserLocation,
  type LocationWatcher,
} from "@/lib/location";
import {
  ARRIVAL_RADIUS_M,
  OFF_ROUTE_CONFIRMATIONS,
  computeNavProgress,
  type NavProgress,
} from "@/lib/navigation/geo-nav";
import { withDestinationName, type NavStep } from "@/lib/navigation/instructions";
import { fetchWalkingRoute, type WalkingRoute } from "@/lib/routing";
import { getLastLocation } from "@/lib/route-cache";
import type { LatLon } from "@shared/types";

/**
 * Turn-by-turn navigation state machine.
 *
 * Owns everything that used to live inline in `handleGetDirections`: location
 * acquisition, routing, live tracking, off-route re-routing and arrival. The
 * map stays a renderer — it gets a route, a progress object and two camera
 * callbacks.
 */

export type NavState =
  | "idle"
  | "locating"
  | "routing"
  | "navigating"
  | "arrived"
  | "error";

/** Distance at which the next maneuver is announced. */
const TURN_CUE_METERS = 15;

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface UseWalkingNavigationOptions {
  destination: LatLon | null;
  destinationName?: string | null;
  /** Campus slug, sent with a step-free request so the server loads its graph. */
  campusId?: string | null;
  /** Building uuid, so the graph can aim at a surveyed door (§5). */
  buildingId?: string | null;
  /** Route avoiding stairs. Only the campus graph can honour it (§5). */
  stepFree?: boolean;
  /** Fit the whole route when one is first drawn. */
  onCameraFit?: (region: MapRegion) => void;
  /** Called on every fix while navigating, for camera follow. */
  onFollowUser?: (point: LatLon) => void;
  /** Non-fatal notices that should surface as an alert, e.g. a degraded fix. */
  onNotice?: (message: string) => void;
}

export interface WalkingNavigation {
  state: NavState;
  route: WalkingRoute | null;
  steps: NavStep[];
  progress: NavProgress | null;
  position: LatLon | null;
  /** Inline note rendered in the sheet (re-routing, tracking unavailable…). */
  message: string | null;
  /** True while acquiring a fix or computing a route. */
  isBusy: boolean;
  start: () => Promise<void>;
  cancel: () => void;
  retry: () => Promise<void>;
}

export function useWalkingNavigation({
  destination,
  destinationName,
  campusId,
  buildingId,
  stepFree = false,
  onCameraFit,
  onFollowUser,
  onNotice,
}: UseWalkingNavigationOptions): WalkingNavigation {
  const [state, setState] = useState<NavState>("idle");
  const [route, setRoute] = useState<WalkingRoute | null>(null);
  const [progress, setProgress] = useState<NavProgress | null>(null);
  const [position, setPosition] = useState<LatLon | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const watcherRef = useRef<LocationWatcher | null>(null);
  const routeRef = useRef<WalkingRoute | null>(null);
  const destinationRef = useRef<LatLon | null>(destination);
  const offRouteCountRef = useRef(0);
  const reroutingRef = useRef(false);
  const cueIndexRef = useRef(0);

  // The location callback is created once; these keep it reading fresh values.
  const callbacksRef = useRef({ onCameraFit, onFollowUser, onNotice });
  callbacksRef.current = { onCameraFit, onFollowUser, onNotice };
  destinationRef.current = destination;

  // Routing preferences are read at request time, not captured in a callback
  // closure, so a mid-walk re-route uses the preference currently in force.
  const routeOptionsRef = useRef({ campusId, buildingId, stepFree });
  routeOptionsRef.current = { campusId, buildingId, stepFree };

  const stopWatching = useCallback(() => {
    watcherRef.current?.remove();
    watcherRef.current = null;
  }, []);

  const applyRoute = useCallback(
    (result: WalkingRoute, origin: LatLon | null, fit: boolean) => {
      routeRef.current = result;
      setRoute(result);
      offRouteCountRef.current = 0;
      cueIndexRef.current = 0;
      // Seed progress from the origin so the bar is non-zero before the first fix.
      setProgress(
        origin
          ? computeNavProgress(origin, result.coordinates, result.steps)
          : null
      );
      if (fit) {
        callbacksRef.current.onCameraFit?.(boundsOf(result.coordinates, 0.003));
      }
    },
    []
  );

  const routeTo = useCallback(
    async (origin: LatLon, target: LatLon, fit: boolean) => {
      const result = await fetchWalkingRoute(origin, target, {
        campusId: routeOptionsRef.current.campusId,
        buildingId: routeOptionsRef.current.buildingId,
        stepFree: routeOptionsRef.current.stepFree,
      });
      applyRoute(result, origin, fit);
      return result;
    },
    [applyRoute]
  );

  const handlePosition = useCallback(
    (point: LatLon) => {
      setPosition(point);
      callbacksRef.current.onFollowUser?.(point);

      const active = routeRef.current;
      if (!active || active.coordinates.length === 0) return;

      const next = computeNavProgress(point, active.coordinates, active.steps);
      if (!next) return;
      setProgress(next);

      // Announce a maneuver once, as it comes up.
      if (next.cueIndex !== cueIndexRef.current) {
        cueIndexRef.current = next.cueIndex;
        if (next.distanceToCueMeters < TURN_CUE_METERS) {
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success
          );
        }
      }

      if (next.offRoute) {
        offRouteCountRef.current += 1;
        if (offRouteCountRef.current >= OFF_ROUTE_CONFIRMATIONS && !reroutingRef.current) {
          const target = destinationRef.current;
          if (!target) return;
          reroutingRef.current = true;
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setState("routing");
          setMessage("Recalculating…");
          routeTo(point, target, false)
            .then(() => setState("navigating"))
            .catch(() => setState("navigating"))
            .finally(() => {
              reroutingRef.current = false;
              setMessage(null);
            });
        }
        return;
      }

      offRouteCountRef.current = 0;

      if (next.remainingMeters <= ARRIVAL_RADIUS_M) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        stopWatching();
        setState("arrived");
      }
    },
    [routeTo, stopWatching]
  );

  const startWatching = useCallback(async () => {
    stopWatching();
    try {
      watcherRef.current = await watchUserLocation(handlePosition);
    } catch (error) {
      // A dead watch costs live progress, not the route — keep the sheet up
      // with the step list and say why nothing is moving.
      setMessage(
        error instanceof LocationPermissionError
          ? "Location permission is required to follow this route."
          : "Live tracking is unavailable here — the route is still shown on the map."
      );
    }
  }, [handlePosition, stopWatching]);

  const start = useCallback(async () => {
    const target = destinationRef.current;
    if (!target) return;

    setMessage(null);
    setState("locating");

    let origin: LatLon | null = null;
    try {
      origin = await getCurrentUserLocation();
    } catch (error) {
      // Offline cold start or a denied prompt: route from the last known fix.
      const lastKnown = await getLastLocation();
      if (lastKnown) {
        origin = lastKnown;
        callbacksRef.current.onNotice?.(
          "Location unavailable — using your last known position."
        );
      } else {
        setState("error");
        setMessage(
          error instanceof LocationPermissionError
            ? "Enable location access to get turn-by-turn directions."
            : "Could not get your location. Please try again."
        );
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
    }

    setPosition(origin);
    setState("routing");

    try {
      await routeTo(origin, target, true);
    } catch {
      setState("error");
      setMessage("Could not find a walking route. Please try again.");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setState("navigating");
    await startWatching();
  }, [routeTo, startWatching]);

  const cancel = useCallback(() => {
    stopWatching();
    offRouteCountRef.current = 0;
    cueIndexRef.current = 0;
    reroutingRef.current = false;
    routeRef.current = null;
    setState("idle");
    setRoute(null);
    setProgress(null);
    setPosition(null);
    setMessage(null);
  }, [stopWatching]);

  useEffect(() => stopWatching, [stopWatching]);

  const steps = useMemo(
    () =>
      route
        ? withDestinationName(
            route.steps,
            destinationName,
            route.entrance?.name
          )
        : [],
    [route, destinationName]
  );

  return {
    state,
    route,
    steps,
    progress,
    position,
    message,
    isBusy: state === "locating" || state === "routing",
    start,
    cancel,
    retry: start,
  };
}
