import React, { forwardRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import {
  Building2,
  BookOpen,
  Library,
  Flag,
  MapPin,
} from "lucide-react-native";

function getMarkerIcon(icon: string) {
  const props = { size: 16, color: "#FFFFFF", strokeWidth: 2.5 };
  switch (icon) {
    case "building":
      return <Building2 {...props} />;
    case "book":
      return <BookOpen {...props} />;
    case "library":
      return <Library {...props} />;
    case "flag":
      return <Flag {...props} />;
    default:
      return <MapPin {...props} />;
  }
}

interface NativeMapViewProps {
  markers: Array<{
    id: string;
    title: string;
    description: string;
    lat: number;
    lng: number;
    icon: string;
  }>;
  selectedMarkerId: string | null;
  onMarkerPress: (marker: any) => void;
  userLocation: { latitude: number; longitude: number } | null;
  routeCoords: { latitude: number; longitude: number }[] | null;
  showRoute: boolean;
  campusLat: number;
  campusLng: number;
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
              {getMarkerIcon(marker.icon)}
            </View>
            <View style={styles.markerArrow} />
          </Marker>
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
