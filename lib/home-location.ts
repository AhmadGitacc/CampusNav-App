import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";

/**
 * The user's saved home for one-tap directions (Feature 7 §6.5).
 *
 * Same two-store design as `lib/prefs.ts`:
 * - **AsyncStorage** (`home:location`) is the source of truth so the feature
 *   works before sign-in and offline.
 * - **`profiles.home_lat` / `profiles.home_lng`** mirror it for the signed-in
 *   user; the RLS column grant in migration 0001 permits exactly these two
 *   coordinate columns. The account's copy is pulled once per session and the
 *   local value wins until then.
 */

export const HOME_STORAGE_KEY = "home:location";

export interface HomeLocation {
  lat: number;
  lng: number;
}

async function readStoredHome(): Promise<HomeLocation | null> {
  try {
    const raw = await AsyncStorage.getItem(HOME_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as HomeLocation).lat === "number" &&
      typeof (parsed as HomeLocation).lng === "number"
    ) {
      return parsed as HomeLocation;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeStoredHome(location: HomeLocation): Promise<void> {
  try {
    await AsyncStorage.setItem(HOME_STORAGE_KEY, JSON.stringify(location));
  } catch {
    // Nothing to do: home simply will not survive a restart.
  }
}

export interface HomePreference {
  home: HomeLocation | null;
  /** False until the stored value has been read, to avoid a flash of nothing. */
  ready: boolean;
  setHome: (location: HomeLocation) => void;
}

export function useHomeLocation(): HomePreference {
  const [home, setHomeState] = useState<HomeLocation | null>(null);
  const [ready, setReady] = useState(false);
  const { user, configured } = useAuth();
  const syncedUserRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    void readStoredHome().then((stored) => {
      if (!active) return;
      setHomeState(stored);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  // Pull the account's copy once per session. Deliberately one-shot: re-reading
  // on every render would fight a home the user just saved on this device.
  useEffect(() => {
    if (!configured || !user || syncedUserRef.current === user.id) return;
    syncedUserRef.current = user.id;
    let active = true;
    void getSupabase()
      .from("profiles")
      .select("home_lat, home_lng")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active || error || !data) return;
        if (
          typeof data.home_lat === "number" &&
          typeof data.home_lng === "number"
        ) {
          const accountHome = { lat: data.home_lat, lng: data.home_lng };
          setHomeState(accountHome);
          void writeStoredHome(accountHome);
        }
      });
    return () => {
      active = false;
    };
  }, [configured, user]);

  const setHome = useCallback(
    (location: HomeLocation) => {
      setHomeState(location);
      void writeStoredHome(location);
      if (configured && user) {
        void getSupabase()
          .from("profiles")
          .update({ home_lat: location.lat, home_lng: location.lng })
          .eq("id", user.id);
      }
    },
    [configured, user]
  );

  return { home, ready, setHome };
}