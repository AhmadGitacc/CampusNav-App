export interface LatLon {
  latitude: number;
  longitude: number;
}

export interface LatLngPair {
  lat: number;
  lng: number;
}

export type MarkerIconName =
  | "building"
  | "book"
  | "library"
  | "flag"
  | "map-pin";

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
