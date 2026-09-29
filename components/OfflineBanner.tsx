import { StyleSheet, Text } from "react-native";
import { CloudOff } from "lucide-react-native";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";
import { useTheme } from "@/components/ThemeProvider";

/**
 * Offline notice. Reuses the hint-bar pill tokens from `app/map.tsx` (raised
 * surface, radius 30, `Inter_500Medium 14`) per style.md §Radius / §Shadow.
 *
 * Sits on top of the map, so it takes a raised surface rather than
 * `backgroundSecondary` — in dark mode a mid-grey pill over dark tiles is the
 * only thing on screen a user can actually read.
 */
export function OfflineBanner({ top }: { top: number }) {
  const { theme } = useTheme();

  return (
    <Animated.View
      entering={FadeInDown.duration(300)}
      exiting={FadeOutUp.duration(250)}
      style={[
        styles.banner,
        { top, backgroundColor: theme.surface, shadowColor: theme.shadow },
      ]}
    >
      <CloudOff size={16} color={theme.warning} strokeWidth={2.5} />
      <Text style={[styles.text, { color: theme.text }]}>
        Offline — showing saved campus data
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    alignSelf: "center",
    // Sits above the map but below the search bar + its results (zIndex 9).
    zIndex: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 30,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  text: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
});
