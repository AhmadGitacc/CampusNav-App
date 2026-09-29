import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  Alert,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import {
  MapPin,
  Navigation,
  Crosshair,
  ArrowLeft,
  X,
  Search,
  RefreshCw,
  CircleCheck,
  Check,
  TriangleAlert,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import Animated, { SlideInDown, SlideOutDown } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import CampusMap from "@/components/CampusMap";
import { MarkerIcon } from "@/components/MarkerIcon";
import { OfflineBanner } from "@/components/OfflineBanner";
import { RouteProgressBar } from "@/components/RouteProgressBar";
import { ManeuverGlyph, NavigationSteps } from "@/components/NavigationSteps";
import { StepFreeToggle } from "@/components/StepFreeToggle";
import {
  getCurrentUserLocation,
  LocationPermissionError,
} from "@/lib/location";
import {
  calculateStraightDistance,
  formatDistance,
  formatEstimatedWalkTime,
  formatWalkTime,
  segmentDistance,
  toLatLon,
} from "@/lib/geo";
import { getLastLocation } from "@/lib/route-cache";
import { useOnline } from "@/lib/useOnline";
import { useStepFreePreference } from "@/lib/prefs";
import {
  useWalkingNavigation,
  type MapRegion,
} from "@/lib/navigation/useWalkingNavigation";
import { useCampus, useBuildings } from "@/lib/api/campuses";
import { isSupabaseConfigured } from "@/lib/supabase";
import { fallbackBuildings } from "@/lib/data/campus-fallback";
import { toCampusMarker, type CampusMarker, type LatLon } from "@shared/types";

/** How long a manual pan keeps the camera away from the walker. */
const FOLLOW_SUSPEND_MS = 5000;
/** Only pull the camera back once the walker has drifted this far off-centre. */
const FOLLOW_DRIFT_M = 200;

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const online = useOnline();
  const params = useLocalSearchParams<{
    campusId: string;
    lat: string;
    lng: string;
  }>();

  const mapRef = useRef<any>(null);
  // Follow bookkeeping: programmatic moves must not read as a manual pan, and
  // a recent pan suspends follow so the walker can look around freely.
  const programMoveUntilRef = useRef(0);
  const lastManualMoveRef = useRef(0);
  const regionCenterRef = useRef<LatLon | null>(null);

  const campusLat = parseFloat(params.lat || "8.8471");
  const campusLng = parseFloat(params.lng || "7.8776");

  const {
    data: campus,
    isLoading: campusLoading,
    isError: campusError,
    refetch: refetchCampus,
  } = useCampus(params.campusId);
  const {
    data: fetchedBuildings,
    isLoading: buildingsLoading,
    isError: buildingsError,
    refetch: refetchBuildings,
  } = useBuildings(params.campusId);

  // Guest mode (no backend yet) uses the bundled dataset; §3 added the offline cache.
  const buildings = useMemo(
    () =>
      isSupabaseConfigured
        ? (fetchedBuildings ?? [])
        : fallbackBuildings(params.campusId),
    [fetchedBuildings, params.campusId]
  );
  const markers = useMemo(() => buildings.map(toCampusMarker), [buildings]);
  const loadingBuildings =
    isSupabaseConfigured && (campusLoading || buildingsLoading);
  const erroredBuildings = isSupabaseConfigured && (campusError || buildingsError);
  // Slug resolved but matched nothing — a stale or hand-edited deep link.
  const campusMissing =
    isSupabaseConfigured &&
    !!params.campusId &&
    !campusLoading &&
    !campusError &&
    !campus;
  const noBuildings =
    !loadingBuildings && !erroredBuildings && !campusMissing && markers.length === 0;

  const [userLocation, setUserLocation] = useState<LatLon | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<CampusMarker | null>(
    null
  );
  const [locationLoading, setLocationLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [stepsExpanded, setStepsExpanded] = useState(false);
  const { stepFree, ready: stepFreeReady, setStepFree } = useStepFreePreference();

  const filteredMarkers = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return markers.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q)
    );
  }, [searchQuery, markers]);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const animateTo = useCallback((region: MapRegion, duration = 600) => {
    programMoveUntilRef.current = Date.now() + duration + 250;
    mapRef.current?.animateToRegion?.(region, duration);
  }, []);

  const handleRegionChange = useCallback((center: LatLon) => {
    regionCenterRef.current = center;
    if (Date.now() < programMoveUntilRef.current) return;
    lastManualMoveRef.current = Date.now();
  }, []);

  const handleCameraFit = useCallback(
    (region: MapRegion) => animateTo(region, 800),
    [animateTo]
  );

  const handleFollowUser = useCallback(
    (point: LatLon) => {
      if (Date.now() - lastManualMoveRef.current < FOLLOW_SUSPEND_MS) return;
      const center = regionCenterRef.current;
      if (center && segmentDistance(center, point) < FOLLOW_DRIFT_M) return;
      animateTo(
        { ...point, latitudeDelta: 0.005, longitudeDelta: 0.005 },
        600
      );
    },
    [animateTo]
  );

  const handleNotice = useCallback(
    (message: string) => {
      Alert.alert("Location Unavailable", message);
    },
    []
  );

  const navigation = useWalkingNavigation({
    destination: selectedMarker ? toLatLon(selectedMarker) : null,
    destinationName: selectedMarker?.title,
    campusId: params.campusId,
    buildingId: selectedMarker?.id ?? null,
    stepFree,
    onCameraFit: handleCameraFit,
    onFollowUser: handleFollowUser,
    onNotice: handleNotice,
  });

  const requestLocation = useCallback(async () => {
    setLocationLoading(true);
    try {
      const loc = await getCurrentUserLocation();
      setUserLocation(loc);
      animateTo(
        { ...loc, latitudeDelta: 0.005, longitudeDelta: 0.005 },
        800
      );
    } catch (error) {
      // Offline or GPS unavailable: fall back to the last known position so
      // directions still work instead of dead-ending.
      const lastKnown = await getLastLocation();
      if (lastKnown) {
        setUserLocation(lastKnown);
        Alert.alert(
          "Location Unavailable",
          "Using your last known location (up to 10 minutes old)."
        );
      } else if (error instanceof LocationPermissionError) {
        Alert.alert(
          "Location Permission",
          "Please enable location access to use this feature."
        );
      } else {
        Alert.alert("Location Error", "Could not get your current location.");
      }
    }
    setLocationLoading(false);
  }, [animateTo]);

  const handleSearchSelect = (marker: CampusMarker) => {
    setSearchQuery("");
    setSearchFocused(false);
    handleMarkerPress(marker);
  };

  const handleMarkerPress = (marker: CampusMarker) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.cancel();
    setStepsExpanded(false);
    setSelectedMarker(marker);
    animateTo(
      {
        latitude: marker.lat,
        longitude: marker.lng,
        latitudeDelta: 0.004,
        longitudeDelta: 0.004,
      },
      600
    );
  };

  const handleGetDirections = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    void navigation.start();
  };

  const handleCancelNavigation = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.cancel();
  };

  const handleDismissSheet = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.cancel();
    setStepsExpanded(false);
    setSelectedMarker(null);
    animateTo(
      {
        latitude: campusLat,
        longitude: campusLng,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      },
      600
    );
  };

  const route = navigation.route;
  const hasRoute = route !== null;
  const arrived = navigation.state === "arrived";
  const busy = navigation.isBusy || locationLoading;
  // A step-free request the campus graph could not satisfy is stated plainly
  // rather than hidden: the fallback may well include stairs, and someone who
  // needs step-free needs to know before they set off.
  const stepFreeFellBack = stepFree && route?.stepFreeSatisfied === false;
  // The tracker owns the position while navigating; the manual locate button
  // owns it otherwise.
  const activeLocation = navigation.position ?? userLocation;

  const progressFraction =
    route && navigation.progress && route.distanceMeters > 0
      ? Math.min(
          1,
          Math.max(
            0,
            (route.distanceMeters - navigation.progress.remainingMeters) /
              route.distanceMeters
          )
        )
      : 0;
  const cueStep = navigation.steps[navigation.progress?.cueIndex ?? 0] ?? null;
  const remainingMeters = navigation.progress?.remainingMeters ?? null;

  // Toggling step-free re-routes straight away when a route is already drawn, so
  // the preference never appears to have done nothing. The ref guard keeps the
  // initial mount (and every later re-render) from re-requesting a fix.
  const previousStepFreeRef = useRef(stepFree);
  useEffect(() => {
    if (!stepFreeReady) return;
    if (previousStepFreeRef.current === stepFree) return;
    previousStepFreeRef.current = stepFree;
    if (navigation.route) void navigation.start();
  }, [stepFree, stepFreeReady, navigation]);

  const displayDistance = route?.distanceMeters ?? (
    activeLocation && selectedMarker
      ? calculateStraightDistance(
          activeLocation.latitude,
          activeLocation.longitude,
          selectedMarker.lat,
          selectedMarker.lng
        )
      : null
  );
  const displayDuration = route?.durationSeconds ?? null;

  return (
    <View style={styles.container}>
      <CampusMap
        ref={mapRef}
        markers={markers}
        selectedMarkerId={selectedMarker?.id || null}
        onMarkerPress={handleMarkerPress}
        userLocation={activeLocation}
        routeCoords={route?.coordinates ?? null}
        showRoute={hasRoute}
        campusLat={campusLat}
        campusLng={campusLng}
        onRegionChange={handleRegionChange}
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
          <Text style={styles.campusLabelText} numberOfLines={1}>
            {campus?.name ?? (loadingBuildings ? "Loading..." : "Campus")}
          </Text>
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

      {loadingBuildings && (
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.overlayCard}>
            <ActivityIndicator size="small" color="#0B6623" />
            <Text style={styles.overlayText}>Loading campus buildings...</Text>
          </View>
        </View>
      )}

      {erroredBuildings && (
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <Text style={styles.overlayTitle}>Couldn&apos;t load buildings</Text>
            <Text style={styles.overlayText}>
              Check your connection and try again.
            </Text>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                refetchCampus();
                refetchBuildings();
              }}
              style={({ pressed }) => [
                styles.overlayButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <RefreshCw size={16} color="#0B6623" strokeWidth={2.5} />
              <Text style={styles.overlayButtonText}>Retry</Text>
            </Pressable>
          </View>
        </View>
      )}

      {noBuildings && (
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.overlayCard}>
            <MapPin size={32} color="#9E9E9E" strokeWidth={2} />
            <Text style={styles.overlayTitle}>No buildings yet</Text>
            <Text style={styles.overlayText}>
              Places for this campus haven&apos;t been added.
            </Text>
          </View>
        </View>
      )}

      {campusMissing && (
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <MapPin size={32} color="#9E9E9E" strokeWidth={2} />
            <Text style={styles.overlayTitle}>Campus not found</Text>
            <Text style={styles.overlayText}>
              This link points to a campus that isn&apos;t available.
            </Text>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              style={({ pressed }) => [
                styles.overlayButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <ArrowLeft size={16} color="#0B6623" strokeWidth={2.5} />
              <Text style={styles.overlayButtonText}>Go back</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View
        style={[
          styles.searchContainer,
          { top: insets.top + webTopInset + 64 },
        ]}
      >
        <View style={[styles.searchBar, searchFocused && styles.searchBarFocused]}>
          <Search size={18} color="#9E9E9E" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search buildings..."
            placeholderTextColor="#9E9E9E"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => {
              setTimeout(() => setSearchFocused(false), 200);
            }}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={() => {
                setSearchQuery("");
                setSearchFocused(false);
              }}
              hitSlop={8}
            >
              <X size={18} color="#9E9E9E" />
            </Pressable>
          )}
        </View>

        {searchQuery.trim().length > 0 && searchFocused && (
          <View style={styles.searchResults}>
            {filteredMarkers.length === 0 ? (
              <View style={styles.searchEmpty}>
                <Text style={styles.searchEmptyText}>No buildings found</Text>
              </View>
            ) : (
              filteredMarkers.map((marker) => (
                <Pressable
                  key={marker.id}
                  onPress={() => handleSearchSelect(marker)}
                  style={({ pressed }) => [
                    styles.searchResultItem,
                    pressed && styles.searchResultItemPressed,
                  ]}
                >
                  <View style={styles.searchResultIcon}>
                    <MarkerIcon icon={marker.icon} />
                  </View>
                  <View style={styles.searchResultText}>
                    <Text style={styles.searchResultTitle}>{marker.title}</Text>
                    <Text style={styles.searchResultDesc} numberOfLines={1}>
                      {marker.description}
                    </Text>
                  </View>
                </Pressable>
              ))
            )}
          </View>
        )}
      </View>

      {!online && (
        <OfflineBanner top={insets.top + webTopInset + 64 + 58} />
      )}

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
              {arrived ? (
                <CircleCheck size={20} color="#FFFFFF" strokeWidth={2.5} />
              ) : (
                <MarkerIcon icon={selectedMarker.icon} />
              )}
            </View>
            <View style={styles.sheetHeaderText}>
              <Text style={styles.sheetTitle}>
                {arrived ? "You’ve arrived" : selectedMarker.title}
              </Text>
              <Text style={styles.sheetDescription}>
                {arrived
                  ? `${selectedMarker.title} · ${selectedMarker.description}`
                  : selectedMarker.description}
              </Text>
            </View>
            <Pressable
              onPress={handleDismissSheet}
              style={({ pressed }) => [
                styles.closeSheet,
                pressed && { opacity: 0.6 },
              ]}
            >
              <X size={20} color="#5A6B5A" />
            </Pressable>
          </View>

          {arrived ? (
            <>
              <View style={styles.arrivedRow}>
                <CircleCheck size={32} color="#0B6623" strokeWidth={2.5} />
                <Text style={styles.arrivedText}>
                  You&apos;re at {selectedMarker.title}. Total walk was{" "}
                  {formatDistance(route?.distanceMeters ?? 0)}.
                </Text>
              </View>
              <Pressable
                onPress={handleDismissSheet}
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
                  <Check size={18} color="#FFFFFF" />
                  <Text style={styles.directionsText}>Done</Text>
                </LinearGradient>
              </Pressable>
            </>
          ) : hasRoute ? (
            busy ? (
              <View style={styles.busyRow}>
                <ActivityIndicator size="small" color="#0B6623" />
                <Text style={styles.busyText}>
                  {navigation.state === "routing"
                    ? "Recalculating…"
                    : "Getting your location…"}
                </Text>
              </View>
            ) : (
              <>
                <RouteProgressBar progress={progressFraction} />

                {cueStep && (
                  <View style={styles.instructionRow}>
                    <View style={styles.instructionIcon}>
                      <ManeuverGlyph icon={cueStep.icon} size={24} />
                    </View>
                    <View style={styles.instructionTextWrap}>
                      <Text style={styles.instructionText} numberOfLines={2}>
                        {cueStep.instruction}
                      </Text>
                      {navigation.progress &&
                        navigation.progress.distanceToCueMeters > 0 && (
                          <Text style={styles.instructionDistance}>
                            in{" "}
                            {formatDistance(
                              navigation.progress.distanceToCueMeters
                            )}
                          </Text>
                        )}
                    </View>
                  </View>
                )}

                <NavigationSteps
                  steps={navigation.steps}
                  activeIndex={navigation.progress?.cueIndex ?? 0}
                  expanded={stepsExpanded}
                  onToggle={() => setStepsExpanded((open) => !open)}
                />

                {remainingMeters !== null && remainingMeters > 0 && (
                  <View style={styles.distanceRow}>
                    <Navigation size={14} color="#0B6623" />
                    <Text style={styles.distanceText}>
                      {formatDistance(remainingMeters)} left
                    </Text>
                    <View style={styles.distanceDot} />
                    <Text style={styles.distanceText}>
                      {formatEstimatedWalkTime(remainingMeters)}
                    </Text>
                  </View>
                )}

                {route.approximate && (
                  <View style={styles.noticeRow}>
                    <RefreshCw size={14} color="#8A6D1F" strokeWidth={2.5} />
                    <Text style={styles.noticeText}>
                      Approximate route — no walking path data available
                    </Text>
                  </View>
                )}

                {stepFreeFellBack && (
                  <View style={styles.noticeRow}>
                    <TriangleAlert size={14} color="#8A6D1F" strokeWidth={2.5} />
                    <Text style={styles.noticeText}>
                      {route.entrance
                        ? `No step-free path found; heading to the nearest entrance (${route.entrance.name}).`
                        : "No step-free path found on this route — it may include stairs."}
                    </Text>
                  </View>
                )}

                {navigation.message && (
                  <View style={styles.noticeRow}>
                    <RefreshCw size={14} color="#8A6D1F" strokeWidth={2.5} />
                    <Text style={styles.noticeText}>
                      {navigation.message}
                    </Text>
                  </View>
                )}

                <Pressable
                  onPress={handleCancelNavigation}
                  style={({ pressed }) => [
                    styles.locateMeButton,
                    pressed && { transform: [{ scale: 0.97 }] },
                  ]}
                >
                  <X size={18} color="#0B6623" />
                  <Text style={styles.locateMeText}>Cancel</Text>
                </Pressable>
              </>
            )
          ) : (
            <>
              {displayDistance !== null && (
                <View style={styles.distanceRow}>
                  <Navigation size={14} color="#0B6623" />
                  <Text style={styles.distanceText}>
                    {formatDistance(displayDistance)}
                    {hasRoute ? "" : " (straight line)"}
                  </Text>
                  <View style={styles.distanceDot} />
                  <Text style={styles.distanceText}>
                    {displayDuration !== null && displayDuration > 0
                      ? formatWalkTime(displayDuration)
                      : formatEstimatedWalkTime(displayDistance)}
                  </Text>
                </View>
              )}

              {navigation.message && (
                <View style={styles.noticeRow}>
                  <RefreshCw size={14} color="#8A6D1F" strokeWidth={2.5} />
                  <Text style={styles.noticeText}>
                    {navigation.message}
                  </Text>
                </View>
              )}

              {/* The preference outlives the sheet, so it sits above the actions
                  and stays put between destinations. */}
              <StepFreeToggle
                value={stepFree}
                onChange={setStepFree}
                disabled={!stepFreeReady}
              />

              <View style={styles.sheetActions}>
                <Pressable
                  onPress={handleGetDirections}
                  disabled={busy}
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
                    {busy ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Navigation size={18} color="#FFFFFF" />
                    )}
                    <Text style={styles.directionsText}>
                      {busy
                        ? "Locating…"
                        : hasRoute
                          ? "Update Route"
                          : "Get Directions"}
                    </Text>
                  </LinearGradient>
                </Pressable>

                {!activeLocation && (
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
            </>
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
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  overlayCard: {
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 28,
    maxWidth: 300,
    shadowColor: "#1B2E1B",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 6,
  },
  overlayTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#1B2E1B",
    textAlign: "center",
  },
  overlayText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#5A6B5A",
    textAlign: "center",
    lineHeight: 20,
  },
  overlayButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    backgroundColor: "#E8F5E9",
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  overlayButtonText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#0B6623",
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
  busyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
  },
  busyText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#5A6B5A",
  },
  instructionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  instructionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#E8F5E9",
    alignItems: "center",
    justifyContent: "center",
  },
  instructionTextWrap: {
    flex: 1,
    gap: 2,
  },
  instructionText: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#1B2E1B",
    lineHeight: 24,
  },
  instructionDistance: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#5A6B5A",
  },
  noticeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#8A6D1F",
    lineHeight: 17,
  },
  arrivedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  arrivedText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#5A6B5A",
    lineHeight: 20,
  },
  searchContainer: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 9,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  searchBarFocused: {
    borderColor: "#0B6623",
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#1B2E1B",
    paddingVertical: 2,
  },
  searchResults: {
    marginTop: 6,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
    overflow: "hidden",
  },
  searchResultItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F2F0",
  },
  searchResultItemPressed: {
    backgroundColor: "#E8F5E9",
  },
  searchResultIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#0B6623",
    alignItems: "center",
    justifyContent: "center",
  },
  searchResultText: {
    flex: 1,
    gap: 1,
  },
  searchResultTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#1B2E1B",
  },
  searchResultDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#5A6B5A",
  },
  searchEmpty: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  searchEmptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#9E9E9E",
  },
});
