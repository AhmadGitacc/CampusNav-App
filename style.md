# CampusNav — Style & Design System

Canonical rules extracted from the existing code (`constants/colors.ts`, `app/index.tsx`, `app/map.tsx`, `components/*`). Follow these for every new screen, component, or sheet so the app stays visually consistent.

---

## 1. Color Palette

Single source of truth: `constants/colors.ts`. **Always import from there** — never hardcode a hex in new code (the existing screens still do; migrate opportunistically).

### Brand / Green ramp
| Token | Hex | Usage |
| --- | --- | --- |
| `tintDark` | `#054A14` | Gradient start, selected marker, deep brand |
| `tint` (FOREST_GREEN) | `#0B6623` | Primary brand: icons, pins, CTAs, active borders, links |
| `accent` | `#2E7D32` | Secondary accent |
| gradient end | `#0D7A2B` | Linear-gradient end stop |
| `tintLight` | `#E8F5E9` | Selected/active surfaces, pills, pressed rows, badge bg |

### Neutrals
| Token | Hex | Usage |
| --- | --- | --- |
| `white` / `background` | `#FFFFFF` | Cards, sheets, floating controls |
| `backgroundSecondary` | `#F5F7F5` | Screen bg, inputs, subtle pressed states |
| border | `#D5E0D5` | 1.5px input/card borders, sheet handle |
| hairline | `#F0F2F0` | 1px list separators |
| `gray` | `#9E9E9E` | Placeholders, disabled text, meta |
| `darkGray` | `#424242` | Rarely used dark neutral |
| disabled fill | `#C8D6C8` | Disabled gradient CTA |

### Text
| Token | Hex | Usage |
| --- | --- | --- |
| `text` | `#1B2E1B` | Headings, primary text (never pure black) |
| `textSecondary` | `#5A6B5A` | Descriptions, sublabels |
| white-on-green | `#FFFFFF` @ 0.6–0.7 alpha | Subtitle/feature text on green backgrounds |

### Rules
- **Green = interactive or active.** Anything tappable/selected uses the green ramp; static content stays neutral.
- **Never pure black** (`#000`) for text — use `#1B2E1B`.
- On the green gradient, secondary text is white at 60–70% opacity, not gray.
- Shadows use a low-opacity green (`shadowColor: theme.shadow`, `rgba(11,102,35,0.08)` in light) rather than pure black — a black shadow on the dark palette reads as a grey halo around every raised surface.
- **The hexes above are the light palette.** Never hardcode one: import `useTheme()` from `@/components/ThemeProvider` and read `theme.*`. The full light/dark pair lives in `constants/colors.ts`.

### Map

`CampusMap.native.tsx` uses `PROVIDER_DEFAULT` — Apple Maps on iOS, Google Maps on Android — and **that stays**. The alternative is `PROVIDER_GOOGLE` everywhere so a `customMapStyle` JSON can be applied, which costs a Google Maps API key in the bundle and forces every iOS user off Apple Maps to get a styling feature they probably do not notice.

What that buys and what it costs:

- Both providers follow the OS appearance for the tile layer, so the default `system` mode is fully themed on both platforms.
- If someone sets an explicit override that disagrees with the OS, the tiles stay on the system appearance while our markers, route polyline, and floating cards follow the override. This is the one known mismatch in the app. It is accepted, not fixed — fixing it means a custom style array per scheme, which means `PROVIDER_GOOGLE`, which means the API key.

Web has no map at all (the placeholder in `CampusMap.web.tsx` lists markers), so the whole question is native-only.

---

## 2. Typography

**Family:** Inter only — weights loaded in `app/_layout.tsx`:
`Inter_400Regular`, `Inter_500Medium`, `Inter_600SemiBold`, `Inter_700Bold`.
Always set `fontFamily` explicitly; React Native ignores `fontWeight` when a named font is used.

| Role | Size | Weight | Notes |
| --- | --- | --- | --- |
| Hero / screen title | 28 | `Inter_700Bold` | Landing title |
| Card / sheet title | 22 / 18 | `Inter_700Bold` | Section header, bottom-sheet title |
| Modal / sub-heading | 18 | `Inter_600SemiBold` | Modal titles |
| Button / CTA label | 16 / 15 | `Inter_600SemiBold` | Primary and secondary buttons |
| Body / input | 15 | `Inter_400Regular` or `Inter_500Medium` | Dropdown text, result titles |
| Supporting body | 14 | `Inter_400Regular` | Subtitles, hints (`lineHeight: 20–22`) |
| Caption / meta | 13 | `Inter_400Regular` / `500Medium` | Distances, locations, helper text (`lineHeight: 18`) |
| Badge / micro | 12–13 | `Inter_600SemiBold` / `400` | Chips, list descriptions |

**Rules**
- Multi-line text always sets `lineHeight` (~1.4× font size).
- Centered hero copy is `textAlign: "center"`.
- Truncate with `numberOfLines={1}` in dropdowns/results; `2` max elsewhere.

---

## 3. Spacing & Layout

- **Base unit: 4px.** Use 4 / 8 / 10 / 12 / 14 / 16 / 20 / 24 / 32.
- **Screen gutters:** landing `horizontalPadding: 24`; map overlays `left/right: 16`; cards & sheets `padding: 20–24`.
- **Gaps inside cards:** `gap: 14–16`; tight rows `gap: 6–12`.
- **Safe areas:** every screen reads `useSafeAreaInsets()` and adds them to `top`/`bottom` of absolute elements.
- **Web compensation:** `Platform.OS === "web"` → `webTopInset = 67`, `webBottomInset = 34`, added to insets. Reuse this pattern in any new screen with absolutely positioned chrome.
- **Stacking:** overlays are `position: "absolute"` with explicit `zIndex` (`10` top bar, `9` search) and are offset downward from the previous element (e.g. search sits at `insets.top + 64`).

---

## 4. Shape & Elevation

### Radii
| Element | Radius |
| --- | --- |
| Chips, small pills | 10–12 (`overflow: "hidden"` when a gradient/child fills it) |
| Inputs, buttons, floating icon buttons, icon tiles | 14 |
| Large cards, modals | 20 |
| Bottom sheet | `24` on top corners only (`borderTopLeftRadius/RightRadius`) |
| Full pill (hint bar) | 30 |
| Markers | 12 (selected 14) |

### Elevation / shadows (native + web parity)
- **Floating small control** (44×44 button, search bar): `offset {0,2}`, `opacity 0.1`, `radius 8`, `elevation 4`
- **Popover / hint bar / search results:** `offset {0,4}`, `opacity 0.1–0.12`, `radius 12`, `elevation 6`
- **Landing card:** `offset {0,8}`, `opacity 0.15`, `radius 24`, `elevation 8`
- **Bottom sheet:** `offset {0,-4}` (upward), `opacity 0.1`, `radius 16`, `elevation 10`
- Always pair `shadowColor/shadowOffset/shadowOpacity/shadowRadius` **and** `elevation`.

### Icon tiles
- Small: `34×34`, radius 10, bg `#0B6623`, white icon (search results).
- Medium: `44×44`, radius 14, bg `#0B6623`, white icon (sheet header).
- Marker: `36×36`, radius 12, bg `#0B6623`, `borderWidth 2.5 borderColor #FFF` + triangular arrow below; selected → `42×42`, radius 14, bg `#054A14`, border 3.
- Landing hero icon: `64×64`, radius 20, bg `rgba(255,255,255,0.15)`.

---

## 5. Components & Patterns

### Primary CTA (gradient)
```
Pressable (radius 14, overflow hidden)
 └─ LinearGradient colors ["#0B6623", "#0D7A2B"], horizontal (x:0→1, y:0)
     paddingVertical 16, paddingHorizontal 24
     row layout, centered, gap 10
     icon 18–20px white + label Inter_600SemiBold 16 #FFFFFF
disabled: colors ["#C8D6C8","#C8D6C8"], icon/text #9E9E9E, opacity .7
pressed:  transform [{scale: 0.97–0.98}]
```

### Secondary button (outline)
`borderWidth 1.5`, `borderColor #0B6623`, `backgroundColor #E8F5E9`, radius 14, `paddingVertical 14`, centered row gap 8, label `Inter_600SemiBold 15 #0B6623`.

### Floating icon button (44×44)
Radius 14, white bg, centered icon (22px, `strokeWidth 2.5`, `#1B2E1B` or `#0B6623`), shadow elevation 4.
`pressed → { opacity: 0.7, transform: [{scale: 0.95}] }`.

### Inputs / search field
Row layout, white bg, radius 14, `paddingHorizontal 14 / paddingVertical 10`, gap 10, `borderWidth 1.5` with `borderColor: "transparent"` → focused `#0B6623`. Leading icon 18px `#9E9E9E`; placeholder color `#9E9E9E`; clear button `hitSlop={8}`.

### Cards / sheets
White, radius 20 (sheet: 24 top-only), padding 20–24, internal `gap`. Sheet starts with a centered handle `36×4`, radius 2, `#D5E0D5`.

### Pills / badges
- Badge chip: bg `#E8F5E9`, text `#0B6623`, `Inter_600SemiBold 12`, `paddingH 12 / paddingV 4`, radius 12, `overflow: hidden`.
- Info pill (distance/ETA): bg `#E8F5E9`, `paddingH 14 / paddingV 8`, radius 10, row gap 6, text `Inter_500Medium 13 #0B6623`, 3px dot separator.

### Lists / rows
Row, `alignItems: center`, gap 12, `paddingH 20 / paddingV 14` (modal) or `14/12` (results), `justifyContent: space-between` when trailing icon exists.
- pressed: bg `#F5F7F5`
- selected: bg `#E8F5E9` + text/icon switch to `#0B6623` + `Inter_600SemiBold`
- separator: `borderBottomWidth 1`, `borderBottomColor #F0F2F0`

### Modal
`transparent`, `animationType="fade"`, overlay `rgba(0,0,0,0.5)` with `justifyContent: "center"` + `paddingHorizontal: 24`; content white, radius 20, `paddingVertical 20`, `maxHeight 400`. Dismiss on overlay press and Android back (`onRequestClose`).

### Empty states
Centered, `padding 14–16`, single line `Inter_400Regular 14 #9E9E9E`.

---

## 6. Motion

Library: **react-native-reanimated** (`FadeInDown`, `FadeInUp`, `SlideInDown`, `SlideOutDown`).

| Context | Recipe |
| --- | --- |
| Landing entrance | `FadeInDown.delay(n).duration(600)` staggered `200 / 400 / 600` |
| Inline reveal (e.g. selected campus info) | `FadeInUp.duration(300)` |
| Bottom sheet in | `SlideInDown.duration(400).springify()` |
| Bottom sheet out | `SlideOutDown.duration(300)` |
| Camera moves | `animateToRegion(region, 600)` for focus, `800` for route fit |

**Rules:** entrances 600 ms, reveals 300 ms, sheets 300–400 ms; no looping animation; never animate layout-critical properties without `Layout` animations.

---

## 7. Haptics

`expo-haptics` on **every** user interaction — non-negotiable for consistency:

| Interaction | Feedback |
| --- | --- |
| Primary/committing action (Explore, Get Directions) | `ImpactFeedbackStyle.Heavy` or `Medium` |
| Normal taps (marker, dropdown open, locate, back) | `ImpactFeedbackStyle.Light` |
| Selection in a list | `ImpactFeedbackStyle.Light` |

Call haptics at the top of the press handler, before any async work.

---

## 8. Icons

- **Primary set: `lucide-react-native`.** Consistent sizing: `14–16` inline/meta, `18–20` in buttons, `22` on floating controls, `32` hero, `48` empty state.
- `strokeWidth`: `2` in dense rows, `2.5` on controls/markers/headers.
- Marker icons render white at `size 16, strokeWidth 2.5` inside a green tile; map the string key → icon in one `getMarkerIcon()` helper (keep duplicates in sync or extract shared).
- Fallback icon: `MapPin`.
- `@expo/vector-icons` (Feather) only appears in `ErrorFallback` — new code should use lucide.

---

## 9. Accessibility & Platform Conventions

- All touch targets ≥ 44×44 (floating buttons are exactly 44×44) with `hitSlop={8}` for small trailing icons.
- Never rely on color alone: selected rows also change weight (`Inter_600SemiBold`) and add a `Check` icon.
- Permission prompts explain the value in the `Alert` title/body; failure paths always show an alert with a recovery message.
- Platform branches are explicit (`Platform.OS === "web"`) for geolocation, insets, and map rendering — keep native/web behavior mirrored in every new feature.
- Portrait only (`app.json` orientation).

---

## 10. Code Conventions

- **One file per screen** in `app/`; shared UI in `components/`; tokens in `constants/`; utilities in `lib/`.
- Styles: `StyleSheet.create` at the **bottom of the file**, semantic camelCase names (`exploreButton`, `sheetTitle`, `searchBarFocused`). Variant styling via arrays: `[styles.base, condition && styles.variant]`.
- A screen's stylesheet is a **`makeStyles(theme)` factory** called via `useMemo(() => makeStyles(theme), [theme])`. Layout-only rules stay inside it; colours come from the `theme` parameter, never from a module-level import. This is the pattern every converted screen and component uses.
- Colours come from `useTheme()`, never from a direct import of `constants/colors.ts`. `constants/colors.ts` has no default export; if you reach for one, you are writing a screen that breaks in dark mode.
- Prefer `gap` over margin pairs for vertical stacks.
- Pressables use the render-prop form: `style={({ pressed }) => [styles.x, pressed && styles.y]}`.
- Naming: components PascalCase files, hooks/helpers camelCase, screen files lowercase route names.
- No inline hex in new code — use `constants/colors.ts` (extend the file if a token is missing). The eight decorative hero washes in `app/index.tsx` and `app/(auth)/sign-in.tsx` are the documented exception; do not add more.
- TypeScript `strict` is on; avoid `any` for new props (existing `mapRef: any` and `marker: any` are legacy).
- Animated components must come from `react-native-reanimated`, never RN's `Animated`.
- Keep `webTopInset` / `webBottomInset` handling consistent across screens rather than inventing a new inset scheme.
- A full-bleed screen that overrides the Android nav bar colour calls `useSystemBars(color)`; everything else inherits `theme.background` from the provider.

---

## 11. Quick Do / Don't

✅ Do
- Inter with explicit `fontFamily`; green for interactive; `theme.text` for text
- Radius 14 for buttons/inputs, 20 for cards, 24-top for sheets
- Haptics on press, `pressed` feedback on every `Pressable`
- Safe-area + web insets on absolutely positioned elements
- `overflow: "hidden"` on any rounded container holding a gradient
- Read colour through `useTheme()` so the screen works in both schemes

❌ Don't
- Hardcode a new hex outside `constants/colors.ts`, or import a default from it
- Use `fontWeight` instead of a named Inter family
- Add a tap target without a pressed state or haptic
- Use pure `#000` text or default gray borders (`theme.border` instead)
- Animate without reanimated, or add looping/decorative motion
- Branch on the colour scheme in a component — add a token instead
