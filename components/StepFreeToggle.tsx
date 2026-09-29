import React, { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Accessibility, Check } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/components/ThemeProvider";

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
  const { theme } = useTheme();

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
        {
          borderColor: theme.tint,
          backgroundColor: value ? theme.accent : theme.tintLight,
        },
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <View
        style={[
          styles.iconWrap,
          {
            backgroundColor: value ? theme.tintLight : theme.background,
          },
        ]}
      >
        {value ? (
          <Check size={16} color={theme.tint} strokeWidth={3} />
        ) : (
          <Accessibility size={16} color={theme.tint} strokeWidth={2.5} />
        )}
      </View>
      <View style={styles.textWrap}>
        <Text
          style={[
            styles.label,
            { color: value ? theme.background : theme.tint },
          ]}
        >
          {value ? "Step-free route on" : "Step-free route"}
        </Text>
        {!value && (
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            Uses ramps and step-free entrances
          </Text>
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
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: {
    flex: 1,
    gap: 1,
  },
  label: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  hint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
