import { useQuery } from "@tanstack/react-query";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type {
  Building,
  BuildingCategory,
  Campus,
  MarkerIconName,
} from "@shared/types";

/** PostgREST returns snake_case columns; the app speaks camelCase. */
function toCampus(row: Record<string, unknown>): Campus {
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    location: row.location as string,
    lat: row.lat as number,
    lng: row.lng as number,
    zoom: (row.zoom as number) ?? 0.008,
    icon: (row.icon as MarkerIconName) ?? "map-pin",
  };
}

function toBuilding(row: Record<string, unknown>): Building {
  return {
    id: row.id as string,
    campusId: row.campus_id as string,
    name: row.name as string,
    description: (row.description as string) ?? "",
    category: row.category as BuildingCategory,
    lat: row.lat as number,
    lng: row.lng as number,
    icon: (row.icon as MarkerIconName) ?? "map-pin",
    aliases: (row.aliases as string[] | null) ?? [],
    openingHours: (row.opening_hours as string | null) ?? null,
    isAccessibleEntry: row.is_accessible_entry !== false,
  };
}

/** PostgREST response shape, narrowed to what these reads need. */
type QueryResult<T> = { data: T | null; error: { message: string } | null };

async function unwrap<T>(result: QueryResult<T>): Promise<T> {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("No data returned");
  return result.data;
}

/** All campuses, alphabetical. Disabled until Supabase is configured. */
export function useCampuses() {
  return useQuery({
    queryKey: ["campuses"],
    enabled: isSupabaseConfigured,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<Campus[]> => {
      const supabase = getSupabase();
      const result = (await supabase
        .from("campuses")
        .select("*")
        .order("name")) as QueryResult<Record<string, unknown>[]>;
      return (await unwrap(result)).map(toCampus);
    },
  });
}

/** One campus by slug — routes carry the slug, not the uuid. */
export function useCampus(slug: string | undefined) {
  return useQuery({
    queryKey: ["campus", slug],
    enabled: isSupabaseConfigured && !!slug,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<Campus | null> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("campuses")
        .select("*")
        .eq("slug", slug!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toCampus(data as Record<string, unknown>) : null;
    },
  });
}

/** Buildings for a campus, resolved through its slug. */
export function useBuildings(campusSlug: string | undefined) {
  const campus = useCampus(campusSlug);

  return useQuery({
    queryKey: ["buildings", campusSlug],
    enabled: isSupabaseConfigured && !!campus.data,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<Building[]> => {
      const supabase = getSupabase();
      const result = (await supabase
        .from("buildings")
        .select("*")
        .eq("campus_id", campus.data!.id)
        .order("name")) as QueryResult<Record<string, unknown>[]>;
      return (await unwrap(result)).map(toBuilding);
    },
  });
}
