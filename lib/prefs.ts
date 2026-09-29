import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";

/**
 * The step-free preference (Feature 5).
 *
 * Two stores on purpose:
 *
 * - **AsyncStorage** (`pref:stepFree`) is the source of truth. The app has to
 *   work before sign-in and with no network, and a routing preference that
 *   needs an account to remember is a bug report waiting to happen.
 * - **`profiles.pref_step_free`** mirrors it for a signed-in user so the setting
 *   follows them to another device. It is written on every change and read once
 *   when a session first appears — the local value wins until then, so a slow
 *   read never flips a toggle the user just tapped.
 */

export const STEP_FREE_STORAGE_KEY = "pref:stepFree";

async function readStoredPreference(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(STEP_FREE_STORAGE_KEY);
    return raw === "true";
  } catch {
    // Storage unavailable (private mode, quota): default to the safer option,
    // which is off — a route that wrongly claims to be step-free is worse than
    // one that makes no accessibility claim at all.
    return false;
  }
}

async function writeStoredPreference(value: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(STEP_FREE_STORAGE_KEY, value ? "true" : "false");
  } catch {
    // Nothing to do: the preference simply will not survive a restart.
  }
}

export interface StepFreePreference {
  stepFree: boolean;
  /** False until the stored value has been read, to avoid a flash of the default. */
  ready: boolean;
  setStepFree: (value: boolean) => void;
}

export function useStepFreePreference(): StepFreePreference {
  const [stepFree, setStepFreeState] = useState(false);
  const [ready, setReady] = useState(false);
  const { user, configured } = useAuth();
  const syncedUserRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    void readStoredPreference().then((stored) => {
      if (!active) return;
      setStepFreeState(stored);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  // Pull the account's copy once per session. Deliberately one-shot: re-reading
  // on every render would fight the local toggle.
  useEffect(() => {
    if (!configured || !user || syncedUserRef.current === user.id) return;
    syncedUserRef.current = user.id;
    let active = true;
    void getSupabase()
      .from("profiles")
      .select("pref_step_free")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active || error || !data) return;
        if (typeof data.pref_step_free === "boolean") {
          setStepFreeState(data.pref_step_free);
          void writeStoredPreference(data.pref_step_free);
        }
      });
    return () => {
      active = false;
    };
  }, [configured, user]);

  const setStepFree = useCallback(
    (value: boolean) => {
      setStepFreeState(value);
      void writeStoredPreference(value);
      if (configured && user) {
        void getSupabase()
          .from("profiles")
          .update({ pref_step_free: value })
          .eq("id", user.id);
      }
    },
    [configured, user]
  );

  return { stepFree, ready, setStepFree };
}
