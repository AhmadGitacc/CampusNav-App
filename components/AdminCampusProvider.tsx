import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Check, ChevronDown, MapPin, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

/**
 * The campus switcher: a header-sized control that opens a bottom sheet of
 * campuses. A dropdown rather than the old pill row for two reasons — a single
 * campus used to hide the picker entirely, leaving no hint which campus the CMS
 * was pointed at, and a horizontal scroll of pills does not scale past two or
 * three entries.
 */
export function CampusSwitcher({ compact }: { compact?: boolean }) {
  const { campus, campuses, setCampusSlug } = useAdminCampus();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  if (!campus) return null;

  return (
    <>
      <Pressable
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setOpen(true);
        }}
        style={({ pressed }) => [
          styles.switcher,
          compact && styles.switcherCompact,
          pressed && styles.switcherPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Campus: ${campus.name}. Switch campus`}
      >
        <View style={styles.switcherIcon}>
          <MapPin size={13} color={theme.tint} strokeWidth={2.6} />
        </View>
        <View style={styles.switcherText}>
          {!compact ? <Text style={styles.switcherLabel}>Campus</Text> : null}
          <Text style={styles.switcherName} numberOfLines={1}>
            {campus.name}
          </Text>
        </View>
        <ChevronDown size={16} color={theme.gray} strokeWidth={2.5} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={styles.switcherScrim}
          onPress={() => setOpen(false)}
          accessibilityLabel="Close"
        />
        <View style={[styles.switcherSheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.switcherSheetHeader}>
            <Text style={styles.switcherSheetTitle}>Switch campus</Text>
            <Pressable
              onPress={() => setOpen(false)}
              hitSlop={10}
              style={({ pressed }) => [styles.switcherClose, pressed && styles.switcherPressed]}
              accessibilityLabel="Close"
            >
              <X size={18} color={theme.text} strokeWidth={2.5} />
            </Pressable>
          </View>
          {campuses.map((item) => {
            const selected = item.slug === campus.slug;
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setCampusSlug(item.slug);
                  setOpen(false);
                }}
                style={({ pressed }) => [
                  styles.switcherRow,
                  selected && styles.switcherRowSelected,
                  pressed && styles.switcherPressed,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <View style={[styles.switcherRowIcon, selected && styles.switcherRowIconSelected]}>
                  <MapPin size={16} color={selected ? theme.onTint : theme.tint} strokeWidth={2.4} />
                </View>
                <View style={styles.switcherRowText}>
                  <Text
                    style={[
                      styles.switcherRowName,
                      selected && styles.switcherRowNameSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  <Text style={styles.switcherRowCaption} numberOfLines={1}>
                    {item.location}
                  </Text>
                </View>
                {selected ? (
                  <Check size={18} color={theme.tint} strokeWidth={2.8} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
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
  switcher: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  switcherCompact: {
    marginHorizontal: 0,
    marginBottom: 0,
    paddingVertical: 8,
  },
  switcherPressed: { opacity: 0.7 },
  switcherIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: theme.tintLight,
    alignItems: "center",
    justifyContent: "center",
  },
  switcherText: { flex: 1, gap: 1 },
  switcherLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: theme.gray,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  switcherName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: theme.text,
  },
  switcherScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.scrim,
  },
  switcherSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  switcherSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 6,
  },
  switcherSheetTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: theme.text,
  },
  switcherClose: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: theme.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  switcherRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
  },
  switcherRowSelected: {
    backgroundColor: theme.tintLight,
  },
  switcherRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: theme.tintLight,
    alignItems: "center",
    justifyContent: "center",
  },
  switcherRowIconSelected: {
    backgroundColor: theme.tint,
  },
  switcherRowText: { flex: 1, gap: 1 },
  switcherRowName: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: theme.text,
  },
  switcherRowNameSelected: {
    color: theme.tint,
    fontFamily: "Inter_600SemiBold",
  },
  switcherRowCaption: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: theme.gray,
  },
});
