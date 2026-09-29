/**
 * Shared entry for the platform-split map component.
 *
 * Metro resolves `CampusMap.web.tsx` (web) and `CampusMap.native.tsx`
 * (iOS/Android) ahead of this file, so at runtime this module is never the one
 * that loads. It exists so TypeScript and eslint-import can resolve the
 * `@/components/CampusMap` specifier, which platform extensions alone hide
 * from static analysis.
 */
export { default } from "./CampusMap.native";
