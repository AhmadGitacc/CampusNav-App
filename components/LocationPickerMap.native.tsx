import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet, View } from "react-native";
import {
  Camera,
  Map,
  Marker,
  type CameraRef,
} from "@maplibre/maplibre-react-native";
import { MapPin } from "lucide-react-native";
import { useTheme } from "@/components/ThemeProvider";
import { getMapStyle } from "@/lib/map-style";

/**
 * The native half of the location picker: a MapLibre view with a pin.
 * Split into `.native` / `.web` files the same way `CampusMap` is, because
 * importing a native-only map module on web crashes at module scope — a runtime
 * `Platform.OS` check cannot save an import that already ran.
 *
 * MapLibre's `Marker` has no `draggable` prop, so the pin is placed by tapping
 * the map. Tapping again moves it; the modal copy reflects that.
 */

const DEFAULT_ZOOM = 17;

export interface LocationPickerMapHandle {
  animateToRegion: (lat: number, lng: number, durationMs?: number) => void;
}

export interface LocationPickerMapProps {
  center: { lat: number; lng: number };
  point: { lat: number; lng: number } | null;
  /** A tap anywhere on the map. */
  onPick: (lat: number, lng: number) => void;
  /** The pin finished a drag. On native this fires on a re-tap/move. */
  onDrag: (lat: number, lng: number) => void;
}

const LocationPickerMap = forwardRef<LocationPickerMapHandle, LocationPickerMapProps>(
  ({ center, point, onPick, onDrag }, ref) => {
    const { theme, scheme } = useTheme();
    const cameraRef = useRef<CameraRef>(null);

    useImperativeHandle(ref, () => ({
      animateToRegion: (lat, lng, durationMs = 350) => {
        cameraRef.current?.easeTo({
          center: [lng, lat],
          duration: durationMs,
        });
      },
    }));

    return (
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={getMapStyle(scheme)}
        onPress={(event) => {
          const [lng, lat] = event.nativeEvent.lngLat;
          onPick(lat, lng);
          onDrag(lat, lng);
        }}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{ center: [center.lng, center.lat], zoom: DEFAULT_ZOOM }}
        />
        {point ? (
          <Marker
            id="picked-location"
            lngLat={[point.lng, point.lat]}
            onPress={() => onDrag(point.lat, point.lng)}
          >
            <View style={styles.pinRoot}>
              <View
                style={[
                  styles.pin,
                  { backgroundColor: theme.tint, borderColor: theme.onTint, shadowColor: theme.shadow },
                ]}
              >
                <MapPin size={20} color={theme.onTint} strokeWidth={2.6} />
              </View>
              <View style={[styles.pinArrow, { borderTopColor: theme.tint }]} />
            </View>
          </Marker>
        ) : null}
      </Map>
    );
  }
);

LocationPickerMap.displayName = "LocationPickerMap";

export default LocationPickerMap;

const styles = StyleSheet.create({
  pinRoot: {
    alignItems: "center",
  },
  pin: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 6,
  },
  pinArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    alignSelf: "center",
    marginTop: -1,
  },
});
