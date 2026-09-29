import {
  importBuildingSchema,
  markerIconNames,
  type ImportBuilding,
} from "@shared/schema";
import type { BuildingCategory } from "@shared/types";
import type { ImportIssue } from "./csv";

/**
 * GeoJSON parser for bulk building imports (Feature 10 §7.5).
 *
 * Accepts the shape every map tool exports: a `FeatureCollection` of `Point`
 * features, with the building's data in `properties`. Anything that is not a
 * Point is rejected by line number rather than silently dropped — a LineString
 * campus boundary in the same file is a mistake worth surfacing.
 *
 * `properties` values arrive as `unknown`: a JSON file can hold a number where
 * a string is expected, so every field is coerced rather than cast.
 */

export interface GeoJsonParseResult {
  rows: ImportBuilding[];
  issues: ImportIssue[];
}

const CATEGORIES: readonly string[] = [
  "admin",
  "faculty",
  "library",
  "event",
  "hostel",
  "cafeteria",
  "sports",
  "health",
  "parking",
  "toilet",
];

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

/** GeoJSON coordinates are [lng, lat, (alt)] — the opposite order to our schema. */
function coordinate(value: unknown): { lat: unknown; lng: unknown } | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  return { lat: value[1], lng: value[0] };
}

function aliasesFrom(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => asText(entry)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,;|]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function categoryFrom(value: unknown): BuildingCategory | undefined {
  const normalized = asText(value).toLowerCase().replace(/\s+/g, "-");
  return CATEGORIES.includes(normalized)
    ? (normalized as BuildingCategory)
    : undefined;
}

function iconFrom(value: unknown): (typeof markerIconNames)[number] | undefined {
  const normalized = asText(value).toLowerCase();
  return markerIconNames.includes(normalized as (typeof markerIconNames)[number])
    ? (normalized as (typeof markerIconNames)[number])
    : undefined;
}

export function parseBuildingsGeoJson(text: string): GeoJsonParseResult {
  const rows: ImportBuilding[] = [];
  const issues: ImportIssue[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      rows,
      issues: [
        {
          line: 0,
          message:
            error instanceof Error
              ? `Not valid JSON — ${error.message}`
              : "Not valid JSON.",
        },
      ],
    };
  }

  const document = parsed as {
    type?: unknown;
    features?: unknown;
  } | null;

  if (!document || typeof document !== "object" || !Array.isArray(document.features)) {
    return {
      rows,
      issues: [
        { line: 0, message: "Expected a GeoJSON FeatureCollection." },
      ],
    };
  }

  // Feature indices are used as the "line" so an error points at a row the
  // person can find in their editor, which a JSON line number rarely is.
  document.features.forEach((rawFeature, index) => {
    const line = index + 1;
    const feature = rawFeature as {
      type?: unknown;
      geometry?: { type?: unknown; coordinates?: unknown } | null;
      properties?: Record<string, unknown> | null;
    } | null;

    if (!feature || typeof feature !== "object") {
      issues.push({ line, message: "Feature is not an object." });
      return;
    }

    const geometryType = asText(feature.geometry?.type);
    if (geometryType !== "Point") {
      issues.push({
        line,
        message: `Only Point features are supported (this one is ${geometryType || "missing"}).`,
      });
      return;
    }

    const point = coordinate(feature.geometry?.coordinates);
    if (!point) {
      issues.push({ line, message: "Missing or malformed coordinates." });
      return;
    }

    const properties = feature.properties ?? {};
    const openingHours = asText(properties.opening_hours ?? properties.openingHours);
    const category = categoryFrom(properties.category);
    const icon = iconFrom(properties.icon);

    const result = importBuildingSchema.safeParse({
      name: asText(properties.name),
      description: asText(properties.description),
      category,
      lat: point.lat,
      lng: point.lng,
      icon,
      aliases: aliasesFrom(properties.aliases),
      openingHours: openingHours || null,
      isAccessibleEntry:
        properties.is_accessible_entry ?? properties.isAccessibleEntry ?? true,
    });

    if (result.success) {
      rows.push(result.data);
    } else {
      issues.push({
        line,
        message: result.error.issues
          .map((issue) => `${issue.path.join(".") || "feature"}: ${issue.message}`)
          .join("; "),
      });
    }
  });

  return { rows, issues };
}
