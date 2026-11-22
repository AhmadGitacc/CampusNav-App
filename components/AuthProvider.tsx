import React, { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import type { EmailOtpType, Session, User } from "@supabase/supabase-js";
import { parseAuthCallbackUrl } from "@/lib/auth-redirect";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  configured: boolean;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Holds the Supabase session for the whole app so every screen shares a single
 * auth listener. Mount once, inside <ErrorBoundary>, in app/_layout.tsx.
 * Degrades to a signed-out state when Supabase is not configured, so guest
 * access keeps working.
 *
 * Also consumes the magic-link redirect: the backend callback page hands the
 * tokens back through the app's own URL scheme, and this is where they become
 * a real Supabase session.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const supabase = getSupabase();
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (!active) return;
        setSession(nextSession);
        setLoading(false);
      }
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  // On web Supabase handles the redirect itself (detectSessionInUrl is on).
  // On a device the link arrives as an app URL instead.
  useEffect(() => {
    if (!isSupabaseConfigured || Platform.OS === "web") return;

    const supabase = getSupabase();
    let active = true;

    const consume = async (url: string) => {
      const tokens = parseAuthCallbackUrl(url);
      if (!tokens) return;

      try {
        if (tokens.accessToken && tokens.refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
          });
          if (error) throw error;
        } else if (tokens.tokenHash && tokens.type) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokens.tokenHash,
            type: tokens.type as EmailOtpType,
          });
          if (error) throw error;
        } else {
          return;
        }

        if (active) router.replace("/");
      } catch (error) {
        // Keep the app usable as a guest if the link was malformed or expired.
        console.warn("Could not complete sign-in from link", error);
      }
    };

    const subscription = Linking.addEventListener("url", ({ url }) => {
      void consume(url);
    });
    Linking.getInitialURL()
      .then((url) => {
        if (url) void consume(url);
      })
      .catch(() => {});

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    await getSupabase().auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      configured: isSupabaseConfigured,
      signOut,
    }),
    [session, loading, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
