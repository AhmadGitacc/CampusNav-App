import { buildingCategories } from "@shared/schema";
import type { Building, BuildingCategory } from "@shared/types";
import type { CorrectionField } from "@shared/schema";

/**
 * Turning a reported string into a column value (Feature 10 §7.6).
 *
 * A correction names a field and proposes a string, but approving it writes
 * straight onto `buildings` — so a latitude has to be a number, a category has
 * to be one the schema knows, and aliases have to be an array. Doing that
 * coercion once, here, means the moderator screen can show *before* they approve
 * that a report can't be applied as written, instead of the update failing and
 * the report silently sticking in the queue.
 *
 * Pure on purpose: no hooks, no Supabase, no react-native, so it can be exercised
 * directly.
 */

/** Human labels for the raw column names a correction is filed against. */
export const CORRECTION_FIELD_LABELS: Record<CorrectionField, string> = {
  name: "Name",
  description: "Description",
  category: "Category",
  lat: "Latitude",
  lng: "Longitude",
  opening_hours: "Opening hours",
  aliases: "Alternative names",
};

/** The current value of a building field, for the modal's "Currently" line. */
export function currentFieldValue(building: Building, field: CorrectionField): string {
  switch (field) {
    case "name":
      return building.name;
    case "description":
      return building.description;
    case "category":
      return building.category;
    case "lat":
      return String(building.lat);
    case "lng":
      return String(building.lng);
    case "opening_hours":
      return building.openingHours ?? "";
    case "aliases":
      return building.aliases.join(", ");
  }
}

export type CoercedValue = string | number | string[];

export type CoercionResult =
  | { ok: true; value: CoercedValue }
  | { ok: false; reason: string };

export function coerceCorrectionValue(
  field: CorrectionField,
  value: string
): CoercionResult {
  const trimmed = value.trim();

  switch (field) {
    case "lat":
    case "lng": {
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed)) {
        return {
          ok: false,
          reason: `${CORRECTION_FIELD_LABELS[field]} must be a number`,
        };
      }
      const limit = field === "lat" ? 90 : 180;
      if (Math.abs(parsed) > limit) {
        return {
          ok: false,
          reason: `${CORRECTION_FIELD_LABELS[field]} must be between -${limit} and ${limit}`,
        };
      }
      return { ok: true, value: parsed };
    }

    case "category": {
      const normalized = trimmed.toLowerCase().replace(/\s+/g, "-");
      if (!buildingCategories.includes(normalized as BuildingCategory)) {
        return {
          ok: false,
          reason: `Category must be one of: ${buildingCategories.join(", ")}`,
        };
      }
      return { ok: true, value: normalized };
    }

    case "aliases": {
      const aliases = trimmed
        .split(/[,;|]/)
        .map((alias) => alias.trim())
        .filter(Boolean);
      return { ok: true, value: aliases };
    }

    default:
      return { ok: true, value: trimmed };
  }
}
