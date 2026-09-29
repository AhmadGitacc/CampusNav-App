const FOREST_GREEN = "#0B6623";
const DARK_GREEN = "#054A14";
const LIGHT_GREEN = "#E8F5E9";
const ACCENT_GREEN = "#2E7D32";
const WHITE = "#FFFFFF";
const OFF_WHITE = "#F5F7F5";
const GRAY = "#9E9E9E";
const DARK_GRAY = "#424242";
const DANGER = "#C62828";
const WARNING = "#8A6D1F";
const TEXT_PRIMARY = "#1B2E1B";
const TEXT_SECONDARY = "#5A6B5A";

/** Modal scrim. Darker in dark mode — a light scrim over a dark sheet reads as fog. */
const SCRIM_LIGHT = "rgba(0, 0, 0, 0.5)";
const SCRIM_DARK = "rgba(0, 0, 0, 0.7)";

/**
 * Colour tokens for the app (Feature 13 §8.1).
 *
 * Both palettes carry the same keys, so no caller branches on the scheme — that
 * is the whole point. `surface`, `surfacePressed` and `separator` exist as
 * tokens rather than literals so a screen never has to know which background
 * colour it is sitting on.
 *
 * `onTint` is the only genuinely new semantic token. §8.1 proposed flipping
 * `white` to the background colour in dark mode so existing call sites would
 * need no change; that does not survive contact with the code, because every
 * use of `white` in this app is a glyph or a label sitting *on* a green button.
 * Flipping it would put near-black text on a near-black button. `white` stays
 * literally white and `onTint` carries the "foreground on brand green" meaning,
 * which happens to be white in both schemes.
 */
export const palettes = {
  light: {
    text: TEXT_PRIMARY,
    textSecondary: TEXT_SECONDARY,
    background: WHITE,
    backgroundSecondary: OFF_WHITE,
    tint: FOREST_GREEN,
    tintDark: DARK_GREEN,
    tintLight: LIGHT_GREEN,
    accent: ACCENT_GREEN,
    tabIconDefault: GRAY,
    tabIconSelected: FOREST_GREEN,
    card: WHITE,
    border: "#D5E0D5",
    separator: "#F0F2F0",
    surface: WHITE,
    surfacePressed: OFF_WHITE,
    shadow: "rgba(11, 102, 35, 0.08)",
    /** Behind the map. A tinted wash so a map loading late does not flash grey. */
    mapBackdrop: LIGHT_GREEN,
    scrim: SCRIM_LIGHT,
    /** Amber, for the offline notice — deliberately not red, which means error. */
    warning: WARNING,
    /** Secondary foreground on the brand hero, e.g. the feature-list icons. */
    onTintMuted: "rgba(255, 255, 255, 0.7)",
    /** A primary button that cannot be pressed yet. */
    tintDisabled: "#C8D6C8",
    white: WHITE,
    /** Foreground on `tint` / gradient backgrounds. White in both schemes. */
    onTint: WHITE,
    gray: GRAY,
    darkGray: DARK_GRAY,
    danger: DANGER,
  },

  dark: {
    text: "#E6EFE6",
    textSecondary: "#9FB09F",
    background: "#0E160E",
    backgroundSecondary: "#151F15",
    tint: "#4CAF50",
    tintDark: FOREST_GREEN,
    tintLight: "#123018",
    accent: "#66BB6A",
    tabIconDefault: GRAY,
    tabIconSelected: "#4CAF50",
    card: "#151F15",
    border: "#243224",
    separator: "#212D21",
    surface: "#1C281C",
    surfacePressed: "#22301F",
    shadow: "rgba(0, 0, 0, 0.4)",
    mapBackdrop: "#0A110A",
    scrim: SCRIM_DARK,
    // Lifted from #8A6D1F: the light-mode amber is too dark to read on #1C281C.
    warning: "#E0B252",
    onTintMuted: "rgba(255, 255, 255, 0.7)",
    tintDisabled: "#39493A",
    white: WHITE,
    onTint: WHITE,
    gray: "#7A877A",
    darkGray: "#B0BDB0",
    danger: "#E57373",
  },
} as const;

export type ThemeName = keyof typeof palettes;
export type Theme = (typeof palettes)[ThemeName];
