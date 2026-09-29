import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Platform, useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SystemUI from "expo-system-ui";
import { palettes, type Theme, type ThemeName } from "@/constants/colors";

/**
 * Theme context (Feature 13 §8.2).
 *
 * Three modes rather than two: "system" is the default and the reason most
 * users never open settings, while an explicit override is what someone needs
 * when the OS is light and they're outdoors on a campus walk.
 *
 * The stored mode is read *before* the splash screen is allowed to hide (see
 * `loadStoredMode` and `app/_layout.tsx`). Reading it here instead would mean
 * painting one frame of the wrong scheme on every cold start, which is exactly
 * the flash §8.6 asks us not to have.
 */

const STORAGE_KEY = "theme:mode";

export type ThemeMode = ThemeModeValue;
type ThemeModeValue = "system" | "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  /** The palette actually in use, after resolving "system". */
  scheme: ThemeName;
  mode: ThemeMode;
  isDark: boolean;
  /**
   * `StatusBar` bar style for a screen whose header is `theme.background`.
   * Screens with a dark full-bleed background must pass `light-content`
   * explicitly instead — the landing gradient is the one case in the app.
   */
  statusBarStyle: "light-content" | "dark-content";
  /**
   * Android nav bar / window background, or null for the theme default. Set it
   * with `useSystemBars`; read it only if you need the resolved value.
   */
  systemBarColor: string | null;
  setSystemBarColor: (color: string | null) => void;
  setMode: (mode: ThemeMode) => void;
  /** Cycles light → dark → system, for a one-tap control. */
  cycleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** What the Android navigation bar falls back to when no screen overrides it. */
const SYSTEM_BAR_DEFAULT = null;

/**
 * Read the persisted override. Exported so the splash gate can await it before
 * the tree renders, which is why it is a plain function and not an effect.
 */
export async function loadStoredMode(): Promise<ThemeMode> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
    return "system";
  } catch {
    // An unavailable store just means we follow the system this session.
    return "system";
  }
}

export function ThemeProvider({
  initialMode = "system",
  children,
}: {
  initialMode?: ThemeMode;
  children: React.ReactNode;
}) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(initialMode);
  const [systemBarColor, setSystemBarColor] = useState<string | null>(
    SYSTEM_BAR_DEFAULT
  );

  const scheme: ThemeName = mode === "system" ? (systemScheme ?? "light") : mode;

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // A full or unavailable store costs the preference, not the session.
    });
  }, []);

  const cycleMode = useCallback(() => {
    setMode(mode === "light" ? "dark" : mode === "dark" ? "system" : "light");
  }, [mode, setMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: palettes[scheme],
      scheme,
      mode,
      isDark: scheme === "dark",
      statusBarStyle: scheme === "dark" ? "light-content" : "dark-content",
      systemBarColor,
      setSystemBarColor,
      setMode,
      cycleMode,
    }),
    [scheme, mode, systemBarColor, setMode, cycleMode]
  );

  return (
    <ThemeContext.Provider value={value}>
      <SystemBarSync />
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * The active palette.
 *
 * Falls back to light rather than throwing when there is no provider. That
 * matters for `ErrorFallback`, which by definition renders when something
 * above it in the tree has already failed — including the provider itself — and
 * a crash screen that throws again is useless.
 */
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value) return value;
  return {
    theme: palettes.light,
    scheme: "light",
    mode: "system",
    isDark: false,
    statusBarStyle: "dark-content",
    systemBarColor: null,
    setSystemBarColor: () => {},
    setMode: () => {},
    cycleMode: () => {},
  };
}

/**
 * Colours the Android navigation bar and the area behind the app.
 *
 * Lives in the provider rather than as a per-screen effect because the answer
 * changes as you navigate: the map and the admin list want `theme.background`,
 * the landing and sign-in screens are a green gradient edge to edge, and on
 * Android anything else leaves a pale band under the gesture bar. Keeping one
 * value here means the last screen to take control is always the one that has
 * it, and stepping back out restores the theme default with no ordering race
 * between a parent's effect and a child's.
 */
export function useSystemBars(background: string | null): void {
  const { theme, setSystemBarColor } = useTheme();
  const fallback = background ?? theme.background;

  useEffect(() => {
    // `expo-system-ui` has no web implementation and nothing to set there.
    if (Platform.OS === "web") return;
    setSystemBarColor(fallback);
    return () => setSystemBarColor(SYSTEM_BAR_DEFAULT);
  }, [fallback, setSystemBarColor]);
}

/** Applies the resolved system bar colour; rendered once by the root layout. */
function SystemBarSync() {
  const { theme, systemBarColor } = useTheme();
  const color = systemBarColor ?? theme.background;

  useEffect(() => {
    if (Platform.OS === "web") return;
    void SystemUI.setBackgroundColorAsync(color);
  }, [color]);

  return null;
}
