import React, { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  FileUp,
  History,
  MessageSquareWarning,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/components/ThemeProvider";
import type { Theme } from "@/constants/colors";
import { useAdminAudit, useAdminBuildings, useAdminStats } from "@/lib/api/admin";
import { CampusSwitcher, useAdminCampus } from "@/components/AdminCampusProvider";
import { buildingCategories } from "@shared/schema";
import type { BuildingCategory } from "@shared/types";

/**
 * Admin dashboard (Feature 10 §7.4).
 *
 * Shaped as: the numbers that say whether the campus is in good shape (2×2
 * stat grid with progress bars, the totals card solid so the grid has an
 * anchor), what the campus is made of (category distribution), the three
 * places work actually happens, and the audit trail so a second admin can see
 * who changed what without asking. Every figure comes from a real query —
 * there are no decorative charts here.
 */

const CATEGORY_LABELS: Record<BuildingCategory, string> = {
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

export default function AdminDashboardScreen() {
  const insets = useSafeAreaInsets();
  const { theme, statusBarStyle } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { campus } = useAdminCampus();
  const stats = useAdminStats(campus?.slug);
  const buildings = useAdminBuildings(campus?.slug);
  const audit = useAdminAudit(8);

  const goBack = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  }, []);

  const total = (stats.data?.buildings ?? 0) + (stats.data?.unpublished ?? 0);
  const published = stats.data?.buildings ?? 0;
  const unpublished = stats.data?.unpublished ?? 0;
  const pending = stats.data?.pendingCorrections ?? 0;
  const entrances = stats.data?.entrances ?? 0;
  const exits = stats.data?.exits ?? 0;
  const stepFreeEntrances = stats.data?.stepFreeEntrances ?? 0;
  const ratio = (value: number) => (total > 0 ? Math.min(value / total, 1) : 0);

  const categoryCounts = useMemo(() => {
    const counts = new Map<BuildingCategory, number>();
    for (const building of buildings.data ?? []) {
      if (building.deletedAt !== null) continue;
      counts.set(building.category, (counts.get(building.category) ?? 0) + 1);
    }
    return buildingCategories
      .map((category) => ({ category, count: counts.get(category) ?? 0 }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [buildings.data]);

  const categoryMax = categoryCounts[0]?.count ?? 1;

  return (
    <View style={styles.container}>
      <StatusBar barStyle={statusBarStyle} />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable
          onPress={goBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          accessibilityLabel="Back"
        >
          <ArrowLeft size={22} color={theme.text} strokeWidth={2.5} />
        </Pressable>
        <Text style={styles.title}>Dashboard</Text>
        <View style={styles.headerSpacer} />
      </View>

      <CampusSwitcher />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      >
        {stats.isError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Couldn&apos;t load the dashboard</Text>
            <Text style={styles.errorText}>
              The database refused the read. If you were just granted admin, sign
              out and back in so the new token is issued.
            </Text>
          </View>
        ) : (
          <View style={styles.grid}>
            <StatCard
              label="Buildings"
              value={total}
              caption="Total places on this campus"
              progress={ratio(published)}
              loading={stats.isLoading}
              solid
              styles={styles}
            />
            <StatCard
              label="Entrances & exits"
              value={entrances}
              caption={
                entrances > 0
                  ? `${exits} exit${exits === 1 ? "" : "s"} · ${stepFreeEntrances} step-free`
                  : "None surveyed yet"
              }
              // The bar is the accessible share of surveyed doors — the number
              // a router can actually promise step-free routes to.
              progress={entrances > 0 ? stepFreeEntrances / entrances : 0}
              loading={stats.isLoading}
              styles={styles}
            />
            <StatCard
              label="Unpublished"
              value={unpublished}
              caption="Hidden from students"
              progress={ratio(unpublished)}
              loading={stats.isLoading}
              styles={styles}
            />
            <StatCard
              label="Reports to review"
              value={pending}
              caption={pending > 0 ? "Waiting on you" : "Queue is clear"}
              progress={total > 0 ? Math.min(pending / Math.max(total, 1), 1) : 0}
              loading={stats.isLoading}
              highlight={pending > 0}
              styles={styles}
            />
          </View>
        )}

        {categoryCounts.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Campus makeup</Text>
            <View style={styles.sectionCard}>
              {categoryCounts.map((row, index) => (
                <View
                  key={row.category}
                  style={[
                    styles.makeupRow,
                    index === categoryCounts.length - 1 && styles.makeupRowLast,
                  ]}
                >
                  <Text style={styles.makeupLabel}>
                    {CATEGORY_LABELS[row.category]}
                  </Text>
                  <View style={styles.makeupTrack}>
                    <View
                      style={[
                        styles.makeupFill,
                        { width: `${Math.max((row.count / categoryMax) * 100, 6)}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.makeupCount}>{row.count}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        <Text style={styles.sectionTitle}>Manage</Text>
        <ActionRow
          icon={<Building2 size={20} color={theme.tint} strokeWidth={2.2} />}
          title="Buildings"
          caption="Add, edit, publish and unpublish"
          badge={total > 0 ? String(total) : null}
          chevronColor={theme.gray}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/admin/buildings");
          }}
          styles={styles}
        />
        <ActionRow
          icon={
            <MessageSquareWarning size={20} color={theme.tint} strokeWidth={2.2} />
          }
          title="Corrections"
          caption="Review what people reported"
          badge={pending > 0 ? String(pending) : null}
          badgeAttention={pending > 0}
          chevronColor={theme.gray}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/admin/corrections");
          }}
          styles={styles}
        />
        <ActionRow
          icon={<FileUp size={20} color={theme.tint} strokeWidth={2.2} />}
          title="Import"
          caption="Bulk add from CSV or GeoJSON"
          chevronColor={theme.gray}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/admin/import");
          }}
          styles={styles}
        />

        <View style={styles.auditHeader}>
          <History size={16} color={theme.gray} strokeWidth={2.2} />
          <Text style={styles.auditTitle}>Recent changes</Text>
        </View>

        {audit.isLoading ? (
          <ActivityIndicator size="small" color={theme.tint} />
        ) : audit.isError ? (
          <Text style={styles.emptyAudit}>The audit log isn&apos;t available yet.</Text>
        ) : (audit.data ?? []).length === 0 ? (
          <Text style={styles.emptyAudit}>No changes recorded yet.</Text>
        ) : (
          <View style={styles.auditCard}>
            {(audit.data ?? []).map((entry, index, all) => (
              <View
                key={entry.id}
                style={[
                  styles.auditRow,
                  index === all.length - 1 && styles.auditRowLast,
                ]}
              >
                <View style={styles.auditAvatar}>
                  <Text style={styles.auditAvatarText}>
                    {initialsFor(entry.actorId, entry.action)}
                  </Text>
                </View>
                <View style={styles.auditText}>
                  <Text style={styles.auditAction} numberOfLines={1}>
                    {describeAction(entry.action, entry.entity)}
                  </Text>
                  <Text style={styles.auditMeta}>
                    {entry.actorId ? `admin · ${entry.actorId.slice(0, 8)}` : "system"} ·{" "}
                    {formatWhen(entry.createdAt)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "just now";
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes >= 1 && minutes < 60) return `${minutes} min ago`;
  if (minutes < 1) return "just now";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "buildings.insert" → "Building added"; unknown verbs degrade to the raw row. */
function describeAction(action: string, entity: string): string {
  const verb = action.includes("delete")
    ? "removed"
    : action.includes("update")
      ? "edited"
      : "added";
  const label = entity === "buildings" ? "Building" : entity;
  return `${label} ${verb}`;
}

/** Actor initials for the avatar; system entries get a dot-and-glyph stand-in. */
function initialsFor(actorId: string | null, action: string): string {
  if (!actorId) return action.includes("delete") ? "–" : "·";
  return actorId.slice(0, 2).toUpperCase();
}

function StatCard({
  label,
  value,
  caption,
  progress,
  loading,
  highlight,
  solid,
  styles,
}: {
  label: string;
  value: number;
  caption: string;
  progress: number;
  loading: boolean;
  highlight?: boolean;
  solid?: boolean;
  styles: DashboardStyles;
}) {
  return (
    <View
      style={[
        styles.statCard,
        solid && styles.statCardSolid,
        highlight && !solid && styles.statCardHighlight,
      ]}
    >
      <Text style={[styles.statValue, solid && styles.statValueSolid]}>
        {loading ? "—" : value}
      </Text>
      <Text style={[styles.statLabel, solid && styles.statLabelSolid]}>{label}</Text>
      <View style={[styles.statTrack, solid && styles.statTrackSolid]}>
        <View
          style={[
            styles.statFill,
            solid && styles.statFillSolid,
            { width: `${Math.round((loading ? 0 : progress) * 100)}%` },
          ]}
        />
      </View>
      <Text style={[styles.statCaption, solid && styles.statCaptionSolid]}>
        {loading ? "Loading…" : caption}
      </Text>
    </View>
  );
}

function ActionRow({
  icon,
  title,
  caption,
  badge,
  badgeAttention,
  onPress,
  chevronColor,
  styles,
}: {
  icon: React.ReactNode;
  title: string;
  caption: string;
  badge?: string | null;
  badgeAttention?: boolean;
  onPress: () => void;
  chevronColor: string;
  styles: DashboardStyles;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
      accessibilityRole="button"
    >
      <View style={styles.actionIcon}>{icon}</View>
      <View style={styles.actionText}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionCaption}>{caption}</Text>
      </View>
      {badge ? (
        <View
          style={[styles.actionBadge, badgeAttention && styles.actionBadgeAttention]}
        >
          <Text
            style={[
              styles.actionBadgeText,
              badgeAttention && styles.actionBadgeTextAttention,
            ]}
          >
            {badge}
          </Text>
        </View>
      ) : null}
      <ChevronRight size={18} color={chevronColor} strokeWidth={2.4} />
    </Pressable>
  );
}

type DashboardStyles = ReturnType<typeof makeStyles>;

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
  pressed: {
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
  content: {
    paddingHorizontal: 16,
    gap: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  statCard: {
    flexGrow: 1,
    flexBasis: "47%",
    backgroundColor: theme.card,
    borderRadius: 20,
    padding: 16,
    gap: 3,
    borderWidth: 1,
    borderColor: theme.border,
  },
  statCardSolid: {
    backgroundColor: theme.tint,
    borderColor: theme.tint,
  },
  statCardHighlight: {
    backgroundColor: theme.tintLight,
    borderColor: theme.tint,
  },
  statValue: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: theme.text,
  },
  statValueSolid: {
    color: theme.onTint,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statLabelSolid: {
    color: "rgba(255, 255, 255, 0.75)",
  },
  statTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.backgroundSecondary,
    marginTop: 6,
    overflow: "hidden",
  },
  statTrackSolid: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  statFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: theme.tint,
  },
  statFillSolid: {
    backgroundColor: theme.onTint,
  },
  statCaption: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: theme.gray,
    marginTop: 2,
  },
  statCaptionSolid: {
    color: "rgba(255, 255, 255, 0.7)",
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 8,
  },
  sectionCard: {
    backgroundColor: theme.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 14,
  },
  makeupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: theme.separator,
  },
  makeupRowLast: {
    borderBottomWidth: 0,
  },
  makeupLabel: {
    width: 76,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: theme.text,
  },
  makeupTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.backgroundSecondary,
    overflow: "hidden",
  },
  makeupFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: theme.tint,
  },
  makeupCount: {
    width: 28,
    textAlign: "right",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: theme.textSecondary,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: theme.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  actionPressed: {
    backgroundColor: theme.surfacePressed,
  },
  actionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: theme.tintLight,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    flex: 1,
    gap: 2,
  },
  actionTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: theme.text,
  },
  actionCaption: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: theme.gray,
  },
  actionBadge: {
    minWidth: 26,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: theme.backgroundSecondary,
    alignItems: "center",
  },
  actionBadgeAttention: {
    backgroundColor: theme.tint,
  },
  actionBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: theme.textSecondary,
  },
  actionBadgeTextAttention: {
    color: theme.onTint,
  },
  auditHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
  },
  auditTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  auditCard: {
    backgroundColor: theme.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 14,
  },
  auditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: theme.separator,
  },
  auditRowLast: {
    borderBottomWidth: 0,
  },
  auditAvatar: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: theme.tintLight,
    alignItems: "center",
    justifyContent: "center",
  },
  auditAvatarText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: theme.tint,
  },
  auditText: {
    flex: 1,
    gap: 2,
  },
  auditAction: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: theme.text,
  },
  auditMeta: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: theme.gray,
  },
  emptyAudit: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: theme.gray,
  },
  errorCard: {
    backgroundColor: theme.card,
    borderRadius: 18,
    padding: 16,
    gap: 4,
  },
  errorTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: theme.text,
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: theme.gray,
    lineHeight: 19,
  },
});
