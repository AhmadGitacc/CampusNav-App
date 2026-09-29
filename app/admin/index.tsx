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
  FileUp,
  History,
  MessageSquareWarning,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/components/ThemeProvider";
import type { Theme } from "@/constants/colors";
import { useAdminAudit, useAdminStats } from "@/lib/api/admin";
import { CampusPicker, useAdminCampus } from "@/components/AdminCampusProvider";

/**
 * Admin dashboard (Feature 10 §7.4).
 *
 * Four things and nothing else: the numbers that say whether the campus is in
 * good shape, the three places work actually happens, and the audit trail so a
 * second admin can see who changed what without asking.
 */

export default function AdminDashboardScreen() {
  const insets = useSafeAreaInsets();
  const { theme, statusBarStyle } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { campus } = useAdminCampus();
  const stats = useAdminStats(campus?.slug);
  const audit = useAdminAudit(8);

  const goBack = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  }, []);

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
        <Text style={styles.title}>Content</Text>
        <View style={styles.headerSpacer} />
      </View>

      <CampusPicker />

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
          <View style={styles.tiles}>
            <Tile
              label="Published"
              value={stats.data?.buildings}
              loading={stats.isLoading}
              styles={styles}
            />
            <Tile
              label="Unpublished"
              value={stats.data?.unpublished}
              loading={stats.isLoading}
              styles={styles}
            />
            <Tile
              label="Reports to review"
              value={stats.data?.pendingCorrections}
              loading={stats.isLoading}
              highlight={(stats.data?.pendingCorrections ?? 0) > 0}
              styles={styles}
            />
          </View>
        )}

        <ActionRow
          icon={<Building2 size={20} color={theme.tint} strokeWidth={2.2} />}
          title="Buildings"
          caption="Add, edit, publish and unpublish"
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/admin/buildings");
          }}
          styles={styles}
        />
        <ActionRow
          icon={
            <MessageSquareWarning
              size={20}
              color={theme.tint}
              strokeWidth={2.2}
            />
          }
          title="Corrections"
          caption="Approve or reject what people reported"
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
          (audit.data ?? []).map((entry) => (
            <View key={entry.id} style={styles.auditRow}>
              <Text style={styles.auditAction}>{entry.action}</Text>
              <Text style={styles.auditMeta}>
                {entry.actorId ? entry.actorId.slice(0, 8) : "system"} ·{" "}
                {formatWhen(entry.createdAt)}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "just now";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Tile({
  label,
  value,
  loading,
  highlight,
  styles,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
  highlight?: boolean;
  // The parent already built these for the active theme; rebuilding them here
  // would mean a third StyleSheet per tile, and a tile that lagged a theme
  // switch by a render.
  styles: DashboardStyles;
}) {
  return (
    <View style={[styles.tile, highlight && styles.tileHighlight]}>
      <Text style={[styles.tileValue, highlight && styles.tileValueHighlight]}>
        {loading ? "—" : (value ?? 0)}
      </Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

function ActionRow({
  icon,
  title,
  caption,
  onPress,
  styles,
}: {
  icon: React.ReactNode;
  title: string;
  caption: string;
  onPress: () => void;
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
  tiles: {
    flexDirection: "row",
    gap: 12,
  },
  tile: {
    flex: 1,
    backgroundColor: theme.card,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 2,
  },
  tileHighlight: {
    backgroundColor: theme.tintLight,
  },
  tileValue: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: theme.text,
  },
  tileValueHighlight: {
    color: theme.tint,
  },
  tileLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: theme.textSecondary,
    textAlign: "center",
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: theme.card,
    borderRadius: 18,
    padding: 14,
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
  auditRow: {
    backgroundColor: theme.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
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
