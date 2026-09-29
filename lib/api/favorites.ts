import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { toBuilding } from "@/lib/api/campuses";
import type { Building } from "@shared/types";

/**
 * A saved building plus the row it came from. `useFavorites` fetches the join
 * server-side (PostgREST embeds `buildings`), so the favorites screen and the
 * map's heart button share one query and one cache entry.
 */
export interface Favorite {
  building: Building;
  createdAt: string;
}

export const FAVORITES_KEY = ["favorites"] as const;

interface FavoriteRow {
  building_id: string;
  created_at: string;
  buildings: Record<string, unknown> | null;
}

/** PostgREST response shape, narrowed to what this read needs. */
type QueryResult<T> = { data: T | null; error: { message: string } | null };

function unwrap<T>(result: QueryResult<T>): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("No data returned");
  return result.data;
}

/**
 * The signed-in user's favorites, most recent first.
 *
 * Disabled (and therefore `undefined`) for guests — both Screens gate on the
 * presence of a session rather than an empty request, so the heart button can
 * tell "signed out" apart from "no favorites".
 */
export function useFavorites() {
  const { user } = useAuth();

  return useQuery<Favorite[]>({
    queryKey: FAVORITES_KEY,
    enabled: isSupabaseConfigured && !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<Favorite[]> => {
      const supabase = getSupabase();
      const result = (await supabase
        .from("favorites")
        .select(
          "building_id, created_at, " +
            "buildings ( id, name, description, category, lat, lng, icon, " +
            "aliases, opening_hours, is_accessible_entry, campus_id )"
        )
        .order("created_at", { ascending: false })) as QueryResult<FavoriteRow[]>;

      const rows = unwrap(result);
      const out: Favorite[] = [];
      for (const row of rows) {
        // A favorite whose building was deleted mid-sync: skip, don't crash.
        if (!row.buildings) continue;
        out.push({
          building: toBuilding(row.buildings),
          createdAt: row.created_at,
        });
      }
      return out;
    },
  });
}

/** True when the given building is among the signed-in user's favorites. */
export function useFavorited(buildingId: string | undefined): boolean {
  const { data: favorites } = useFavorites();
  if (!buildingId || !favorites) return false;
  return favorites.some((f) => f.building.id === buildingId);
}

/**
 * Optimistic add/remove of a favorite.
 *
 * Pass the full `Building` (the map already has it) so the optimistic entry is
 * complete — the favorites screen renders from the same cache without a second
 * lookup. `favorited` is the *current* state: the mutation flips it.
 */
export function useToggleFavorite() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (args: { building: Building; favorited: boolean }) => {
      if (!user) throw new Error("Sign in required");
      const supabase = getSupabase();
      if (args.favorited) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("user_id", user.id)
          .eq("building_id", args.building.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("favorites")
          .insert({ user_id: user.id, building_id: args.building.id });
        if (error) throw new Error(error.message);
      }
    },
    onMutate: async (args) => {
      await queryClient.cancelQueries({ queryKey: FAVORITES_KEY });
      const previous = queryClient.getQueryData<Favorite[]>(FAVORITES_KEY);
      queryClient.setQueryData<Favorite[]>(FAVORITES_KEY, (old) => {
        const list = old ?? [];
        if (args.favorited) {
          return list.filter((f) => f.building.id !== args.building.id);
        }
        return [
          { building: args.building, createdAt: new Date().toISOString() },
          ...list,
        ];
      });
      return { previous };
    },
    onError: (_error, _args, context) => {
      if (context?.previous) {
        queryClient.setQueryData<Favorite[]>(FAVORITES_KEY, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: FAVORITES_KEY });
    },
  });
}