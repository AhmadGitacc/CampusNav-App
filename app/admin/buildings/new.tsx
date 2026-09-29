import React, { useCallback, useMemo } from "react";
import {
  Alert,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/components/ThemeProvider";
import type { Theme } from "@/constants/colors";
import { useCreateBuilding } from "@/lib/api/admin";
import { useAdminCampus } from "@/components/AdminCampusProvider";
import { BuildingForm } from "@/components/BuildingForm";

/** Add one building by hand (Feature 10 §7.4). */
export default function NewBuildingScreen() {
  const insets = useSafeAreaInsets();
  const { campus } = useAdminCampus();
  const create = useCreateBuilding();
  const { theme, statusBarStyle } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const goBack = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/admin/buildings");
    }
  }, []);

  const handleSubmit = useCallback(
    async (values: Parameters<typeof create.mutateAsync>[0]["values"]) => {
      if (!campus) {
        Alert.alert("No campus selected", "Pick a campus on the content screen first.");
        return;
      }
      try {
        await create.mutateAsync({ campusId: campus.id, values });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace("/admin/buildings");
      } catch (error) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(
          "Couldn't save",
          error instanceof Error ? error.message : "Please try again."
        );
      }
    },
    [campus, create]
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={statusBarStyle} />
      <View style={[styles.header, { paddingTop: insets.top + webTopInset + 10 }]}>
        <Pressable
          onPress={goBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          accessibilityLabel="Back"
        >
          <ArrowLeft size={22} color={theme.text} strokeWidth={2.5} />
        </Pressable>
        <Text style={styles.title}>New building</Text>
        <View style={styles.headerSpacer} />
      </View>
      <BuildingForm
        submitLabel="Add building"
        isSubmitting={create.isPending}
        onSubmit={(values) => void handleSubmit(values)}
      />
    </View>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: theme.card,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  headerSpacer: { width: 44 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.95 }] },
  title: {
    flex: 1,
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: theme.text,
    textAlign: "center",
  },
});
