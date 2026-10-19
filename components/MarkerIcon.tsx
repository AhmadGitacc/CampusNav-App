import React from "react";
import { MapPin } from "lucide-react-native";
import { useTheme } from "@/components/ThemeProvider";
import { ICON_REGISTRY } from "@/lib/icon-registry";
import type { MarkerIconName } from "@shared/types";

/**
 * The glyph that stands for a building category.
 *
 * By default it renders in `onTint` because the map draws it inside a filled
 * `tint` circle — but call sites that put the glyph on a plain card background
 * must pass `color` (the picker uses `theme.tint`), or a white glyph lands on a
 * white card in light mode.
 *
 * Unknown names fall back to `map-pin` rather than rendering nothing: the icon
 * column is a varchar, and a row written by a future version of the app should
 * still show *something* on the map.
 */
export function MarkerIcon({
  icon,
  size = 16,
  strokeWidth = 2.5,
  color,
}: {
  icon: MarkerIconName | string;
  size?: number;
  strokeWidth?: number;
  color?: string;
}) {
  const { theme } = useTheme();
  const entry = ICON_REGISTRY[icon as MarkerIconName];
  const Glyph = entry?.Component ?? MapPin;
  return (
    <Glyph size={size} color={color ?? theme.onTint} strokeWidth={strokeWidth} />
  );
}
