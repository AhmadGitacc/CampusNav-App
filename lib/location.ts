import { Platform } from "react-native";
import * as Location from "expo-location";
import { setLastLocation } from "@/lib/route-cache";
import type { LatLon } from "@shared/types";

export class LocationPermissionError extends Error {
  constructor(
    message = "Location access is off for Campus Navigator. Enable it in your device settings.",
  ) {
    super(message);
    this.name = "LocationPermissionError";
  }
}

export class LocationServicesError extends Error {
  constructor(message = "Device location services are turned off. Enable location and try again.") {
    super(message);
    this.name = "LocationServicesError";
  }
}

export class LocationUnavailableError extends Error {
  constructor(message = "Could not get a GPS fix. Move outside or try again.") {
    super(message);
    this.name = "LocationUnavailableError";
  }
}

/** User-facing copy shared by every screen that asks for a position. */
export function describeLocationError(error: unknown): string {
  if (
    error instanceof LocationPermissionError ||
    error instanceof LocationServicesError ||
    error instanceof LocationUnavailableError
  ) {
    return error.message;
  }
  return "Could not get your current location. Please try again.";
}

function toLatLon(position: Location.LocationObject): LatLon {
  const { latitude, longitude } = position.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new LocationUnavailableError();
  }
  return { latitude, longitude };
}

/** A native fix can hang forever indoors; cap every attempt. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new LocationUnavailableError());
    }, ms);

    work.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function getWebLocation(): Promise<LatLon> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new LocationUnavailableError("Geolocation is not available in this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      () => reject(new LocationUnavailableError()),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
    );
  });
}

async function ensureNativePermission(): Promise<void> {
  const existing = await Location.getForegroundPermissionsAsync();
  if (existing.status === "granted") return;

  // A previously denied prompt cannot be re-shown on Android — the user has to
  // flip the switch in system settings. Say that instead of silently failing.
  if (existing.status === "denied" && !existing.canAskAgain) {
    throw new LocationPermissionError();
  }

  const requested = await Location.requestForegroundPermissionsAsync();
  if (requested.status !== "granted") throw new LocationPermissionError();
}

/**
 * Requests foreground location and returns the current position.
 *
 * Strategy for devices (the old High-only request used to hang or fail on
 * phones without a clear GPS fix): ask for a fast network fix first, upgrade
 * to GPS only when we need more precision, then fall back to the OS's cached
 * fix. Throws a typed error when the user must take action.
 *
 * Successful fixes are written to the offline cache, so a cold offline start
 * can still route from roughly where the user was.
 */
export async function getCurrentUserLocation(): Promise<LatLon> {
  const point = Platform.OS === "web" ? await getWebLocation() : await getNativeLocation();

  // A cache failure must never block navigation.
  try {
    await setLastLocation(point);
  } catch {
    /* ignore */
  }
  return point;
}

async function getNativeLocation(): Promise<LatLon> {
  await ensureNativePermission();

  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) throw new LocationServicesError();

  let position: Location.LocationObject | null = null;

  // Wi-Fi/cell fix: quick and works indoors. This is what "Locate Me" needs in
  // most cases, so it goes first rather than waiting for a GPS satellite lock.
  try {
    position = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        mayShowUserSettingsDialog: false,
      }),
      9000
    );
  } catch {
    position = null;
  }

  // Upgrade to GPS when the quick fix is coarse (or missing entirely).
  const accuracy = position?.coords.accuracy ?? Number.POSITIVE_INFINITY;
  if (!position || accuracy > 40) {
    try {
      const precise = await withTimeout(
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
          mayShowUserSettingsDialog: true,
        }),
        7000
      );
      const preciseAccuracy = precise.coords.accuracy ?? Number.POSITIVE_INFINITY;
      if (!position || preciseAccuracy < accuracy) position = precise;
    } catch {
      /* keep the network fix we already have */
    }
  }

  // Last resort: a recent OS-level fix, which succeeds when the device cannot
  // obtain a fresh one right now (e.g. indoors or underground).
  if (!position) {
    try {
      position = await Location.getLastKnownPositionAsync({
        maxAge: 10 * 60_000,
        requiredAccuracy: 200,
      });
    } catch {
      position = null;
    }
  }

  if (!position) throw new LocationUnavailableError();
  return toLatLon(position);
}

export interface LocationWatcher {
  remove: () => void;
}

/**
 * Every fix is cached, not just the one-shot lookup — that is what lets a
 * re-route work after the network drops mid-walk.
 */
function emit(onPosition: (point: LatLon) => void, point: LatLon): void {
  void setLastLocation(point).catch(() => {});
  onPosition(point);
}

function watchWebLocation(
  onPosition: (point: LatLon) => void
): Promise<LocationWatcher> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new LocationUnavailableError("Geolocation is not available in this browser."));
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (position) =>
        emit(onPosition, {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      // Transient watch errors are ignored on purpose: killing the watch on the
      // first glitch would drop an active navigation.
      () => {},
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 }
    );
    resolve({ remove: () => navigator.geolocation.clearWatch(id) });
  });
}

async function watchNativeLocation(
  onPosition: (point: LatLon) => void
): Promise<LocationWatcher> {
  await ensureNativePermission();

  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) throw new LocationServicesError();

  const subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 5,
      timeInterval: 1000,
    },
    (position) => emit(onPosition, toLatLon(position))
  );

  return { remove: () => subscription.remove() };
}

/**
 * Subscribes to position updates for live navigation.
 * Throws LocationPermissionError when the user declines the permission.
 */
export async function watchUserLocation(
  onPosition: (point: LatLon) => void
): Promise<LocationWatcher> {
  return Platform.OS === "web"
    ? watchWebLocation(onPosition)
    : watchNativeLocation(onPosition);
}
