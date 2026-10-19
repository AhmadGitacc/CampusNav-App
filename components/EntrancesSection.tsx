import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { DoorClosed, DoorOpen, LogOut, Pencil, Plus, Trash2 } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/components/ThemeProvider";
import type { Theme } from "@/constants/colors";
import { EntranceEditorSheet } from "@/components/EntranceEditorSheet";
import { ConfirmSheet } from "@/components/ConfirmSheet";
import {
  useDeleteEntrance,
  useEntrances,
  type AdminEntrance,
} from "@/lib/api/admin";
import { entranceKindLabels } from "@shared/schema";
import type { EntranceKind } from "@shared/schema";

/**
 * The "Entrances" section of the building edit screen (Feature 5 data,
 * Feature 10 UI).
 *
 * Entrance edits save immediately through their own sheet rather than joining
 * the building form's submit: the two write different tables, and a door a
 * colleague added five minutes ago should not wait on someone else's draft.
 * This section only exists when editing an existing building — a new one has
 * no id to hang doors off yet, so survey them after the first save.
 */

export interface EntrancesSectionProps {
  buildingId: string;
  /** Camera seed for new rows — the building's coordinates. */
  defaultCoords: { lat: number; lng: number };
}

function KindIcon({ kind, color }: { kind: EntranceKind; color: string }) {
  // Different glyphs so a glance down the list reads the category without
  // needing the label — exit vs entrance is the distinction routers care about.
  if (kind === "exit") return <LogOut size={16} color={color} strokeWidth={2.3} />;
  if (kind === "gate") return <DoorClosed size={16} color={color} strokeWidth={2.3} />;
  return <DoorOpen size={16} color={color} strokeWidth={2.3} />;
}

/** Compact "Ramp · Steps · Gate 20:00" summary; empty string when unsurveyed. */
function flagSummary(entrance: AdminEntrance): string {
  const parts: string[] = [];
  if (entrance.stepFree) parts.push("Step-free");
  if (entrance.hasRamp) parts.push("Ramp");
  if (entrance.hasSteps) parts.push("Steps");
  if (entrance.gated) {
    parts.push(
      entrance.gateClosesAt ? `Gate until ${entrance.gateClosesAt}` : "Gated"
    );
  }
  return parts.join(" · ");
}

export function EntrancesSection({ buildingId, defaultCoords }: EntrancesSectionProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { data: entrances, isLoading, isError } = useEntrances(buildingId);
  const remove = useDeleteEntrance();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AdminEntrance | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminEntrance | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openCreate = () => {
    setError(null);
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = (entrance: AdminEntrance) => {
    setError(null);
    setEditing(entrance);
    setEditorOpen(true);
  };

  const confirmDelete = async (entrance: AdminEntrance) => {
    try {
      await remove.mutateAsync(entrance.id);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (caught) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(
        caught instanceof Error
          ? caught.message
          : "Couldn't delete that entrance. Please try again."
      );
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.label}>Entrances</Text>
          <Text style={styles.caption}>
            Doors the router can start or end a route at.
          </Text>
        </View>
        <Pressable
          onPress={openCreate}
          style={({ pressed }) => [styles.add, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Add an entrance"
        >
          <Plus size={16} color={theme.tint} strokeWidth={2.6} />
          <Text style={styles.addText}>Add</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator
          size="small"
          color={theme.tint}
          style={styles.loading}
        />
      ) : isError ? (
        <Text style={styles.error}>
          Couldn&apos;t load entrances — check your connection and reopen this
          screen.
        </Text>
      ) : entrances && entrances.length > 0 ? (
        <View style={styles.list}>
          {entrances.map((entrance) => {
            const flags = flagSummary(entrance);
            return (
              <View key={entrance.id} style={styles.row}>
                <View style={styles.rowIcon}>
                  <KindIcon kind={entrance.kind} color={theme.tint} />
                </View>
                <View style={styles.rowText}>
                  <View style={styles.rowTitleLine}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {entrance.name}
                    </Text>
                    <View style={styles.kindTag}>
                      <Text style={styles.kindTagText}>
                        {entranceKindLabels[entrance.kind]}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {entrance.lat.toFixed(5)}, {entrance.lng.toFixed(5)}
                    {flags ? `  ·  ${flags}` : ""}
                  </Text>
                </View>
                <Pressable
                  onPress={() => openEdit(entrance)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.rowAction, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${entrance.name}`}
                >
                  <Pencil size={16} color={theme.textSecondary} strokeWidth={2.2} />
                </Pressable>
                <Pressable
                  onPress={() => {
                    setError(null);
                    setDeleteTarget(entrance);
                  }}
                  hitSlop={8}
                  style={({ pressed }) => [styles.rowAction, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${entrance.name}`}
                >
                  <Trash2 size={16} color={theme.danger} strokeWidth={2.2} />
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.empty}>
          No entrances surveyed yet — routes fall back to the building&apos;s
          centre point.
        </Text>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <EntranceEditorSheet
        visible={editorOpen}
        buildingId={buildingId}
        entrance={editing}
        defaultCoords={defaultCoords}
        onClose={() => setEditorOpen(false)}
      />

      <ConfirmSheet
        visible={deleteTarget !== null}
        title={`Delete ${deleteTarget?.name ?? "entrance"}?`}
        message="The door disappears from routing. The building itself is not affected, and you can survey it again later."
        confirmLabel="Delete"
        tone="destructive"
        busy={remove.isPending}
        onConfirm={() => {
          if (deleteTarget) void confirmDelete(deleteTarget);
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    section: {
      marginTop: 18,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: theme.separator,
      gap: 8,
    },
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
    },
    headerText: { flex: 1, gap: 2 },
    label: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: theme.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    caption: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: theme.gray,
      lineHeight: 16,
    },
    add: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: theme.tintLight,
    },
    addText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: theme.tint,
    },
    pressed: { opacity: 0.7 },
    loading: { marginVertical: 14 },
    list: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      overflow: "hidden",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.separator,
    },
    rowIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      backgroundColor: theme.tintLight,
      alignItems: "center",
      justifyContent: "center",
    },
    rowText: { flex: 1, gap: 2 },
    rowTitleLine: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    rowName: {
      flexShrink: 1,
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: theme.text,
    },
    kindTag: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 6,
      backgroundColor: theme.tintLight,
    },
    kindTagText: {
      fontSize: 10,
      fontFamily: "Inter_600SemiBold",
      color: theme.tint,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    rowMeta: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: theme.gray,
    },
    rowAction: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.backgroundSecondary,
    },
    empty: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: theme.gray,
      fontStyle: "italic",
      lineHeight: 18,
      paddingHorizontal: 2,
    },
    error: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: theme.danger,
      lineHeight: 18,
    },
  });
