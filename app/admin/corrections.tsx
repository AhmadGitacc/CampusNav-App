import React, { useCallback, useState, useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
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
  CORRECTION_REASON_LABELS,
  coerceCorrectionValue,
  currentFieldValue,
} from "@/lib/import/correction-values";
import type { CorrectionStatus } from "@shared/schema";

/**
 * Correction moderation queue (Feature 10 §7.6).
 *
 * Each card shows the current value next to the proposed one, because the whole
 * job is judging whether the report is right — a proposal without the value it
 * replaces is just an assertion. Marking a report reviewed writes the new value
 * onto the building first and only then marks the report decided, so a failed
 * write leaves the report pending and retryable rather than silently dropped.
 *
 * The confirmation is an in-app sheet, not `Alert.alert`: react-native-web
 * implements `Alert` as a no-op, which is why the old Approve button appeared
 * to do nothing on web. The sheet also spells out the diff on every platform.
 */

const TABS: { status: CorrectionStatus; label: string }[] = [
  { status: "pending", label: "To review" },
  { status: "approved", label: "Reviewed" },
  { status: "rejected", label: "Rejected" },
];

export default function AdminCorrectionsScreen() {
  const insets = useSafeAreaInsets();
  const { theme, statusBarStyle } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [tab, setTab] = useState<CorrectionStatus>("pending");
  const { data: corrections, isLoading, isError } = useCorrections(tab);
  const moderate = useModerateCorrection();

  const [confirming, setConfirming] = useState<CorrectionItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const goBack = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/admin");
    }
  }, []);

  const run = useCallback(
    async (correction: CorrectionItem, decision: "approved" | "rejected") => {
      setConfirming(null);
      try {
        await moderate.mutateAsync({ correction, decision });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (error) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setActionError(
          decision === "approved"
            ? `Couldn't mark as reviewed — ${error instanceof Error ? error.message : "please try again."}`
            : `Couldn't reject — ${error instanceof Error ? error.message : "please try again."}`
        );
      }
    },
    [moderate]
  );

  const renderItem = useCallback(
    ({ item }: { item: CorrectionItem }) => {
      const building = item.building;
      const coerced = item.field ? coerceCorrectionValue(item.field, item.newValue) : null;
      const invalid = coerced !== null && !coerced.ok;
      const decided = item.status !== "pending";
      // A note-only report ("Something else") has no field and no diff.
      const noteOnly = item.field === null;

      return (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.building} numberOfLines={1}>
              {building?.name ?? "Deleted building"}
            </Text>
            <Text style={styles.field}>
              {noteOnly
                ? CORRECTION_REASON_LABELS[item.reason ?? "other"]
                : CORRECTION_FIELD_LABELS[item.field!]}
            </Text>
          </View>

          {!noteOnly ? (
            <View style={styles.diff}>
              <View style={styles.diffCell}>
                <Text style={styles.diffLabel}>Now</Text>
                <Text style={styles.diffValue} numberOfLines={2}>
                  {building
                    ? currentFieldValue(building, item.field!) || "—"
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
          ) : (
            <View style={styles.diff}>
              <View style={styles.diffCell}>
                <Text style={styles.diffValue} numberOfLines={3}>
                  {item.note || "(no detail given)"}
                </Text>
              </View>
            </View>
          )}

          {invalid ? (
            <Text style={styles.problem}>
              Can&apos;t be applied as written — {coerced!.reason}.
            </Text>
          ) : null}

          {item.note && !noteOnly ? (
            <Text style={styles.note}>“{item.note}”</Text>
          ) : null}

          {item.reason && !noteOnly ? (
            <Text style={styles.meta}>
              Reason: {CORRECTION_REASON_LABELS[item.reason]}
            </Text>
          ) : null}

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
                {item.status === "approved" ? "Reviewed" : "Rejected"}
              </Text>
            </View>
          ) : (
            <View style={styles.actions}>
              <Pressable
                onPress={() => void run(item, "rejected")}
                disabled={moderate.isPending}
                style={({ pressed }) => [
                  styles.reject,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Reject the ${(
                  item.field
                    ? CORRECTION_FIELD_LABELS[item.field]
                    : CORRECTION_REASON_LABELS[item.reason ?? "other"]
                ).toLowerCase()} report`}
              >
                <X size={16} color={theme.danger} strokeWidth={2.6} />
                <Text style={styles.rejectText}>Reject</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setConfirming(item);
                }}
                disabled={moderate.isPending || invalid || building === null}
                style={({ pressed }) => [
                  styles.approve,
                  (moderate.isPending || invalid || building === null) &&
                    styles.approveDisabled,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Mark the ${(
                  item.field
                    ? CORRECTION_FIELD_LABELS[item.field]
                    : CORRECTION_REASON_LABELS[item.reason ?? "other"]
                ).toLowerCase()} report as reviewed`}
              >
                <Check size={16} color={theme.onTint} strokeWidth={2.8} />
                <Text style={styles.approveText}>Reviewed</Text>
              </Pressable>
            </View>
          )}
        </View>
      );
    },
    [moderate.isPending, run, styles, theme]
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
                setActionError(null);
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

      {actionError ? (
        <Pressable
          onPress={() => setActionError(null)}
          style={styles.errorBanner}
          accessibilityRole="alert"
        >
          <Text style={styles.errorBannerText}>{actionError}</Text>
        </Pressable>
      ) : null}

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

      <ConfirmSheet
        item={confirming}
        onConfirm={() => {
          if (confirming) void run(confirming, "approved");
        }}
        onClose={() => setConfirming(null)}
        styles={styles}
        theme={theme}
        busy={moderate.isPending}
      />
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

/**
 * In-app replacement for the old `Alert.alert` confirmation. Web never
 * rendered the alert, so the approve button looked broken there; this sheet
 * works everywhere and shows the exact replacement value.
 */
function ConfirmSheet({
  item,
  onConfirm,
  onClose,
  styles,
  theme,
  busy,
}: {
  item: CorrectionItem | null;
  onConfirm: () => void;
  onClose: () => void;
  styles: ReturnType<typeof makeStyles>;
  theme: Theme;
  busy: boolean;
}) {
  const insets = useSafeAreaInsets();
  if (!item) return null;

  const preview = item.field
    ? `${item.building
        ? currentFieldValue(item.building, item.field) || "(empty)"
        : "(empty)"}  →  ${item.newValue || "(empty)"}`
    : item.note || "(no detail given)";

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.sheetScrim} onPress={onClose} accessibilityLabel="Cancel" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.sheetTitle}>
          Mark as reviewed — {item.building?.name ?? "the building"}?
        </Text>
        <Text style={styles.sheetSubtitle}>
          {item.field
            ? `${CORRECTION_FIELD_LABELS[item.field]}: ${preview}`
            : `“${preview}”`}
        </Text>
        <Text style={styles.sheetHint}>
          {item.field
            ? "The proposed value is applied to the building students see."
            : "There is no value to apply — this only records your decision on the note."}
        </Text>
        <View style={styles.sheetActions}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.sheetCancel, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={styles.sheetCancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            disabled={busy}
            style={({ pressed }) => [
              styles.sheetConfirm,
              busy && styles.approveDisabled,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
          >
            <Check size={16} color={theme.onTint} strokeWidth={2.8} />
            <Text style={styles.sheetConfirmText}>Reviewed</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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
  errorBanner: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: theme.tintLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.danger,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  errorBannerText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: theme.danger,
    lineHeight: 18,
  },
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
  sheetScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.scrim,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
    gap: 8,
  },
  sheetTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: theme.text,
  },
  sheetSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: theme.textSecondary,
    lineHeight: 20,
  },
  sheetHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: theme.gray,
    lineHeight: 17,
  },
  sheetActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  sheetCancel: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  sheetCancelText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: theme.text,
  },
  sheetConfirm: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: theme.tint,
  },
  sheetConfirmText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: theme.onTint,
  },
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
