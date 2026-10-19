import type { ComponentType } from "react";
import {
  Accessibility,
  Banknote,
  BedDouble,
  Bike,
  BookOpen,
  Briefcase,
  Building2,
  Bus,
  Car,
  Clock,
  Coffee,
  Cross,
  DoorOpen,
  Dumbbell,
  Flag,
  FlaskConical,
  Flame,
  Footprints,
  Gamepad2,
  GraduationCap,
  HeartPulse,
  Landmark,
  Laptop,
  Library,
  LifeBuoy,
  Mail,
  MapPin,
  Microscope,
  Music,
  Package,
  Palette,
  Pencil,
  Ruler,
  Shield,
  Siren,
  Star,
  Stethoscope,
  Store,
  SquareParking,
  Tent,
  Trees,
  Trophy,
  Utensils,
  Users,
  Warehouse,
  Waves,
  Volleyball,
  Wrench,
  type LucideProps,
} from "lucide-react-native";
import type { BuildingCategory, MarkerIconName } from "@shared/types";

/**
 * The marker icon library (Feature 10 §7.4).
 *
 * One registry — name, human label, search keywords, group and the lucide
 * component — so the picker, the form and `MarkerIcon` all read the same list.
 * `markerIconNames` in shared/schema.ts mirrors the keys here; the schema is the
 * validation boundary (it must stay react-free for the server), this file is
 * the presentation half.
 */

export type IconGroup =
  | "academic"
  | "facilities"
  | "services"
  | "sports"
  | "outdoors"
  | "health"
  | "general";

export const ICON_GROUPS: { id: IconGroup; label: string }[] = [
  { id: "academic", label: "Academic" },
  { id: "facilities", label: "Facilities" },
  { id: "services", label: "Services" },
  { id: "sports", label: "Sports" },
  { id: "outdoors", label: "Outdoors" },
  { id: "health", label: "Health" },
  { id: "general", label: "General" },
];

export interface IconEntry {
  name: MarkerIconName;
  label: string;
  /** Extra words the search should match, beyond the label. */
  keywords: string;
  group: IconGroup;
  Component: ComponentType<LucideProps>;
}

export const ICON_REGISTRY: Record<MarkerIconName, IconEntry> = {
  // Original five
  building: { name: "building", label: "Building", keywords: "hall block office", group: "general", Component: Building2 },
  book: { name: "book", label: "Book", keywords: "study reading", group: "academic", Component: BookOpen },
  library: { name: "library", label: "Library", keywords: "books reading collection", group: "academic", Component: Library },
  flag: { name: "flag", label: "Flag", keywords: "landmark point", group: "general", Component: Flag },
  "map-pin": { name: "map-pin", label: "Map pin", keywords: "location marker place", group: "general", Component: MapPin },
  // Academic
  "graduation-cap": { name: "graduation-cap", label: "Graduation cap", keywords: "faculty lecture graduation school", group: "academic", Component: GraduationCap },
  pencil: { name: "pencil", label: "Pencil", keywords: "art class studio drawing write", group: "academic", Component: Pencil },
  flask: { name: "flask", label: "Flask", keywords: "science lab chemistry research", group: "academic", Component: FlaskConical },
  laptop: { name: "laptop", label: "Laptop", keywords: "computer lab ict tech", group: "academic", Component: Laptop },
  palette: { name: "palette", label: "Palette", keywords: "art design creative", group: "academic", Component: Palette },
  microscope: { name: "microscope", label: "Microscope", keywords: "science lab biology research", group: "academic", Component: Microscope },
  ruler: { name: "ruler", label: "Ruler", keywords: "engineering workshop drawing", group: "academic", Component: Ruler },
  // Facilities
  warehouse: { name: "warehouse", label: "Warehouse", keywords: "store depot storehouse", group: "facilities", Component: Warehouse },
  bed: { name: "bed", label: "Bed", keywords: "hostel dorm residence sleep", group: "facilities", Component: BedDouble },
  store: { name: "store", label: "Shop", keywords: "store market bookstore shop", group: "facilities", Component: Store },
  coffee: { name: "coffee", label: "Coffee", keywords: "cafe cafe tea refreshment", group: "facilities", Component: Coffee },
  utensils: { name: "utensils", label: "Food", keywords: "canteen cafeteria dining eat restaurant", group: "facilities", Component: Utensils },
  door: { name: "door", label: "Door", keywords: "entrance exit gate", group: "facilities", Component: DoorOpen },
  accessibility: { name: "accessibility", label: "Accessible", keywords: "wheelchair ramp disabled step-free", group: "facilities", Component: Accessibility },
  // Services
  landmark: { name: "landmark", label: "Landmark", keywords: "bank government administration civic", group: "services", Component: Landmark },
  stethoscope: { name: "stethoscope", label: "Clinic", keywords: "medical health doctor infirmary", group: "health", Component: Stethoscope },
  shield: { name: "shield", label: "Security", keywords: "safety guard patrol police", group: "services", Component: Shield },
  banknote: { name: "banknote", label: "ATM", keywords: "cash money bank finance payment", group: "services", Component: Banknote },
  wrench: { name: "wrench", label: "Workshop", keywords: "repair maintenance engineering", group: "services", Component: Wrench },
  mail: { name: "mail", label: "Post office", keywords: "mail letters courier postal", group: "services", Component: Mail },
  package: { name: "package", label: "Store room", keywords: "warehouse storage parcels", group: "services", Component: Package },
  briefcase: { name: "briefcase", label: "Office", keywords: "work administration staff", group: "services", Component: Briefcase },
  // Sports & recreation
  dumbbell: { name: "dumbbell", label: "Gym", keywords: "fitness workout weights", group: "sports", Component: Dumbbell },
  trophy: { name: "trophy", label: "Trophy", keywords: "award ceremony victory", group: "sports", Component: Trophy },
  volleyball: { name: "volleyball", label: "Ball games", keywords: "football soccer sport pitch court", group: "sports", Component: Volleyball },
  bike: { name: "bike", label: "Bike", keywords: "cycling rack parking", group: "outdoors", Component: Bike },
  waves: { name: "waves", label: "Pool", keywords: "swimming aquatic water", group: "sports", Component: Waves },
  gamepad: { name: "gamepad", label: "Games", keywords: "gaming recreation lounge", group: "sports", Component: Gamepad2 },
  music: { name: "music", label: "Music", keywords: "auditorium performance band choir", group: "sports", Component: Music },
  // Outdoors & transport
  trees: { name: "trees", label: "Garden", keywords: "park trees green outdoor nature", group: "outdoors", Component: Trees },
  parking: { name: "parking", label: "Parking", keywords: "car park vehicles lot", group: "outdoors", Component: SquareParking },
  bus: { name: "bus", label: "Bus stop", keywords: "shuttle transport transit", group: "outdoors", Component: Bus },
  car: { name: "car", label: "Drop-off", keywords: "vehicle car park entrance", group: "outdoors", Component: Car },
  footprints: { name: "footprints", label: "Walkway", keywords: "path footpath trail walking", group: "outdoors", Component: Footprints },
  tent: { name: "tent", label: "Camp", keywords: "tent campsite outdoor", group: "outdoors", Component: Tent },
  // Health & safety
  heart: { name: "heart", label: "First aid", keywords: "health medical emergency care", group: "health", Component: HeartPulse },
  cross: { name: "cross", label: "Hospital", keywords: "medical clinic health", group: "health", Component: Cross },
  "life-buoy": { name: "life-buoy", label: "Help point", keywords: " assistance emergency support", group: "health", Component: LifeBuoy },
  flame: { name: "flame", label: "Fire point", keywords: "fire emergency extinguisher", group: "health", Component: Flame },
  siren: { name: "siren", label: "Siren", keywords: "alarm emergency security", group: "health", Component: Siren },
  // General
  star: { name: "star", label: "Star", keywords: "landmark popular notable", group: "general", Component: Star },
  clock: { name: "clock", label: "Clock", keywords: "time hours", group: "general", Component: Clock },
  users: { name: "users", label: "People", keywords: "community gathering students", group: "general", Component: Users },
};

/**
 * Which icon groups to surface first for a building category. The picker shows
 * these as the "Suggested" tab the moment a category is chosen, so the right
 * glyph is usually one tap away instead of a scroll.
 */
export const CATEGORY_ICON_GROUPS: Partial<Record<BuildingCategory, IconGroup[]>> = {
  admin: ["services", "academic"],
  faculty: ["academic"],
  library: ["academic"],
  event: ["general", "sports"],
  hostel: ["facilities"],
  cafeteria: ["facilities"],
  sports: ["sports"],
  health: ["health"],
  parking: ["outdoors"],
  toilet: ["facilities"],
};

export const ICON_GROUP_LABELS: Record<IconGroup, string> = {
  academic: "Academic",
  facilities: "Facilities",
  services: "Services",
  sports: "Sports",
  outdoors: "Outdoors",
  health: "Health",
  general: "General",
};
