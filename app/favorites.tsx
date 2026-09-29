import React, { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowLeft, ChevronRight, RefreshCw, Star } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/components/ThemeProvider";
import { actionGradient } from "@/constants/gradients";
import type { Theme } from "@/constants/colors";
import { useAuth } from "@/lib/useAuth";
import { useCampuses } from "@/lib/api/campuses";
import { useFavorites, type Favorite } from "@/lib/api/favorites";
import { pushRecent } from "@/lib/recent-searches";
import { MarkerIcon } from "@/components/MarkerIcon";
import type { BuildingCategory } from "@shared/types";

const CATEGORY_LABELS: Record<BuildingCategory, string> = {
  admin: "Administration",
  faculty: "Faculty",
  library: "Library",
  event: "Events",
  hostel: "Hostel",
  cafeteria: "Cafeteria",
  sports: "Sports",
  health: "Health",
  parking: "Parking",
  toilet: "Toilet",
};

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets();
  const { theme, scheme, statusBarStyle } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { user } = useAuth();
  const { data: favorites, isLoading, isError, refetch } = useFavorites();
  const { data: campuses } = useCampuses();

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const goBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  }, []);

  const handleSelect = useCallback(
    (favorite: Favorite) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const building = favorite.building;
      // Choosing a saved place counts as a recent search too.
      void pushRecent({
        id: building.id,
        name: building.name,
        description: building.description,
        icon: building.icon,
      });
      const campus = campuses?.find((c) => c.id === building.campusId);
      if (campus) {
        // Replace rather than push: the map screen reads `buildingId` from its
        // params on mount, so it needs to be a fresh instance.
        router.replace({
          pathname: "/map",
          params: {
            campusId: campus.slug,
            buildingId: building.id,
            lat: building.lat,
            lng: building.lng,
          },
        });
      } else {
        goBack();
      }
    },
    [campuses, goBack]
  );

  const renderItem = ({ item }: { item: Favorite }) => {
    const building = item.building;
    return (
      <Pressable
        onPress={() => handleSelect(item)}
        style={({ pressed }) => [
          styles.favoriteRow,
          pressed && styles.favoriteRowPressed,
        ]}
      >
        <View style={styles.favoriteIcon}>
          <MarkerIcon icon={building.icon} />
        </View>
        <View style={styles.favoriteText}>
          <Text style={styles.favoriteName} numberOfLines={1}>
            {building.name}
          </Text>
          <Text style={styles.favoriteCaption} numberOfLines={1}>
            {CATEGORY_LABELS[building.category] ?? building.category}
          </Text>
        </View>
        <ChevronRight size={18} color={theme.gray} strokeWidth={2.5} />
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={statusBarStyle} />
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + webTopInset + 10 },
        ]}
      >
        <Pressable
          onPress={goBack}
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <ArrowLeft size={22} color={theme.text} strokeWidth={2.5} />
        </Pressable>
        <Text style={styles.title}>Favorites</Text>
        <View style={styles.headerSpacer} />
      </View>

      {!user ? (
        <View style={styles.centered}>
          <View style={styles.emptyIcon}>
            <Star size={28} color={theme.gray} strokeWidth={2} />
          </View>
          <Text style={styles.emptyTitle}>Favorites stay on your account</Text>
          <Text style={styles.emptyText}>
            Sign in to save places you visit often and find them again in a tap.
          </Text>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push("/(auth)/sign-in");
            }}
            style={({ pressed }) => [
              styles.signInButton,
              pressed && styles.signInButtonPressed,
            ]}
          >
            <LinearGradient
              colors={actionGradient(scheme)}
              style={styles.signInGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.signInText}>Sign In</Text>
            </LinearGradient>
          </Pressable>
        </View>
      ) : isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color={theme.tint} />
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Couldn&apos;t load favorites</Text>
          <Text style={styles.emptyText}>
            Check your connection and try again.
          </Text>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              void refetch();
            }}
            style={({ pressed }) => [
              styles.retryButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <RefreshCw size={16} color={theme.tint} strokeWidth={2.5} />
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (favorites ?? []).length === 0 ? (
        <View style={styles.centered}>
          <View style={styles.emptyIcon}>
            <Star size={28} color={theme.gray} strokeWidth={2} />
          </View>
          <Text style={styles.emptyTitle}>No favorites yet</Text>
          <Text style={styles.emptyText}>
            Tap the heart on any building to save it here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(item) => item.building.id}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 24 },
          ]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={renderItem}
        />
      )}
    </View>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.backgroundSecondary,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: theme.card,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  headerSpacer: {
    width: 44,
  },
  buttonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: theme.text,
    textAlign: "center",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 8,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: theme.tintLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: theme.text,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: theme.gray,
    textAlign: "center",
    lineHeight: 20,
  },
  signInButton: {
    marginTop: 8,
    borderRadius: 14,
    overflow: "hidden",
    alignSelf: "stretch",
  },
  signInButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  signInGradient: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  signInText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: theme.white,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    backgroundColor: theme.tintLight,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: theme.tint,
  },
  list: {
    marginHorizontal: 16,
    backgroundColor: theme.card,
    borderRadius: 20,
    overflow: "hidden",
  },
  separator: {
    height: 1,
    backgroundColor: theme.separator,
    marginLeft: 70,
  },
  favoriteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  favoriteRowPressed: {
    backgroundColor: theme.backgroundSecondary,
  },
  favoriteIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: theme.tint,
    alignItems: "center",
    justifyContent: "center",
  },
  favoriteText: {
    flex: 1,
    gap: 2,
  },
  favoriteName: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: theme.text,
  },
  favoriteCaption: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: theme.textSecondary,
  },
});