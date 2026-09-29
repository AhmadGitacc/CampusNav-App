import { Platform } from "react-native";
import * as Location from "expo-location";
import { setLastLocation } from "@/lib/route-cache";
import type { LatLon } from "@shared/types";

export class LocationPermissionError extends Error {
  constructor(message = "Location permission denied") {
    super(message);
    this.name = "LocationPermissionError";
  }
}

function getWebLocation(): Promise<LatLon> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation is not available in this browser"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      (error) => reject(error),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

/**
 * Requests foreground location and returns the current position.
 * Throws LocationPermissionError when the user declines the permission.
 *
 * Successful fixes are written to the offline cache, so a cold offline start
 * can still route from roughly where the user was.
 */
export async function getCurrentUserLocation(): Promise<LatLon> {
  const point = Platform.OS === "web" ? await getWebLocation() : await getNativeLocation();
  await setLastLocation(point);
  return point;
}

async function getNativeLocation(): Promise<LatLon> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new LocationPermissionError();
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

export interface LocationWatcher {
  remove: () => void;
}

/**
 * Every fix is cached, not just the one-shot lookup — that is what lets a
 * re-route work after the network drops mid-walk.
 */
function emit(
  onPosition: (point: LatLon) => void,
  point: LatLon
): void {
  void setLastLocation(point);
  onPosition(point);
}

function watchWebLocation(
  onPosition: (point: LatLon) => void
): Promise<LocationWatcher> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation is not available in this browser"));
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
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new LocationPermissionError();
  }

  const subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      distanceInterval: 5,
      timeInterval: 2000,
    },
    (position) =>
      emit(onPosition, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      })
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
