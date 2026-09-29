import React, { useCallback, useState, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { ArrowLeft, FileUp, TriangleAlert } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/components/ThemeProvider";
import type { Theme } from "@/constants/colors";
import { useImportBuildings } from "@/lib/api/admin";
import { useAdminCampus } from "@/components/AdminCampusProvider";
import { parseBuildingsCsv, type ImportIssue } from "@/lib/import/csv";
import { parseBuildingsGeoJson } from "@/lib/import/geojson";
import type { ImportBuilding } from "@shared/schema";

/**
 * Bulk import from CSV or GeoJSON (Feature 10 §7.5).
 *
 * Three steps on one screen — pick a format, paste or load the file, review what
 * parsed, then commit. The review step is not optional: a mis-parsed coordinate
 * is invisible on a list and catastrophic on a map, and a 500-row sheet with three
 * broken lines should import the other 497 rather than fail outright. Both
 * parsers report per-row problems with the source line so a human can fix them.
 *
 * The text box is the primary input on every platform. A file picker is a
 * dependency and a second way to get a file the parse can't explain; paste and
 * drag a `.csv` in works in the same place.
 */

type Format = "csv" | "geojson";

export default function AdminImportScreen() {
  const insets = useSafeAreaInsets();
  const { theme, statusBarStyle } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { campus } = useAdminCampus();
  const importBuildings = useImportBuildings();

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const [format, setFormat] = useState<Format>("csv");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ImportBuilding[] | null>(null);
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [committed, setCommitted] = useState(false);

  const goBack = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/admin");
    }
  }, []);

  const review = useCallback(() => {
    if (!text.trim()) {
      Alert.alert("Nothing to import", "Paste the file contents first.");
      return;
    }
    const result = format === "csv" ? parseBuildingsCsv(text) : parseBuildingsGeoJson(text);
    setRows(result.rows);
    setIssues(result.issues);
    setCommitted(false);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [format, text]);

  const changeFormat = useCallback((next: Format) => {
    setFormat(next);
    // A parse result from the other format is meaningless, and rows carry a
    // campus from the previous review.
    setRows(null);
    setIssues([]);
    setCommitted(false);
  }, []);

  const commit = useCallback(() => {
    if (!rows || rows.length === 0 || !campus) return;
    const target = campus.name;
    const run = async () => {
      try {
        const count = await importBuildings.mutateAsync({ campusId: campus.id, rows });
        setCommitted(true);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          `Imported ${count} building${count === 1 ? "" : "s"}`,
          `They're live on the map for ${target}.`,
          [{ text: "Done", onPress: () => router.replace("/admin/buildings") }]
        );
      } catch (error) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(
          "Import failed",
          error instanceof Error ? error.message : "Please try again."
        );
      }
    };

    Alert.alert(
      `Import ${rows.length} building${rows.length === 1 ? "" : "s"} into ${target}?`,
      issues.length > 0
        ? `${issues.length} row${issues.length === 1 ? "" : "s"} will be skipped.`
        : "Every row in the file will be added.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Import", onPress: () => void run() },
      ]
    );
  }, [campus, importBuildings, issues.length, rows]);

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
        <Text style={styles.title}>Import</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.target}>
        <Text style={styles.targetLabel}>Target campus</Text>
        <Text style={styles.targetValue}>{campus?.name ?? "No campus selected"}</Text>
      </View>

      <View style={styles.tabs}>
        {(["csv", "geojson"] as const).map((option) => {
          const selected = option === format;
          return (
            <Pressable
              key={option}
              onPress={() => changeFormat(option)}
              style={({ pressed }) => [
                styles.tab,
                selected && styles.tabSelected,
                pressed && styles.pressed,
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.tabText, selected && styles.tabTextSelected]}>
                {option === "csv" ? "CSV" : "GeoJSON"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.hint}>
        {format === "csv"
          ? 'Header row required: name, description, category, lat, lng, icon, aliases, opening_hours.'
          : 'A FeatureCollection of Points. Building data goes in properties: name, description, category, lat, lng.'}
      </Text>

      <TextInput
        style={styles.input}
        value={text}
        onChangeText={(next) => {
          setText(next);
          setRows(null);
          setCommitted(false);
        }}
        placeholder={format === "csv" ? "name,lat,lng\nLibrary,6.4541,3.3947" : '{ "type": "FeatureCollection", … }'}
        placeholderTextColor={theme.gray}
        accessibilityLabel="File contents"
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        textAlignVertical="top"
      />

      <Pressable
        onPress={review}
        style={({ pressed }) => [styles.review, pressed && styles.pressed]}
        accessibilityRole="button"
      >
        <FileUp size={18} color={theme.tint} strokeWidth={2.4} />
        <Text style={styles.reviewText}>Review file</Text>
      </Pressable>

      {rows ? (
        <View style={styles.result}>
          <Text style={styles.resultTitle}>
            {rows.length} building{rows.length === 1 ? "" : "s"} ready
            {issues.length > 0
              ? `, ${issues.length} row${issues.length === 1 ? "" : "s"} skipped`
              : ""}
          </Text>

          {issues.length > 0 ? (
            <View style={styles.issues}>
              {issues.slice(0, 8).map((issue) => (
                <View key={`${issue.line}-${issue.message}`} style={styles.issue}>
                  <TriangleAlert size={14} color={theme.danger} strokeWidth={2.4} />
                  <Text style={styles.issueText}>
                    {issue.line > 0 ? `Line ${issue.line}: ` : ""}
                    {issue.message}
                  </Text>
                </View>
              ))}
              {issues.length > 8 ? (
                <Text style={styles.moreIssues}>
                  and {issues.length - 8} more — fix these, then review again.
                </Text>
              ) : null}
            </View>
          ) : null}

          {!committed ? (
            <Pressable
              onPress={commit}
              disabled={rows.length === 0 || importBuildings.isPending}
              style={({ pressed }) => [
                styles.commit,
                rows.length === 0 && styles.commitDisabled,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              {importBuildings.isPending ? (
                <ActivityIndicator size="small" color={theme.onTint} />
              ) : (
                <Text style={styles.commitText}>
                  Import {rows.length} building{rows.length === 1 ? "" : "s"}
                </Text>
              )}
            </Pressable>
          ) : null}

          {importBuildings.isError ? (
            <Text style={styles.issueText}>
              {importBuildings.error instanceof Error
                ? importBuildings.error.message
                : "The import failed."}
            </Text>
          ) : null}
        </View>
      ) : null}
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
  target: {
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: theme.tintLight,
    borderRadius: 12,
    gap: 2,
  },
  targetLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: theme.tint,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  targetValue: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: theme.text },
  tabs: { flexDirection: "row", gap: 8, paddingHorizontal: 16 },
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
  hint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: theme.gray,
    lineHeight: 17,
    paddingHorizontal: 16,
    marginTop: 10,
  },
  input: {
    flex: 1,
    margin: 16,
    padding: 12,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: theme.text,
  },
  review: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
  },
  reviewText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: theme.tint },
  result: {
    marginTop: 16,
    marginHorizontal: 16,
    padding: 16,
    backgroundColor: theme.card,
    borderRadius: 18,
    gap: 10,
  },
  resultTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: theme.text },
  issues: { gap: 6 },
  issue: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  issueText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: theme.danger,
    lineHeight: 17,
  },
  moreIssues: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: theme.gray,
  },
  commit: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: theme.tint,
  },
  commitDisabled: { opacity: 0.4 },
  commitText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: theme.onTint },
});
