import { StyleSheet, Text } from "react-native";
import { CloudOff } from "lucide-react-native";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";

/**
 * Offline notice. Reuses the hint-bar pill tokens from `app/map.tsx` (white
 * surface, radius 30, `Inter_500Medium 14`) per style.md §Radius / §Shadow.
 */
export function OfflineBanner({ top }: { top: number }) {
  return (
    <Animated.View
      entering={FadeInDown.duration(300)}
      exiting={FadeOutUp.duration(250)}
      style={[styles.banner, { top }]}
    >
      <CloudOff size={16} color="#8A6D1F" strokeWidth={2.5} />
      <Text style={styles.text}>Offline — showing saved campus data</Text>
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
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  text: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#1B2E1B",
  },
});
