/**
 * Shared entry for the platform-split picker map.
 *
 * Metro resolves `LocationPickerMap.web.tsx` (web) and
 * `LocationPickerMap.native.tsx` (iOS/Android) ahead of this file, so at
 * runtime this module is never the one that loads — which matters here more
 * than usual, because the native variant imports `react-native-maps`, a module
 * that crashes on web at import time. This file exists so TypeScript and
 * eslint-import can resolve the `@/components/LocationPickerMap` specifier,
 * which platform extensions alone hide from static analysis.
 */
export { default } from "./LocationPickerMap.native";
export type {
  LocationPickerMapHandle,
  LocationPickerMapProps,
} from "./LocationPickerMap.native";
