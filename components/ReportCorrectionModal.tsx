import React, { useCallback, useState, useMemo } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/components/ThemeProvider";
import { actionGradient } from "@/constants/gradients";
import type { Theme } from "@/constants/colors";
import { useSubmitCorrection } from "@/lib/api/corrections";
import {
  CORRECTION_FIELD_LABELS,
  currentFieldValue,
} from "@/lib/import/correction-values";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import type { Building } from "@shared/types";
import type { CorrectionField } from "@shared/schema";

/**
 * "Report wrong info" on a building (Feature 10 §7.6).
 *
 * Open to guests on purpose. The RLS policy in migration 0005 allows a row with
 * a null `user_id`, and requiring a sign-in to fix a typo would mean most of
 * what gets reported never gets reported.
 *
 * The field list is `correctionFields` from the schema — the same set a
 * moderator can actually apply, so nobody can propose a change that is
 * structurally impossible to make. The current value is shown above every field:
 * a report is only useful if it is clear what is being replaced.
 */

const FIELDS = Object.keys(CORRECTION_FIELD_LABELS) as CorrectionField[];

export interface ReportCorrectionModalProps {
  building: Building | null;
  visible: boolean;
  onClose: () => void;
}

export function ReportCorrectionModal({
  building,
  visible,
  onClose,
}: ReportCorrectionModalProps) {
  const insets = useSafeAreaInsets();
  const { theme, scheme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const submit = useSubmitCorrection();

  const [field, setField] = useState<CorrectionField>("name");
  const [newValue, setNewValue] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const reset = useCallback(() => {
    setField("name");
    setNewValue("");
    setNote("");
    setError(null);
    setDone(false);
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const handleSubmit = useCallback(async () => {
    if (!building) return;
    if (!newValue.trim()) {
      setError("Tell us what it should say.");
      return;
    }
    try {
      await submit.mutateAsync({ buildingId: building.id, field, newValue, note });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDone(true);
    } catch (caught) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(
        caught instanceof Error ? caught.message : "Couldn't send that. Please try again."
      );
    }
  }, [building, field, newValue, note, submit]);

  if (!building) return null;

  const isSubmitting = submit.isPending;
  const current = currentFieldValue(building, field);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
      // Web renders `Modal` as an inline panel, so the scrim has to carry the
      // dimming itself.
      statusBarTranslucent
    >
      <Pressable style={styles.scrim} onPress={close} accessibilityLabel="Close" />

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Report wrong info</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {building.name}
            </Text>
          </View>
          <Pressable
            onPress={close}
            hitSlop={10}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
            accessibilityLabel="Close"
          >
            <X size={20} color={theme.text} strokeWidth={2.5} />
          </Pressable>
        </View>

        {done ? (
          <View style={styles.thanks}>
            <Text style={styles.thanksTitle}>Thanks</Text>
            <Text style={styles.thanksText}>
              An administrator will review it. You don&apos;t need an account — the
              report is already in the queue.
            </Text>
            <Pressable
              onPress={close}
              style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </Pressable>
          </View>
        ) : (
          <KeyboardAwareScrollViewCompat
            contentContainerStyle={styles.content}
            keyboardDismissMode="on-drag"
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.fieldRow}
            >
              {FIELDS.map((option) => {
                const selected = option === field;
                return (
                  <Pressable
                    key={option}
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setField(option);
                      setError(null);
                    }}
                    style={({ pressed }) => [
                      styles.fieldChip,
                      selected && styles.fieldChipSelected,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <Text
                      style={[
                        styles.fieldChipText,
                        selected && styles.fieldChipTextSelected,
                      ]}
                    >
                      {CORRECTION_FIELD_LABELS[option]}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.current}>
              <Text style={styles.currentLabel}>Currently</Text>
              <Text style={styles.currentValue} numberOfLines={2}>
                {current || "—"}
              </Text>
            </View>

            <Text style={styles.label}>What should it say?</Text>
            <TextInput
              style={styles.input}
              value={newValue}
              onChangeText={(text) => {
                setNewValue(text);
                if (error) setError(null);
              }}
              placeholder={placeholderFor(field)}
              placeholderTextColor={theme.gray}
              accessibilityLabel="The corrected value"
              autoCapitalize={field === "description" ? "sentences" : "words"}
              autoCorrect={field !== "lat" && field !== "lng"}
            />

            <Text style={styles.label}>Anything else? (optional)</Text>
            <TextInput
              style={[styles.input, styles.note]}
              value={note}
              onChangeText={setNote}
              placeholder="How do you know?"
              placeholderTextColor={theme.gray}
              accessibilityLabel="Additional detail, optional"
              multiline
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              onPress={() => void handleSubmit()}
              disabled={isSubmitting}
              style={({ pressed }) => [
                styles.submit,
                pressed && styles.submitPressed,
                isSubmitting && styles.submitDisabled,
              ]}
              accessibilityRole="button"
            >
              <LinearGradient
                colors={actionGradient(scheme)}
                style={styles.submitGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.submitText}>
                  {isSubmitting ? "Sending…" : "Send report"}
                </Text>
              </LinearGradient>
            </Pressable>
          </KeyboardAwareScrollViewCompat>
        )}
      </View>
    </Modal>
  );
}

function placeholderFor(field: CorrectionField): string {
  switch (field) {
    case "lat":
      return "6.4541";
    case "lng":
      return "3.3947";
    case "category":
      return "library";
    case "aliases":
      return "Main library, Lib";
    case "opening_hours":
      return "Mon–Fri 08:00–20:00";
    case "name":
      return "Central Library";
    default:
      return "What's actually there?";
  }
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.scrim,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "88%",
    backgroundColor: theme.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerText: { flex: 1, gap: 2 },
  title: {
    fontSize: 19,
    fontFamily: "Inter_700Bold",
    color: theme.text,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: theme.gray,
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: theme.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.7 },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 8,
    // The sheet is absolutely positioned with only a maxHeight, so the scroll
    // content needs its own cap or it grows past the screen.
    maxHeight: 520,
  },
  fieldRow: { gap: 8, paddingBottom: 6 },
  fieldChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: theme.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.border,
  },
  fieldChipSelected: {
    backgroundColor: theme.tint,
    borderColor: theme.tint,
  },
  fieldChipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: theme.textSecondary,
  },
  fieldChipTextSelected: { color: theme.onTint },
  current: {
    backgroundColor: theme.tintLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 3,
    marginBottom: 6,
  },
  currentLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: theme.tint,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  currentValue: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: theme.text,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: theme.textSecondary,
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: theme.text,
  },
  note: { minHeight: 72, textAlignVertical: "top" },
  error: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: theme.danger,
    marginTop: 8,
  },
  submit: { marginTop: 16, borderRadius: 14, overflow: "hidden" },
  submitPressed: { transform: [{ scale: 0.98 }] },
  submitDisabled: { opacity: 0.6 },
  submitGradient: { alignItems: "center", paddingVertical: 15 },
  submitText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: theme.onTint,
  },
  thanks: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
    alignItems: "center",
  },
  thanksTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: theme.text,
  },
  thanksText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: theme.gray,
    textAlign: "center",
    lineHeight: 20,
  },
  doneButton: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: theme.tint,
  },
  doneButtonText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: theme.onTint,
  },
});
