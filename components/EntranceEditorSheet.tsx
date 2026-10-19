import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Crosshair, MapPin, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/components/ThemeProvider";
import { actionGradient } from "@/constants/gradients";
import type { Theme } from "@/constants/colors";
import { LocationPickerModal } from "@/components/LocationPickerModal";
import {
  useCreateEntrance,
  useUpdateEntrance,
  type AdminEntrance,
  type EntranceInput,
} from "@/lib/api/admin";
import { entranceKindLabels, entranceKinds } from "@shared/schema";
import type { EntranceKind } from "@shared/schema";

/**
 * Add or edit one surveyed door (Feature 5's data, Feature 10's UI).
 *
 * Coordinates come from the same `LocationPickerModal` the building form uses —
 * tapping the map, not typing two numbers — with the building's own position as
 * the camera seed for a new row, because a new door is almost always next to
 * the building it belongs to.
 *
 * The body is mounted only while the sheet is visible and keyed on the entrance
 * id, so state resets through plain `useState` initialisers instead of an
 * effect that re-seeds after render.
 */

export interface EntranceEditorSheetProps {
  visible: boolean;
  buildingId: string;
  /** Null creates a new entrance. */
  entrance: AdminEntrance | null;
  /** Camera seed for a new row — the building's coordinates. */
  defaultCoords: { lat: number; lng: number };
  onClose: () => void;
}

export function EntranceEditorSheet({
  visible,
  buildingId,
  entrance,
  defaultCoords,
  onClose,
}: EntranceEditorSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {visible ? (
        <EntranceSheetBody
          key={entrance?.id ?? "new"}
          buildingId={buildingId}
          entrance={entrance}
          defaultCoords={defaultCoords}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  );
}

function EntranceSheetBody({
  buildingId,
  entrance,
  defaultCoords,
  onClose,
}: {
  buildingId: string;
  entrance: AdminEntrance | null;
  defaultCoords: { lat: number; lng: number };
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { theme, scheme } = useTheme();
  const styles = React.useMemo(() => makeStyles(theme), [theme]);
  const create = useCreateEntrance();
  const update = useUpdateEntrance();

  const [name, setName] = useState(entrance?.name ?? "");
  const [kind, setKind] = useState<EntranceKind>(entrance?.kind ?? "entrance");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    entrance ? { lat: entrance.lat, lng: entrance.lng } : null
  );
  const [stepFree, setStepFree] = useState(entrance?.stepFree ?? true);
  const [hasRamp, setHasRamp] = useState(entrance?.hasRamp ?? false);
  const [hasSteps, setHasSteps] = useState(entrance?.hasSteps ?? false);
  const [gated, setGated] = useState(entrance?.gated ?? false);
  const [gateClosesAt, setGateClosesAt] = useState(entrance?.gateClosesAt ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const pending = create.isPending || update.isPending;

  const submit = async () => {
    if (!coords) {
      setError("Pick the door's position on the map.");
      return;
    }
    const values: EntranceInput = {
      name: name.trim(),
      kind,
      lat: coords.lat,
      lng: coords.lng,
      hasRamp,
      hasSteps,
      stepFree,
      gated,
      gateClosesAt: gated && gateClosesAt.trim() ? gateClosesAt.trim() : null,
    };
    try {
      if (entrance) {
        await update.mutateAsync({ id: entrance.id, values });
      } else {
        await create.mutateAsync({ buildingId, values });
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (caught) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(
        caught instanceof Error ? caught.message : "Couldn't save that. Please try again."
      );
    }
  };

  return (
    <>
      <Pressable
        style={styles.scrim}
        onPress={onClose}
        accessibilityLabel="Close"
      />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>
              {entrance ? "Edit entrance" : "Add entrance"}
            </Text>
            <Text style={styles.subtitle}>
              {entrance
                ? "Changes apply as soon as you save."
                : "A door the router can start or end a route at."}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
            accessibilityLabel="Close"
          >
            <X size={20} color={theme.text} strokeWidth={2.5} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardDismissMode="on-drag"
        >
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (error) setError(null);
            }}
            placeholder="Main ramp entrance"
            placeholderTextColor={theme.gray}
            accessibilityLabel="Entrance name"
            returnKeyType="done"
          />

          <Text style={styles.label}>Kind</Text>
          <View style={styles.chipRow}>
            {entranceKinds.map((option) => {
              const selected = option === kind;
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setKind(option);
                  }}
                  style={({ pressed }) => [
                    styles.chip,
                    selected && styles.chipSelected,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {entranceKindLabels[option]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Position</Text>
          <View style={styles.locationCard}>
            <View style={styles.locationIcon}>
              <MapPin size={20} color={theme.tint} strokeWidth={2.3} />
            </View>
            <View style={styles.locationText}>
              <Text style={styles.locationValue} numberOfLines={1}>
                {coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : "Not set"}
              </Text>
              <Text style={styles.locationCaption}>
                {coords ? "Tap to adjust on the map" : "Drop a pin on the door"}
              </Text>
            </View>
            <Pressable
              onPress={() => setPickerOpen(true)}
              style={({ pressed }) => [styles.locationButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Pick the entrance position on a map"
            >
              <Crosshair size={17} color={theme.tint} strokeWidth={2.4} />
            </Pressable>
          </View>

          <LocationPickerModal
            visible={pickerOpen}
            initial={
              coords ? { lat: String(coords.lat), lng: String(coords.lng) } : null
            }
            campus={{ latitude: defaultCoords.lat, longitude: defaultCoords.lng }}
            onConfirm={(lat, lng) => {
              setCoords({ lat, lng });
              if (error) setError(null);
            }}
            onClose={() => setPickerOpen(false)}
          />

          <Text style={styles.label}>Attributes</Text>
          <View style={styles.toggles}>
            <ToggleRow
              title="Step-free"
              caption="Usable without climbing — what accessible routes filter on."
              value={stepFree}
              onChange={setStepFree}
              styles={styles}
            />
            <ToggleRow
              title="Has a ramp"
              caption="A ramp leads up to this door."
              value={hasRamp}
              onChange={setHasRamp}
              styles={styles}
            />
            <ToggleRow
              title="Has steps"
              caption="Steps are in the way of this door."
              value={hasSteps}
              onChange={setHasSteps}
              styles={styles}
            />
            <ToggleRow
              title="Gated"
              caption="A gate controls this opening."
              value={gated}
              onChange={(next) => {
                setGated(next);
                if (!next) setGateClosesAt("");
              }}
              styles={styles}
            />
          </View>

          {gated ? (
            <>
              <Text style={styles.label}>Gate closes at</Text>
              <TextInput
                style={styles.input}
                value={gateClosesAt}
                onChangeText={(text) => {
                  setGateClosesAt(text);
                  if (error) setError(null);
                }}
                placeholder="20:00"
                placeholderTextColor={theme.gray}
                accessibilityLabel="Gate closing time, local campus time"
                keyboardType="numbers-and-punctuation"
                inputMode="numeric"
              />
            </>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={() => void submit()}
            disabled={pending}
            style={({ pressed }) => [
              styles.submit,
              pressed && styles.submitPressed,
              pending && styles.submitDisabled,
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
                {pending ? "Saving…" : entrance ? "Save changes" : "Add entrance"}
              </Text>
            </LinearGradient>
          </Pressable>
        </ScrollView>
      </View>
    </>
  );
}

function ToggleRow({
  title,
  caption,
  value,
  onChange,
  styles,
}: {
  title: string;
  caption: string;
  value: boolean;
  onChange: (next: boolean) => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.toggleCaption}>{caption}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={(next) => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onChange(next);
        }}
        trackColor={{ true: theme.tint, false: theme.gray }}
        accessibilityLabel={title}
      />
    </View>
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
      maxHeight: "92%",
      backgroundColor: theme.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: 10,
    },
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      paddingHorizontal: 20,
      paddingBottom: 10,
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
      paddingBottom: 20,
      gap: 4,
    },
    label: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: theme.textSecondary,
      marginTop: 10,
      marginBottom: 4,
      textTransform: "uppercase",
      letterSpacing: 0.5,
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
    chipRow: { flexDirection: "row", gap: 8 },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
    },
    chipSelected: { backgroundColor: theme.tint, borderColor: theme.tint },
    chipText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: theme.textSecondary,
    },
    chipTextSelected: { color: theme.onTint },
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
    },
    locationButton: {
      width: 40,
      height: 40,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.tintLight,
    },
    toggles: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
    },
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.separator,
    },
    toggleText: { flex: 1, gap: 2 },
    toggleTitle: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: theme.text,
    },
    toggleCaption: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: theme.gray,
      lineHeight: 16,
    },
    error: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: theme.danger,
      marginTop: 10,
      lineHeight: 18,
    },
    submit: {
      marginTop: 16,
      borderRadius: 14,
      overflow: "hidden",
    },
    submitPressed: { transform: [{ scale: 0.98 }] },
    submitDisabled: { opacity: 0.6 },
    submitGradient: { alignItems: "center", paddingVertical: 15 },
    submitText: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: theme.onTint,
    },
  });
