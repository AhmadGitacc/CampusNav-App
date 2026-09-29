import React, { forwardRef, useImperativeHandle } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { MapPin } from "lucide-react-native";
import { useTheme } from "@/components/ThemeProvider";
import type { CampusMarker, LatLon } from "@shared/types";

interface CampusMapProps {
  markers: CampusMarker[];
  onMarkerPress: (marker: CampusMarker) => void;
  selectedMarkerId: string | null;
  userLocation: LatLon | null;
  routeCoords: LatLon[] | null;
  showRoute: boolean;
  campusLat: number;
  campusLng: number;
  /** Unused on web — the placeholder has no pannable region to report. */
  onRegionChange?: (center: LatLon) => void;
}

const CampusMap = forwardRef<any, CampusMapProps>(
  ({ markers, onMarkerPress, selectedMarkerId }, ref) => {
    useImperativeHandle(ref, () => ({
      animateToRegion: () => {},
    }));

    const { theme } = useTheme();

    return (
      <View style={[styles.container, { backgroundColor: theme.mapBackdrop }]}>
        <View style={styles.mapPlaceholder}>
          <MapPin size={48} color={theme.tint} />
          <Text style={[styles.title, { color: theme.text }]}>
            NSUK Campus Map
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            For the full interactive map experience, open this app on your phone
            using Expo Go
          </Text>
          <View style={styles.markerList}>
            {markers.map((marker) => {
              const isSelected = selectedMarkerId === marker.id;
              return (
                <Pressable
                  key={marker.id}
                  onPress={() => onMarkerPress(marker)}
                  style={[
                    styles.markerItem,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.separator,
                    },
                    isSelected && {
                      borderColor: theme.tint,
                      backgroundColor: theme.tintLight,
                    },
                  ]}
                >
                  <MapPin
                    size={16}
                    color={isSelected ? theme.tint : theme.textSecondary}
                  />
                  <View style={styles.markerInfo}>
                    <Text
                      style={[
                        styles.markerTitle,
                        {
                          color: isSelected ? theme.tint : theme.text,
                          fontFamily: isSelected
                            ? "Inter_600SemiBold"
                            : "Inter_500Medium",
                        },
                      ]}
                    >
                      {marker.title}
                    </Text>
                    <Text style={[styles.markerCoords, { color: theme.gray }]}>
                      {marker.lat.toFixed(4)}, {marker.lng.toFixed(4)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    );
  }
);

CampusMap.displayName = "CampusMap";

export default CampusMap;

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    marginTop: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
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
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  markerInfo: {
    gap: 2,
  },
  markerTitle: {
    fontSize: 15,
  },
  markerCoords: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
