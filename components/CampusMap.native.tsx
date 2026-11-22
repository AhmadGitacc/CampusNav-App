import React, { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  type CameraRef,
} from "@maplibre/maplibre-react-native";
import { MarkerIcon } from "@/components/MarkerIcon";
import { useTheme } from "@/components/ThemeProvider";
import { getMapStyle } from "@/lib/map-style";
import type { MapRegion } from "@/lib/navigation/useWalkingNavigation";
import type { CampusMarker, LatLon } from "@shared/types";

export interface CampusMapHandle {
  animateToRegion: (region: MapRegion, durationMs?: number) => void;
}

interface NativeMapViewProps {
  markers: CampusMarker[];
  selectedMarkerId: string | null;
  onMarkerPress: (marker: CampusMarker) => void;
  userLocation: LatLon | null;
  routeCoords: LatLon[] | null;
  showRoute: boolean;
  campusLat: number;
  campusLng: number;
  /** Fires with the map's centre whenever the visible region settles. */
  onRegionChange?: (center: LatLon) => void;
}

const NativeMapView = forwardRef<CampusMapHandle, NativeMapViewProps>(
  (
    {
      markers,
      selectedMarkerId,
      onMarkerPress,
      userLocation,
      routeCoords,
      showRoute,
      campusLat,
      campusLng,
      onRegionChange,
    },
    ref
  ) => {
    const { theme, scheme } = useTheme();
    const cameraRef = useRef<CameraRef>(null);

    // The rest of the app still thinks in lat/lng-delta regions. Convert
    // them to a MapLibre bounds camera move so callers need no changes.
    useImperativeHandle(ref, () => ({
      animateToRegion(region, durationMs = 600) {
        cameraRef.current?.fitBounds(
          [
            region.longitude - region.longitudeDelta / 2,
            region.latitude - region.latitudeDelta / 2,
            region.longitude + region.longitudeDelta / 2,
            region.latitude + region.latitudeDelta / 2,
          ],
          { duration: durationMs }
        );
      },
    }));

    const routeData = useMemo<GeoJSON.FeatureCollection>(
      () => ({
        type: "FeatureCollection",
        features:
          routeCoords && routeCoords.length > 1
            ? [
                {
                  type: "Feature",
                  properties: {},
                  geometry: {
                    type: "LineString",
                    coordinates: routeCoords.map((p) => [p.longitude, p.latitude]),
                  },
                },
              ]
            : [],
      }),
      [routeCoords]
    );

    return (
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={getMapStyle(scheme)}
        compass={false}
        onRegionDidChange={(event) => {
          const [lng, lat] = event.nativeEvent.center;
          onRegionChange?.({ latitude: lat, longitude: lng });
        }}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: [campusLng, campusLat],
            zoom: 16.5,
            pitch: 40,
          }}
          maxZoom={19}
        />

        {/* The dark style only has flat building footprints — add the same 3D
            extrusion the detailed light style ships with. */}
        {scheme === "dark" ? (
          <Layer
            id="campus-buildings-3d"
            type="fill-extrusion"
            source="openmaptiles"
            source-layer="building"
            minzoom={14}
            filter={["!", ["has", "hide_3d"]]}
            paint={{
              "fill-extrusion-color": "#3d5144",
              "fill-extrusion-height": ["get", "render_height"],
              "fill-extrusion-base": ["get", "render_min_height"],
              "fill-extrusion-opacity": 0.75,
            }}
          />
        ) : null}

        {markers.map((marker) => {
          const isSelected = selectedMarkerId === marker.id;
          return (
            <Marker
              key={marker.id}
              id={marker.id}
              lngLat={[marker.lng, marker.lat]}
              onPress={() => onMarkerPress(marker)}
            >
              <View style={styles.markerRoot}>
                <View
                  style={[
                    styles.markerContainer,
                    {
                      backgroundColor: isSelected ? theme.tintDark : theme.tint,
                      borderColor: theme.onTint,
                      shadowColor: theme.shadow,
                    },
                    isSelected && styles.markerSelected,
                  ]}
                >
                  <MarkerIcon icon={marker.icon} />
                </View>
                <View
                  style={[styles.markerArrow, { borderTopColor: isSelected ? theme.tintDark : theme.tint }]}
                />
              </View>
            </Marker>
          );
        })}

        {userLocation ? (
          <Marker
            id="user-location"
            lngLat={[userLocation.longitude, userLocation.latitude]}
          >
            <View style={styles.userDotOuter}>
              <View style={[styles.userDotInner, { backgroundColor: theme.tint }]} />
            </View>
          </Marker>
        ) : null}

        {showRoute && routeCoords && routeCoords.length > 1 ? (
          <GeoJSONSource id="campus-route" data={routeData}>
            <Layer
              id="campus-route-casing"
              type="line"
              source="campus-route"
              paint={{
                "line-color": theme.card,
                "line-width": 9,
                "line-opacity": 0.85,
              }}
            />
            <Layer
              id="campus-route-line"
              type="line"
              source="campus-route"
              paint={{
                "line-color": theme.tint,
                "line-width": 5,
              }}
            />
          </GeoJSONSource>
        ) : null}
      </Map>
    );
  }
);

NativeMapView.displayName = "NativeMapView";

export default NativeMapView;

const styles = StyleSheet.create({
  markerRoot: {
    alignItems: "center",
  },
  markerContainer: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  markerSelected: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 3,
  },
  markerArrow: {
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
  userDotOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  userDotInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
});
