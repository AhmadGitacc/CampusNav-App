import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Crosshair, MapPin, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/components/ThemeProvider";
import { actionGradient } from "@/constants/gradients";
import type { Theme } from "@/constants/colors";
import { getCurrentUserLocation, LocationPermissionError } from "@/lib/location";
import LocationPickerMap, {
  type LocationPickerMapHandle,
} from "@/components/LocationPickerMap";
import type { LatLon } from "@shared/types";

/**
 * Pick a building's coordinates on a map instead of typing two numbers
 * (Feature 10 §7.4). Tap or drag the pin; the readout updates live; confirming
 * writes the pair back into the form's lat/lng fields.
 *
 * Platform split: the map itself lives in `LocationPickerMap` (.native/.web),
 * because `react-native-maps` crashes on web at import time. On web the same
 * modal shows the manual lat/lng inputs instead of pretending to be a map.
 */

export interface LocationPickerModalProps {
  visible: boolean;
  /** The form's current coordinates, when there are any. */
  initial: { lat: string; lng: string } | null;
  /** Where the camera opens when there is no initial point. */
  campus: LatLon | null;
  onConfirm: (lat: number, lng: number) => void;
  onClose: () => void;
}

function parseCoordinate(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const value = Number(raw.trim());
  return Number.isFinite(value) ? value : null;
}

export function LocationPickerModal({
  visible,
  initial,
  campus,
  onConfirm,
  onClose,
}: LocationPickerModalProps) {
  const insets = useSafeAreaInsets();
  const { theme, scheme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const startLat = parseCoordinate(initial?.lat);
  const startLng = parseCoordinate(initial?.lng);
  const start =
    startLat !== null && startLng !== null
      ? { lat: startLat, lng: startLng }
      : null;
  const origin = start ?? (campus ? { lat: campus.latitude, lng: campus.longitude } : null);

  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(origin);
  const [manualLat, setManualLat] = useState(initial?.lat ?? "");
  const [manualLng, setManualLng] = useState(initial?.lng ?? "");
  const [locating, setLocating] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const mapRef = useRef<LocationPickerMapHandle | null>(null);

  // Re-seed each time the sheet opens; stale state from a cancelled pick
  // would silently overwrite the form.
  useEffect(() => {
    if (visible) {
      setPoint(origin);
      setManualLat(initial?.lat ?? "");
      setManualLng(initial?.lng ?? "");
      setManualError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const flyTo = useCallback((lat: number, lng: number) => {
    mapRef.current?.animateToRegion(lat, lng, 350);
  }, []);

  const locateMe = useCallback(async () => {
    setLocating(true);
    try {
      const here = await getCurrentUserLocation();
      setPoint({ lat: here.latitude, lng: here.longitude });
      flyTo(here.latitude, here.longitude);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        error instanceof LocationPermissionError ? "Location permission denied" : "Couldn't get your location",
        error instanceof LocationPermissionError
          ? "Allow location access in settings, or drop the pin on the map instead."
          : "Drop the pin on the map instead."
      );
    } finally {
      setLocating(false);
    }
  }, [flyTo]);

  const confirm = useCallback(() => {
    if (!point) return;
    onConfirm(point.lat, point.lng);
    onClose();
  }, [point, onConfirm, onClose]);

  const confirmManual = useCallback(() => {
    const lat = Number(manualLat.trim());
    const lng = Number(manualLng.trim());
    if (!Number.isFinite(lat) || Math.abs(lat) > 90) {
      setManualError("Latitude must be a number between -90 and 90.");
      return;
    }
    if (!Number.isFinite(lng) || Math.abs(lng) > 180) {
      setManualError("Longitude must be a number between -180 and 180.");
      return;
    }
    onConfirm(lat, lng);
    onClose();
  }, [manualLat, manualLng, onConfirm, onClose]);

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <View style={styles.headerText}>
        <Text style={styles.title}>Pick the location</Text>
        <Text style={styles.subtitle}>
          {Platform.OS === "web"
            ? "Enter the coordinates, or use the campus centre."
            : "Tap the map to drop the pin, or drag it into place."}
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
  );

  if (Platform.OS === "web") {
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          {header}
          <View style={styles.manualBody}>
            <Text style={styles.manualHint}>
              Interactive map picking needs the phone app. Type the coordinates
              here, or start from the campus centre.
            </Text>
            <View style={styles.coordinateRow}>
              <View style={styles.coordinateField}>
                <Text style={styles.coordinateHint}>Latitude</Text>
                <TextInput
                  style={styles.input}
                  value={manualLat}
                  onChangeText={(text) => {
                    setManualLat(text);
                    if (manualError) setManualError(null);
                  }}
                  placeholder="6.4541"
                  placeholderTextColor={theme.gray}
                  accessibilityLabel="Latitude"
                  inputMode="decimal"
                />
              </View>
              <View style={styles.coordinateField}>
                <Text style={styles.coordinateHint}>Longitude</Text>
                <TextInput
                  style={styles.input}
                  value={manualLng}
                  onChangeText={(text) => {
                    setManualLng(text);
                    if (manualError) setManualError(null);
                  }}
                  placeholder="3.3947"
                  placeholderTextColor={theme.gray}
                  accessibilityLabel="Longitude"
                  inputMode="decimal"
                />
              </View>
            </View>
            {campus ? (
              <Pressable
                onPress={() => {
                  setManualLat(String(campus.latitude));
                  setManualLng(String(campus.longitude));
                  if (manualError) setManualError(null);
                }}
                style={({ pressed }) => [styles.campusButton, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <MapPin size={15} color={theme.tint} strokeWidth={2.4} />
                <Text style={styles.campusButtonText}>Use the campus centre</Text>
              </Pressable>
            ) : null}
            {manualError ? <Text style={styles.error}>{manualError}</Text> : null}
            <Pressable
              onPress={confirmManual}
              disabled={!manualLat.trim() || !manualLng.trim()}
              style={({ pressed }) => [
                styles.confirm,
                pressed && styles.confirmPressed,
                (!manualLat.trim() || !manualLng.trim()) && styles.confirmDisabled,
              ]}
              accessibilityRole="button"
            >
              <LinearGradient
                colors={actionGradient(scheme)}
                style={styles.confirmGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.confirmText}>Use this location</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.container}>
        {header}

        <View style={styles.mapWrap}>
          <LocationPickerMap
            ref={mapRef}
            center={origin ?? { lat: 0, lng: 0 }}
            point={point}
            onPick={(lat, lng) => {
              setPoint({ lat, lng });
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            onDrag={(lat, lng) => setPoint({ lat, lng })}
          />

          {point ? (
            <View style={styles.readout}>
              <Text style={styles.readoutValue}>
                {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
              </Text>
              <Text style={styles.readoutHint}>Drag the pin to fine-tune</Text>
            </View>
          ) : (
            <View style={styles.readout}>
              <Text style={styles.readoutHint}>Tap the map to drop the pin</Text>
            </View>
          )}

          <Pressable
            onPress={() => void locateMe()}
            disabled={locating}
            style={({ pressed }) => [styles.locate, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Use my current location"
          >
            {locating ? (
              <ActivityIndicator size="small" color={theme.tint} />
            ) : (
              <Crosshair size={18} color={theme.tint} strokeWidth={2.4} />
            )}
          </Pressable>
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable
            onPress={confirm}
            disabled={!point}
            style={({ pressed }) => [
              styles.confirm,
              pressed && styles.confirmPressed,
              !point && styles.confirmDisabled,
            ]}
            accessibilityRole="button"
          >
            <LinearGradient
              colors={actionGradient(scheme)}
              style={styles.confirmGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.confirmText}>Use this location</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
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
      paddingTop: 10,
    },
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
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
    mapWrap: {
      flex: 1,
      backgroundColor: theme.mapBackdrop,
      justifyContent: "flex-end",
    },
    readout: {
      position: "absolute",
      top: 12,
      alignSelf: "center",
      alignItems: "center",
      gap: 1,
      backgroundColor: theme.surface,
      borderRadius: 30,
      paddingHorizontal: 18,
      paddingVertical: 10,
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 10,
      elevation: 5,
    },
    readoutValue: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: theme.text,
    },
    readoutHint: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: theme.gray,
    },
    locate: {
      position: "absolute",
      right: 16,
      bottom: 16,
      width: 46,
      height: 46,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.surface,
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 5,
    },
    footer: {
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    manualBody: {
      paddingHorizontal: 20,
      paddingBottom: 20,
      gap: 10,
    },
    manualHint: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: theme.gray,
      lineHeight: 19,
    },
    coordinateRow: { flexDirection: "row", gap: 12 },
    coordinateField: { flex: 1, gap: 4 },
    coordinateHint: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: theme.gray,
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
    campusButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: theme.tintLight,
    },
    campusButtonText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: theme.tint,
    },
    error: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: theme.danger,
    },
    confirm: {
      marginTop: 6,
      borderRadius: 14,
      overflow: "hidden",
    },
    confirmPressed: { transform: [{ scale: 0.98 }] },
    confirmDisabled: { opacity: 0.6 },
    confirmGradient: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 15,
    },
    confirmText: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: theme.onTint,
    },
  });
