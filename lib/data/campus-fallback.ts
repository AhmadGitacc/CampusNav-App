import type { Building, Campus } from "@shared/types";

/**
 * The one place NSUK campus data is written down.
 *
 * Used by `npm run db:seed` to populate Postgres, and by the app as the
 * guest-mode fallback while the backend is unconfigured. Keeping both on the
 * same dataset means the seeded database and the offline experience can never
 * drift apart.
 *
 * Ids here are readable slugs; the database assigns its own uuids.
 */
export const SEED_CAMPUSES: Campus[] = [
  {
    id: "nsuk",
    slug: "nsuk",
    name: "Nasarawa State University (NSUK)",
    location: "Keffi, Nasarawa State",
    lat: 8.8471,
    lng: 7.8776,
    zoom: 0.008,
    icon: "map-pin",
  },
];

export const SEED_BUILDINGS: Record<string, Building[]> = {
  nsuk: [
    {
      id: "nsuk-senate",
      campusId: "nsuk",
      name: "Senate Building",
      description: "NSUK Senate Building - Administrative headquarters",
      category: "admin",
      lat: 8.849,
      lng: 7.8785,
      icon: "building",
      aliases: ["vc's office", "vc lodge", "admin block", "administration"],
      openingHours: "Mon-Fri 08:00-17:00",
      isAccessibleEntry: true,
    },
    {
      id: "nsuk-faculty-of-law",
      campusId: "nsuk",
      name: "Faculty of Law",
      description: "Faculty of Law - Legal studies department",
      category: "faculty",
      lat: 8.8465,
      lng: 7.876,
      icon: "book",
      aliases: ["law faculty", "department of law", "law"],
      openingHours: "Mon-Fri 08:00-18:00",
      isAccessibleEntry: true,
    },
    {
      id: "nsuk-main-library",
      campusId: "nsuk",
      name: "Main Library",
      description: "NSUK Main Library - Knowledge center",
      category: "library",
      lat: 8.8475,
      lng: 7.877,
      icon: "library",
      aliases: ["main lib", "university library", "library", "jolly lafra"],
      openingHours: "Mon-Sat 08:00-20:00",
      isAccessibleEntry: true,
    },
    {
      id: "nsuk-convocation-square",
      campusId: "nsuk",
      name: "Convocation Square",
      description: "Convocation Square - Events and ceremonies",
      category: "event",
      lat: 8.8482,
      lng: 7.8795,
      icon: "flag",
      aliases: ["convocation ground", "ceremony square", "convocation"],
      openingHours: null,
      isAccessibleEntry: true,
    },
  ],
};

/** Building set for a campus, or an empty list when the campus is unknown. */
export function fallbackBuildings(campusSlug: string | undefined): Building[] {
  if (!campusSlug) return [];
  return SEED_BUILDINGS[campusSlug] ?? [];
}
