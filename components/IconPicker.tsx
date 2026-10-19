import React, { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Check, MapPin, Search } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/components/ThemeProvider";
import type { Theme } from "@/constants/colors";
import { MarkerIcon } from "@/components/MarkerIcon";
import {
  CATEGORY_ICON_GROUPS,
  ICON_GROUPS,
  ICON_REGISTRY,
  type IconGroup,
} from "@/lib/icon-registry";
import { markerIconNames } from "@shared/schema";
import type { BuildingCategory, MarkerIconName } from "@shared/types";

/**
 * Searchable, grouped picker for the marker glyph (Feature 10 §7.4).
 *
 * Every tile draws the glyph on a `tintLight` disc in the `tint` foreground —
 * the same contrast pair the map markers use — because a bare glyph on a card
 * background is invisible in light mode, which is exactly the bug this
 * replaced. A group tab (plus a "Suggested" tab derived from the chosen
 * building category) keeps fifty-odd icons from being one long wall, and the
 * search matches labels *and* keywords ("restroom", "canteen", "lab").
 */

const ALL = "all" as const;
const SUGGESTED = "suggested" as const;
type Tab = typeof ALL | typeof SUGGESTED | IconGroup;

const ALL_ICONS = markerIconNames as readonly MarkerIconName[];

function matches(icon: MarkerIconName, needle: string): boolean {
  if (!needle) return true;
  const entry = ICON_REGISTRY[icon];
  return (
    entry.label.toLowerCase().includes(needle) ||
    entry.keywords.includes(needle) ||
    icon.includes(needle)
  );
}

export interface IconPickerProps {
  value: MarkerIconName | undefined;
  onChange: (icon: MarkerIconName | undefined) => void;
  /** The building category, when chosen — drives the Suggested tab. */
  category?: BuildingCategory;
}

export function IconPicker({ value, onChange, category }: IconPickerProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>(category ? SUGGESTED : ALL);

  const needle = query.trim().toLowerCase();

  const suggestedGroups = category ? (CATEGORY_ICON_GROUPS[category] ?? []) : [];
  const tabs: { id: Tab; label: string }[] = useMemo(() => {
    const list: { id: Tab; label: string }[] = [];
    if (suggestedGroups.length > 0) list.push({ id: SUGGESTED, label: "Suggested" });
    list.push({ id: ALL, label: "All" });
    for (const group of ICON_GROUPS) {
      // A group in "Suggested" already has a tab of its own — no duplicate.
      if (suggestedGroups.includes(group.id)) continue;
      list.push({ id: group.id, label: group.label });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const visible = useMemo(() => {
    if (needle) return ALL_ICONS.filter((icon) => matches(icon, needle));
    if (tab === ALL) return ALL_ICONS;
    const groups =
      tab === SUGGESTED ? suggestedGroups : ([tab] as IconGroup[]);
    return ALL_ICONS.filter((icon) =>
      groups.includes(ICON_REGISTRY[icon].group)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needle, tab, category]);

  // Keep the tab legal when the category (and therefore Suggested) disappears.
  const activeTab = tabs.some((item) => item.id === tab) ? tab : ALL;

  return (
    <View style={styles.wrap}>
      <View style={styles.searchWrap}>
        <Search size={16} color={theme.gray} strokeWidth={2.2} />
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search icons — library, gym, toilet…"
          placeholderTextColor={theme.gray}
          accessibilityLabel="Search icons"
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => setQuery("")}
            hitSlop={10}
            accessibilityLabel="Clear search"
          >
            <Text style={styles.clear}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      {needle ? null : (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={tabs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.tabRow}
          renderItem={({ item }) => {
            const selected = item.id === activeTab;
            return (
              <Pressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setTab(item.id);
                }}
                style={({ pressed }) => [
                  styles.tab,
                  selected && styles.tabSelected,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.tabText, selected && styles.tabTextSelected]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          }}
        />
      )}

      {needle && visible.length === 0 ? (
        <Text style={styles.noMatches}>
          No icons match “{query.trim()}”.
        </Text>
      ) : (
        <View style={styles.grid}>
          {/* The default option first: nothing selected renders the map-pin
              marker, so an explicit "Auto' choice is the honest empty state. */}
          <Tile
            selected={value === undefined}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onChange(undefined);
            }}
            label="Auto"
            onTint={theme.onTint}
            styles={styles}
          >
            <MapPin size={20} color={value === undefined ? theme.onTint : theme.tint} strokeWidth={2.3} />
          </Tile>

          {visible.map((icon) => {
            const selected = value === icon;
            const entry = ICON_REGISTRY[icon];
            return (
              <Tile
                key={icon}
                selected={selected}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onChange(selected ? undefined : icon);
                }}
                label={entry.label}
                onTint={theme.onTint}
                styles={styles}
              >
                <MarkerIcon
                  icon={icon}
                  size={20}
                  strokeWidth={2.3}
                  color={selected ? theme.onTint : theme.tint}
                />
              </Tile>
            );
          })}
        </View>
      )}
    </View>
  );
}

function Tile({
  selected,
  onPress,
  label,
  children,
  onTint,
  styles,
}: {
  selected: boolean;
  onPress: () => void;
  label: string;
  children: React.ReactNode;
  onTint: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        selected && styles.tileSelected,
        pressed && styles.pressed,
      ]}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
    >
      <View style={[styles.disc, selected && styles.discSelected]}>{children}</View>
      <Text style={[styles.tileLabel, selected && styles.tileLabelSelected]} numberOfLines={1}>
        {label}
      </Text>
      {selected ? (
        <View style={styles.check}>
          <Check size={9} color={onTint} strokeWidth={3.2} />
        </View>
      ) : null}
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: 10 },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 14,
      backgroundColor: theme.backgroundSecondary,
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
    clear: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: theme.tint,
    },
    tabRow: { gap: 8, paddingBottom: 2 },
    tab: {
      paddingHorizontal: 13,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
    },
    tabSelected: { backgroundColor: theme.tint, borderColor: theme.tint },
    tabText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: theme.textSecondary,
    },
    tabTextSelected: { color: theme.onTint },
    noMatches: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: theme.gray,
      paddingVertical: 12,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    tile: {
      width: 64,
      gap: 4,
      alignItems: "center",
      paddingVertical: 8,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: "transparent",
    },
    tileSelected: {
      borderColor: theme.tint,
      backgroundColor: theme.tintLight,
    },
    disc: {
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.tintLight,
    },
    discSelected: {
      backgroundColor: theme.tint,
    },
    tileLabel: {
      fontSize: 10,
      fontFamily: "Inter_500Medium",
      color: theme.textSecondary,
      maxWidth: 60,
    },
    tileLabelSelected: {
      color: theme.tint,
      fontFamily: "Inter_600SemiBold",
    },
    check: {
      position: "absolute",
      top: 4,
      right: 6,
      width: 15,
      height: 15,
      borderRadius: 8,
      backgroundColor: theme.tint,
      alignItems: "center",
      justifyContent: "center",
    },
    pressed: { opacity: 0.7 },
  });
