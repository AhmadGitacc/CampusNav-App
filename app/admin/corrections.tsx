import React, { useCallback, useState, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { ArrowLeft, Check, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/components/ThemeProvider";
import type { Theme } from "@/constants/colors";
import {
  useCorrections,
  useModerateCorrection,
  type CorrectionItem,
} from "@/lib/api/corrections";
import {
  CORRECTION_FIELD_LABELS,
  coerceCorrectionValue,
  currentFieldValue,
} from "@/lib/import/correction-values";
import type { CorrectionStatus } from "@shared/schema";

/**
 * Correction moderation queue (Feature 10 §7.6).
 *
 * Each card shows the current value next to the proposed one, because the whole
 * job is judging whether the report is right — a proposal without the value it
 * replaces is just an assertion. Approving writes the new value onto the
 * building first and only then marks the report decided, so a failed write
 * leaves the report pending and retryable rather than silently dropped.
 */

const TABS: { status: CorrectionStatus; label: string }[] = [
  { status: "pending", label: "To review" },
  { status: "approved", label: "Approved" },
  { status: "rejected", label: "Rejected" },
];

export default function AdminCorrectionsScreen() {
  const insets = useSafeAreaInsets();
  const { theme, statusBarStyle } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [tab, setTab] = useState<CorrectionStatus>("pending");
  const { data: corrections, isLoading, isError } = useCorrections(tab);
  const moderate = useModerateCorrection();

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const goBack = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/admin");
    }
  }, []);

  const decide = useCallback(
    (correction: CorrectionItem, decision: "approved" | "rejected") => {
      const run = async () => {
        try {
          await moderate.mutateAsync({ correction, decision });
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (error) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert(
            decision === "approved" ? "Couldn't approve" : "Couldn't reject",
            error instanceof Error ? error.message : "Please try again."
          );
        }
      };

      if (decision === "rejected") {
        void run();
        return;
      }
      // Approving edits a building that students can see right now, so it gets
      // a confirmation. The value is spelled out so the admin approves the
      // specific replacement, not just the idea of one.
      const preview = correction.building
        ? `${currentFieldValue(correction.building, correction.field)}  →  ${
            correction.newValue || "(empty)"
          }`
        : correction.newValue;
      Alert.alert(
        `Apply this correction to ${correction.building?.name ?? "the building"}?`,
        `${CORRECTION_FIELD_LABELS[correction.field]}: ${preview}`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Approve", onPress: () => void run() },
        ]
      );
    },
    [moderate]
  );

  const renderItem = useCallback(
    ({ item }: { item: CorrectionItem }) => {
      const building = item.building;
      const coerced = coerceCorrectionValue(item.field, item.newValue);
      const invalid = !coerced.ok;
      const decided = item.status !== "pending";

      return (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.building} numberOfLines={1}>
              {building?.name ?? "Deleted building"}
            </Text>
            <Text style={styles.field}>
              {CORRECTION_FIELD_LABELS[item.field]}
            </Text>
          </View>

          <View style={styles.diff}>
            <View style={styles.diffCell}>
              <Text style={styles.diffLabel}>Now</Text>
              <Text style={styles.diffValue} numberOfLines={2}>
                {building
                  ? currentFieldValue(building, item.field) || "—"
                  : "—"}
              </Text>
            </View>
            <Text style={styles.arrow}>→</Text>
            <View style={styles.diffCell}>
              <Text style={styles.diffLabel}>Proposed</Text>
              <Text style={styles.diffValueNew} numberOfLines={2}>
                {item.newValue || "(empty)"}
              </Text>
            </View>
          </View>

          {invalid ? (
            <Text style={styles.problem}>
              Can&apos;t be applied as written — {coerced.reason}.
            </Text>
          ) : null}

          {item.note ? <Text style={styles.note}>“{item.note}”</Text> : null}

          <Text style={styles.meta}>
            {item.userId ? `Signed in · ${item.userId.slice(0, 8)}` : "Guest"} ·{" "}
            {formatWhen(item.createdAt)}
          </Text>

          {item.reviewNote ? (
            <Text style={styles.meta}>Note: {item.reviewNote}</Text>
          ) : null}

          {decided ? (
            <View
              style={[
                styles.decided,
                item.status === "approved"
                  ? styles.decidedApproved
                  : styles.decidedRejected,
              ]}
            >
              <Text
                style={[
                  styles.decidedText,
                  item.status === "approved"
                    ? styles.decidedTextApproved
                    : styles.decidedTextRejected,
                ]}
              >
                {item.status === "approved" ? "Approved" : "Rejected"}
              </Text>
            </View>
          ) : (
            <View style={styles.actions}>
              <Pressable
                onPress={() => decide(item, "rejected")}
                disabled={moderate.isPending}
                style={({ pressed }) => [
                  styles.reject,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Reject the ${CORRECTION_FIELD_LABELS[item.field].toLowerCase()} correction`}
              >
                <X size={16} color={theme.danger} strokeWidth={2.6} />
                <Text style={styles.rejectText}>Reject</Text>
              </Pressable>
              <Pressable
                onPress={() => decide(item, "approved")}
                disabled={moderate.isPending || invalid || building === null}
                style={({ pressed }) => [
                  styles.approve,
                  (moderate.isPending || invalid || building === null) &&
                    styles.approveDisabled,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Approve the ${CORRECTION_FIELD_LABELS[item.field].toLowerCase()} correction`}
              >
                <Check size={16} color={theme.onTint} strokeWidth={2.8} />
                <Text style={styles.approveText}>Approve</Text>
              </Pressable>
            </View>
          )}
        </View>
      );
    },
    [decide, moderate.isPending, styles, theme]
  );

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
        <Text style={styles.title}>Corrections</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.tabs}>
        {TABS.map((item) => {
          const selected = item.status === tab;
          return (
            <Pressable
              key={item.status}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setTab(item.status);
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
        })}
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color={theme.tint} />
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Couldn&apos;t load the queue</Text>
          <Text style={styles.emptyText}>
            If you were just granted admin, sign out and back in so the new token
            is issued.
          </Text>
        </View>
      ) : (
        <FlatList
          data={corrections ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 24 },
          ]}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {tab === "pending" ? "Nothing to review" : `No ${tab} reports`}
              </Text>
              <Text style={styles.emptyText}>
                {tab === "pending"
                  ? "Corrections people report from the map will land here."
                  : "Reports you decide will be listed here."}
              </Text>
            </View>
          }
        />
      )}
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
  tabs: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
  },
  tabSelected: { backgroundColor: theme.tint, borderColor: theme.tint },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.textSecondary },
  tabTextSelected: { color: theme.onTint },
  list: { paddingHorizontal: 16, gap: 12 },
  card: {
    backgroundColor: theme.card,
    borderRadius: 18,
    padding: 16,
    gap: 8,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  building: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: theme.text,
  },
  field: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: theme.tint,
    backgroundColor: theme.tintLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  diff: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 12,
    padding: 12,
  },
  diffCell: { flex: 1, gap: 3 },
  diffLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: theme.gray,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  diffValue: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: theme.textSecondary,
  },
  diffValueNew: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: theme.tint,
  },
  arrow: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: theme.gray,
  },
  problem: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: theme.danger,
    lineHeight: 18,
  },
  note: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: theme.text,
    fontStyle: "italic",
    lineHeight: 20,
  },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular", color: theme.gray },
  actions: { flexDirection: "row", gap: 10, marginTop: 4 },
  reject: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  rejectText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: theme.danger },
  approve: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: theme.tint,
  },
  approveDisabled: { opacity: 0.4 },
  approveText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: theme.onTint },
  decided: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    marginTop: 4,
  },
  decidedApproved: { backgroundColor: theme.tintLight },
  decidedRejected: { backgroundColor: theme.separator },
  decidedText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  decidedTextApproved: { color: theme.tint },
  decidedTextRejected: { color: theme.gray },
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
