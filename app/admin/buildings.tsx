import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowLeft, Plus, Search } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/components/ThemeProvider";
import type { Theme } from "@/constants/colors";
import {
  useAdminBuildings,
  useSetBuildingPublished,
  type AdminBuilding,
} from "@/lib/api/admin";
import { useAdminCampus } from "@/components/AdminCampusProvider";
import { MarkerIcon } from "@/components/MarkerIcon";

/**
 * Building list with publish / unpublish (Feature 10 §7.4).
 *
 * Unpublished buildings stay in this list, greyed, because the operation people
 * need most is *undo* — a mis-click that hid a lecture hall is only fixable if
 * the row is still visible. The public map filters them out in
 * `lib/api/campuses.ts`; here they are inventory.
 */

const CATEGORY_LABELS: Record<string, string> = {
  admin: "Admin",
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

export default function AdminBuildingsScreen() {
  const insets = useSafeAreaInsets();
  const { theme, statusBarStyle } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { campus } = useAdminCampus();
  const { data: buildings, isLoading, isError } = useAdminBuildings(campus?.slug);
  const setPublished = useSetBuildingPublished();
  const [query, setQuery] = useState("");

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const goBack = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const all = buildings ?? [];
    if (!needle) return all;
    return all.filter(
      (building) =>
        building.name.toLowerCase().includes(needle) ||
        building.aliases.some((alias) => alias.toLowerCase().includes(needle))
    );
  }, [buildings, query]);

  const togglePublished = useCallback(
    (building: AdminBuilding) => {
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

      // Unpublishing removes a place from every student's map, so it is worth
      // one confirmation. Publishing it back is not.
      if (publish) {
        void run();
        return;
      }
      Alert.alert(
        `Unpublish ${building.name}?`,
        "It disappears from the map and search for everyone, but nothing is deleted and you can restore it here.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Unpublish", style: "destructive", onPress: () => void run() },
        ]
      );
    },
    [setPublished]
  );

  const renderItem = useCallback(
    ({ item }: { item: AdminBuilding }) => {
      const unpublished = item.deletedAt !== null;
      return (
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push({ pathname: "/admin/buildings/[id]", params: { id: item.id } });
          }}
          onLongPress={() => togglePublished(item)}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          accessibilityRole="button"
          accessibilityLabel={`${item.name}, ${unpublished ? "unpublished" : "published"}`}
        >
          <View style={[styles.iconWrap, unpublished && styles.iconWrapMuted]}>
            <MarkerIcon icon={item.icon} />
          </View>
          <View style={styles.rowText}>
            <Text
              style={[styles.name, unpublished && styles.nameMuted]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            <Text style={styles.caption} numberOfLines={1}>
              {CATEGORY_LABELS[item.category] ?? item.category}
              {unpublished ? " · Unpublished" : ""}
            </Text>
          </View>
          <Pressable
            onPress={() => togglePublished(item)}
            hitSlop={10}
            accessibilityRole="switch"
            accessibilityState={{ checked: !unpublished }}
            accessibilityLabel={
              unpublished ? `Publish ${item.name}` : `Unpublish ${item.name}`
            }
            style={({ pressed }) => [
              styles.statusPill,
              unpublished ? styles.statusPillOff : styles.statusPillOn,
              pressed && styles.rowPressed,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                { color: unpublished ? theme.gray : theme.tint },
              ]}
            >
              {unpublished ? "Publish" : "Unpublish"}
            </Text>
          </Pressable>
        </Pressable>
      );
    },
    [togglePublished, styles, theme]
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={statusBarStyle} />
      <View style={[styles.header, { paddingTop: insets.top + webTopInset + 10 }]}>
        <Pressable
          onPress={goBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.rowPressed]}
          accessibilityLabel="Back"
        >
          <ArrowLeft size={22} color={theme.text} strokeWidth={2.5} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {campus?.name ?? "Buildings"}
        </Text>
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push("/admin/buildings/new");
          }}
          style={({ pressed }) => [styles.addButton, pressed && styles.rowPressed]}
          accessibilityLabel="Add a building"
        >
          <Plus size={22} color={theme.onTint} strokeWidth={2.5} />
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <Search size={16} color={theme.gray} strokeWidth={2.2} />
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search buildings and aliases"
          placeholderTextColor={theme.gray}
          accessibilityLabel="Search buildings"
          autoCorrect={false}
        />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color={theme.tint} />
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Couldn&apos;t load buildings</Text>
          <Text style={styles.emptyText}>Check your connection and try again.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 24 },
          ]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {query ? "No matches" : "No buildings yet"}
              </Text>
              <Text style={styles.emptyText}>
                {query
                  ? "Try a different name or alias."
                  : "Add one with the + button, or import a spreadsheet."}
              </Text>
            </View>
          }
        />
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
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: theme.tint,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: theme.text,
    textAlign: "center",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    backgroundColor: theme.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  search: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: theme.text,
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
    marginLeft: 72,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  rowPressed: { opacity: 0.7 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: theme.tint,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapMuted: { backgroundColor: theme.separator },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontFamily: "Inter_500Medium", color: theme.text },
  nameMuted: { color: theme.gray },
  caption: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: theme.textSecondary,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusPillOn: {
    borderColor: theme.border,
    backgroundColor: theme.tintLight,
  },
  statusPillOff: { borderColor: theme.border, backgroundColor: "transparent" },
  statusText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 8,
  },
  empty: { alignItems: "center", gap: 6, paddingVertical: 48, paddingHorizontal: 24 },
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
});
