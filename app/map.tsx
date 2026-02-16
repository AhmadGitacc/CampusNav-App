import React, { useState, useRef, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import {
  MapPin,
  Navigation,
  Crosshair,
  ArrowLeft,
  X,
  Building2,
  BookOpen,
  Library,
  Flag,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInUp,
  SlideInDown,
  SlideOutDown,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import CampusMap from "@/components/CampusMap";

const NSUK_MARKERS = [
  {
    id: "senate",
    title: "Senate Building",
    description: "NSUK Senate Building - Administrative headquarters",
    lat: 8.849,
    lng: 7.8785,
    icon: "building",
  },
  {
    id: "law",
    title: "Faculty of Law",
    description: "Faculty of Law - Legal studies department",
    lat: 8.8465,
    lng: 7.876,
    icon: "book",
  },
  {
    id: "library",
    title: "Main Library",
    description: "NSUK Main Library - Knowledge center",
    lat: 8.8475,
    lng: 7.877,
    icon: "library",
  },
  {
    id: "convocation",
    title: "Convocation Square",
    description: "Convocation Square - Events and ceremonies",
    lat: 8.8482,
    lng: 7.8795,
    icon: "flag",
  },
];

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

function generateWalkingRoute(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): { latitude: number; longitude: number }[] {
  const steps = 20;
  const points: { latitude: number; longitude: number }[] = [];
  const midLat = (from.latitude + to.latitude) / 2;
  const midLng = (from.longitude + to.longitude) / 2;
  const offset = 0.0003;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let lat: number;
    let lng: number;

    if (t <= 0.5) {
      const s = t * 2;
      lat = from.latitude + (midLat - from.latitude) * s;
      lng = from.longitude + (midLng + offset - from.longitude) * s;
    } else {
      const s = (t - 0.5) * 2;
      lat = midLat + (to.latitude - midLat) * s;
      lng = midLng + offset + (to.longitude - (midLng + offset)) * s;
    }

    points.push({ latitude: lat, longitude: lng });
  }

  return points;
}

function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function formatWalkTime(meters: number): string {
  const minutes = Math.ceil(meters / 80);
  if (minutes < 1) return "< 1 min";
  return `${minutes} min walk`;
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    campusId: string;
    lat: string;
    lng: string;
  }>();

  const mapRef = useRef<any>(null);

  const campusLat = parseFloat(params.lat || "8.8471");
  const campusLng = parseFloat(params.lng || "7.8776");

  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<
    (typeof NSUK_MARKERS)[0] | null
  >(null);
  const [routeCoords, setRouteCoords] = useState<
    { latitude: number; longitude: number }[] | null
  >(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [showRoute, setShowRoute] = useState(false);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const requestLocation = useCallback(async () => {
    setLocationLoading(true);
    try {
      if (Platform.OS === "web") {
        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10000,
            });
          }
        );
        const loc = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setUserLocation(loc);
        mapRef.current?.animateToRegion?.(
          { ...loc, latitudeDelta: 0.005, longitudeDelta: 0.005 },
          800
        );
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Location Permission",
            "Please enable location access to use this feature."
          );
          setLocationLoading(false);
          return;
        }
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        const loc = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };
        setUserLocation(loc);
        mapRef.current?.animateToRegion?.(
          { ...loc, latitudeDelta: 0.005, longitudeDelta: 0.005 },
          800
        );
      }
    } catch {
      Alert.alert("Location Error", "Could not get your current location.");
    }
    setLocationLoading(false);
  }, []);

  const handleMarkerPress = (marker: (typeof NSUK_MARKERS)[0]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedMarker(marker);
    setShowRoute(false);
    setRouteCoords(null);
    mapRef.current?.animateToRegion?.(
      {
        latitude: marker.lat,
        longitude: marker.lng,
        latitudeDelta: 0.004,
        longitudeDelta: 0.004,
      },
      600
    );
  };

  const handleGetDirections = async () => {
    if (!selectedMarker) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    let currentLocation = userLocation;
    if (!currentLocation) {
      setLocationLoading(true);
      try {
        if (Platform.OS === "web") {
          const position = await new Promise<GeolocationPosition>(
            (resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 10000,
              });
            }
          );
          currentLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
        } else {
          const { status } =
            await Location.requestForegroundPermissionsAsync();
          if (status !== "granted") {
            Alert.alert(
              "Location Permission",
              "Please enable location to get directions."
            );
            setLocationLoading(false);
            return;
          }
          const location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
          currentLocation = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          };
        }
        setUserLocation(currentLocation);
      } catch {
        Alert.alert("Location Error", "Could not get your location.");
        setLocationLoading(false);
        return;
      }
      setLocationLoading(false);
    }

    const dest = {
      latitude: selectedMarker.lat,
      longitude: selectedMarker.lng,
    };

    const route = generateWalkingRoute(currentLocation, dest);
    setRouteCoords(route);
    setShowRoute(true);

    const minLat = Math.min(currentLocation.latitude, dest.latitude);
    const maxLat = Math.max(currentLocation.latitude, dest.latitude);
    const minLng = Math.min(currentLocation.longitude, dest.longitude);
    const maxLng = Math.max(currentLocation.longitude, dest.longitude);
    const padding = 0.003;

    mapRef.current?.animateToRegion?.(
      {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta: Math.max(maxLat - minLat + padding * 2, 0.005),
        longitudeDelta: Math.max(maxLng - minLng + padding * 2, 0.005),
      },
      800
    );
  };

  const handleDismissRoute = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowRoute(false);
    setRouteCoords(null);
    setSelectedMarker(null);
    mapRef.current?.animateToRegion?.(
      {
        latitude: campusLat,
        longitude: campusLng,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      },
      600
    );
  };

  const distance =
    userLocation && selectedMarker
      ? calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          selectedMarker.lat,
          selectedMarker.lng
        )
      : null;

  return (
    <View style={styles.container}>
      <CampusMap
        ref={mapRef}
        markers={NSUK_MARKERS}
        selectedMarkerId={selectedMarker?.id || null}
        onMarkerPress={handleMarkerPress}
        userLocation={userLocation}
        routeCoords={routeCoords}
        showRoute={showRoute}
        campusLat={campusLat}
        campusLng={campusLng}
      />

      <View
        style={[
          styles.topBar,
          { top: insets.top + webTopInset + 10 },
        ]}
      >
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <ArrowLeft size={22} color="#1B2E1B" strokeWidth={2.5} />
        </Pressable>

        <View style={styles.campusLabel}>
          <MapPin size={14} color="#0B6623" strokeWidth={2.5} />
          <Text style={styles.campusLabelText}>NSUK Campus</Text>
        </View>

        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            requestLocation();
          }}
          disabled={locationLoading}
          style={({ pressed }) => [
            styles.locateButton,
            pressed && styles.buttonPressed,
          ]}
        >
          {locationLoading ? (
            <ActivityIndicator size="small" color="#0B6623" />
          ) : (
            <Crosshair size={22} color="#0B6623" strokeWidth={2.5} />
          )}
        </Pressable>
      </View>

      {!selectedMarker && (
        <Animated.View
          entering={SlideInDown.duration(400).springify()}
          style={[
            styles.hintBar,
            { bottom: insets.bottom + webBottomInset + 16 },
          ]}
        >
          <MapPin size={16} color="#0B6623" />
          <Text style={styles.hintText}>Tap a marker to get directions</Text>
        </Animated.View>
      )}

      {selectedMarker && (
        <Animated.View
          entering={SlideInDown.duration(400).springify()}
          exiting={SlideOutDown.duration(300)}
          style={[
            styles.bottomSheet,
            { paddingBottom: insets.bottom + webBottomInset + 12 },
          ]}
        >
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeader}>
            <View style={styles.sheetMarkerIcon}>
              {getMarkerIcon(selectedMarker.icon)}
            </View>
            <View style={styles.sheetHeaderText}>
              <Text style={styles.sheetTitle}>{selectedMarker.title}</Text>
              <Text style={styles.sheetDescription}>
                {selectedMarker.description}
              </Text>
            </View>
            <Pressable
              onPress={handleDismissRoute}
              style={({ pressed }) => [
                styles.closeSheet,
                pressed && { opacity: 0.6 },
              ]}
            >
              <X size={20} color="#5A6B5A" />
            </Pressable>
          </View>

          {distance !== null && (
            <View style={styles.distanceRow}>
              <Navigation size={14} color="#0B6623" />
              <Text style={styles.distanceText}>
                {formatDistance(distance)} away
              </Text>
              <View style={styles.distanceDot} />
              <Text style={styles.distanceText}>
                {formatWalkTime(distance)}
              </Text>
            </View>
          )}

          <View style={styles.sheetActions}>
            <Pressable
              onPress={handleGetDirections}
              disabled={locationLoading}
              style={({ pressed }) => [
                styles.directionsButton,
                pressed && { transform: [{ scale: 0.97 }] },
              ]}
            >
              <LinearGradient
                colors={["#0B6623", "#0D7A2B"]}
                style={styles.directionsGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {locationLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Navigation size={18} color="#FFFFFF" />
                )}
                <Text style={styles.directionsText}>
                  {showRoute ? "Update Route" : "Get Directions"}
                </Text>
              </LinearGradient>
            </Pressable>

            {!userLocation && (
              <Pressable
                onPress={requestLocation}
                disabled={locationLoading}
                style={({ pressed }) => [
                  styles.locateMeButton,
                  pressed && { transform: [{ scale: 0.97 }] },
                ]}
              >
                <Crosshair size={18} color="#0B6623" />
                <Text style={styles.locateMeText}>Locate Me First</Text>
              </Pressable>
            )}
          </View>

          {showRoute && (
            <Animated.View
              entering={FadeInUp.duration(300)}
              style={styles.routeActive}
            >
              <View style={styles.routeActiveDot} />
              <Text style={styles.routeActiveText}>
                Route is shown on the map
              </Text>
            </Animated.View>
          )}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7F5",
  },
  topBar: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  campusLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  campusLabelText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#1B2E1B",
  },
  locateButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  hintBar: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  hintText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#1B2E1B",
  },
  bottomSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 10,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D5E0D5",
    alignSelf: "center",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sheetMarkerIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#0B6623",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetHeaderText: {
    flex: 1,
    gap: 2,
  },
  sheetTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#1B2E1B",
  },
  sheetDescription: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#5A6B5A",
    lineHeight: 18,
  },
  closeSheet: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#F5F7F5",
    alignItems: "center",
    justifyContent: "center",
  },
  distanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  distanceText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#0B6623",
  },
  distanceDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#0B6623",
  },
  sheetActions: {
    gap: 10,
  },
  directionsButton: {
    borderRadius: 14,
    overflow: "hidden",
  },
  directionsGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  directionsText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  locateMeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#0B6623",
    backgroundColor: "#E8F5E9",
  },
  locateMeText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#0B6623",
  },
  routeActive: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  routeActiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#0B6623",
  },
  routeActiveText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#5A6B5A",
  },
});
