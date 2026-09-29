import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "@/components/ThemeProvider";

interface RouteProgressBarProps {
  /** 0–1 fraction of the route already walked. */
  progress: number;
}

/**
 * How much of the route is behind the walker. 6px track, radius 3, per the
 * §4 sheet spec; the fill is a flex child so no layout measurement is needed.
 */
export function RouteProgressBar({ progress }: RouteProgressBarProps) {
  const { theme } = useTheme();
  const fraction = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  const percent = Math.round(fraction * 100);

  return (
    <View
      style={[styles.track, { backgroundColor: theme.tintLight }]}
      accessibilityRole="progressbar"
      accessibilityLabel="Route progress"
      accessibilityValue={{ min: 0, max: 100, now: percent }}
    >
      <View
        style={[styles.fill, { flex: Math.max(fraction, 0.01), backgroundColor: theme.tint }]}
      />
      <View style={[styles.remainder, { flex: Math.max(1 - fraction, 0.01) }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
  },
  remainder: {
    height: "100%",
  },
});
