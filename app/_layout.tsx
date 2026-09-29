import { Stack } from "expo-router";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/components/AuthProvider";
import {
  QUERY_CACHE_MAX_AGE,
  queryClient,
  queryPersister,
} from "@/lib/query-client";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false, headerBackTitle: "Back" }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="map" />
      <Stack.Screen name="(auth)" />
    </Stack>
  );
}

/**
 * Holds the splash screen until the persisted cache is back.
 *
 * PersistQueryClientProvider renders children immediately, so without this the
 * app would show a loading state for a moment on every cold start — most
 * noticeable offline, where the cache is the only source of data.
 */
export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [cacheRestored, setCacheRestored] = useState(false);

  useEffect(() => {
    if (fontsLoaded && cacheRestored) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, cacheRestored]);

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      {/* Restores the persisted cache so a cold offline start renders real data
          instead of an empty list. */}
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: queryPersister, maxAge: QUERY_CACHE_MAX_AGE }}
        onSuccess={() => setCacheRestored(true)}
        onError={() => setCacheRestored(true)}
      >
        <AuthProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <RootLayoutNav />
            </KeyboardProvider>
          </GestureHandlerRootView>
        </AuthProvider>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  );
}
