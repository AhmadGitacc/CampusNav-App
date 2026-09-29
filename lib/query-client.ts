import { fetch } from "expo/fetch";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";

/**
 * Gets the base URL for the Express API server (e.g., "http://localhost:3000")
 *
 * Returns "" when EXPO_PUBLIC_DOMAIN is unset so the app can still boot with no
 * network and no config — resolved routes become page-relative on web. A native
 * build has no origin to be relative to, so callers that actually need to hit
 * the network go through requireApiUrl() instead.
 */
export function getApiUrl(): string {
  const host = process.env.EXPO_PUBLIC_DOMAIN;

  if (!host) {
    return "";
  }

  return new URL(`https://${host}`).href;
}

function requireApiUrl(): string {
  const baseUrl = getApiUrl();
  if (!baseUrl && Platform.OS !== "web") {
    throw new Error("EXPO_PUBLIC_DOMAIN is not set");
  }
  return baseUrl;
}

/**
 * True when there is a server worth calling.
 *
 * On web a relative route still resolves against the current origin, so an
 * unset domain is only a hard "no" on native. Callers use this to decide
 * whether a server-only feature (Feature 5's campus graph) is reachable, or
 * whether to fall back to something that works offline.
 */
export function isApiConfigured(): boolean {
  return getApiUrl() !== "" || Platform.OS === "web";
}

function resolveUrl(route: string, baseUrl: string): string {
  // With no configured host, keep the route relative (web resolves it against
  // the current origin).
  return baseUrl ? new URL(route, baseUrl).toString() : route;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  const url = resolveUrl(route, requireApiUrl());

  const res = await fetch(url.toString(), {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = resolveUrl(queryKey.join("/") as string, requireApiUrl());

    const res = await fetch(url.toString(), {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

/**
 * Persists the query cache to AsyncStorage so a cold, offline start still
 * renders campuses, buildings, and anything else already fetched.
 * Rehydrated by PersistQueryClientProvider in app/_layout.tsx.
 */
export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "campusnav-query-cache",
});

/** Persisted cache entries older than a day are dropped on restore. */
export const QUERY_CACHE_MAX_AGE = 24 * 60 * 60_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      // Content is editable from the admin CMS, so don't cache forever.
      staleTime: 5 * 60_000,
      // Keep cached data a full day — this is what makes offline work.
      gcTime: QUERY_CACHE_MAX_AGE,
      retry: 2,
      // Run queries even with no connection so they fail fast and fall back to
      // the persisted cache instead of pausing indefinitely.
      networkMode: "always",
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
      networkMode: "always",
    },
  },
});
