import React, { useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Crosshair, MapPin } from "lucide-react-native";
import { useTheme } from "@/components/ThemeProvider";
import { actionGradient } from "@/constants/gradients";
import type { Theme } from "@/constants/colors";
import { importBuildingSchema, type ImportBuilding } from "@shared/schema";
import type { BuildingCategory, MarkerIconName } from "@shared/types";
import { IconPicker } from "@/components/IconPicker";
import { LocationPickerModal } from "@/components/LocationPickerModal";
import { EntrancesSection } from "@/components/EntrancesSection";
import { useAdminCampus } from "@/components/AdminCampusProvider";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

/**
 * Create/edit form for a building (Feature 10 §7.4).
 *
 * Shared by the two admin screens so validation can never drift between them:
 * both call `importBuildingSchema`, the same schema the CSV and GeoJSON parsers
 * use, so a hand-typed building is held to exactly the standard an imported one
 * is. The DB has the last word regardless — this only saves a round trip.
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

const CATEGORIES = Object.keys(CATEGORY_LABELS) as BuildingCategory[];

export type BuildingFormValues = {
  name: string;
  description: string;
  category: BuildingCategory | undefined;
  lat: string;
  lng: string;
  icon: MarkerIconName | undefined;
  aliases: string;
  openingHours: string;
  isAccessibleEntry: boolean;
};

export interface BuildingFormProps {
  /** Existing values when editing; absent fields fall back to the empty form. */
  initialValues?: Partial<{
    name: string;
    description: string;
    category: BuildingCategory | undefined;
    lat: number;
    lng: number;
    icon: MarkerIconName | undefined;
    aliases: string[];
    openingHours: string | null;
    isAccessibleEntry: boolean;
  }>;
  submitLabel: string;
  isSubmitting: boolean;
  error?: string | null;
  /**
   * Present only on the edit screen. Unlocks the entrance section — a new
   * building has no id to hang doors off yet, so doors are surveyed after the
   * first save.
   */
  buildingId?: string;
  onSubmit: (values: ImportBuilding) => void;
}

function emptyValues(): BuildingFormValues {
  return {
    name: "",
    description: "",
    category: undefined,
    lat: "",
    lng: "",
    icon: undefined,
    aliases: "",
    openingHours: "",
    isAccessibleEntry: true,
  };
}

export function BuildingForm({
  initialValues,
  submitLabel,
  isSubmitting,
  error,
  buildingId,
  onSubmit,
}: BuildingFormProps) {
  const [values, setValues] = useState<BuildingFormValues>(() => ({
    ...emptyValues(),
    ...(initialValues?.name !== undefined && { name: initialValues.name }),
    ...(initialValues?.description !== undefined && {
      description: initialValues.description,
    }),
    ...(initialValues?.category !== undefined && {
      category: initialValues.category,
    }),
    ...(initialValues?.lat !== undefined && { lat: String(initialValues.lat) }),
    ...(initialValues?.lng !== undefined && { lng: String(initialValues.lng) }),
    ...(initialValues?.icon !== undefined && { icon: initialValues.icon }),
    ...(initialValues?.aliases !== undefined && {
      aliases: initialValues.aliases.join(", "),
    }),
    ...(initialValues?.openingHours !== undefined && {
      openingHours: initialValues.openingHours ?? "",
    }),
    ...(initialValues?.isAccessibleEntry !== undefined && {
      isAccessibleEntry: initialValues.isAccessibleEntry,
    }),
  }));
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const { theme, scheme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { campus } = useAdminCampus();

  /**
   * Camera seed for new doors: whatever the fields say right now, falling back
   * to the saved coordinates while the lat/lng inputs are mid-edit or blank.
   */
  const entranceSeedCoords = useMemo(() => {
    const lat = Number.parseFloat(values.lat);
    const lng = Number.parseFloat(values.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    return { lat: initialValues?.lat ?? 0, lng: initialValues?.lng ?? 0 };
  }, [values.lat, values.lng, initialValues?.lat, initialValues?.lng]);

  const set = <K extends keyof BuildingFormValues>(
    key: K,
    value: BuildingFormValues[K]
  ) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    if (fieldError) setFieldError(null);
  };

  /** Category defaults to the first chip; nothing is preselected for a new row. */
  const categories = useMemo(() => CATEGORIES, []);

  const handleSubmit = () => {
    const parsed = importBuildingSchema.safeParse({
      name: values.name,
      description: values.description,
      category: values.category,
      lat: values.lat,
      lng: values.lng,
      icon: values.icon,
      aliases: values.aliases
        .split(/[,;|]/)
        .map((alias) => alias.trim())
        .filter(Boolean),
      openingHours: values.openingHours.trim() || null,
      isAccessibleEntry: values.isAccessibleEntry,
    });

    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Check the highlighted values.");
      return;
    }
    setFieldError(null);
    onSubmit(parsed.data);
  };

  return (
    <KeyboardAwareScrollViewCompat
      contentContainerStyle={styles.content}
      keyboardDismissMode="on-drag"
    >
      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        value={values.name}
        onChangeText={(text) => set("name", text)}
        placeholder="Central Library"
        placeholderTextColor={theme.gray}
        accessibilityLabel="Building name"
        returnKeyType="next"
      />

      <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={values.description}
          onChangeText={(text) => set("description", text)}
          placeholder="What is this place for?"
          placeholderTextColor={theme.gray}
          accessibilityLabel="Building description"
          multiline
          numberOfLines={3}
        />

        <Text style={styles.label}>Category</Text>
        <View style={styles.chipRow}>
          {categories.map((category) => {
            const selected = values.category === category;
            return (
              <Pressable
                key={category}
                onPress={() => set("category", category)}
                style={({ pressed }) => [
                  styles.chip,
                  selected && styles.chipSelected,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <Text
                  style={[styles.chipText, selected && styles.chipTextSelected]}
                >
                  {CATEGORY_LABELS[category]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Location</Text>
        <View style={styles.locationCard}>
          <View style={styles.locationIcon}>
            <MapPin size={20} color={theme.tint} strokeWidth={2.3} />
          </View>
          <View style={styles.locationText}>
            <Text style={styles.locationValue} numberOfLines={1}>
              {values.lat.trim() && values.lng.trim()
                ? `${values.lat.trim()}, ${values.lng.trim()}`
                : "No coordinates yet"}
            </Text>
            <Text style={styles.locationCaption}>
              {values.lat.trim() && values.lng.trim()
                ? "Tap to adjust on the map"
                : "Drop a pin on the map to set the location"}
            </Text>
          </View>
          <Pressable
            onPress={() => setLocationPickerOpen(true)}
            style={({ pressed }) => [styles.locationButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Pick the location on a map"
          >
            <Crosshair size={17} color={theme.tint} strokeWidth={2.4} />
          </Pressable>
        </View>
        <View style={styles.coordinateRow}>
          <View style={styles.coordinateField}>
            <Text style={styles.coordinateHint}>Latitude</Text>
            <TextInput
              style={styles.input}
              value={values.lat}
              onChangeText={(text) => set("lat", text)}
              placeholder="6.4541"
              placeholderTextColor={theme.gray}
              accessibilityLabel="Latitude"
              keyboardType="numbers-and-punctuation"
              inputMode="decimal"
            />
          </View>
          <View style={styles.coordinateField}>
            <Text style={styles.coordinateHint}>Longitude</Text>
            <TextInput
              style={styles.input}
              value={values.lng}
              onChangeText={(text) => set("lng", text)}
              placeholder="3.3947"
              placeholderTextColor={theme.gray}
              accessibilityLabel="Longitude"
              keyboardType="numbers-and-punctuation"
              inputMode="decimal"
            />
          </View>
        </View>

        <LocationPickerModal
          visible={locationPickerOpen}
          initial={
            values.lat.trim() && values.lng.trim()
              ? { lat: values.lat, lng: values.lng }
              : null
          }
          campus={
            campus ? { latitude: campus.lat, longitude: campus.lng } : null
          }
          onConfirm={(lat, lng) => {
            set("lat", String(lat.toFixed(6)));
            set("lng", String(lng.toFixed(6)));
          }}
          onClose={() => setLocationPickerOpen(false)}
        />

        <Text style={styles.label}>Map icon</Text>
        <IconPicker
          value={values.icon}
          onChange={(icon) => set("icon", icon)}
          category={values.category}
        />

        <Text style={styles.label}>Alternative names</Text>
        <TextInput
          style={styles.input}
          value={values.aliases}
          onChangeText={(text) => set("aliases", text)}
          placeholder="Main library, Lib"
          placeholderTextColor={theme.gray}
          accessibilityLabel="Alternative names, separated by commas"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Opening hours</Text>
        <TextInput
          style={styles.input}
          value={values.openingHours}
          onChangeText={(text) => set("openingHours", text)}
          placeholder="Mon–Fri 08:00–20:00"
          placeholderTextColor={theme.gray}
          accessibilityLabel="Opening hours"
        />

        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.switchTitle}>Step-free entrance</Text>
            <Text style={styles.switchCaption}>
              Routes to this building prefer the accessible entrance.
            </Text>
          </View>
          <Switch
            value={values.isAccessibleEntry}
            onValueChange={(next) => set("isAccessibleEntry", next)}
            trackColor={{ true: theme.tint, false: theme.gray }}
            accessibilityLabel="Step-free entrance"
          />
        </View>

        {buildingId ? (
          <EntrancesSection
            buildingId={buildingId}
            defaultCoords={entranceSeedCoords}
          />
        ) : null}

        {fieldError ? <Text style={styles.error}>{fieldError}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          onPress={handleSubmit}
          disabled={isSubmitting}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.submit,
            pressed && styles.submitPressed,
            isSubmitting && styles.submitDisabled,
          ]}
        >
          <LinearGradient
            colors={actionGradient(scheme)}
            style={styles.submitGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={styles.submitText}>
              {isSubmitting ? "Saving…" : submitLabel}
            </Text>
          </LinearGradient>
        </Pressable>
    </KeyboardAwareScrollViewCompat>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 48,
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: theme.textSecondary,
    marginTop: 12,
    marginBottom: 6,
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
  multiline: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pressed: {
    opacity: 0.7,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
  },
  chipSelected: {
    backgroundColor: theme.tint,
    borderColor: theme.tint,
  },
  chipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: theme.textSecondary,
  },
  chipTextSelected: {
    color: theme.onTint,
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
  },
  locationButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.tintLight,
  },
  coordinateRow: {
    flexDirection: "row",
    gap: 12,
  },
  coordinateField: {
    flex: 1,
    gap: 4,
  },
  coordinateHint: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: theme.gray,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 20,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    padding: 14,
  },
  switchText: {
    flex: 1,
    gap: 2,
  },
  switchTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: theme.text,
  },
  switchCaption: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: theme.gray,
    lineHeight: 17,
  },
  error: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: theme.danger,
    marginTop: 12,
  },
  submit: {
    marginTop: 20,
    borderRadius: 14,
    overflow: "hidden",
  },
  submitPressed: {
    transform: [{ scale: 0.98 }],
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitGradient: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
  submitText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: theme.onTint,
  },
});