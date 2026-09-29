import React, { forwardRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import { MarkerIcon } from "@/components/MarkerIcon";
import type { CampusMarker, LatLon } from "@shared/types";

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

const NativeMapView = forwardRef<MapView, NativeMapViewProps>(
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
    return (
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_DEFAULT}
        initialRegion={{
          latitude: campusLat,
          longitude: campusLng,
          latitudeDelta: 0.008,
          longitudeDelta: 0.008,
        }}
        showsUserLocation={!!userLocation}
        showsMyLocationButton={false}
        showsCompass={false}
        mapType="standard"
        onRegionChangeComplete={(region) => {
          if (region) {
            onRegionChange?.({
              latitude: region.latitude,
              longitude: region.longitude,
            });
          }
        }}
      >
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            coordinate={{ latitude: marker.lat, longitude: marker.lng }}
            title={marker.title}
            description={marker.description}
            onPress={() => onMarkerPress(marker)}
          >
            <View
              style={[
                styles.markerContainer,
                selectedMarkerId === marker.id && styles.markerSelected,
              ]}
            >
              <MarkerIcon icon={marker.icon} />
            </View>
            <View style={styles.markerArrow} />          </Marker>
        ))}

        {showRoute && routeCoords && routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor="#0B6623"
            strokeWidth={4}
            lineDashPattern={[0]}
          />
        )}
      </MapView>
    );
  }
);

NativeMapView.displayName = "NativeMapView";

export default NativeMapView;

const styles = StyleSheet.create({
  markerContainer: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#0B6623",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  markerSelected: {
    backgroundColor: "#054A14",
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
    borderTopColor: "#0B6623",
    alignSelf: "center",
    marginTop: -1,
  },
});
