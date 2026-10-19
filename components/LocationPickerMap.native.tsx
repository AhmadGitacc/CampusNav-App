import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import { MapPin } from "lucide-react-native";
import { useTheme } from "@/components/ThemeProvider";

/**
 * The native half of the location picker: a `react-native-maps` view with a
 * draggable pin. Split into `.native` / `.web` files the same way
 * `CampusMap` is, because importing `react-native-maps` on web crashes at
 * module scope (`codegenNativeComponent` doesn't exist there) — a runtime
 * `Platform.OS` check cannot save an import that already ran.
 */

const DEFAULT_DELTA = 0.004;

export interface LocationPickerMapHandle {
  animateToRegion: (lat: number, lng: number, durationMs?: number) => void;
}

export interface LocationPickerMapProps {
  center: { lat: number; lng: number };
  point: { lat: number; lng: number } | null;
  /** A tap anywhere on the map. */
  onPick: (lat: number, lng: number) => void;
  /** The pin finished a drag. */
  onDrag: (lat: number, lng: number) => void;
}

const LocationPickerMap = forwardRef<LocationPickerMapHandle, LocationPickerMapProps>(
  ({ center, point, onPick, onDrag }, ref) => {
    const { theme } = useTheme();
    const mapRef = useRef<MapView | null>(null);

    useImperativeHandle(ref, () => ({
      animateToRegion: (lat, lng, durationMs = 350) => {
        mapRef.current?.animateToRegion(
          {
            latitude: lat,
            longitude: lng,
            latitudeDelta: DEFAULT_DELTA,
            longitudeDelta: DEFAULT_DELTA,
          },
          durationMs
        );
      },
    }));

    return (
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_DEFAULT}
        initialRegion={{
          latitude: center.lat,
          longitude: center.lng,
          latitudeDelta: DEFAULT_DELTA,
          longitudeDelta: DEFAULT_DELTA,
        }}
        onPress={(event) => {
          const { latitude, longitude } = event.nativeEvent.coordinate;
          onPick(latitude, longitude);
        }}
      >
        {point ? (
          <Marker
            coordinate={{ latitude: point.lat, longitude: point.lng }}
            draggable
            onDragEnd={(event) => {
              const { latitude, longitude } = event.nativeEvent.coordinate;
              onDrag(latitude, longitude);
            }}
          >
            <View
              style={[
                styles.pin,
                { backgroundColor: theme.tint, borderColor: theme.onTint, shadowColor: theme.shadow },
              ]}
            >
              <MapPin size={20} color={theme.onTint} strokeWidth={2.6} />
            </View>
            <View style={[styles.pinArrow, { borderTopColor: theme.tint }]} />
          </Marker>
        ) : null}
      </MapView>
    );
  }
);

LocationPickerMap.displayName = "LocationPickerMap";

export default LocationPickerMap;

const styles = StyleSheet.create({
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
