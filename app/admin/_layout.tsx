import { router, Stack } from "expo-router";
import React, { useEffect, useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowLeft, ShieldOff } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/components/ThemeProvider";
import type { Theme } from "@/constants/colors";
import { useRole } from "@/lib/useRole";
import { AdminCampusProvider } from "@/components/AdminCampusProvider";

/**
 * Admin shell and the client-side half of the admin gate (Feature 10 §7.3).
 *
 * This is UX, not security. The real boundary is `app_metadata.role` in the JWT,
 * which every policy in supabase/migrations/0005_admin_cms.sql tests — a user
 * who edited this file out of their build would find every write rejected by
 * Postgres. Doing the check here still matters: it stops a non-admin seeing a
 * screen full of controls that cannot work, and it keeps the audit log (staff
 * data) out of reach.
 */
export default function AdminLayout() {
  const { isAdmin, loading, configured } = useRole();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  // A signed-in non-admin who deep-links into /admin goes back out rather than
  // sitting on a permission screen they cannot act on.
  useEffect(() => {
    if (!loading && !isAdmin) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/");
      }
    }
  }, [isAdmin, loading]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="small" color={theme.tint} />
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={styles.centered}>
        <View style={styles.deniedIcon}>
          <ShieldOff size={28} color={theme.gray} strokeWidth={2} />
        </View>
        <Text style={styles.deniedTitle}>Staff only</Text>
        <Text style={styles.deniedText}>
          {configured
            ? "This area is for campus administrators."
            : "Sign in to an administrator account to manage campus data."}
        </Text>
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.replace("/");
          }}
          style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
        >
          <ArrowLeft size={18} color={theme.tint} strokeWidth={2.5} />
          <Text style={styles.backText}>Back to the map</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <AdminCampusProvider>
      <Stack screenOptions={{ headerShown: false, headerBackTitle: "Back" }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="buildings" />
        <Stack.Screen name="buildings/new" />
        <Stack.Screen name="buildings/[id]" />
        <Stack.Screen name="corrections" />
        <Stack.Screen name="import" />
      </Stack>
    </AdminCampusProvider>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 8,
    backgroundColor: theme.backgroundSecondary,
  },
  deniedIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: theme.tintLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  deniedTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: theme.text,
  },
  deniedText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: theme.gray,
    textAlign: "center",
    lineHeight: 20,
  },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    backgroundColor: theme.tintLight,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  backPressed: {
    transform: [{ scale: 0.98 }],
  },
  backText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: theme.tint,
  },
});
