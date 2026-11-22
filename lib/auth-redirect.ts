import "react-native-url-polyfill/auto";
import * as Linking from "expo-linking";

/** Path used both by the app deep link and by the backend callback page. */
export const AUTH_CALLBACK_PATH = "auth/callback";

/**
 * The URL Supabase puts in magic-link emails.
 *
 * Production uses the backend's HTTPS callback page (env-configured in
 * eas.json) so the link is a real web URL that can be allow-listed in Supabase.
 * Development falls back to the app's own deep link.
 */
export function getAuthRedirectUrl(): string {
  const configured = process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL?.trim();
  return configured || getAppAuthDeepLink();
}

/** Deep link the backend callback page uses to hand the session back to us. */
export function getAppAuthDeepLink(): string {
  return Linking.createURL(AUTH_CALLBACK_PATH);
}

export interface AuthCallbackParams {
  accessToken?: string;
  refreshToken?: string;
  tokenHash?: string;
  type?: string;
}

/**
 * Reads the tokens Supabase appends to the redirect URL (in its hash fragment).
 * Supports both the implicit session form and the token_hash verification form.
 */
export function parseAuthCallbackUrl(url: string): AuthCallbackParams | null {
  const hashAt = url.indexOf("#");
  const queryAt = url.indexOf("?");
  const start = hashAt >= 0 ? hashAt : queryAt;
  if (start < 0) return null;

  const raw = url.slice(start + 1);
  if (!raw) return null;

  const params = new URLSearchParams(raw);
  return {
    accessToken: params.get("access_token") ?? undefined,
    refreshToken: params.get("refresh_token") ?? undefined,
    tokenHash: params.get("token_hash") ?? undefined,
    type: params.get("type") ?? undefined,
  };
}
