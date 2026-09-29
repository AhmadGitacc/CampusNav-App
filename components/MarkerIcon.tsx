import React from "react";
import { Building2, BookOpen, Library, Flag, MapPin } from "lucide-react-native";
import colors from "@/constants/colors";
import type { MarkerIconName } from "@shared/types";

const props = { size: 16, color: colors.light.white, strokeWidth: 2.5 };

export function MarkerIcon({ icon }: { icon: MarkerIconName | string }) {
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
