export interface LatLon {
  latitude: number;
  longitude: number;
}

export interface LatLngPair {
  lat: number;
  lng: number;
}

/**
 * Marker glyph keys. Kept in lockstep with `markerIconNames` in shared/schema.ts
 * (the enum the form validates against) and `lib/icon-registry.ts` (labels,
 * keywords and the lucide component). The five original names stay first so
 * rows written before the library grew keep resolving.
 */
export type MarkerIconName =
  // Original five
  | "building"
  | "book"
  | "library"
  | "flag"
  | "map-pin"
  // Academic
  | "graduation-cap"
  | "pencil"
  | "flask"
  | "laptop"
  | "palette"
  | "microscope"
  | "ruler"
  // Facilities
  | "warehouse"
  | "bed"
  | "store"
  | "coffee"
  | "utensils"
  | "door"
  | "accessibility"
  // Services
  | "landmark"
  | "stethoscope"
  | "shield"
  | "banknote"
  | "wrench"
  | "mail"
  | "package"
  | "briefcase"
  // Sports & recreation
  | "dumbbell"
  | "trophy"
  | "volleyball"
  | "bike"
  | "waves"
  | "gamepad"
  | "music"
  // Outdoors & transport
  | "trees"
  | "parking"
  | "bus"
  | "car"
  | "footprints"
  | "tent"
  // Health & safety
  | "heart"
  | "cross"
  | "life-buoy"
  | "flame"
  | "siren"
  // General
  | "star"
  | "clock"
  | "users";

export interface CampusMarker {
  id: string;
  title: string;
  description: string;
  lat: number;
  lng: number;
  icon: MarkerIconName;
}

export interface Campus {
  id: string;
  slug: string;
  name: string;
  location: string;
  lat: number;
  lng: number;
  zoom: number;
  icon: MarkerIconName;
}

export type BuildingCategory =
  | "admin"
  | "faculty"
  | "library"
  | "event"
  | "hostel"
  | "cafeteria"
  | "sports"
  | "health"
  | "parking"
  | "toilet";

export interface Building {
  id: string;
  campusId: string;
  name: string;
  description: string;
  category: BuildingCategory;
  lat: number;
  lng: number;
  icon: MarkerIconName;
  aliases: string[];
  openingHours: string | null;
  isAccessibleEntry: boolean;
}

/** Shape the map components consume (see components/CampusMap.*.tsx). */
export function toCampusMarker(building: Building): CampusMarker {
  return {
    id: building.id,
    title: building.name,
    description: building.description,
    lat: building.lat,
    lng: building.lng,
    icon: building.icon,
  };
}
