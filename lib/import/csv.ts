import { importBuildingSchema, type ImportBuilding } from "@shared/schema";

/**
 * CSV parser for bulk building imports (Feature 10 §7.5).
 *
 * Small on purpose: a real CSV library is a dependency the app does not need
 * for a one-screen admin tool. What it does handle is everything a hand-edited
 * spreadsheet actually contains — quoted fields, embedded commas and
 * newlines, doubled quotes, a BOM from Excel, and CRLF line endings.
 *
 * Every row is validated independently and failures are reported with the
 * 1-based file line, so a bad row in a 500-row sheet doesn't fail the import.
 */

export interface ImportIssue {
  /** 1-based line in the source file, header included. */
  line: number;
  message: string;
}

export interface CsvParseResult {
  rows: ImportBuilding[];
  issues: ImportIssue[];
}

/** Splits one CSV line into fields, honouring quotes. Returns the next index. */
function readFields(line: string, start: number): { fields: string[]; next: number } {
  const fields: string[] = [];
  let index = start;
  let current = "";
  let quoted = false;

  while (index < line.length) {
    const char = line[index];

    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      current += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = true;
      index += 1;
      continue;
    }
    if (char === ",") {
      fields.push(current);
      current = "";
      index += 1;
      continue;
    }
    current += char;
    index += 1;
  }

  fields.push(current);
  return { fields, next: index };
}

/**
 * Splits the file into logical lines, so a quoted newline inside a description
 * does not split one record into two broken ones.
 */
function splitRecords(text: string): string[] {
  const records: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      // A doubled quote is an escaped quote, not a terminator.
      if (quoted && text[i + 1] === '"') {
        current += '""';
        i += 1;
        continue;
      }
      quoted = !quoted;
      current += char;
      continue;
    }
    if (!quoted && (char === "\n" || char === "\r")) {
      records.push(current);
      current = "";
      // Swallow the \n of a \r\n pair.
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      continue;
    }
    current += char;
  }

  if (current.length > 0) records.push(current);
  return records.filter((record) => record.trim().length > 0);
}

/** Header aliases, so an export from a survey sheet lands without editing. */
const HEADER_ALIASES: Record<string, string> = {
  name: "name",
  building: "name",
  title: "name",
  description: "description",
  desc: "description",
  details: "description",
  category: "category",
  type: "category",
  lat: "lat",
  latitude: "lat",
  lng: "lng",
  lon: "lng",
  longitude: "lng",
  icon: "icon",
  aliases: "aliases",
  "alternate names": "aliases",
  "alt names": "aliases",
  openinghours: "opening_hours",
  "opening hours": "opening_hours",
  hours: "opening_hours",
  isaccessibleentry: "is_accessible_entry",
  "accessible entry": "is_accessible_entry",
};

function normalizeHeader(header: string): string | null {
  return HEADER_ALIASES[header.trim().toLowerCase()] ?? null;
}

/** "a, b | c" → ["a", "b", "c"]. Cells and the aliases field both allow this. */
function splitAliases(value: string): string[] {
  return value
    .split(/[,;|]/)
    .map((alias) => alias.trim())
    .filter(Boolean);
}

function parseBoolean(value: string, fallback: boolean): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (["true", "yes", "y", "1"].includes(normalized)) return true;
  if (["false", "no", "n", "0"].includes(normalized)) return false;
  return fallback;
}

/**
 * Parses a header row plus data rows into validated buildings.
 *
 * An absent header is treated as a failure rather than guessed at: silently
 * assuming column order would put coordinates in the description field, and the
 * resulting building would be wrong on a live map.
 */
export function parseBuildingsCsv(text: string): CsvParseResult {
  const rows: ImportBuilding[] = [];
  const issues: ImportIssue[] = [];

  // Excel writes a BOM that would otherwise become part of the first header.
  const source = text.replace(/^﻿/, "");
  const records = splitRecords(source);
  if (records.length === 0) {
    return { rows, issues: [{ line: 0, message: "The file is empty." }] };
  }

  const { fields: headerFields } = readFields(records[0], 0);
  const columnFor: Record<string, number> = {};
  headerFields.forEach((header, index) => {
    const key = normalizeHeader(header);
    if (key && columnFor[key] === undefined) columnFor[key] = index;
  });

  if (columnFor.name === undefined) {
    return {
      rows,
      issues: [
        {
          line: 1,
          message: `No "name" column. Found: ${headerFields.join(", ") || "(none)"}.`,
        },
      ],
    };
  }
  if (columnFor.lat === undefined || columnFor.lng === undefined) {
    return {
      rows,
      issues: [{ line: 1, message: 'Both "lat" and "lng" columns are required.' }],
    };
  }

  for (let recordIndex = 1; recordIndex < records.length; recordIndex += 1) {
    const line = recordIndex + 1;
    const { fields } = readFields(records[recordIndex], 0);
    const cell = (key: string): string => {
      const index = columnFor[key];
      return index === undefined ? "" : (fields[index] ?? "").trim();
    };

    const aliases = splitAliases(cell("aliases"));
    const parsed = importBuildingSchema.safeParse({
      name: cell("name"),
      description: cell("description"),
      category: cell("category") || undefined,
      lat: cell("lat"),
      lng: cell("lng"),
      icon: cell("icon") || undefined,
      aliases,
      openingHours: cell("opening_hours") || null,
      isAccessibleEntry: parseBoolean(cell("is_accessible_entry"), true),
    });

    if (parsed.success) {
      rows.push(parsed.data);
    } else {
      issues.push({
        line,
        message: parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "row"}: ${issue.message}`)
          .join("; "),
      });
    }
  }

  return { rows, issues };
}
