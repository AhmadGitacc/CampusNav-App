import React, { forwardRef } from "react";
import type {
  LocationPickerMapHandle,
  LocationPickerMapProps,
} from "@/components/LocationPickerMap.native";

/**
 * No map on web: `react-native-maps` has no web build in this app (the public
 * campus map is a placeholder there too, see CampusMap.web.tsx). The modal's
 * web branch offers manual entry instead, so this component is a no-op — it
 * exists so `import "./LocationPickerMap"` resolves on web without pulling the
 * native module in, which is what crashed the bundle before.
 */
const LocationPickerMap = forwardRef<
  LocationPickerMapHandle,
  LocationPickerMapProps
>(function LocationPickerMap(_props, ref) {
  React.useImperativeHandle(ref, () => ({
    animateToRegion: () => {},
  }));
  return null;
});

export default LocationPickerMap;
