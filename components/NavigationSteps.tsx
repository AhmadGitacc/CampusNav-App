import React, { useCallback, useEffect, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  Compass,
  CornerDownLeft,
  CornerDownRight,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  RotateCcw,
  Undo2,
  type LucideIcon,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { formatDistance } from "@/lib/geo";
import type { ManeuverIconName, NavStep } from "@/lib/navigation/instructions";
import { useTheme } from "@/components/ThemeProvider";

const GLYPHS: Record<ManeuverIconName, LucideIcon> = {
  depart: Compass,
  left: CornerUpLeft,
  "slight-left": ArrowLeft,
  "sharp-left": CornerDownLeft,
  right: CornerUpRight,
  "slight-right": ArrowRight,
  "sharp-right": CornerDownRight,
  "u-turn": Undo2,
  straight: ArrowUp,
  roundabout: RotateCcw,
  merge: ArrowUpRight,
  arrive: Flag,
};

interface ManeuverGlyphProps {
  icon: ManeuverIconName;
  size?: number;
  color?: string;
}

/** The single icon mapping for maneuvers — see style.md §8. */
export function ManeuverGlyph({
  icon,
  size = 22,
  color,
}: ManeuverGlyphProps) {
  const { theme } = useTheme();
  const Glyph = GLYPHS[icon] ?? ArrowUp;
  return (
    <Glyph size={size} color={color ?? theme.tint} strokeWidth={2.5} />
  );
}

interface NavigationStepsProps {
  steps: NavStep[];
  /** Index of the step the walker is on (or the upcoming cue). */
  activeIndex: number;
  expanded: boolean;
  onToggle: () => void;
}

/**
 * Collapsible list of every maneuver on the route. Rows reuse the
 * `searchResultItem` tokens from `app/map.tsx` so the sheet reads as one
 * surface (style.md §5).
 */
export function NavigationSteps({
  steps,
  activeIndex,
  expanded,
  onToggle,
}: NavigationStepsProps) {
  const scrollRef = useRef<ScrollView>(null);
  const offsetsRef = useRef<Record<number, number>>({});
  const { theme } = useTheme();

  const handleLayout = useCallback((index: number, y: number) => {
    offsetsRef.current[index] = y;
  }, []);

  // Keep the upcoming maneuver in view as the walker advances.
  useEffect(() => {
    if (!expanded) return;
    const y = offsetsRef.current[activeIndex];
    if (y === undefined) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  }, [activeIndex, expanded]);

  if (steps.length === 0) return null;

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onToggle();
        }}
        style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <Text style={[styles.headerLabel, { color: theme.text }]}>
          Steps ({steps.length})
        </Text>
        {expanded ? (
          <ChevronUp size={18} color={theme.tint} strokeWidth={2.5} />
        ) : (
          <ChevronDown size={18} color={theme.tint} strokeWidth={2.5} />
        )}
      </Pressable>

      {expanded && (
        <ScrollView
          ref={scrollRef}
          style={[styles.list, { backgroundColor: theme.surface }]}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
        >
          {steps.map((step, index) => {
            const isActive = index === activeIndex;
            const isDone = index < activeIndex;
            const tint = isActive ? theme.tint : theme.gray;

            return (
              <View
                key={`${step.type}-${index}`}
                onLayout={(event) => handleLayout(index, event.nativeEvent.layout.y)}
                style={[
                  styles.row,
                  { borderBottomColor: theme.separator },
                  isActive && { backgroundColor: theme.tintLight },
                  isDone && { backgroundColor: theme.surfacePressed },
                ]}
              >
                <View
                  style={[
                    styles.indicator,
                    isActive && { backgroundColor: theme.tint },
                  ]}
                />
                <ManeuverGlyph icon={step.icon} size={18} color={tint} />
                <View style={styles.rowText}>
                  <Text
                    style={[
                      styles.rowInstruction,
                      isActive
                        ? styles.rowInstructionActive
                        : isDone
                          ? { color: theme.gray }
                          : { color: theme.text },
                    ]}
                    numberOfLines={2}
                  >
                    {step.instruction}
                  </Text>
                  {step.distance > 0 && (
                    <Text
                      style={[
                        styles.rowDistance,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {formatDistance(step.distance)}
                    </Text>
                  )}
                </View>
                {isActive && <Check size={16} color={theme.tint} strokeWidth={2.5} />}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  headerPressed: {
    opacity: 0.7,
  },
  headerLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  list: {
    maxHeight: 200,
    borderRadius: 14,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  // A 3px dot, not just a hue shift, marks the active step (style.md §9).
  indicator: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "transparent",
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  rowInstruction: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  rowInstructionActive: {
    fontFamily: "Inter_600SemiBold",
  },
  rowDistance: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
});
