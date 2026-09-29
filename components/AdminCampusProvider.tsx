import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ChevronDown } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/components/ThemeProvider";
import type { Theme } from "@/constants/colors";
import { useCampuses } from "@/lib/api/campuses";
import type { Campus } from "@shared/types";

/**
 * Which campus the admin tools are pointed at (Feature 10 §7.4).
 *
 * Every CMS screen — buildings, import, and the per-campus dashboard tiles —
 * works on one campus at a time, and the import deliberately has no campus column
 * (see `lib/import/csv.ts`), so the target has to be chosen once and remembered
 * for the session. A context in the admin layout beats a query parameter here:
 * it survives navigating between admin screens without every link having to
 * thread `campus` through, and it keeps the choice off the public URL.
 */

interface AdminCampusValue {
  campus: Campus | undefined;
  campuses: Campus[];
  campusSlug: string | undefined;
  setCampusSlug: (slug: string) => void;
  loading: boolean;
}

const AdminCampusContext = createContext<AdminCampusValue | null>(null);

export function useAdminCampus(): AdminCampusValue {
  const value = useContext(AdminCampusContext);
  if (!value) {
    throw new Error("useAdminCampus must be used inside <AdminCampusProvider>");
  }
  return value;
}

export function AdminCampusProvider({ children }: { children: React.ReactNode }) {
  const { data: campuses, isLoading } = useCampuses();
  const [campusSlug, setCampusSlugState] = useState<string | undefined>(undefined);

  // Default to the first campus once the list arrives, and keep the selection
  // valid if a campus is removed underneath us.
  useEffect(() => {
    if (!campuses || campuses.length === 0) return;
    const stillExists = campuses.some((campus) => campus.slug === campusSlug);
    if (!stillExists) setCampusSlugState(campuses[0].slug);
  }, [campuses, campusSlug]);

  const value = useMemo<AdminCampusValue>(
    () => ({
      campus: campuses?.find((item) => item.slug === campusSlug),
      campuses: campuses ?? [],
      campusSlug,
      setCampusSlug: setCampusSlugState,
      loading: isLoading,
    }),
    [campuses, campusSlug, isLoading]
  );

  return (
    <AdminCampusContext.Provider value={value}>
      {children}
    </AdminCampusContext.Provider>
  );
}

/** Horizontal campus switcher shown under the admin header. */
export function CampusPicker() {
  const { campuses, campusSlug, setCampusSlug } = useAdminCampus();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  if (campuses.length <= 1) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.picker}
    >
      {campuses.map((campus) => {
        const selected = campus.slug === campusSlug;
        return (
          <Pressable
            key={campus.id}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setCampusSlug(campus.slug);
            }}
            style={({ pressed }) => [
              styles.pill,
              selected && styles.pillSelected,
              pressed && styles.pillPressed,
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
              {campus.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Single-campus variant for screens where a picker would be noise. */
export function CampusName() {
  const { campus } = useAdminCampus();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  if (!campus) return null;
  return (
    <View style={styles.nameRow}>
      <ChevronDown size={14} color={theme.gray} strokeWidth={2.5} />
      <Text style={styles.name}>{campus.name}</Text>
    </View>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  picker: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
  },
  pillSelected: {
    backgroundColor: theme.tint,
    borderColor: theme.tint,
  },
  pillPressed: {
    opacity: 0.7,
  },
  pillText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: theme.textSecondary,
  },
  pillTextSelected: {
    color: theme.onTint,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  name: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: theme.gray,
  },
});
