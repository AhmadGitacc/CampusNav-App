import type { ThemeName } from "./colors";

/**
 * Brand gradients (Feature 13 §8.4).
 *
 * Dark is not the light palette dimmed. The light ramp starts near-black and
 * ends brighter, which on an OLED panel blooms and reads as a light source; the
 * dark ramp is a compressed, lower-key version of the same hue so the landing
 * screen still feels like a forest canopy at night instead of a glowing button.
 *
 * Tuples rather than `string[]` so `expo-linear-gradient`'s `colors` prop
 * cannot silently take an array of the wrong length.
 */
type BrandRamp = readonly [string, string, string];
type ActionRamp = readonly [string, string];

export const GRADIENTS = {
  brand: {
    light: ["#054A14", "#0B6623", "#0D7A2B"],
    dark: ["#04350E", "#064A15", "#07591A"],
  },
  /** CTA gradients sit a stop brighter than the brand so they read as buttons. */
  action: {
    light: ["#0B6623", "#0D7A2B"],
    dark: ["#0B6623", "#0F6D28"],
  },
} satisfies Record<string, Record<ThemeName, BrandRamp | ActionRamp>>;

export function brandGradient(scheme: ThemeName): BrandRamp {
  return GRADIENTS.brand[scheme] as BrandRamp;
}

export function actionGradient(scheme: ThemeName): ActionRamp {
  return GRADIENTS.action[scheme] as ActionRamp;
}
