import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  StatusBar,
  Modal,
  FlatList,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { MapPin, ChevronDown, Navigation, Check, RefreshCw } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInDown,
  FadeInUp,
} from "react-native-reanimated";
import colors from "@/constants/colors";
import { useAuth } from "@/lib/useAuth";
import { useCampuses } from "@/lib/api/campuses";
import { isSupabaseConfigured } from "@/lib/supabase";
import { SEED_CAMPUSES } from "@/lib/data/campus-fallback";

export default function LandingScreen() {
  const insets = useSafeAreaInsets();
  const { user, configured, signOut } = useAuth();
  const [selectedCampus, setSelectedCampus] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const {
    data: fetchedCampuses,
    isLoading: campusesLoading,
    isError: campusesError,
    refetch: refetchCampuses,
  } = useCampuses();

  // Guest mode (no backend yet) uses the bundled dataset; §3 added the offline cache.
  const campuses = isSupabaseConfigured
    ? (fetchedCampuses ?? [])
    : SEED_CAMPUSES;
  const loadingCampuses = isSupabaseConfigured && campusesLoading;
  const erroredCampuses = isSupabaseConfigured && campusesError;

  const selected = campuses.find((c) => c.id === selectedCampus);
  const accountName =
    (user?.user_metadata?.full_name as string | undefined) ??
    user?.email?.split("@")[0] ??
    "Account";

  const handleAccountAction = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (user) {
      signOut();
    } else {
      router.push("/(auth)/sign-in");
    }
  };

  const handleExplore = () => {
    if (!selected) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: "/map",
      // Slug, not `selected.id`: `/map?campusId=nsuk` has to stay shareable and
      // survive a re-seed, which the assigned uuid does not. `useCampus` and the
      // route server both look up on slug.
      params: { campusId: selected.slug, lat: selected.lat, lng: selected.lng },
    });
  };

  const handleSelectCampus = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCampus(id);
    setShowPicker(false);
  };

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={["#054A14", "#0B6623", "#0D7A2B"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <View
        style={[
          styles.patternOverlay,
          { top: insets.top + webTopInset },
        ]}
      >
        <View style={styles.circle1} />
        <View style={styles.circle2} />
        <View style={styles.circle3} />
      </View>

      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + webTopInset + 60,
            paddingBottom: insets.bottom + webBottomInset + 20,
          },
        ]}
      >
        <Animated.View
          entering={FadeInDown.delay(200).duration(600)}
          style={styles.header}
        >
          <View style={styles.iconContainer}>
            <MapPin size={32} color="#FFFFFF" strokeWidth={2.5} />
          </View>
          <Text style={styles.title}>Campus Navigator</Text>
          <Text style={styles.subtitle}>
            Find your way around campus with ease
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(400).duration(600)}
          style={styles.card}
        >
          <Text style={styles.guestBadge}>
            {user ? accountName : "Guest Access"}
          </Text>

          <Text style={styles.cardTitle}>Select Your Campus</Text>
          <Text style={styles.cardDescription}>
            Choose your university to start navigating
          </Text>

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowPicker(true);
            }}
            disabled={loadingCampuses || erroredCampuses}
            style={({ pressed }) => [
              styles.dropdown,
              pressed && styles.dropdownPressed,
            ]}
          >
            <View style={styles.dropdownContent}>
              <MapPin
                size={18}
                color={selected ? "#0B6623" : "#9E9E9E"}
                strokeWidth={2}
              />
              <Text
                style={[
                  styles.dropdownText,
                  !selected && styles.dropdownPlaceholder,
                ]}
                numberOfLines={1}
              >
                {loadingCampuses
                  ? "Loading campuses..."
                  : selected
                    ? selected.name
                    : "Choose a campus..."}
              </Text>
            </View>
            <ChevronDown size={20} color="#9E9E9E" />
          </Pressable>

          {erroredCampuses && (
            <View style={styles.errorRow}>
              <Text style={styles.errorText}>
                Couldn&apos;t load campuses. Check your connection.
              </Text>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  refetchCampuses();
                }}
                style={({ pressed }) => [
                  styles.retryButton,
                  pressed && styles.retryButtonPressed,
                ]}
              >
                <RefreshCw size={14} color="#0B6623" strokeWidth={2.5} />
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          )}

          {selected && (
            <Animated.View
              entering={FadeInUp.duration(300)}
              style={styles.selectedInfo}
            >
              <Navigation size={14} color="#0B6623" />
              <Text style={styles.selectedLocation}>
                {selected.location}
              </Text>
            </Animated.View>
          )}

          <Pressable
            onPress={handleExplore}
            disabled={!selected}
            style={({ pressed }) => [
              styles.exploreButton,
              !selected && styles.exploreButtonDisabled,
              pressed && selected && styles.exploreButtonPressed,
            ]}
          >
            <LinearGradient
              colors={
                selected
                  ? ["#0B6623", "#0D7A2B"]
                  : ["#C8D6C8", "#C8D6C8"]
              }
              style={styles.exploreGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Navigation
                size={20}
                color={selected ? "#FFFFFF" : "#9E9E9E"}
              />
              <Text
                style={[
                  styles.exploreText,
                  !selected && styles.exploreTextDisabled,
                ]}
              >
                Explore Campus
              </Text>
            </LinearGradient>
          </Pressable>

          {(configured || user) && (
            <Pressable
              onPress={handleAccountAction}
              style={({ pressed }) => [
                styles.accountLink,
                pressed && styles.accountLinkPressed,
              ]}
            >
              <Text style={styles.accountLinkText}>
                {user ? `Sign out ${accountName}` : "Sign in to save favorites"}
              </Text>
            </Pressable>
          )}
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(600).duration(600)}
          style={styles.footer}
        >
          <View style={styles.featureRow}>
            <View style={styles.featureItem}>
              <MapPin size={16} color="rgba(255,255,255,0.7)" />
              <Text style={styles.featureText}>Campus Markers</Text>
            </View>
            <View style={styles.featureDot} />
            <View style={styles.featureItem}>
              <Navigation size={16} color="rgba(255,255,255,0.7)" />
              <Text style={styles.featureText}>Walking Routes</Text>
            </View>
          </View>
        </Animated.View>
      </View>

      <Modal
        visible={showPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPicker(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowPicker(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Campus</Text>
            <FlatList
              data={campuses}
              keyExtractor={(item) => item.id}
              scrollEnabled={campuses.length > 5}
              ListEmptyComponent={
                <View style={styles.modalEmpty}>
                  <Text style={styles.modalEmptyText}>
                    {loadingCampuses
                      ? "Loading campuses..."
                      : "No campuses available yet"}
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => handleSelectCampus(item.id)}
                  style={({ pressed }) => [
                    styles.campusItem,
                    pressed && styles.campusItemPressed,
                    selectedCampus === item.id && styles.campusItemSelected,
                  ]}
                >
                  <View style={styles.campusItemContent}>
                    <MapPin
                      size={18}
                      color={
                        selectedCampus === item.id ? "#0B6623" : "#5A6B5A"
                      }
                    />
                    <View style={styles.campusItemText}>
                      <Text
                        style={[
                          styles.campusName,
                          selectedCampus === item.id &&
                            styles.campusNameSelected,
                        ]}
                      >
                        {item.name}
                      </Text>
                      <Text style={styles.campusLocation}>
                        {item.location}
                      </Text>
                    </View>
                  </View>
                  {selectedCampus === item.id && (
                    <Check size={20} color="#0B6623" />
                  )}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#054A14",
  },
  patternOverlay: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  circle1: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(255,255,255,0.03)",
    top: -50,
    right: -80,
  },
  circle2: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(255,255,255,0.02)",
    bottom: 100,
    left: -60,
  },
  circle3: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(255,255,255,0.04)",
    top: "40%",
    right: -30,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  header: {
    alignItems: "center",
    gap: 12,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    lineHeight: 22,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  guestBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#E8F5E9",
    color: "#0B6623",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: "hidden",
  },
  cardTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#1B2E1B",
  },
  cardDescription: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#5A6B5A",
    lineHeight: 20,
    marginTop: -8,
  },
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1.5,
    borderColor: "#D5E0D5",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#F5F7F5",
  },
  dropdownPressed: {
    borderColor: "#0B6623",
    backgroundColor: "#E8F5E9",
  },
  dropdownContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  dropdownText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: "#1B2E1B",
    flex: 1,
  },
  dropdownPlaceholder: {
    color: "#9E9E9E",
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: "#E8F5E9",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#5A6B5A",
    lineHeight: 18,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  retryButtonPressed: {
    opacity: 0.7,
  },
  retryText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#0B6623",
  },
  modalEmpty: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: "center",
  },
  modalEmptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#9E9E9E",
  },
  selectedInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
    marginTop: -8,
  },
  selectedLocation: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#0B6623",
  },
  exploreButton: {
    borderRadius: 14,
    overflow: "hidden",
    marginTop: 4,
  },
  exploreButtonDisabled: {
    opacity: 0.7,
  },
  exploreButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  exploreGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  exploreText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  exploreTextDisabled: {
    color: "#9E9E9E",
  },
  accountLink: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  accountLinkPressed: {
    opacity: 0.7,
  },
  accountLinkText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: colors.light.tint,
  },
  footer: {
    alignItems: "center",
    paddingBottom: 10,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  featureText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.6)",
  },
  featureDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingVertical: 20,
    maxHeight: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: "#1B2E1B",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  campusItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  campusItemPressed: {
    backgroundColor: "#F5F7F5",
  },
  campusItemSelected: {
    backgroundColor: "#E8F5E9",
  },
  campusItemContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  campusItemText: {
    gap: 2,
    flex: 1,
  },
  campusName: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: "#1B2E1B",
  },
  campusNameSelected: {
    color: "#0B6623",
    fontFamily: "Inter_600SemiBold",
  },
  campusLocation: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#5A6B5A",
  },
});
