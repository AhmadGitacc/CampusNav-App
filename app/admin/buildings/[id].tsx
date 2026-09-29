import React, { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/components/ThemeProvider";
import type { Theme } from "@/constants/colors";
import {
  useAdminBuildings,
  useSetBuildingPublished,
  useUpdateBuilding,
} from "@/lib/api/admin";
import { useAdminCampus } from "@/components/AdminCampusProvider";
import { BuildingForm } from "@/components/BuildingForm";

/**
 * Edit one building (Feature 10 §7.4).
 *
 * Reads the row out of the already-loaded list rather than fetching it again:
 * the admin lands here from that list, so the cache is warm, and an edit that
 * follows a list refresh shows the values currently on screen. If the id is not
 * in the list — a stale link, or a campus change — the screen says so instead of
 * silently rendering an empty form that would create a second building.
 */
export default function EditBuildingScreen() {
  const insets = useSafeAreaInsets();
  const { theme, statusBarStyle } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { campus } = useAdminCampus();
  const { data: buildings, isLoading, isError } = useAdminBuildings(campus?.slug);
  const update = useUpdateBuilding();
  const setPublished = useSetBuildingPublished();

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const building = useMemo(
    () => (buildings ?? []).find((item) => item.id === id),
    [buildings, id]
  );

  const goBack = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/admin/buildings");
    }
  }, []);

  const handleSubmit = useCallback(
    async (values: Parameters<typeof update.mutateAsync>[0]["values"]) => {
      try {
        await update.mutateAsync({ id, values });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        goBack();
      } catch (error) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(
          "Couldn't save",
          error instanceof Error ? error.message : "Please try again."
        );
      }
    },
    [goBack, id, update]
  );

  const handleTogglePublished = useCallback(() => {
    if (!building) return;
    const publish = building.deletedAt !== null;
    const run = async () => {
      try {
        await setPublished.mutateAsync({ id: building.id, published: publish });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (error) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(
          publish ? "Couldn't publish" : "Couldn't unpublish",
          error instanceof Error ? error.message : "Please try again."
        );
      }
    };
    if (publish) {
      void run();
      return;
    }
    Alert.alert(
      `Unpublish ${building.name}?`,
      "It disappears from the map and search for everyone, but nothing is deleted and you can restore it.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Unpublish", style: "destructive", onPress: () => void run() },
      ]
    );
  }, [building, setPublished]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={statusBarStyle} />
      <View style={[styles.header, { paddingTop: insets.top + webTopInset + 10 }]}>
        <Pressable
          onPress={goBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          accessibilityLabel="Back"
        >
          <ArrowLeft size={22} color={theme.text} strokeWidth={2.5} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {building?.name ?? "Building"}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color={theme.tint} />
        </View>
      ) : !building ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>
            {isError ? "Couldn't load this building" : "Building not found"}
          </Text>
          <Text style={styles.emptyText}>
            {isError
              ? "Check your connection and try again."
              : "It may have been moved to another campus."}
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.statusBar}>
            <View style={styles.statusText}>
              <Text style={styles.statusLabel}>
                {building.deletedAt === null ? "Published" : "Unpublished"}
              </Text>
              <Text style={styles.statusCaption}>
                {building.deletedAt === null
                  ? "Visible on the map and in search."
                  : "Hidden from the map, still in the database."}
              </Text>
            </View>
            <Pressable
              onPress={handleTogglePublished}
              disabled={setPublished.isPending}
              style={({ pressed }) => [
                styles.statusButton,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.statusButtonText}>
                {building.deletedAt === null ? "Unpublish" : "Publish"}
              </Text>
            </Pressable>
          </View>

          <BuildingForm
            key={building.id}
            initialValues={{
              name: building.name,
              description: building.description,
              category: building.category,
              lat: building.lat,
              lng: building.lng,
              icon: building.icon,
              aliases: building.aliases,
              openingHours: building.openingHours,
              isAccessibleEntry: building.isAccessibleEntry,
            }}
            submitLabel="Save changes"
            isSubmitting={update.isPending}
            onSubmit={(values) => void handleSubmit(values)}
          />
        </>
      )}
    </View>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
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
  headerSpacer: { width: 44 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.95 }] },
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
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 4,
    padding: 14,
    backgroundColor: theme.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  statusText: { flex: 1, gap: 2 },
  statusLabel: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: theme.text,
  },
  statusCaption: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: theme.gray,
    lineHeight: 17,
  },
  statusButton: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: theme.tintLight,
  },
  statusButtonText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: theme.tint,
  },
});
