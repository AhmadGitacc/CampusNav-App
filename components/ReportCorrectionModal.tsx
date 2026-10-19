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
import { Check, ChevronDown, Crosshair, MapPin, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/components/ThemeProvider";
import { actionGradient } from "@/constants/gradients";
import type { Theme } from "@/constants/colors";
import { useSubmitCorrection } from "@/lib/api/corrections";
import {
  CORRECTION_FIELD_LABELS,
  CORRECTION_REASON_LABELS,
  REASON_DEFAULT_FIELD,
  currentFieldValue,
} from "@/lib/import/correction-values";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { LocationPickerModal } from "@/components/LocationPickerModal";
import type { Building } from "@shared/types";
import type { CorrectionField, CorrectionReason } from "@shared/schema";
import { correctionReasons } from "@shared/schema";

/**
 * "Report wrong info" on a building (Feature 10 §7.6).
 *
 * Open to guests on purpose. The RLS policy in migration 0005 allows a row with
 * a null `user_id`, and requiring a sign-in to fix a typo would mean most of
 * what gets reported never gets reported.
 *
 * The flow starts from *why* the reporter is here — the reason dropdown — and
 * only then asks what to change. A wrong location collects latitude **and**
 * longitude via the shared map picker (one pin, two coordinates, one
 * movement), but the pin is **optional**: plenty of people notice a marker in
 * the lake without knowing where it belongs, and their report still tells a
 * moderator to go look. "Something else" skips the value entirely and asks for
 * a note, which lands in the queue as a field-less row an admin can only
 * acknowledge or dismiss — as does a pin-less wrong-location report.
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

  const [reason, setReason] = useState<CorrectionReason>("wrong_location");
  const [field, setField] = useState<CorrectionField>("name");
  const [newValue, setNewValue] = useState("");
  /** The reporter's corrected pin — null means "wrong, but I can't say where". */
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [done, setDone] = useState(false);

  const reset = useCallback(() => {
    setReason("wrong_location");
    setField("name");
    setNewValue("");
    setPicked(null);
    setNote("");
    setError(null);
    setPickerOpen(false);
    setLocationOpen(false);
    setDone(false);
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const pickReason = useCallback((next: CorrectionReason) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReason(next);
    setError(null);
    setPickerOpen(false);
    const suggested = REASON_DEFAULT_FIELD[next];
    if (suggested) {
      setField(suggested);
      setNewValue("");
    }
  }, []);

  const isLocation = reason === "wrong_location";
  const isOther = reason === "other";

  const handleSubmit = useCallback(async () => {
    if (!building) return;

    let proposals: { field: CorrectionField; newValue: string }[] = [];
    if (isLocation) {
      // Optional pin: a report with no coordinates becomes a field-less flag
      // the moderator can still triage. The schema accepts 0-or-2 proposals
      // for this reason, never a half pair.
      if (picked) {
        proposals = [
          { field: "lat", newValue: picked.lat.toFixed(6) },
          { field: "lng", newValue: picked.lng.toFixed(6) },
        ];
      }
    } else if (!isOther) {
      if (!newValue.trim()) {
        setError("Tell us what it should say.");
        return;
      }
      proposals = [{ field, newValue: newValue.trim() }];
    }

    try {
      await submit.mutateAsync({
        buildingId: building.id,
        reason,
        proposals,
        note: note.trim() || undefined,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDone(true);
    } catch (caught) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(
        caught instanceof Error ? caught.message : "Couldn't send that. Please try again."
      );
    }
  }, [building, reason, field, newValue, picked, note, isLocation, isOther, submit]);

  if (!building) return null;

  const isSubmitting = submit.isPending;

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
            <Text style={styles.label}>What&apos;s wrong?</Text>
            <Pressable
              onPress={() => setPickerOpen(true)}
              style={({ pressed }) => [styles.reasonSelect, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Report type: ${CORRECTION_REASON_LABELS[reason]}`}
              accessibilityHint="Opens the list of report types"
            >
              <Text style={styles.reasonSelectText}>
                {CORRECTION_REASON_LABELS[reason]}
              </Text>
              <ChevronDown size={18} color={theme.gray} strokeWidth={2.4} />
            </Pressable>

            {isLocation ? (
              <>
                <View style={styles.current}>
                  <Text style={styles.currentLabel}>Currently</Text>
                  <Text style={styles.currentValue} numberOfLines={2}>
                    {`${building.lat}, ${building.lng}`}
                  </Text>
                </View>
                <Text style={styles.label}>Where should it be?</Text>
                <View style={styles.locationCard}>
                  <View style={styles.locationIcon}>
                    <MapPin size={20} color={theme.tint} strokeWidth={2.3} />
                  </View>
                  <View style={styles.locationText}>
                    <Text style={styles.locationValue} numberOfLines={1}>
                      {picked
                        ? `${picked.lat.toFixed(5)}, ${picked.lng.toFixed(5)}`
                        : "No new pin yet"}
                    </Text>
                    <Text style={styles.locationCaption}>
                      {picked
                        ? "Tap to adjust on the map"
                        : "Optional — send it anyway if you're not sure where it goes"}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setLocationOpen(true)}
                    style={({ pressed }) => [
                      styles.locationButton,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={
                      picked
                        ? "Adjust the corrected location on the map"
                        : "Pick the corrected location on the map"
                    }
                  >
                    <Crosshair size={17} color={theme.tint} strokeWidth={2.4} />
                  </Pressable>
                </View>
                {picked ? (
                  <Pressable
                    onPress={() => setPicked(null)}
                    hitSlop={8}
                    style={styles.clearPin}
                    accessibilityRole="button"
                  >
                    <Text style={styles.clearPinText}>Remove the pin</Text>
                  </Pressable>
                ) : null}
              </>
            ) : isOther ? null : (
              <>
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
                    {currentFieldValue(building, field) || "—"}
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
              </>
            )}

            <Text style={styles.label}>
              {isOther ? "Tell us what's wrong" : "Anything else? (optional)"}
            </Text>
            <TextInput
              style={[styles.input, styles.note]}
              value={note}
              onChangeText={(text) => {
                setNote(text);
                if (error) setError(null);
              }}
              placeholder={
                isOther
                  ? "Describe the problem — wrong opening time, moved entrance…"
                  : isLocation
                    ? "Why is the pin wrong? What's actually there?"
                    : "How do you know?"
              }
              placeholderTextColor={theme.gray}
              accessibilityLabel={isOther ? "What is wrong?" : "Additional detail, optional"}
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

        {/* The reason "dropdown": RN has no native select, so this is a sheet
            of radio rows over the report sheet. */}
        <Modal
          visible={pickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setPickerOpen(false)}
        >
          <Pressable
            style={styles.pickerScrim}
            onPress={() => setPickerOpen(false)}
            accessibilityLabel="Close"
          />
          <View style={[styles.pickerSheet, { paddingBottom: insets.bottom + 12 }]}>
            <Text style={styles.pickerTitle}>What&apos;s wrong?</Text>
            {correctionReasons.map((option) => {
              const selected = option === reason;
              return (
                <Pressable
                  key={option}
                  onPress={() => pickReason(option)}
                  style={({ pressed }) => [
                    styles.pickerRow,
                    selected && styles.pickerRowSelected,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <Text
                    style={[
                      styles.pickerRowText,
                      selected && styles.pickerRowTextSelected,
                    ]}
                  >
                    {CORRECTION_REASON_LABELS[option]}
                  </Text>
                  {selected ? (
                    <Check size={17} color={theme.tint} strokeWidth={2.8} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </Modal>

        {/* The same map picker the building form uses, seeded from the building
            so the reporter starts at the marker they believe is wrong. */}
        <LocationPickerModal
          visible={locationOpen}
          initial={
            picked
              ? { lat: String(picked.lat), lng: String(picked.lng) }
              : { lat: String(building.lat), lng: String(building.lng) }
          }
          campus={{ latitude: building.lat, longitude: building.lng }}
          onConfirm={(lat, lng) => {
            setPicked({ lat, lng });
            if (error) setError(null);
          }}
          onClose={() => setLocationOpen(false)}
        />
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
    ...StyleSheet.absoluteFill,
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
    maxHeight: 560,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: theme.textSecondary,
    marginTop: 8,
    marginBottom: 4,
  },
  reasonSelect: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  reasonSelectText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: theme.text,
  },
  pickerScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.scrim,
  },
  pickerSheet: {
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
  pickerTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: theme.text,
    marginBottom: 8,
    paddingHorizontal: 6,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
  },
  pickerRowSelected: {
    backgroundColor: theme.tintLight,
  },
  pickerRowText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: theme.text,
  },
  pickerRowTextSelected: {
    color: theme.tint,
    fontFamily: "Inter_600SemiBold",
  },
  locationCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 16,
    padding: 12,
  },
  locationIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: theme.tintLight,
    alignItems: "center",
    justifyContent: "center",
  },
  locationText: { flex: 1, gap: 2 },
  locationValue: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: theme.text,
  },
  locationCaption: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: theme.gray,
    lineHeight: 16,
  },
  locationButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.tintLight,
  },
  clearPin: {
    alignSelf: "flex-start",
    paddingVertical: 2,
  },
  clearPinText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: theme.danger,
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
