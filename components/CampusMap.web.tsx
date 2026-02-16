import React, { forwardRef, useImperativeHandle } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { MapPin } from "lucide-react-native";

interface CampusMapProps {
  markers: Array<{
    id: string;
    title: string;
    description: string;
    lat: number;
    lng: number;
    icon: string;
  }>;
  onMarkerPress: (marker: any) => void;
  selectedMarkerId: string | null;
  userLocation: { latitude: number; longitude: number } | null;
  routeCoords: { latitude: number; longitude: number }[] | null;
  showRoute: boolean;
  campusLat: number;
  campusLng: number;
}

const CampusMap = forwardRef<any, CampusMapProps>(
  ({ markers, onMarkerPress, selectedMarkerId }, ref) => {
    useImperativeHandle(ref, () => ({
      animateToRegion: () => {},
    }));

    return (
      <View style={styles.container}>
        <View style={styles.mapPlaceholder}>
          <MapPin size={48} color="#0B6623" />
          <Text style={styles.title}>NSUK Campus Map</Text>
          <Text style={styles.subtitle}>
            For the full interactive map experience, open this app on your phone
            using Expo Go
          </Text>
          <View style={styles.markerList}>
            {markers.map((marker) => (
              <Pressable
                key={marker.id}
                onPress={() => onMarkerPress(marker)}
                style={[
                  styles.markerItem,
                  selectedMarkerId === marker.id && styles.markerItemSelected,
                ]}
              >
                <MapPin
                  size={16}
                  color={
                    selectedMarkerId === marker.id ? "#0B6623" : "#5A6B5A"
                  }
                />
                <View style={styles.markerInfo}>
                  <Text
                    style={[
                      styles.markerTitle,
                      selectedMarkerId === marker.id &&
                        styles.markerTitleSelected,
                    ]}
                  >
                    {marker.title}
                  </Text>
                  <Text style={styles.markerCoords}>
                    {marker.lat.toFixed(4)}, {marker.lng.toFixed(4)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    );
  }
);

export default CampusMap;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#E8F5E9",
  },
  mapPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#1B2E1B",
    marginTop: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#5A6B5A",
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 300,
  },
  markerList: {
    marginTop: 16,
    width: "100%",
    maxWidth: 380,
    gap: 8,
  },
  markerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D5E0D5",
  },
  markerItemSelected: {
    borderColor: "#0B6623",
    backgroundColor: "#E8F5E9",
  },
  markerInfo: {
    gap: 2,
  },
  markerTitle: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: "#1B2E1B",
  },
  markerTitleSelected: {
    color: "#0B6623",
    fontFamily: "Inter_600SemiBold",
  },
  markerCoords: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#9E9E9E",
  },
});
