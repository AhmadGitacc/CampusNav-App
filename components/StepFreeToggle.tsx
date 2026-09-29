import React, { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Accessibility, Check } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import colors from "@/constants/colors";

interface StepFreeToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

/**
 * Step-free routing switch (Feature 5).
 *
 * The universal accessibility glyph rather than a footprint: "step-free" is a
 * claim about stairs, and a footprint reads as "walking" instead. Shape change
 * as well as fill carries the state, so it is not colour-only (style.md §9).
 */
export function StepFreeToggle({
  value,
  onChange,
  disabled = false,
}: StepFreeToggleProps) {
  const handlePress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(!value);
  }, [onChange, value]);

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel="Step-free route"
      accessibilityHint="Avoids stairs and uses step-free building entrances"
      style={({ pressed }) => [
        styles.button,
        value && styles.buttonActive,
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <View style={[styles.iconWrap, value && styles.iconWrapActive]}>
        {value ? (
          <Check size={16} color={colors.light.tint} strokeWidth={3} />
        ) : (
          <Accessibility size={16} color={colors.light.tint} strokeWidth={2.5} />
        )}
      </View>
      <View style={styles.textWrap}>
        <Text style={[styles.label, value && styles.labelActive]}>
          {value ? "Step-free route on" : "Step-free route"}
        </Text>
        {!value && (
          <Text style={styles.hint}>Uses ramps and step-free entrances</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.light.tint,
    backgroundColor: colors.light.tintLight,
  },
  buttonActive: {
    backgroundColor: colors.light.accent,
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.light.background,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapActive: {
    backgroundColor: colors.light.tintLight,
  },
  textWrap: {
    flex: 1,
    gap: 1,
  },
  label: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.tint,
  },
  labelActive: {
    color: colors.light.background,
  },
  hint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
  },
});
