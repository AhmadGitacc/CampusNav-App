# CampusNav / NSUK Navigator — Project Overview

A cross-platform (iOS / Android / Web) campus navigation app built with **Expo Router + React Native**, backed by a lightweight **Express** server and provisioned for **PostgreSQL via Drizzle ORM**. Currently ships as a guest-accessible NSUK (Nasarawa State University, Keffi) campus map with building markers, free-text search, and OSRM-backed walking directions.

---

## 1. At a Glance

| Area | Choice |
| --- | --- |
| Framework | React Native 0.81 + Expo SDK 54 (New Architecture enabled) |
| Routing | expo-router ~6 (file-based, typed routes) |
| Language | TypeScript ~5.9, `strict: true` |
| Server | Express 5 (ESM, esbuild-bundled) |
| Database | PostgreSQL + Drizzle ORM / drizzle-kit (provisioned, not yet used at runtime) |
| Validation | Zod + drizzle-zod + zod-validation-error |
| Data fetching | TanStack React Query v5 (`expo/fetch` transport) |
| Animation | react-native-reanimated 4 + react-native-gesture-handler |
| Maps | `react-native-maps` (native) with a platform-swapped web fallback |
| Icons | lucide-react-native (primary), @expo/vector-icons (error UI) |
| Fonts | Inter 400/500/600/700 via @expo-google-fonts/inter |
| Haptics | expo-haptics on every interactive tap |
| Hosting target | Replit → Cloud Run (static Expo build + Express) |

**Product state:** 2 screens (Landing → Map), 1 campus (NSUK), 4 hardcoded markers, guest-only. Backend routes are an empty scaffold.

---

## 2. Directory Structure

```
CampusNav-App/
├── app/                      # expo-router file-based routes
│   ├── _layout.tsx           # Root layout: fonts, splash, providers, Stack
│   ├── index.tsx             # Landing screen — campus picker (guest access)
│   ├── map.tsx               # Map screen — search, markers, routing, bottom sheet
│   └── +not-found.tsx        # 404 route (still template styling)
│
├── components/
│   ├── CampusMap.native.tsx  # react-native-maps MapView + Marker + Polyline
│   ├── CampusMap.web.tsx     # Web fallback: placeholder + tappable marker list
│   ├── ErrorBoundary.tsx     # App-level React error boundary
│   ├── ErrorFallback.tsx     # Themed recovery UI (reload / view details)
│   └── KeyboardAwareScrollViewCompat.tsx
│
├── constants/
│   └── colors.ts             # Single source of truth for the palette (light only)
│
├── lib/
│   └── query-client.ts       # QueryClient, getApiUrl(), apiRequest(), getQueryFn()
│
├── shared/
│   └── schema.ts             # Drizzle tables + Zod schemas + inferred types
│
├── server/
│   ├── index.ts              # Express bootstrap: CORS, logging, static, errors
│   ├── routes.ts             # API route registration (EMPTY SCAFFOLD)
│   ├── storage.ts            # IStorage interface + MemStorage (in-memory)
│   └── templates/
│       └── landing-page.html # Marketing/Expo-Go landing page with placeholders
│
├── scripts/
│   └── build.js              # Static Expo export → static-build/{ios,android}
│
├── assets/images/            # icon, splash, favicon, Android adaptive icons
├── patches/                  # patch-package: expo-asset+12.0.12.patch
├── drizzle.config.ts         # Postgres config (requires DATABASE_URL)
├── app.json                  # Expo config: NSUK Navigator, plugins, experiments
├── tsconfig.json             # Paths: @/* → ./*, @shared/* → ./shared/*
├── eslint.config.js          # eslint-config-expo (flat)
├── metro.config.js, babel.config.js (React Compiler enabled)
└── .replit                   # Cloud Run deploy: static build → esbuild → node
```

### Path Aliases
- `@/*` → project root (e.g. `@/components/CampusMap`, `@/constants/colors`)
- `@shared/*` → `./shared/*` (used by the server: `@shared/schema`)

---

## 3. Application Flow

```
app/_layout.tsx
  ErrorBoundary
   └─ QueryClientProvider
      └─ GestureHandlerRootView
         └─ KeyboardProvider
            └─ Stack (headerShown: false)
                 ├─ index  → Landing screen
                 └─ map    → Map screen

index (Landing)                     map (Map screen)
─────────────────                   ─────────────────
CAMPUSES[] (1 entry: NSUK)          CampusMap (platform-swapped)
  ↓ user picks campus               ├─ top bar: back / campus label / locate
  ↓ "Explore Campus" (haptics)      ├─ search bar + filtered results
router.push("/map", {campusId,      ├─ marker tap → selectedMarker
              lat, lng})            ├─ Get Directions → OSRM foot route
                                    └─ bottom sheet: distance + ETA + actions
```

### Route parameters
`/map` accepts `campusId`, `lat`, `lng` (strings; fall back to NSUK defaults `8.8471, 7.8776`).

---

## 4. Key Modules in Detail

### 4.1 Landing screen — `app/index.tsx`
- Full-bleed green `LinearGradient` (`#054A14 → #0B6623 → #0D7A2B`) with decorative translucent circles.
- White rounded card (radius 20) with "Guest Access" badge, campus dropdown, and gradient CTA.
- Campus picker is a `Modal` + `FlatList`; `CAMPUSES` is a local const (not fetched).
- Reanimated `FadeInDown` / `FadeInUp` entrance sequences (200/400/600 ms staggered delays).
- Web-specific inset compensation (`webTopInset = 67`, `webBottomInset = 34`).

### 4.2 Map screen — `app/map.tsx` (~970 lines, the app's core)
Contains both UI and logic for:
- **Marker data** — `NSUK_MARKERS` (4 hardcoded entries: Senate, Faculty of Law, Main Library, Convocation Square) with `icon` keys mapped to lucide icons.
- **Search** — client-side case-insensitive filter over title/description, rendered as an absolute dropdown under the search bar.
- **Location** — dual implementation: `navigator.geolocation` on web, `expo-location` foreground permission + high accuracy on native.
- **Routing** — `fetchWalkingRoute()` calls the public **OSRM** foot profile (`router.project-osrm.org`), decodes the polyline geometry inline, and falls back to a straight-line Haversine estimate.
- **Formatting helpers** — `formatDistance` (`m` / `km`), `formatWalkTime` (ceil minutes), `calculateStraightDistance` (Haversine).
- **Camera control** — `mapRef.animateToRegion` for marker focus, route bounding-box fit, and reset.
- **Bottom sheet** — animated `SlideInDown`/`SlideOutDown` card with handle, marker icon tile, distance/ETA pill, primary gradient CTA, secondary "Locate Me First".
- **Hint bar** — pill shown when no marker is selected.

### 4.3 Map rendering — `components/CampusMap.*.tsx`
Platform-split component (Metro resolves `.native.tsx` / `.web.tsx` for the `@/components/CampusMap` import):

| | Native | Web |
| --- | --- | --- |
| Engine | `react-native-maps` (PROVIDER_DEFAULT) | Static placeholder panel |
| Markers | Custom pin views (36px tile, white 2.5px border, triangle arrow) | Tappable list rows |
| Route | `Polyline` stroke `#0B6623`, width 4 | Not rendered |
| Ref API | `animateToRegion(region, ms)` | No-op `animateToRegion` |
| User location | `showsUserLocation` | — |

> Note: the web build has **no real map**, only a list — a known gap.

### 4.4 Data layer
- `shared/schema.ts`: `users` table (`id` uuid, unique `username`, `password`) + `insertUserSchema` + inferred types. **Only user auth-shaped schema exists; no campus/marker/building tables.**
- `server/storage.ts`: `IStorage` CRUD contract with `MemStorage` (in-memory `Map`). No Postgres implementation wired up.
- `drizzle.config.ts` targets Postgres with `DATABASE_URL`; `npm run db:push` is available but currently pushes only `users`.

### 4.5 API layer
- `lib/query-client.ts` provides `getApiUrl()` (from `EXPO_PUBLIC_DOMAIN`), `apiRequest()`, and a `getQueryFn` with 401 handling. `staleTime: Infinity`, no retries, no window-focus refetch.
- `server/routes.ts` is an **empty scaffold** (`registerRoutes` just creates the HTTP server). The client is fully wired for an API that does not exist yet.

### 4.6 Server — `server/index.ts`
Order of middleware: CORS (Replit domains + any localhost) → body parsing (JSON with `rawBody`) → request logging (API only, 80-char truncated) → Expo manifest + landing page routing → static assets → `registerRoutes` → error handler.
- `/` serves `server/templates/landing-page.html` with `BASE_URL_PLACEHOLDER`, `EXPS_URL_PLACEHOLDER`, `APP_NAME_PLACEHOLDER`.
- `/` or `/manifest` with an `expo-platform: ios|android` header serves `static-build/<platform>/manifest.json`.
- Listens on `PORT` (default 5000), `0.0.0.0`, `reusePort`.

### 4.7 Build & deploy
- `expo:static:build` → `node scripts/build.js` (spawns Metro export for iOS/Android into `static-build/`).
- `server:build` → esbuild bundles `server/index.ts` → `server_dist/`.
- `.replit` deployment: build both, run `server:prod` on Cloud Run, ports 5000 (app) and 8081→80.

---

## 5. Configuration & Scripts

| Script | Purpose |
| --- | --- |
| `npm start` / `expo:dev` | Metro dev server (Replit-aware proxy env vars) |
| `server:dev` | `tsx server/index.ts` in development |
| `expo:static:build` | Production static export |
| `server:build` / `server:prod` | Bundle + run Express for production |
| `db:push` | Push `shared/schema.ts` to Postgres |
| `lint` / `lint:fix` | `expo lint` (flat ESLint config) |

**Notable `app.json` config:** slug `nsuk-navigator`, scheme `myapp`, `newArchEnabled`, `reactCompiler` + `typedRoutes` experiments, plugins `expo-router` (origin replit.com), `expo-font`, `expo-web-browser`. Package/bundle IDs are still placeholders (`com.myapp`).

**Environment variables:** `EXPO_PUBLIC_DOMAIN`, `DATABASE_URL`, `PORT`, `REPLIT_DEV_DOMAIN`, `REPLIT_DOMAINS`.

---

## 6. Current Capabilities vs. Gaps

**Works today**
- Guest campus selection → map navigation
- 4 NSUK building markers with custom pins and descriptions
- Client-side building search with live results
- Real walking routes over OSRM with distance + ETA, camera fit to route
- Locate-me (native permission flow + web geolocation)
- Error boundary with themed fallback, haptics throughout, Inter typography

**Gaps / not yet built**
- No API endpoints; React Query layer has nothing to query
- No persistence for markers/campuses — all data hardcoded in `app/map.tsx`
- No auth (schema exists, no routes, passwords stored plaintext in schema)
- No dark mode (`constants/colors.ts` exports only `light`); `+not-found.tsx` still uses template styles
- Web has no actual map (placeholder list only)
- No offline support, no caching of routes, no accessibility pass, no tests
- Unused installed deps: `expo-image-picker`, `expo-blur`, `expo-glass-effect`, `expo-symbols`, `@react-native-async-storage/async-storage`, `expo-haptics` (used) vs. several present but idle
- OSRM public instance called directly from the client (rate-limited, no key, no caching)

---

## 7. Design Tokens (summary — see `style.md`)

- **Primary:** Forest Green `#0B6623` · **Dark:** `#054A14` · **Accent:** `#2E7D32` · **Tint Light:** `#E8F5E9`
- **Text:** `#1B2E1B` primary / `#5A6B5A` secondary · **Border:** `#D5E0D5` · **Surface:** `#FFFFFF` / `#F5F7F5`
- **Type:** Inter — 400 body, 500 medium/labels, 600 semibold/buttons, 700 headings
- **Radii:** 10 pills-small · 12 badges · 14 inputs/buttons · 16–20 cards · 24 sheet top · 30 hint pill
- **Spacing base:** 4px grid; screen gutter 24 (landing) / 16–20 (map)
