import React, { useMemo, useState } from "react";
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
import { useSystemBars, useTheme } from "@/components/ThemeProvider";
import { brandGradient, actionGradient } from "@/constants/gradients";
import type { Theme } from "@/constants/colors";
import { useAuth } from "@/lib/useAuth";
import { useRole } from "@/lib/useRole";
import { useCampuses } from "@/lib/api/campuses";
import { isSupabaseConfigured } from "@/lib/supabase";
import { SEED_CAMPUSES } from "@/lib/data/campus-fallback";

export default function LandingScreen() {
  const insets = useSafeAreaInsets();
  const { theme, scheme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // The hero gradient reaches the bottom of the screen, so the nav bar has to
  // match its darkest stop rather than the page background.
  useSystemBars(brandGradient(scheme)[0]);
  const { user, configured, signOut } = useAuth();
  const { isAdmin } = useRole();
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
        colors={brandGradient(scheme)}
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
            <MapPin size={32} color={theme.onTint} strokeWidth={2.5} />
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
                color={selected ? theme.tint : theme.gray}
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
            <ChevronDown size={20} color={theme.gray} />
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
                <RefreshCw size={14} color={theme.tint} strokeWidth={2.5} />
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          )}

          {selected && (
            <Animated.View
              entering={FadeInUp.duration(300)}
              style={styles.selectedInfo}
            >
              <Navigation size={14} color={theme.tint} />
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
                selected ? actionGradient(scheme) : [theme.tintDisabled, theme.tintDisabled]
              }
              style={styles.exploreGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Navigation
                size={20}
                color={selected ? theme.onTint : theme.gray}
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

          {/* Only rendered for an admin, and only as a quiet text link — the CMS
              is a tool for staff, not a destination a student is looking for.
              `useRole` reads the JWT claim, so this never flashes for a user
              whose profile merely claims admin. */}
          {isAdmin && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/admin");
              }}
              style={({ pressed }) => [
                styles.accountLink,
                pressed && styles.accountLinkPressed,
              ]}
              accessibilityRole="link"
            >
              <Text style={styles.accountLinkText}>Admin · manage campus content</Text>
            </Pressable>
          )}
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(600).duration(600)}
          style={styles.footer}
        >
          <View style={styles.featureRow}>
            <View style={styles.featureItem}>
              <MapPin size={16} color={theme.onTintMuted} />
              <Text style={styles.featureText}>Campus Markers</Text>
            </View>
            <View style={styles.featureDot} />
            <View style={styles.featureItem}>
              <Navigation size={16} color={theme.onTintMuted} />
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
                        selectedCampus === item.id ? theme.tint : theme.textSecondary
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
                    <Check size={20} color={theme.tint} />
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

const makeStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.tintDark,
  },
  patternOverlay: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  // The four washes below are the only literal colours left in the app. They are
  // decorative low-alpha white over the brand hero, which is dark green in *both*
  // schemes, so they are not theme values — a token here would imply a
  // light/dark decision that does not exist. `iconContainer` has to stay an rgba
  // rather than `opacity`, because the MapPin inside it must not fade with it.
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
    color: theme.onTint,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: theme.onTintMuted,
    textAlign: "center",
    lineHeight: 22,
  },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 20,
    padding: 24,
    gap: 16,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  guestBadge: {
    alignSelf: "flex-start",
    backgroundColor: theme.tintLight,
    color: theme.tint,
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
    color: theme.text,
  },
  cardDescription: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: theme.textSecondary,
    lineHeight: 20,
    marginTop: -8,
  },
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1.5,
    borderColor: theme.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: theme.surfacePressed,
  },
  dropdownPressed: {
    borderColor: theme.tint,
    backgroundColor: theme.tintLight,
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
    color: theme.text,
    flex: 1,
  },
  dropdownPlaceholder: {
    color: theme.gray,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: theme.tintLight,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: theme.textSecondary,
    lineHeight: 18,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: theme.surface,
  },
  retryButtonPressed: {
    opacity: 0.7,
  },
  retryText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: theme.tint,
  },
  modalEmpty: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: "center",
  },
  modalEmptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: theme.gray,
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
    color: theme.tint,
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
    color: theme.onTint,
  },
  exploreTextDisabled: {
    color: theme.gray,
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
    color: theme.tint,
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
    color: theme.onTintMuted,
  },
  featureDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.onTintMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.scrim,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalContent: {
    backgroundColor: theme.surface,
    borderRadius: 20,
    paddingVertical: 20,
    maxHeight: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: theme.text,
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
    backgroundColor: theme.surfacePressed,
  },
  campusItemSelected: {
    backgroundColor: theme.tintLight,
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
    color: theme.text,
  },
  campusNameSelected: {
    color: theme.tint,
    fontFamily: "Inter_600SemiBold",
  },
  campusLocation: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: theme.textSecondary,
  },
});
