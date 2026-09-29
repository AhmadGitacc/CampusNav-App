import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MarkerIconName } from "@shared/types";

/**
 * Recent places the user looked up (Feature 7 §6.4).
 *
 * Lives entirely on-device — favourites need an account, a browsing history
 * shouldn't. Stored most-recent-first, deduped by building id, capped at 10.
 * Written only when a result is *chosen*, never on a keystroke. Every call is
 * fail-soft: a full or unavailable store degrades to an empty history.
 */

const STORAGE_KEY = "recent:searches";
const MAX_ITEMS = 10;

export interface RecentItem {
  id: string;
  name: string;
  description?: string;
  icon?: MarkerIconName;
}

async function readStored(): Promise<RecentItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecentItem[]) : [];
  } catch {
    return [];
  }
}

async function writeStored(items: RecentItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Nothing to do: the history simply will not survive a restart.
  }
}

export async function getRecents(): Promise<RecentItem[]> {
  return readStored();
}

/** Insert at the front (or move an existing entry there) and return the list. */
export async function pushRecent(item: RecentItem): Promise<RecentItem[]> {
  const current = await readStored();
  const next = [item, ...current.filter((existing) => existing.id !== item.id)].slice(
    0,
    MAX_ITEMS
  );
  await writeStored(next);
  return next;
}

export async function clearRecents(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do.
  }
}