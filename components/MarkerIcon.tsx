import React from "react";
import { Building2, BookOpen, Library, Flag, MapPin } from "lucide-react-native";
import { useTheme } from "@/components/ThemeProvider";
import type { MarkerIconName } from "@shared/types";

/**
 * The glyph that stands for a building category.
 *
 * Rendered inside a filled `tint` circle everywhere it is used, so the icon
 * colour is always the on-tint foreground rather than the marker's background —
 * which is why this is `onTint` and not `white`, even though the two are the
 * same colour in both palettes today.
 */
export function MarkerIcon({
  icon,
  size = 16,
  strokeWidth = 2.5,
}: {
  icon: MarkerIconName | string;
  size?: number;
  strokeWidth?: number;
}) {
  const { theme } = useTheme();
  const props = { size, color: theme.onTint, strokeWidth };

  switch (icon) {
    case "building":
      return <Building2 {...props} />;
    case "book":
      return <BookOpen {...props} />;
    case "library":
      return <Library {...props} />;
    case "flag":
      return <Flag {...props} />;
    default:
      return <MapPin {...props} />;
  }
}
