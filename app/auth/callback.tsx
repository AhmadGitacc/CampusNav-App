import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useTheme } from "@/components/ThemeProvider";

/**
 * Landing route for `myapp://auth/callback`. AuthProvider consumes the tokens
 * from the URL; this screen only prevents a not-found flash while that happens.
 */
export default function AuthCallbackScreen() {
  const { theme } = useTheme();

  useEffect(() => {
    router.replace("/");
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={theme.tint} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
