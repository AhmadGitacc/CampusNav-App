import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/components/ThemeProvider";
import type { Theme } from "@/constants/colors";

/**
 * In-app confirmation sheet — the replacement for `Alert.alert`.
 *
 * react-native-web implements `Alert` as a no-op, so every confirmation that
 * used it (unpublish, and before this the corrections approval) silently did
 * nothing on web. A sheet renders identically on every platform and can show
 * more than one line of context, which a native alert box truncates anyway.
 *
 * Destructive tone paints the confirm button in `danger`. Its text takes
 * `theme.background` rather than `onTint`: in dark mode `danger` is a light red
 * (#E57373) where white text would fail contrast, and `background` flips with
 * it — dark text on light red, white text on dark red in light mode.
 */
export interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "destructive";
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  busy = false,
  onConfirm,
  onClose,
}: ConfirmSheetProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = React.useMemo(() => makeStyles(theme), [theme]);

  if (!visible) return null;

  const destructive = tone === "destructive";

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={styles.scrim}
        onPress={onClose}
        accessibilityLabel={cancelLabel}
      />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        <View style={styles.actions}>
          <Pressable
            onPress={onClose}
            disabled={busy}
            style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={styles.cancelText}>{cancelLabel}</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            disabled={busy}
            style={({ pressed }) => [
              styles.confirm,
              destructive && styles.confirmDestructive,
              busy && styles.busy,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
          >
            <Text
              style={[
                styles.confirmText,
                destructive && styles.confirmTextDestructive,
              ]}
            >
              {busy ? "Working…" : confirmLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    scrim: {
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
    title: {
      fontSize: 17,
      fontFamily: "Inter_700Bold",
      color: theme.text,
    },
    message: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: theme.textSecondary,
      lineHeight: 20,
    },
    actions: {
      flexDirection: "row",
      gap: 10,
      marginTop: 10,
    },
    cancel: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 13,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
    },
    cancelText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: theme.text,
    },
    confirm: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 13,
      borderRadius: 12,
      backgroundColor: theme.tint,
    },
    confirmDestructive: {
      backgroundColor: theme.danger,
    },
    confirmText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: theme.onTint,
    },
    confirmTextDestructive: {
      // Flips with the theme: white on dark red (light mode), near-black on
      // light red (dark mode).
      color: theme.background,
    },
    busy: {
      opacity: 0.6,
    },
    pressed: {
      opacity: 0.7,
    },
  });
