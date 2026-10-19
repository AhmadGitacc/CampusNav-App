import React from "react";
import { Platform, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CloudOff } from "lucide-react-native";
import Animated, { FadeInUp, FadeOutDown } from "react-native-reanimated";
import { usePathname } from "expo-router";
import { useTheme } from "@/components/ThemeProvider";
import { useOnline } from "@/lib/useOnline";

/**
 * A floating "you're offline" toast, mounted once in the root layout so every
 * screen — user and admin — gets it without each one wiring a banner.
 *
 * The map screen is skipped: `app/map.tsx` renders its own `OfflineBanner`
 * under the search bar with copy about saved campus data, and two stacked
 * notices would be noise.
 */
export function OfflineToast() {
  const online = useOnline();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { theme } = useTheme();

  if (online || pathname === "/map") return null;

  const top = (Platform.OS === "web" ? 67 : 0) + insets.top + 8;

  return (
    <Animated.View
      entering={FadeInUp.duration(250)}
      exiting={FadeOutDown.duration(250)}
      style={[styles.toast, { top, backgroundColor: theme.warning, shadowColor: theme.shadow }]}
      accessibilityRole="alert"
    >
      <CloudOff size={15} color={theme.background} strokeWidth={2.6} />
      <Text style={[styles.text, { color: theme.background }]}>
        You&apos;re offline — changes can&apos;t be saved
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 30,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  text: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});
