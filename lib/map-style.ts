/**
 * Keyless MapLibre styles served by OpenFreeMap.
 *
 * `liberty` is the detailed general-purpose style: it includes building
 * footprints, 3D extrusions, road labels and land-use detail. `dark` is used
 * for the app's dark scheme and gets an explicit 3D building layer in the map
 * component because that style only ships flat footprints.
 */
export const MAP_STYLES = {
  light: "https://tiles.openfreemap.org/styles/liberty",
  dark: "https://tiles.openfreemap.org/styles/dark",
} as const;

export function getMapStyle(scheme: string | undefined): string {
  return scheme === "dark" ? MAP_STYLES.dark : MAP_STYLES.light;
}
