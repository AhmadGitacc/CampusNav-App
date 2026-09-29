# CampusNav / NSUK Navigator — Complete Project Documentation

> **Purpose of this file.** One self-contained reference for the product, its features, the
> architecture behind them, the decisions that shaped it, the data model, the routing engine,
> the security model, and everything needed to run, verify, and extend it.
>
> **Source of truth is the code.** Where this document and the source disagree, the source wins.
> Companion documents: `style.md` (design system rules), `FEATURES.md` (roadmap),
> `IMPLEMENTATION.md` (per-feature implementation records), `PROJECT_OVERVIEW.md` (older snapshot —
> stale, describes a 2-screen guest-only build).

---

## Table of Contents

1. [Product Definition](#1-product-definition)
2. [Technology Stack](#2-technology-stack)
3. [Feature Catalog](#3-feature-catalog)
4. [Use Cases](#4-use-cases)
5. [Architecture](#5-architecture)
6. [Module Map](#6-module-map)
7. [Data Model](#7-data-model)
8. [Security Model](#8-security-model)
9. [The Routing & Navigation Engine](#9-the-routing--navigation-engine)
10. [API Surface](#10-api-surface)
11. [State, Caching & Offline](#11-state-caching--offline)
12. [Design System](#12-design-system)
13. [Setup & Operations](#13-setup--operations)
14. [Build, Deploy, Environments](#14-build-deploy-environments)
15. [Verification Gates](#15-verification-gates)
16. [Architecture Decision Log](#16-architecture-decision-log)
17. [Known Limitations](#17-known-limitations)
18. [Roadmap](#18-roadmap)
19. [Extension Guide](#19-extension-guide)

---

## 1. Product Definition

### 1.1 What it is

**CampusNav** is a cross-platform (iOS / Android / Web) wayfinding application for university
campuses, currently shipped for **NSUK (Nasarawa State University, Keffi, Nigeria)**.

The product promise is deliberately narrow and specific:

> *Given a walkable campus, tell a pedestrian — including one in a wheelchair, pushing a trolley,
> or carrying a heavy load — exactly which door to enter and which way to walk to get there.*

That framing is what separates it from a generic map. Google Maps knows the public road network.
It does not know that the Senate Building's shortest approach is a flight of central steps with a
ramp four metres to the right, that Convocation Square is behind a gate that locks at 20:00, or
that the library's "main entrance" is a set of nine steps with an accessible side door that the
campus's own website does not list.

### 1.2 Who it serves

| Persona | Need | Feature that serves them |
| --- | --- | --- |
| **First-year student** | "Where is my faculty, and can I walk there?" | Map, search, turn-by-turn, favorites, recents |
| **Student with mobility impairment** | "Can I get there without climbing?" | Step-free routing, entrance-aware arrival, ramp/door survey data |
| **Visitor / applicant** | "Find the hall, in a hurry, without asking" | Map, search, OSRM walking ETA, Convocation Square lookup |
| **Repeat commuter** | "Take me home / to the library" | Favorites, "Take me home", recent searches, offline cache |
| **Campus data steward** | "This building moved / is mislabelled" | "Report wrong info" → corrections queue |
| **Campus administrator** | "Fix 200 buildings at once" | Admin CMS, CSV/GeoJSON import, audit log, soft delete |

### 1.3 Scope boundaries (explicit)

**In scope**
- Outdoor pedestrian navigation on a surveyed campus walk graph.
- Building-level wayfinding, not room-level or floor-level.
- Data stewardship by non-developers (admin CMS + public corrections).

**Out of scope (deliberately)**
- Indoor navigation, floor plans, lift routing.
- Real-time context (crowds, shuttles, closures) — no live data source exists.
- Events, timetables, notifications — no `events` table in the schema.
- Any PWA/service-worker web install story.
- Multi-user social features, reviews, ratings.

### 1.4 Deployment identity

| Property | Value | Notes |
| --- | --- | --- |
| App name | `NSUK Navigator` | `app.json` |
| Slug | `nsuk-navigator` | |
| URL scheme | `myapp` | placeholder; not used for deep links today |
| iOS bundle id | `com.myapp` | **placeholder — must be changed before store submission** |
| Android package | `com.myapp` | **placeholder — must be changed before store submission** |
| Orientation | `portrait` | enforced |
| Architecture | New Architecture + React Compiler | both experimental flags on |

---

## 2. Technology Stack

### 2.1 Runtime stack

| Layer | Choice | Version | Why this choice |
| --- | --- | --- | --- |
| App framework | Expo SDK | `~57.0.26` | Managed pipeline; native modules (maps, location) without ejecting |
| UI runtime | React Native | `0.86.3` | `react-native-maps` and `expo-location` have no first-class web story without wrappers |
| React | React | `19.2.3` | Matches RN 0.86 |
| Web | `react-native-web` | `^0.21.0` | One codebase, three platforms |
| Routing | `expo-router` | `~57.0.24` | File-based; `typedRoutes` makes `router.push("/admin")` a compile error if the route does not exist |
| Language | TypeScript | `~6.0.3` | `strict: true`, no `any` in new code |
| Optimizer | React Compiler | experimental | Enabled in `babel.config.js` + `app.json` |
| Maps | `react-native-maps` | `1.27.2` | `PROVIDER_DEFAULT` — Apple Maps on iOS, Google Maps on Android |
| State (server) | TanStack Query | `5.83.0` | Cache, persistence, optimistic mutations out of the box |
| State (client) | React Context + hooks | — | No Redux/Zustand: the app has 3 global concerns (auth, theme, admin campus) |
| Auth | Supabase Auth | `2.117.2` | Hosted; `app_metadata` claims are not client-forgeable |
| Database | PostgreSQL (Supabase) | — | Matches Drizzle's model; RLS gives per-user scoping without a server |
| ORM | Drizzle ORM + drizzle-kit | `0.39.3` / `0.31.4` | SQL-shaped, generates Zod schemas, no runtime reflection |
| Validation | Zod + drizzle-zod + zod-validation-error | `3.24.2` | One schema is both the Drizzle validator and the API contract |
| Server | Express | `5.0.1` | Two endpoints; a full framework is not load-bearing |
| Animation | react-native-reanimated | `4.5.1` | UI-thread animations; required for `worklets` |
| Fonts | Inter via `@expo-google-fonts/inter` | `^0.4.2` | 400/500/600/700; explicit `fontFamily` (RN ignores `fontWeight` with named fonts) |
| Icons | `lucide-react-native` | `^0.564.0` | Consistent stroke geometry; `@expo/vector-icons` only survives in `ErrorFallback` |
| Storage | AsyncStorage | `2.2.0` | Theme, preferences, recents, route cache, query persistence |
| Connectivity | `@react-native-community/netinfo` | `^12.0.1` | Emits connect/disconnect; `expo-network` does not |
| Bundler (server) | esbuild | via CLI | `--packages=external` keeps the native `pg` out of the bundle |
| Runtime for scripts | `tsx` | `^4.20.6` | TypeScript execution without a build step |

### 2.2 Path aliases

Declared in both `tsconfig.json` and Metro:

| Alias | Resolves to | Used by |
| --- | --- | --- |
| `@/*` | repo root | app + client code — `@/lib/geo`, `@/components/CampusMap` |
| `@shared/*` | `shared/` | the server — `@shared/schema`, `@shared/types` |

> `@shared/*` exists so the Express process can import the *same* schema and types the app uses.
> A duplicated DTO on the server is a guaranteed drift bug.

### 2.3 Platform capability matrix

| Capability | iOS | Android | Web |
| --- | --- | --- | --- |
| Real map | Apple Maps | Google Maps | **None** — marker list placeholder |
| Marker pins / route polyline | Yes | Yes | No |
| One-shot location | `expo-location` | `expo-location` | `navigator.geolocation` |
| Continuous location (navigation) | `watchPositionAsync` | `watchPositionAsync` | `watchPosition` (browser-gated) |
| Haptics | Yes | Yes | No-op |
| Camera animation | `animateToRegion` | `animateToRegion` | No-op |
| Auth persistence | AsyncStorage | AsyncStorage | Browser cookies |
| System bars | `expo-system-ui` | `expo-system-ui` | N/A |

The web map gap is the single largest product gap. It is a `components/CampusMap.web.tsx`
implementation away and is scoped in the roadmap.

---

## 3. Feature Catalog

Every feature below is implemented in the current tree unless explicitly marked *(not built)*.

### 3.1 Onboarding & Campus Entry

| # | Feature | Where | Notes |
| --- | --- | --- | --- |
| F1 | Branded landing screen with animated entrance | `app/index.tsx` | Green gradient, decorative washes, 200/400/600 ms `FadeInDown` stagger |
| F2 | Campus picker populated from the database | `app/index.tsx` + `lib/api/campuses.ts` | Loading skeleton, error + retry, empty state; no hardcoded campus list |
| F3 | Guest access as a first-class mode | `lib/data/campus-fallback.ts` | When Supabase is unconfigured, screens read the seed dataset instead of failing |
| F4 | 404 route | `app/+not-found.tsx` | Themed (it carried a leftover Windows-blue link) |
| F5 | Account state in the landing card | `app/index.tsx` | Shows "Guest Access" or the signed-in display name |

### 3.2 Map & Discovery

| # | Feature | Where | Notes |
| --- | --- | --- | --- |
| F6 | Interactive campus map with custom pins | `components/CampusMap.native.tsx` | 36px green tile, 2.5px white border, triangular arrow; selected = 42px `#054A14` |
| F7 | Web map placeholder | `components/CampusMap.web.tsx` | Tappable marker list; documented gap |
| F8 | Free-text building search | `app/map.tsx` | Case-insensitive over name + description + aliases |
| F9 | Recent searches dropdown | `lib/recent-searches.ts` | AsyncStorage, cap 10, dedupe by id, persisted **on selection only** |
| F10 | Marker selection → bottom sheet | `app/map.tsx` | Handle, icon tile, name, description, distance/ETA pill, actions |
| F11 | Category icon mapping | `components/MarkerIcon.tsx` | `building`/`book`/`library`/`flag`/`map-pin`; white 16px, strokeWidth 2.5, `MapPin` fallback |
| F12 | Locate-me | `lib/location.ts` | Native permission flow with a value-explaining `Alert`; web geolocation |
| F13 | Home location ("take me home") | `lib/home-location.ts` | Float button; tap routes home, long-press sets home to current position |
| F14 | Favorites | `lib/api/favorites.ts`, `app/favorites.tsx` | Optimistic toggle; guests get a sign-in prompt rather than a dead heart |
| F15 | Camera control | `components/CampusMap.*.tsx` | `animateToRegion` — 600 ms focus, 800 ms route fit |
| F16 | Offline banner | `components/OfflineBanner.tsx` | Pill matching the hint-bar tokens, "Offline — showing saved campus data" |

### 3.3 Navigation

| # | Feature | Where | Notes |
| --- | --- | --- | --- |
| F17 | Walking route with distance + ETA | `lib/routing.ts` | Four-tier resolution: cache → campus graph → OSRM → stale cache → straight line |
| F18 | Turn-by-turn cues | `lib/navigation/instructions.ts` | Full OSRM maneuver table incl. uturn via `continue` + `uturn` modifier |
| F19 | Live progress tracking | `lib/navigation/useWalkingNavigation.ts` | `watchPositionAsync`, 5 m distance / 2 s time interval |
| F20 | Route snapping + step advancement | `lib/navigation/geo-nav.ts` | Projected onto the polyline; 5 m symmetric hysteresis |
| F21 | Off-route detection and re-route | `lib/navigation/geo-nav.ts` + hook | >30 m for 3 consecutive fixes (~6 s) → one haptic, one re-route |
| F22 | Arrival detection | hook | ≤15 m → success haptic, watcher stops, "Arrived" state |
| F23 | Progress bar | `components/RouteProgressBar.tsx` | 6px track `#E8F5E9`, fill `#0B6623` |
| F24 | Collapsible step list with auto-scroll | `components/NavigationSteps.tsx` | Current step highlighted |
| F25 | Camera follow | `app/map.tsx` + map prop | Follows the user unless the user dragged in the last 5 s |
| F26 | Step-free routing toggle | `components/StepFreeToggle.tsx` | Under the distance pill; re-routes on change |
| F27 | Entrance-aware arrival | `lib/navigation/graph.ts` | Routes to a surveyed door; "Arrive at Main ramp entrance" |
| F28 | Gate-aware routing | `entrances.gate_closes_at` | Campus-local `HH:MM`; client sends its local time |
| F29 | "No step-free path" warning | `app/map.tsx` | Shown when the fallback cannot honour the request |

### 3.4 Data Stewardship

| # | Feature | Where | Notes |
| --- | --- | --- | --- |
| F30 | "Report wrong info" | `components/ReportCorrectionModal.tsx` | Field picker limited to a whitelist of correctable columns; guests submit with `user_id: null` |
| F31 | Corrections moderation queue | `app/admin/corrections.tsx` | Pending/approved/rejected tabs, now → proposed diff, confirm on approve |
| F32 | Building CMS | `app/admin/buildings/*` | Create + edit share `components/BuildingForm.tsx`; validated by `importBuildingSchema` |
| F33 | Soft delete (unpublish) | `buildings.deleted_at` | Rows stay in the admin list greyed — the most-needed action is undo |
| F34 | CSV bulk import | `lib/import/csv.ts` | Quoted fields, embedded commas/newlines, doubled quotes, BOM, CRLF, header aliases, 1-based file line numbers in issues |
| F35 | GeoJSON bulk import | `lib/import/geojson.ts` | Point-only; `[lng, lat]` reordering; non-Point features rejected by index |
| F36 | Review-then-commit import | `app/admin/import.tsx` | Paste-only (no file-picker dependency); preview + per-row issues before commit |
| F37 | Chunked upsert | `lib/api/admin.ts` | 500 rows per chunk, upsert on `(campus_id, name)` |
| F38 | Admin dashboard + stats | `app/admin/index.tsx` | Buildings, unpublished, pending corrections; recent audit log |
| F39 | Audit log | `audit_log` + SQL triggers | **Trigger-only writer** — the client writes nothing |
| F40 | Role gate | `app/admin/_layout.tsx` + `lib/useRole.ts` | UX redirect for non-admins; RLS is the real enforcement |

### 3.5 Identity

| # | Feature | Where | Notes |
| --- | --- | --- | --- |
| F41 | Email/password sign-in | `app/(auth)/sign-in.tsx` | Supabase Auth; "check your inbox" inline state (no separate verify route) |
| F42 | Auto-profile creation | `supabase/migrations/0001_auth_profiles.sql` | `handle_new_user()` trigger |
| F43 | Graceful degradation when unconfigured | `lib/supabase.ts` | `getSupabase()` built on first use; `isSupabaseConfigured` false → "Sign-in unavailable" card, not a white screen |
| F44 | Admin grant CLI | `scripts/make-admin.ts` | `npm run admin:grant <email>` / `--revoke`; writes `app_metadata` via the service role |

### 3.6 Platform

| # | Feature | Where | Notes |
| --- | --- | --- | --- |
| F45 | Light/dark/system theming | `components/ThemeProvider.tsx` | Override persisted in AsyncStorage; awaited before the splash hides |
| F46 | Full dark palette | `constants/colors.ts` | 256 colour references migrated to `theme.*` |
| F47 | Per-scheme gradients | `constants/gradients.ts` | Dark uses lower-luminance greens to limit OLED bloom |
| F48 | System-bar ownership | `useSystemBars` | One context value the last-mounted screen owns; avoids effect races |
| F49 | Error boundary + themed recovery UI | `components/ErrorBoundary.tsx`, `ErrorFallback.tsx` | Boundary sits **outside** `ThemeProvider` so a provider crash is still caught |
| F50 | Keyboard avoidance | `components/KeyboardAwareScrollViewCompat.tsx` | `react-native-keyboard-controller` wrapper |
| F51 | Query cache persistence | `lib/query-client.ts` | AsyncStorage persister, 24 h max age, restored before the splash hides |
| F52 | Type-safe routes | `app.json` → `experiments.typedRoutes` | Compile-time route existence |

---

## 4. Use Cases

### UC-1 — First-time student finds their faculty

```
1. Open app → landing, no session, no network dependency for the campus list
2. Pick "Nasarawa State University (NSUK)" from the picker
3. router.push("/map", { campusId: "nsuk", lat, lng })   ← slug, not uuid
4. MapScreen: useBuildings("nsuk") → resolve uuid → fetch → filter deleted_at IS NULL
5. CampusMap renders 4 markers
6. Types "law" → useMemo filter over name + description + aliases
   → "Faculty of Law" matches by name AND alias "law"
7. Taps the result → bottom sheet (name, description, 210 m pill)
8. Taps "Get Directions"
9. useWalkingNavigation.start() → getCurrentUserLocation() → resolve route
10. Sheet swaps to progress bar + "Head north-east" + step list
```

**Acceptance:** works with no session; works with the backend unconfigured (fallback dataset);
works offline if a route was computed earlier.

### UC-2 — Wheelchair user requests a step-free route

```
1. On the map, selects Convocation Square
2. Taps the "Step-free route" toggle (persisted to `pref:stepFree`, mirrored to profiles)
3. handleGetDirections fires with options.stepFree = true
4. lib/routing.ts resolution order:
   a. route cache keyed on (from, to, campus, building, stepFree)  → miss
   b. POST /api/route  (graph is consulted ONLY when stepFree)
5. server/graph.ts: resolveCampusRef("nsuk") → uuid → getCampusGraph (15-min cache)
6. buildGraph(..., { stepFree: true }) drops every hasSteps edge STRUCTURALLY
7. A* from nearest node → candidate step-free entrances → cheapest door
8. Response re-validated against routeResponseSchema, then sent
9. Client parses, patches the arrive step: "Arrive at Main ramp entrance"
10. stepFreeSatisfied = true → no warning row
```

**If the graph is unprovisioned:** server returns `503` + `Retry-After: 60` → client swallows it →
OSRM fallback → `stepFreeSatisfied: false` → the sheet shows "No step-free path found; showing
nearest entrance." rather than silently serving a route with stairs in it.

**If the origin is >150 m off-graph:** `MAX_SNAP_METERS` → `409` with a `reason` → warning row.

### UC-3 — Returning user goes straight to the library

```
1. Signs in once (email/password)
2. Opens the map → `params.buildingId` is absent, so nothing auto-selects
3. Taps ★ in the top bar → /favorites
4. "Main Library" row → router.replace({ pathname: "/map", params: { buildingId } })
   ↑ replace, not navigate: navigate would reuse the mounted /map and never re-read params
5. MapScreen's one-shot ref fires handleMarkerPress(buildings.find(id === buildingId))
6. Sheet opens on the library; heart is already filled from useFavorites
7. Taps Home float button instead → routes home from profiles.home_lat/home_lng
```

### UC-4 — A student reports a wrong coordinate

```
1. Sheet for "Main Library" → "Report wrong info"
2. Field picker (correctionFields whitelist) → "latitude" → new value "8.84751"
3. Optional note → Submit
4. useSubmitCorrection inserts; guests send user_id: null (RLS allows it deliberately)
5. Audit trigger records the insert; the moderation queue is unaffected
6. Admin approves: building update lands FIRST, then status → 'approved'
   ↑ two ordered writes, not a transaction: if the update fails the report stays pending
     and retryable, rather than approved against a value that never landed
7. trg_audit_corrections records the status transition
```

### UC-5 — An admin imports 200 buildings

```
1. /admin → Import
2. Picks the CSV tab → pastes the file (paste-only: no document-picker dependency)
3. parseBuildingsCsv: BOM strip → CRLF normalise → header alias map → per-row zod parse
4. Review screen: first 10 rows previewed, issues listed with 1-based file line numbers
5. "Import N rows" → useImportBuildings chunks by 500 → upsert on (campus_id, name)
6. trg_audit_buildings writes one audit row per affected building
7. Public useBuildings cache is invalidated → the map picks them up
```

### UC-6 — App is opened with no network

```
1. Launch → PersistQueryClientProvider restores the AsyncStorage cache
2. Theme loaded and awaited → splash hides (no light flash)
3. useOnline() false → OfflineBanner
4. useBuildings serves the persisted React Query entry, no network attempt
5. Select a building → "Get Directions"
6. route cache hit (6 h TTL) → route drawn from cache
7. Or: cache expired → getStaleRoute returns the old entry → still better than a straight line
8. Or: nothing cached → straight-line route flagged `approximate: true`, synthesized cues
```

### UC-7 — Nav loses signal mid-walk

```
1. `watchUserLocation` rejects (permission revoked, no fix)
2. A failed watch is NOT a failed navigation
3. Route + step list stay on screen with an inline note
4. Live progress halts; the user still has a usable route
```

### UC-8 — Walker diverges and returns

```
1. Fix lands >30 m from the route for the 3rd consecutive time (~6 s)
2. setState("routing"); Haptics.notificationAsync(Warning); sheet shows "Recalculating…"
3. Re-route fires from the *fix that triggered it* — no second permission round trip
4. Exactly one re-route per divergence event (confirmation counter resets on re-attach)
```

---

## 5. Architecture

### 5.1 Layer diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│  PRESENTATION — app/ (Expo Router) + components/                        │
│  index · map · favorites · (auth)/sign-in · admin/* · +not-found         │
│  ThemeProvider · AuthProvider · AdminCampusProvider · ErrorBoundary      │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │  hooks only
┌───────────────────────────────▼──────────────────────────────────────────┐
│  STATE — TanStack Query (server cache) + Context (global client state)   │
│  QueryClient + AsyncStorage persister   │   Auth · Theme · AdminCampus   │
└──────────────┬──────────────────────────────────────┬───────────────────┘
               │                                      │
┌──────────────▼───────────────┐        ┌─────────────▼──────────────────┐
│  DOMAIN LIBRARIES (pure)     │        │  CLIENT DATA ACCESS            │
│  lib/geo · lib/routing       │        │  lib/api/*  → Supabase (PostgREST)│
│  lib/navigation/graph        │        │  (anon key, RLS is the gate)    │
│  lib/navigation/geo-nav      │        └────────────────────────────────┘
│  lib/navigation/instructions │
│  lib/navigation/useWalkingNav│        ┌────────────────────────────────┐
│  lib/location · lib/route-cache        │  PLATFORM SERVICES              │
│  lib/import/* · lib/prefs               │  expo-location · NetInfo        │
│  lib/recent-searches · home-location    │  AsyncStorage · haptics         │
└──────────────┬────────────────────────┘  └────────────────────────────────┘
               │
┌──────────────▼───────────────────────────────────────────────────────────┐
│  SHARED CONTRACT — shared/schema.ts (Drizzle + Zod) · shared/types.ts   │
└──────────────┬──────────────────────────┬───────────────────────────────┘
               │                          │
┌──────────────▼──────────────┐  ┌────────▼─────────────────────────────┐
│  EXPRESS SERVER             │  │  POSTGRES (Supabase)                │
│  /api/health · /api/route   │──│  RLS on every table                 │
│  server/graph.ts (loader)   │  │  audit triggers                     │
│  pg Pool → Drizzle          │  │  auth.users ↔ profiles trigger     │
└─────────────────────────────┘  └──────────────────────────────────────┘
```

### 5.2 The central architectural decision: where data lives

**Data flows through Supabase directly from the client. Express exists for exactly one
computational reason that the client cannot do.**

| Operation | Path | Reason |
| --- | --- | --- |
| Read campuses / buildings / favorites / corrections | Client → PostgREST | RLS already scopes per user; a server hop would re-implement it |
| Write buildings / corrections / audit-visible CRUD | Client → PostgREST | Same |
| **Step-free graph routing** | Client → `POST /api/route` → `pg` | Needs the whole campus graph in memory and an A* pass over it |
| Landing page, Expo manifest, static bundle hosting | Browser → Express | Hosting concern |
| Health | Client → `GET /api/health` | Liveness probe |

**Why this split.** Running a full server for CRUD would mean re-implementing auth checks, duplicating
RLS semantics, and adding a network hop to every list. A server *only* for graph routing is a real
need: the graph is hundreds of nodes and the A* has to run where the rows are.

**The rule this creates:** never mix paths for the same data. Campus and building data have exactly
one read path. If you add an Express endpoint that returns buildings, delete the client-side read.

### 5.3 Provider stack (order is load-bearing)

```tsx
// app/_layout.tsx
<ErrorBoundary>                        // 1. OUTSIDE ThemeProvider on purpose
  <PersistQueryClientProvider>          // 2. restores cache before children paint
    <ThemeProvider>                    // 3. awaited before splash hides
      <AuthProvider>                   // 4. session drives RLS-scoped queries
        <GestureHandlerRootView>
          <KeyboardProvider>
            <Stack headerShown={false}>
```

| Position | Why there |
| --- | --- |
| `ErrorBoundary` first | It catches a `ThemeProvider` crash. Inside, the fallback would have no theme context — so `useTheme()` returns the light palette instead of throwing. |
| `PersistQueryClientProvider` before the Stack | Children mount before restore; the splash is held via the provider's `onSuccess`/`onError`, which settle via `.finally` (a corrupt cache must not hang the splash). |
| Not nested in a second `QueryClientProvider` | `PersistQueryClientProvider` already renders one internally. Nesting two with the same client is a redundant context layer. |
| `ThemeProvider` before screens | Every screen's `makeStyles(theme)` needs it at first render. |

### 5.4 Request lifecycle — the full navigation path

```
User taps "Get Directions"
  │
  ├─ components/StepFreeToggle state → useStepFreePreference (AsyncStorage truth)
  │
  ├─ lib/navigation/useWalkingNavigation.start()
  │    ├─ state = "locating"
  │    ├─ lib/location.getCurrentUserLocation()
  │    │     native: expo-location permission → high accuracy
  │    │     web:    navigator.geolocation
  │    │     on success: lib/route-cache.setLastLocation(fix, 10 min TTL)
  │    │
  │    ├─ state = "routing"
  │    ├─ lib/routing.fetchWalkingRoute({ from, to, campusId, buildingId, stepFree, now })
  │    │    1. getCachedRoute(key)          → HIT?  return
  │    │    2. stepFree && api configured   → POST /api/route
  │    │    │                                 200 → setCachedRoute → return
  │    │    │                                 409/503 → fall through
  │    │    3. OSRM foot profile            → setCachedRoute → return
  │    │    4. getStaleRoute(key)           → return (degraded but real)
  │    │    5. straightLineRoute()          → approximate: true
  │    │
  │    ├─ camera fit: boundsOf(coords) → animateToRegion(region, 800)
  │    ├─ state = "navigating"
  │    └─ watchUserLocation() → per fix:
  │          ├─ snapToRoute(fix, coords)      → { index, offset, snapped }
  │          ├─ computeNavProgress()          → remaining, stepIndex, cueIndex
  │          ├─ off-route? (>30 m × 3)        → state "routing" → re-route → Warning haptic
  │          ├─ arrival?   (≤15 m)            → state "arrived" → Success haptic → stop watch
  │          └─ camera follow (unless user dragged <5 s ago)
  │
  └─ app/map.tsx renders one of three sheet layouts keyed on NavState
```

### 5.5 Failure policy

Every dependency has a defined degradation, and none of them are "throw".

| Dependency | Failure | Policy |
| --- | --- | --- |
| Supabase unconfigured | `isSupabaseConfigured === false` | Read `lib/data/campus-fallback.ts`; sign-in shows an "unavailable" card |
| Supabase query fails | React Query error | Screen-specific error + retry; the map keeps the last good data |
| Campus graph unprovisioned | `503` + `Retry-After` | Swallowed → OSRM → `stepFreeSatisfied: false` → warning row |
| Graph pair unconnected | `409` + `reason` | Warning row naming the reason |
| Route response malformed | server-side zod failure | 500; the client never receives a broken polyline |
| OSRM down / rate-limited | fetch rejects | Stale cache → straight line (`approximate: true`) |
| Location permission denied | `LocationPermissionError` | `Alert` explaining value; "Locate Me First" path offered |
| Location watch fails mid-walk | promise rejects | Route and steps **stay on screen** with an inline note |
| AsyncStorage unavailable | any call throws | `try/catch` everywhere → "no cache", not a crash |
| Corrupt query cache on disk | restore rejects | Provider `onError` still fires → splash hides |
| React render crash | `ErrorBoundary` | Themed recovery UI with reload + details |

### 5.6 Offline-first data flow

```
┌─ WRITE PATH ────────────────────────────────────────────────────────────┐
│ admin writes a building                                                │
│   → useUpdateBuilding (PostgREST)                                      │
│   → trg_audit_buildings fires in Postgres                              │
│   → onSettled: invalidate ["buildings", campusId]                      │
└────────────────────────────────────────────────────────────────────────┘
┌─ PERSISTENCE ──────────────────────────────────────────────────────────┐
│ createAsyncStoragePersister({ key: "campusnav-query-cache" })           │
│ PersistQueryClientProvider maxAge: 24 h                                │
└────────────────────────────────────────────────────────────────────────┘
┌─ READ PATH ────────────────────────────────────────────────────────────┐
│ cold launch → restore → staleTime 5 min / gcTime 24 h                  │
│ networkMode: "always"  ← lets a query fail fast instead of pausing       │
│ refetchOnReconnect: true                                               │
└────────────────────────────────────────────────────────────────────────┘
```

`networkMode: "always"` is the crux. The default (`"online"`) *pauses* queries while offline,
which would leave the UI in a permanent loading skeleton. Running the query lets it fail fast, and
React Query serves the persisted entry instead.

### 5.7 Why there is no Redux / Zustand

| Concern | Chosen mechanism | Why not a store |
| --- | --- | --- |
| Server state | TanStack Query | A cache library, not a state container; no manual invalidation store |
| Session | `AuthProvider` context | One value, one setter, read by ~5 hooks |
| Theme | `ThemeProvider` context | Same |
| Selected admin campus | `AdminCampusProvider` | Session-scoped, deliberately not in the URL |
| Everything else | Local `useState` | Was never global; a store would only add ceremony |

`lib/prefs.ts` and `lib/home-location.ts` are the interesting middle ground: local state for speed,
AsyncStorage as source of truth, `profiles` as a mirror when signed in. Preferences work signed-out.

---

## 6. Module Map

### 6.1 `app/` — routes

| File | Responsibility |
| --- | --- |
| `_layout.tsx` | Provider stack, font loading, persisted-cache restore, stored theme await, splash hide, Stack registration |
| `index.tsx` | `LandingScreen` — brand hero, campus picker, guest/account badge, quiet admin link |
| `map.tsx` | `MapScreen` — the core screen: search, recents, marker selection, route planning, live navigation, 3 sheet layouts, camera follow |
| `favorites.tsx` | `FavoritesScreen` — guest CTA, loading/error/empty, rows that navigate with `buildingId` |
| `+not-found.tsx` | 404 route |
| `(auth)/sign-in.tsx` | `SignInScreen` — email/password, inline "check your inbox" state, unconfigured fallback card |
| `admin/_layout.tsx` | `AdminLayout` — `useRole()` gate, redirect to `/`, `AdminCampusProvider`, admin `Stack` |
| `admin/index.tsx` | `AdminDashboardScreen` — stat tiles, action rows, read-only recent audit |
| `admin/buildings.tsx` | `AdminBuildingsScreen` — search over name+aliases, publish/unpublish, unpublished rows greyed |
| `admin/buildings/new.tsx` | `NewBuildingScreen` — `BuildingForm` create flow |
| `admin/buildings/[id].tsx` | `EditBuildingScreen` — `BuildingForm` update + publish toggle |
| `admin/corrections.tsx` | `AdminCorrectionsScreen` — moderation queue |
| `admin/import.tsx` | `AdminImportScreen` — CSV/GeoJSON tabs, review-then-commit, per-row issues |

> There is no `app/(auth)/_layout.tsx`. The auth group exists for URL grouping only.

### 6.2 `components/`

| File | Responsibility |
| --- | --- |
| `ThemeProvider.tsx` | Light/dark palettes, `loadStoredMode`, `ThemeMode`, `useTheme`, `useSystemBars` |
| `AuthProvider.tsx` | Supabase session lifecycle |
| `AdminCampusProvider.tsx` | Active campus for the CMS, session-scoped |
| `CampusMap.tsx` | Static-analysis entry re-exporting the native types (Metro resolves `.native`/`.web` first) |
| `CampusMap.native.tsx` | `react-native-maps` `MapView` + `Marker` + `Polyline`, custom pin views, `animateToRegion`, `showsUserLocation`, `onRegionChangeComplete` |
| `CampusMap.web.tsx` | Placeholder panel + tappable marker list; no-op `animateToRegion` |
| `MarkerIcon.tsx` | Single `getMarkerIcon(key)` mapping — the single source of truth for pin glyphs |
| `NavigationSteps.tsx` | Turn list + exported `ManeuverGlyph` |
| `RouteProgressBar.tsx` | 6px progress track/fill |
| `StepFreeToggle.tsx` | Accessibility toggle with inactive/active states |
| `BuildingForm.tsx` | Shared create/edit form, validated by `importBuildingSchema` |
| `ReportCorrectionModal.tsx` | Field picker + value + note for public correction submission |
| `ErrorBoundary.tsx` | App-level React error boundary |
| `ErrorFallback.tsx` | Themed recovery UI (reads the OS scheme, not the context — see ADR-11) |
| `OfflineBanner.tsx` | Offline pill |
| `KeyboardAwareScrollViewCompat.tsx` | Keyboard-controller wrapper |

### 6.3 `lib/`

| File | Responsibility |
| --- | --- |
| `query-client.ts` | `queryClient`, `queryPersister`, `getApiUrl()`, `apiRequest()`, `getQueryFn()`, `isApiConfigured()`, `QUERY_CACHE_MAX_AGE` |
| `useAuth.ts` | `useAuth()` re-export of the provider context |
| `useRole.ts` | `useRole()` — reads `app_metadata.role` from the session JWT only |
| `useOnline.ts` | `useOnline()` via NetInfo |
| `prefs.ts` | `useStepFreePreference()`, `STEP_FREE_STORAGE_KEY = "pref:stepFree"` |
| `home-location.ts` | `useHomeLocation()`, `HOME_STORAGE_KEY = "home:location"`, `HomePreference` |
| `route-cache.ts` | `getCachedRoute` / `getStaleRoute` / `setCachedRoute` / `getLastLocation` / `setLastLocation` |
| `recent-searches.ts` | `getRecents` / `pushRecent` / `clearRecents` |
| `routing.ts` | `fetchWalkingRoute`, `WalkingRoute` — the five-tier resolution |
| `route-contract.ts` | `routeResponseSchema`, `RouteEntrance`, `graphRouteToResponse` |
| `geo.ts` | `toLatLon`, `toLatLngPair`, `segmentDistance`, `polylineLength`, `initialBearing`, `boundsOf`, `formatDistance`, `formatWalkTime`, `estimateWalkSeconds`, `decodeOSRMGeometry`, `calculateStraightDistance` |
| `location.ts` | `getCurrentUserLocation`, `watchUserLocation`, `LocationWatcher`, `LocationPermissionError` |
| `supabase.ts` | `isSupabaseConfigured`, `getSupabase` |
| `navigation/graph.ts` | **Pure** A* engine — `buildGraph`, `findPath`, `nearestNode`, `attachEntrances`, `routeOnGraph`, `classifyTurn`, `bearingDelta`, `isEntranceOpen`, `parseClock`, `MAX_SNAP_METERS` |
| `navigation/geo-nav.ts` | `snapToRoute`, `computeNavProgress`, `cumulativeDistances`, `totalPathLength`, `stepOffsets` + all thresholds |
| `navigation/instructions.ts` | `buildNavSteps`, `describeManeuver`, `maneuverIcon`, `compassDirection`, `withDestinationName` |
| `navigation/useWalkingNavigation.ts` | `useWalkingNavigation()` — the `NavState` machine |
| `import/csv.ts` | `parseBuildingsCsv`, `ImportIssue`, `CsvParseResult` |
| `import/geojson.ts` | `parseBuildingsGeoJson`, `GeoJsonParseResult` |
| `import/correction-values.ts` | `CORRECTION_FIELD_LABELS`, `currentFieldValue`, `coerceCorrectionValue` |
| `data/campus-fallback.ts` | `SEED_CAMPUSES`, `SEED_BUILDINGS`, `fallbackBuildings` — feeds both `db:seed` and guest mode |
| `data/path-graph-fallback.ts` | `SEED_PATH_NODES` (11), `SEED_PATH_EDGES` (14), `SEED_ENTRANCES` (7) — placeholder topology |

### 6.4 `shared/`

| File | Responsibility |
| --- | --- |
| `schema.ts` | All Drizzle `pgTable` definitions + Zod insert/update schemas + inferred types + `correctionFields` whitelist |
| `types.ts` | `LatLon`, `LatLngPair`, `Building`, `Campus`, `BuildingCategory`, `MarkerIconName`, `toCampusMarker` |

### 6.5 `server/`

| File | Responsibility |
| --- | --- |
| `index.ts` | Express bootstrap: CORS → body parsing → API logging → Expo manifest + landing page → static assets → routes → error handler. Listens on `PORT` (5000) / `0.0.0.0` |
| `routes.ts` | The `/api` router (`GET /health`, `POST /route`) |
| `graph.ts` | `routeOnCampusGraph`, `getCampusGraph`, `invalidateGraphCache`, `resolveCampusRef`, `GraphUnavailableError`, `GraphNotSurveyedError` |
| `db.ts` | `pg` Pool (max 10, `rejectUnauthorized: false` for the Supabase pooler) + Drizzle client + `assertDatabaseConfigured()` |
| `storage.ts` | `IStorage` / `MemStorage` in-memory profile stub — **orphaned**, nothing imports it |
| `templates/landing-page.html` | Marketing page with `BASE_URL_PLACEHOLDER`, `EXPS_URL_PLACEHOLDER`, `APP_NAME_PLACEHOLDER` |

### 6.6 `scripts/`

| Script | npm alias | Purpose |
| --- | --- | --- |
| `load-env.ts` | — | Loads `.env` into `process.env` for `tsx` scripts; **existing values always win** |
| `seed.ts` | `db:seed` | Idempotent upsert of campuses, buildings, entrances, path nodes, path edges |
| `make-admin.ts` | `admin:grant` | `admin:grant <email> [--revoke]` — sets `app_metadata.role` via the service role, mirrors `profiles.role` |
| `collect-paths.ts` | `paths:collect` | `paths:collect --track <file>` — GPS trace (JSON / GeoJSON LineString / GPX) → de-noise → RDP simplify → node spacing → review CSV + SQL. `--apply` is a deliberate stub |
| `build.js` | `expo:static:build` | Starts Metro, downloads iOS/Android bundles + manifests + assets, rewrites bundle URLs, writes `static-build/<platform>/manifest.json` |
| `tmp-*.ts` | — | Scratch diagnostics for the graph engine and the track parser. **Not referenced by any npm script; delete before shipping** |

### 6.7 `supabase/migrations/`

Drizzle creates the tables. These five files add what Drizzle cannot express.

| File | Adds |
| --- | --- |
| `0001_auth_profiles.sql` | `profiles → auth.users` FK (cascade), `handle_new_user()` signup trigger, RLS (own-profile read/insert/update, admin read/write), column-scoped `grant update (display_name, home_lat, home_lng)` |
| `0002_campus_data.sql` | RLS on `campuses` / `buildings` — public read, admin write |
| `0003_path_graph.sql` | RLS on `entrances` / `path_nodes` / `path_edges`; `profiles.pref_step_free` + its column grant |
| `0004_favorites.sql` | RLS on `favorites` — `auth.uid() = user_id` for all operations |
| `0005_admin_cms.sql` | `buildings.deleted_at`; RLS on `corrections` (own read, guest-or-own insert, admin moderate) and `audit_log` (admin read/insert, **no** update/delete policy); `trg_audit_buildings` (insert/update/delete with per-column `changed` diff); `trg_audit_corrections` (status transitions) |

---

## 7. Data Model

### 7.1 Entity relationship

```
auth.users (Supabase-managed)
      │ 1:1  (FK, ON DELETE CASCADE, created by handle_new_user() trigger)
      ▼
  profiles ──────────────┐
      │ role             │ user_id (ON DELETE CASCADE)
      │ pref_step_free   │
      │ home_lat/lng     │
      │                  ▼
      │              favorites ──── building_id (CASCADE) ────┐
      │                  unique(user_id, building_id)         │
      │                                                       │
      │           user_id (NO CASCADE — preserve on delete)   │
      ▼                                                       ▼
  corrections ── building_id (CASCADE) ──────────────►  buildings
      field (7-value enum)                                 campus_id (CASCADE) ──► campuses
      new_value · note · status                                          ▲
      review_note · created_at · reviewed_at                 unique(campus_id, name)
      index (status, created_at)                           soft delete: deleted_at
                                                                    │
   ┌────────────────────────────────────────────────────────────────┤
   │ (campus_id, CASCADE)                                            │
   ▼                                                                ▼
entrances                                            path_edges ──┐ from_node_id
  building_id (CASCADE)                                to_node_id   │ to_node_id
  unique(building_id, name)                             unique(from,to)  (CASCADE)
  name · lat/lng · has_ramp · has_steps                    distance_m · has_steps
  step_free · gated · gate_closes_at (time)                has_ramp · covered
                                                              surface (enum) · lit
                                                          path_nodes (campus_id, lat, lng)
                                                            unique(campus_id, lat, lng)

audit_log  (standalone)  actor_id · action · entity · entity_id · diff jsonb · created_at
users      (legacy)      username unique · NO LONGER WRITTEN
```

### 7.2 Table specifications

#### `profiles`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | FK → `auth.users(id)` ON DELETE CASCADE |
| `role` | enum `student` \| `admin` | default `student`. **Display only** — RLS reads `app_metadata` |
| `display_name` | text | |
| `home_lat` / `home_lng` | double | "take me home" |
| `pref_step_free` | boolean | mirror of the AsyncStorage preference |
| `created_at` | timestamptz | default `now()` |

#### `campuses`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | `gen_random_uuid()` |
| `slug` | text **unique** | `"nsuk"` — what routes carry |
| `name` | text | |
| `location` | text | "Keffi, Nasarawa State" |
| `lat` / `lng` | double | |
| `zoom` | double | default `0.008` |
| `icon` | text | default `map-pin` |

#### `buildings`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `campus_id` | uuid FK → campuses CASCADE | |
| `name` | text | |
| `description` | text | |
| `category` | enum, 10 values | `admin`, `faculty`, `library`, `event`, `hostel`, `cafeteria`, `sports`, `health`, `parking`, `toilet`; default `faculty` |
| `lat` / `lng` | double | centroid, not a door |
| `icon` | text | default `map-pin`; maps through `MarkerIcon` |
| `aliases` | `text[]` | `["VC's office", "admin block"]` — **seeded and searched** |
| `opening_hours` | text | free-form; no parsing, no validation |
| `is_accessible_entry` | boolean | default `true`. **Never read by routing** — `entrances` is the authority (ADR-08) |
| `deleted_at` | timestamptz | soft delete; public reads filter `IS NULL` |
| `created_at` | timestamptz | |
| | **unique `(campus_id, name)`** | makes the seed idempotent and the import an upsert |

#### `entrances`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `building_id` | uuid FK → buildings CASCADE | |
| `name` | text NOT NULL default `"Main entrance"` | "Main ramp entrance" |
| `lat` / `lng` | double | |
| `has_ramp` | boolean | default `false` |
| `has_steps` | boolean | default `false` |
| `step_free` | boolean | default `true` — usable without climbing |
| `gated` | boolean | default `false` |
| `gate_closes_at` | `time` | campus-local, e.g. `20:00` |
| | unique `(building_id, name)` | |

> Multiple entrances per building is the whole point: a building can have both a stair door and a
> ramp door, so `buildings.isAccessibleEntry` alone is insufficient.

#### `path_nodes` / `path_edges`
| `path_nodes` | | | `path_edges` | |
| --- | --- | --- | --- | --- |
| `id` | uuid PK | | `id` | uuid PK |
| `campus_id` | uuid FK (nullable) | | `campus_id` | uuid FK (nullable) |
| `lat`/`lng` | double | | `from_node_id` | uuid FK CASCADE |
| | unique `(campus_id, lat, lng)` | | `to_node_id` | uuid FK CASCADE |
| | | | `distance_m` | double |
| | | | `has_steps` / `has_ramp` | boolean |
| | | | `covered` | boolean |
| | | | `surface` | enum `paved`\|`gravel`\|`dirt` (NOT NULL) |
| | | | `lit` | boolean |
| | | | | unique `(from_node_id, to_node_id)` |

**Undirected.** Each edge is stored once and reachable from both ends.

Nullable `campus_id` is deliberate: it makes the survey per-campus, and lets a legacy/global graph
be addressed with `campusId: "*"` (which spans all campuses *including* rows with a null campus).

#### `corrections`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `building_id` | uuid FK → buildings CASCADE | |
| `user_id` | uuid FK → profiles, **NO CASCADE** | nullable; guests submit `null` |
| `field` | enum, 7 columns | the `correctionFields` whitelist |
| `new_value` | text | coerced to the column type on approval |
| `note` | text | free-form context |
| `status` | enum | `pending` \| `approved` \| `rejected`; default `pending` |
| `review_note` | text | moderator's reason |
| `created_at` / `reviewed_at` | timestamptz | |
| index `(status, created_at)` | | the queue's ordering |

#### `audit_log`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `actor_id` | uuid | |
| `action` | text | `building.insert` / `.update` / `.delete`, `correction.approve`, `.reject` |
| `entity` | text | `buildings`, `corrections` |
| `entity_id` | text | |
| `diff` | `jsonb` | per-column `{ before, after, changed }` |
| `created_at` | timestamptz | index |

### 7.3 Validation schemas

`shared/schema.ts` exports, via `drizzle-zod` + explicit refinements:

`insertUserSchema` (legacy) · `insertProfileSchema` / `updateProfileSchema` · `homeLocationSchema` ·
`insertCampusSchema` · `insertBuildingSchema` · `searchBuildingsSchema` · `insertEntranceSchema` ·
`insertPathNodeSchema` / `insertPathEdgeSchema` · `routeOptionsSchema` / `insertRouteSchema` ·
`insertCorrectionSchema` · `importBuildingSchema`

Plus the non-Drizzle ones:

| Schema | Enforces |
| --- | --- |
| `routeResponseSchema` | The wire contract. **The server validates its own response before sending it** and the client validates on receipt. A malformed polyline would surface as an inexplicable off-route loop, not an error. |
| `correctionFields` | The whitelist of correctable columns — the single source of truth for the picker, the coercion table and the approval path |
| `markerIconNames` | Closed set of renderable icons |

> `importBuildingSchema` **rejects a blank coordinate instead of coercing it to 0**.
> `z.coerce.number()` runs `Number("")` → `0`, so an empty latitude in a spreadsheet would have
> imported a building at Null Island and validated cleanly. Caught by the parser checks.

### 7.4 Seed data

| Dataset | Count | File |
| --- | --- | --- |
| Campuses | 1 (`nsuk`) | `lib/data/campus-fallback.ts` |
| Buildings | 4 (Senate, Faculty of Law, Main Library, Convocation Square) | `lib/data/campus-fallback.ts` |
| Path nodes | 11 | `lib/data/path-graph-fallback.ts` |
| Path edges | 14 | `lib/data/path-graph-fallback.ts` |
| Entrances | 7 (including a gated one) | `lib/data/path-graph-fallback.ts` |

**One dataset, two consumers.** `scripts/seed.ts` and the guest-mode fallback import the *same*
`SEED_CAMPUSES` / `SEED_BUILDINGS` / `SEED_PATH_*` constants, so the seeded database and the offline
experience cannot drift. Ids are readable slugs (`nsuk-senate`, `law`, `ramp`); the database assigns
its own uuids.

> The path graph is **plausible, not surveyed**. Every coordinate is invented to sit sensibly between
> the four seeded buildings. It exists so the step-free path is *demonstrably different* from the
> shortest one and so the tables have rows before anyone walks a campus with `collect-paths.ts`. It
> is wrong in the details a wheelchair user would care about.

---

## 8. Security Model

### 8.1 The invariant

> **The anon key is the only credential in the client bundle, and RLS is the only thing standing
> between a curious user and the admin table. Client-side role checks are UX, not security.**

### 8.2 Trust tiers

| Tier | Credential | Where it lives | Can do |
| --- | --- | --- | --- |
| Public / anon | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | in the bundle | Anything RLS allows (public reads, own-row writes) |
| Service role | `SUPABASE_SERVICE_ROLE_KEY` | `.env`, scripts only | Bypass RLS; **the only credential that can write `app_metadata`** |
| DB direct | `DIRECT_URL` | `.env`, drizzle-kit only | DDL; migrations |
| Pooler | `DATABASE_URL` | `.env`, Express only | Queries as the app role; subject to RLS |

### 8.3 Why `app_metadata` and not `profiles.role`

| Claim | Writable by | Survives token refresh | Use |
| --- | --- | --- | --- |
| `profiles.role` | The user (their own row) | Yes | **UI hints only** |
| `app_metadata.role` | Service role only | Yes — baked into the JWT | **RLS policy tests** |

A user can `update profiles set role = 'admin' where id = auth.uid()`. They cannot write
`app_metadata` — that requires the service role. So every RLS policy tests:

```sql
auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
```

`scripts/make-admin.ts` is the only writer, and it goes through the Supabase Admin API.

> **After `admin:grant`, sign out and back in.** `app_metadata` is baked into the JWT at sign-in;
> a token minted before the grant will fail every policy until it is refreshed.

### 8.4 RLS policy matrix

| Table | select | insert | update | delete |
| --- | --- | --- | --- | --- |
| `profiles` | own row; admins: all | own row | own row, **column-scoped** to `display_name`, `home_lat`, `home_lng`; admins: all | — |
| `campuses` | public | admin | admin | admin |
| `buildings` | public (soft-deleted rows are filtered in the client query) | admin | admin | admin |
| `entrances` | public | admin | admin | admin |
| `path_nodes` | public | admin | admin | admin |
| `path_edges` | public | admin | admin | admin |
| `favorites` | `auth.uid() = user_id` | `auth.uid() = user_id` | `auth.uid() = user_id` | `auth.uid() = user_id` |
| `corrections` | own; admins: all | own **or** `user_id is null` (guests) | admin | — |
| `audit_log` | admin | admin | **no policy** | **no policy** |

Two details worth remembering:

1. **`grant update` then `grant update (display_name, home_lat, home_lng)`** — Postgres column
   privileges revoke the table-level grant, so a user can change their display name and home
   location but *not* their own `role`. A client-side check would be trivially bypassed; this is
   enforced in the database.
2. **`audit_log` has no update or delete policy.** An admin can read and append, never rewrite
   history. Combined with the trigger-only writer (ADR-13), the log is append-only from every angle
   the app can reach.

### 8.5 Two-layer admin protection

```
Layer 1 (UX):  app/admin/_layout.tsx → useRole() → <Redirect href="/" /> for non-admins
Layer 2 (real): RLS policies → a non-admin calling PostgREST directly changes zero rows
```

The client gate exists so a non-admin sees the landing screen instead of an empty dashboard. It is
not a security control and must never be described as one.

### 8.6 API hardening status

| Control | Status |
| --- | --- |
| Zod validation on request bodies | ✅ `insertRouteSchema.safeParse` |
| Zod validation on responses | ✅ `routeResponseSchema.safeParse` before send |
| CORS allow-list | ✅ Replit domains + `REPLIT_DOMAINS` + any localhost port |
| Secrets out of the bundle | ✅ service role and `DATABASE_URL` are never `EXPO_PUBLIC_*` |
| `audit_log` immutability | ✅ no update/delete policy + trigger-only writer |
| Admin authority server-side | ✅ `app_metadata` |
| Column-scoped profile updates | ✅ Postgres column grants |
| **Rate limiting on `/api`** | ❌ not implemented |
| **Helmet / security headers** | ❌ not implemented |
| **OSRM key server-side** | ⚠ the public OSRM demo is still called directly from the client |
| **`/api/route` auth** | ❌ open to anyone who can reach it (read-only over public graph data, but unthrottled) |
| **Error handler leaks stack in prod** | ⚠ verify `server/index.ts` before public launch |

---

## 9. The Routing & Navigation Engine

This is the most substantial piece of engineering in the repository. It has three parts.

### 9.1 Part one — route resolution (`lib/routing.ts`)

Five tiers, in order, each degrading to the next:

```
1.  Fresh cache      getCachedRoute(key)     6 h TTL, coordinates rounded to 4 dp (~11 m)
                                          → HIT: return
2.  Campus graph     POST /api/route        only when stepFree && api configured
                                          200 → setCachedRoute → return
                                          409 / 503 → fall through
3.  Public router    OSRM foot profile      router.project-osrm.org
                                          → setCachedRoute → return
4.  Stale cache      getStaleRoute(key)     expired but present
                                          → return (degraded but real geometry)
5.  Straight line    straightLineRoute()    approximate: true, synthesized cues
```

**Why stale beats straight.** A 12-hour-old campus path is a real walkable path. A line between two
points may go through a building. Expiry downgrades quality instead of discarding the entry.

**Why coordinates are rounded to 4 dp.** GPS jitter would otherwise mint a new cache entry per
request. ~11 m precision is well inside the difference that matters for a campus route.

**Why every `AsyncStorage` call is wrapped.** A full or unavailable store degrades to "no cache",
not a crash.

**Cached-route upgrade.** Entries written before turn-by-turn existed have no `steps`. They are
upgraded with `synthesizeSteps()` (depart → continue → arrive) rather than collapsing the sheet to a
single "route shown" row. `stepFree` is deliberately **not** defaulted on upgrade: a cached OSRM
route can satisfy nothing about a step-free request, so a stale step-free hit is rejected outright.

#### `WalkingRoute` contract

```ts
interface WalkingRoute {
  coordinates: LatLon[];
  steps: NavStep[];              // cues already trimmed of sub-2 m noise
  distanceMeters: number;
  durationSeconds: number;
  approximate: boolean;          // straight-line geometry
  source?: "osrm" | "graph";     // engine, for the sheet's source note
  entrance?: RouteEntrance | null;   // the door a graph route aimed at
  stepFreeSatisfied?: boolean;   // false → the sheet warns instead of lying
}
```

`approximate` and `stepFreeSatisfied` are the two honesty flags. Every degraded path sets at least
one, and the UI is expected to surface them rather than hide them.

### 9.2 Part two — the campus graph (`lib/navigation/graph.ts`)

**Pure**: no DB, no fetch, no React. It runs identically on the server, in the offline bundle, and in
a unit test. `server/graph.ts` is only the loader and cache.

#### Cost model

```
cost_per_meter(edge) = SURFACE_FACTOR[surface] × (preferCovered && covered ? 0.95 : 1)

paved  = 1.00     gravel = 1.15     dirt = 1.30
COVERED_FACTOR = 0.95   — a nudge, not a shortcut
```

`path_edges.surface` is a **NOT NULL enum**, not free text, so the cost model cannot silently read a
typo as `undefined`.

#### Step-free filtering is structural

```ts
if (options.stepFree && edge.hasSteps) {
  graph.skippedStepEdges += 1;
  continue;                       // never reaches an adjacency list
}
```

Stairs are dropped **before** adjacency is built, so a stair edge cannot be traversed by a later
relaxation. This is not a per-relaxation check that could be missed.

#### A* with a provably admissible heuristic

```
minCostPerMeter = min over included edges of ( cost / chord )
                   where chord = straight-line distance between the edge's endpoints
```

Why not just the minimum surface multiplier? A path's surveyed length is normally longer than the
straight line between its endpoints — but not always. A covered passage, an indoor link, or a
mistyped distance can be *shorter* than the chord. Bounding by `cost / chord` keeps the heuristic a
true lower bound even then, so A* still returns an **optimal** path rather than a plausible-looking
near miss. Verified: A* matches a reference Dijkstra on all 100 node pairs × 4 option sets, with the
heuristic proved admissible for every pair.

A fallback of `1` is used when no edges exist or every chord is zero — a zero heuristic is admissible.

The search uses a small binary min-heap rather than a linear open-set scan.

#### Reported distance is measured from the drawn geometry

`edge.distanceM` feeds **cost**, not the reported number. The polyline we draw is node-to-node
straight lines, so reporting surveyed metres against a straight-line drawing would make the progress
bar and the arrival radius disagree with what the user sees. The graph's job is therefore to **place
nodes at every turn** — which is what `scripts/collect-paths.ts` enforces via node spacing.

`implausibleEdgeCount` flags edges whose surveyed distance is shorter than 95% of their chord, so
survey mistakes surface as a metric instead of a mysteriously cheap shortcut.

#### Snapping

`nearestNode` is a **linear** scan. A hand-surveyed campus graph is hundreds of nodes, not millions;
a spatial index would cost more to maintain than it saves. `MAX_SNAP_METERS = 150` — a fix further
than that from any node means the walker is off-campus, so routing gives up rather than drawing a
line to a remote junction.

#### Gate filtering

```ts
isEntranceOpen(entrance, now /* campus-local "HH:MM" */)
parseClock("20:00") → minutes
```

The **client** sends campus-local time in `options.avoidGatesAfter`. The server defaulting to its own
clock would be wrong for a campus outside UTC.

#### Entrance selection

When `stepFree`: candidates = entrances with `step_free` on the destination building; pick the
cheapest by graph cost. Otherwise: nearest entrance regardless of flags. The final step is patched to
"Arrive at *{entrance name}*".

### 9.3 Part three — live navigation (`lib/navigation/geo-nav.ts` + hook)

#### Thresholds

| Constant | Value | Meaning |
| --- | --- | --- |
| `OFF_ROUTE_THRESHOLD_M` | `30` | perpendicular distance from the route before the walker counts as off it |
| `OFF_ROUTE_CONFIRMATIONS` | `3` | consecutive fixes (~6 s at the 2 s interval) before acting |
| `STEP_HYSTERESIS_M` | `5` | symmetric buffer at a step boundary |
| `ARRIVAL_RADIUS_M` | `15` | distance to the destination that ends navigation |
| `MAX_SNAP_METERS` | `150` | graph snapping limit (graph engine) |

#### Snapping to the route

```ts
snapToRoute(point, path) → { index, offset, snapped }
```

Nearest segment by cross-track distance; per-segment projection in a **local equirectangular frame**
(sub-metre accuracy at campus scale). Cumulative vertex distances are memoised in a `WeakMap` keyed on
the path array, so a fix every 2 s re-measures nothing. O(n) per fix, which is trivial for ~500 points.

#### Symmetric hysteresis

A step advances once the walker is **5 m past** the maneuver; the "next cue" flips **5 m before** it.
A fix hovering on a boundary therefore neither skips a step nor flickers between two cues.

#### Step boundaries are derived, not assumed

OSRM's step geometries concatenate into the route polyline, so `stepOffsets()` walks the polyline
**once**, matching each step's first/last vertex forward-only, and memoises per step array. This
keeps working when the router omits per-step geometry — which the public OSRM demo actually does
(`steps[].geometry` is absent; every step is a single maneuver point).

#### Navigation state machine

```ts
type NavState = "idle" | "locating" | "routing" | "navigating" | "arrived" | "error";
```

| Transition | Trigger |
| --- | --- |
| `idle → locating` | `start()` |
| `locating → routing` | permission + fix obtained |
| `routing → navigating` | route resolved (any tier) |
| `navigating → routing` | off-route confirmed, or step-free toggled |
| `navigating → arrived` | within `ARRIVAL_RADIUS_M` |
| `* → idle` | `cancel()` |

The hook takes `onCameraFit` / `onFollowUser` **callbacks**, not a `MapView` ref. `lib/` therefore
stays free of map imports and the hook stays testable. Route-request context (`campusId`,
`buildingId`, `stepFree`) is threaded through a **request-time ref** so changing a toggle mid-flight
cannot produce a half-updated request.

#### Three sheet layouts

| `NavState` | Sheet |
| --- | --- |
| `idle` | title, description, distance/ETA pill, step-free toggle, "Get Directions" |
| `navigating` | progress bar, current cue (icon + `Inter_700Bold 18` + "in 40 m"), collapsible step list (auto-scrolls), remaining pill, Cancel |
| `arrived` | success check, destination name, "Done" |

### 9.4 What the public OSRM demo actually returns (measured, NSUK gate → library)

| Field | Value | Consequence |
| --- | --- | --- |
| `steps[]` | 8 steps, distances summing to the full 1570 m | step list is complete |
| `steps[].geometry` | **absent** | each step is a single maneuver point; `stepOffsets()` matches those against the polyline |
| `steps[].name` | **empty for every step** | no "onto Faculty Rd" suffix in practice; the mapping is implemented and unit-checked anyway |
| `steps[].maneuver.location` | present | drives step boundaries |

Two consequences worth remembering:

1. A **`continue` step with `modifier: "uturn"`** is how the foot profile reports a U-turn. That
   needed an explicit case in both `describeManeuver` and `maneuverIcon`, or the sheet would have
   said "Continue" through a 180° turn.
2. Because the demo has no per-step geometry, the live check confirmed the boundary matcher: sampled
   at 0/25/50/75/99% of the route, the step and cue indices advance **monotonically**, and the final
   fix reports `remaining ≈ 0 m` with the cue on the arrive step.

### 9.5 Instruction generation

The router does not know the destination, so the arrive step is stored as **"You have arrived"** and
the destination is patched in at the display layer by `withDestinationName()`. That keeps one cached
route reusable for any destination it was requested for, and the patch is idempotent.

| `type` / `modifier` | Output |
| --- | --- |
| `depart` | "Head {compass direction}" |
| `turn` + `left`/`right`/`slight left`/`slight right`/`sharp left`/`sharp right` | "Turn left", "Slight right", … |
| `continue` + `uturn` | "Make a U-turn" |
| `continue` | "Continue on {street or path}" |
| `new name` | "Continue onto {name}" |
| `fork` | "Keep {left/right}" |
| `roundabout` + `exit` | "Enter roundabout, take exit {n}" |
| `arrive` | "Arrive at {destination name}" |

Steps under 2 m are dropped when building the list (first and last are always retained).
`maneuverIcon` maps the same table to lucide glyphs; `compassDirection` converts a bearing to one of
16 points.

---

## 10. API Surface

The complete API is **two routes**. Everything else goes through Supabase directly.

### `GET /api/health`

```json
{ "ok": true }
```

### `POST /api/route`

**Request** — validated by `insertRouteSchema`:

```json
{
  "from": { "lat": 8.8465, "lng": 7.8760 },
  "to":   { "lat": 8.8475, "lng": 7.8770 },
  "campusId": "nsuk",
  "buildingId": "<uuid or null>",
  "options": {
    "stepFree": true,
    "preferCovered": false,
    "avoidGatesAfter": "18:30"
  }
}
```

**200** — validated against `routeResponseSchema` before leaving the process:

```json
{
  "coordinates": [{ "latitude": 8.8465, "longitude": 7.8760 }, "…"],
  "steps": [{ "instruction": "Head north-east", "distance": 42, "icon": "arrow-up", "…": "…" }],
  "distanceMeters": 118,
  "durationSeconds": 87,
  "approximate": false,
  "source": "graph",
  "entrance": { "name": "Main ramp entrance", "lat": 8.8475, "lng": 7.8770 },
  "stepFreeSatisfied": true
}
```

| Status | When | Client behaviour |
| --- | --- | --- |
| `400` | body fails `insertRouteSchema` | `details` from `zod-validation-error` |
| `409` | the graph is fine but this pair is not connected | warning row naming `reason` (`origin-off-graph`, `empty-graph`, `unreachable`, `no-usable-entrance`) |
| `503` + `Retry-After: 60` | the graph is unprovisioned (`GraphUnavailableError`) | fall through to OSRM; `stepFreeSatisfied: false` |
| `500` | `graphRouteToResponse` produced an invalid payload | error handler |

**409 rather than 404 is deliberate.** The graph is fine; *this pair of points* is not connected, which
is a different thing for the client to explain.

**The 503 is not an error.** The graph being unprovisioned is a normal state, not a failure — the
response says so with `Retry-After` and the client is designed to swallow it.

### `server/graph.ts` — loader and cache

| Export | Responsibility |
| --- | --- |
| `resolveCampusRef` | slug **or** uuid → the uuid the graph tables are keyed on |
| `getCampusGraph` | 15-minute in-memory cache, keyed on campus + topology-affecting options (`stepFree`, `preferCovered`) |
| `routeOnCampusGraph` | resolve → load → `buildGraph` → snap → `findPath` → `attachEntrances` → build steps |
| `invalidateGraphCache` | reserved for the admin CMS; **no caller yet** |
| `GraphUnavailableError` | → 503 |
| `GraphNotSurveyedError` | no rows for the campus → a `reason` on the 409 |

`resolveCampusRef` runs **before** the cache lookup, so both spellings share one cache entry and an
already-canonical uuid costs no extra query.

`campusId: "*"` spans all campuses, including rows with a null `campus_id`.

### `server/index.ts` — middleware order

```
CORS            Replit domains + REPLIT_DOMAINS + any localhost port
  ↓
body parsing    JSON (with rawBody) + urlencoded
  ↓
API logging     /api only, 80-char truncated paths
  ↓
Expo manifest   GET / or /manifest with `expo-platform: ios|android`
                → static-build/<platform>/manifest.json
  ↓
landing page    GET / → server/templates/landing-page.html with placeholders substituted
  ↓
static          assets/ and static-build/
  ↓
routes          registerRoutes(app) → /api
  ↓
error handler
```

Listens on `PORT` (default `5000`) bound to `0.0.0.0`.

---

## 11. State, Caching & Offline

### 11.1 React Query configuration

```ts
defaultOptions: {
  queries: {
    staleTime: 5 * 60_000,             // 5 min — content is admin-editable
    gcTime:   QUERY_CACHE_MAX_AGE,    // 24 h
    retry:    2,
    networkMode: "always",             // fail fast offline; serve the persisted entry
    refetchOnReconnect: true,          // replaces refetchOnWindowFocus
  },
  mutations: { retry: false, networkMode: "always" },
}
```

`staleTime` was deliberately moved off `Infinity` when the data layer landed: campus content is
editable, and an infinite stale time meant a published building never appeared.

`getApiUrl()` **does not throw at import time** when `EXPO_PUBLIC_DOMAIN` is unset — that broke
offline boot. It returns a relative URL and only throws inside `apiRequest` when a real native
network call is attempted.

### 11.2 Query keys

| Key | Consumer | Notes |
| --- | --- | --- |
| `["campuses"]` | `useCampuses` | |
| `["campus", slug]` | `useCampus` | resolves the uuid |
| `["buildings", uuid]` | `useBuildings` | `deleted_at IS NULL` |
| `["favorites"]` | `useFavorites` | **returns `undefined` while disabled** so the screen can distinguish "signed out" (CTA) from "no favorites" (empty state) |
| `["corrections", status]` | `useCorrections` | |
| `["admin", "buildings", campusId]` | `useAdminBuildings` | **includes** soft-deleted |
| `["admin", "stats"]` | `useAdminStats` | |
| `["admin", "audit"]` | `useAdminAudit` | |
| `["admin", "moderation", status]` | `useModerateCorrection` target | |

### 11.3 Optimistic mutations

`useToggleFavorite` is the reference implementation:

```ts
onMutate:  cancelQueries(["favorites"]) → snapshot previous → setQueryData(toggled)
onError:   restore snapshot
onSettled: invalidateQueries(["favorites"])
```

It takes the **full `Building`**, not just the id, so the optimistic row is complete rather than a
placeholder that flickers.

`useModerateCorrection` is deliberately **not** optimistic: it performs two ordered writes, and
showing the new state before the building update lands would claim a value that has not been applied.

### 11.4 Local persistence inventory

| Key | Purpose | Writer | Failure policy |
| --- | --- | --- | --- |
| `campusnav-query-cache` | React Query cache | persister | corrupt → `onError` still fires → splash hides |
| `theme:mode` | light/dark/system override | `ThemeProvider` | awaited before splash hide |
| `pref:stepFree` | step-free preference | `lib/prefs.ts` | AsyncStorage is the source of truth; `profiles.pref_step_free` is a mirror |
| `home:location` | home coordinates | `lib/home-location.ts` | same mirror pattern with `profiles.home_lat/home_lng` |
| `route:<from>|<to>|<opts>` | computed routes (6 h) | `lib/route-cache.ts` | `getStaleRoute` covers expiry; `try/catch` covers IO |
| `last:location` | last GPS fix (10 min) | `lib/location.ts` | used as the offline route origin |
| recents | recent searches (cap 10) | `lib/recent-searches.ts` | dedupe by id, most-recent-first |

### 11.5 Offline verification recipe

1. Run online, open a campus, tap a marker, get directions (populates the route cache).
2. Enable airplane mode (or DevTools → Offline on web).
3. Kill and relaunch.
4. Buildings render from the persisted query cache, the offline pill shows, and "Get Directions"
   still draws the cached route from the last known position.

---

## 12. Design System

The full rules live in `style.md`. This section is the condensed reference.

### 12.1 Color

Single source of truth: `constants/colors.ts`, exposing `palettes.light` and `palettes.dark` with
**identical key sets** (a key present in one but not the other is a bug).

| Token | Light | Dark | Usage |
| --- | --- | --- | --- |
| `tint` | `#0B6623` | `#4CAF50` | Primary brand: icons, pins, CTAs, active borders |
| `tintDark` | `#054A14` | `#0B6623` | Gradient start, selected marker |
| `tintLight` | `#E8F5E9` | `#123018` | Selected/active surfaces, pills, pressed rows |
| `accent` | `#2E7D32` | `#66BB6A` | Secondary accent |
| `text` | `#1B2E1B` | `#E6EFE6` | Headings, primary text (never pure black) |
| `textSecondary` | `#5A6B5A` | `#9FB09F` | Descriptions, sublabels |
| `background` | `#FFFFFF` | `#0E160E` | Screen base |
| `backgroundSecondary` | `#F5F7F5` | `#151F15` | Screen bg behind cards, subtle fills |
| `surface` | `#FFFFFF` | `#1C281C` | Cards, sheets, modals, inputs |
| `surfacePressed` | `#F5F7F5` | `#22301F` | Pressed state |
| `separator` | `#F0F2F0` | `#212D21` | 1 px list separators |
| `border` | `#D5E0D5` | `#243224` | 1.5 px input/card borders, sheet handle |
| `gray` | `#9E9E9E` | `#7A877A` | Placeholders, disabled text, meta |
| `danger` | `#C62828` | `#E57373` | Errors |
| `warning` | amber | amber | Offline / no-path warnings |
| `onTint` | `#FFFFFF` | `#FFFFFF` | **Foreground on brand green** — see ADR-10 |
| `shadow` | `rgba(11,102,35,0.08)` | `rgba(0,0,0,0.4)` | Low-opacity green, never pure black |

**Rules**
- Green = interactive or active. Static content stays neutral.
- Never pure black for text.
- On a brand gradient, secondary text is white at 60–70% opacity, not gray.
- Colours come from `useTheme()`, never from a direct `constants/colors.ts` import. There is no
  default export, and reaching for one means writing a screen that breaks in dark mode.

### 12.2 Map tiles and dark mode

`CampusMap.native.tsx` uses `PROVIDER_DEFAULT` — Apple Maps on iOS, Google Maps on Android — and that
**stays**. Switching to `PROVIDER_GOOGLE` everywhere to enable a `customMapStyle` array would cost a
Google Maps API key in the bundle and force every iOS user off Apple Maps for a styling feature they
probably do not notice.

Both providers follow the OS appearance for the tile layer, so system mode is fully themed on both
platforms. The one known mismatch: **if an explicit override disagrees with the OS, the tiles stay on
the system appearance while markers, route polyline and floating cards follow the override.** This is
accepted, not fixed.

### 12.3 Typography

Inter only. Weights: `Inter_400Regular`, `Inter_500Medium`, `Inter_600SemiBold`, `Inter_700Bold`.
Always set `fontFamily` explicitly — React Native ignores `fontWeight` when a named font is used.

| Role | Size | Weight |
| --- | --- | --- |
| Hero / screen title | 28 | 700 |
| Card / sheet title | 22 / 18 | 700 |
| Modal / sub-heading | 18 | 600 |
| Button / CTA label | 16 / 15 | 600 |
| Body / input | 15 | 400 / 500 |
| Supporting body | 14 | 400 (`lineHeight` 20–22) |
| Caption / meta | 13 | 400 / 500 (`lineHeight` 18) |
| Badge / micro | 12–13 | 600 / 400 |

### 12.4 Spacing, shape, elevation

- **Base unit 4 px.** Screen gutters: landing 24, map overlays 16, cards/sheets 20–24.
- **Radii:** chips/pills 10–12 · inputs, buttons, icon tiles 14 · cards, modals 20 · bottom sheet 24
  (top corners only) · full pill 30 · markers 12 (selected 14).
- **Shadows — always pair `shadowColor/Offset/Opacity/Radius` *and* `elevation`:**
  floating small control `offset {0,2} / 0.1 / 8 / elevation 4` · popover, hint bar, search results
  `{0,4} / 0.1–0.12 / 12 / elevation 6` · landing card `{0,8} / 0.15 / 24 / elevation 8` ·
  bottom sheet `{0,-4} / 0.1 / 16 / elevation 10`.
- **Icon tiles:** small 34×34/r10 (search results) · medium 44×44/r14 (sheet header) ·
  marker 36×36/r12 + 2.5 px white border + triangle arrow; selected 42×42/r14, `#054A14`, border 3 ·
  landing hero 64×64/r20, `rgba(255,255,255,0.15)`.
- **Web compensation:** `webTopInset = 67`, `webBottomInset = 34`, added to safe-area insets on
  absolutely positioned chrome.

### 12.5 Component recipes

| Component | Recipe |
| --- | --- |
| **Primary CTA** | `Pressable` r14 `overflow:hidden` → `LinearGradient ["#0B6623","#0D7A2B"]` horizontal, `paddingVertical 16 / paddingHorizontal 24`, row centered gap 10, icon 18–20 white + label `Inter_600SemiBold 16 #FFF`. Disabled `["#C8D6C8","#C8D6C8"]` + gray icon/text + `opacity .7`. Pressed `scale 0.97–0.98` |
| **Secondary button** | `borderWidth 1.5 #0B6623`, bg `#E8F5E9`, r14, `paddingVertical 14`, row centered gap 8, label `Inter_600SemiBold 15 #0B6623` |
| **Floating icon button** | 44×44, r14, white bg, icon 22 `strokeWidth 2.5`, shadow elevation 4. Pressed `opacity .7, scale .95` |
| **Input / search** | Row, white bg, r14, `paddingH 14 / paddingV 10`, gap 10, `borderWidth 1.5 transparent → #0B6623` focused, leading icon 18 `#9E9E9E`, placeholder `#9E9E9E`, clear button `hitSlop={8}` |
| **Card / sheet** | `theme.surface`, r20 (sheet: 24 top only), `padding 20–24`, internal `gap`. Sheet opens with a centered 36×4 handle, r2, `#D5E0D5` |
| **Badge chip** | bg `#E8F5E9`, text `#0B6623`, `Inter_600SemiBold 12`, `paddingH 12 / paddingV 4`, r12, `overflow:hidden` |
| **Info pill** | bg `#E8F5E9`, `paddingH 14 / paddingV 8`, r10, row gap 6, `Inter_500Medium 13 #0B6623`, 3 px dot separator |
| **List row** | Row `center` gap 12, `paddingH 20/paddingV 14` (modal) or `14/12` (results), `space-between` with a trailing icon. Pressed `#F5F7F5` · selected `#E8F5E9` + `#0B6623` + 600 weight · separator `borderBottomWidth 1 #F0F2F0` |
| **Modal** | `transparent`, `animationType="fade"`, overlay `rgba(0,0,0,0.5)` centered with `paddingHorizontal 24`, content white r20 `paddingVertical 20` `maxHeight 400`; dismiss on overlay press **and** Android back (`onRequestClose`) |
| **Empty state** | Centered, `padding 14–16`, single line `Inter_400Regular 14 #9E9E9E` |

### 12.6 Motion

| Context | Recipe |
| --- | --- |
| Landing entrance | `FadeInDown.delay(n).duration(600)`, staggered 200 / 400 / 600 |
| Inline reveal | `FadeInUp.duration(300)` |
| Sheet in / out | `SlideInDown.duration(400).springify()` / `SlideOutDown.duration(300)` |
| Camera moves | `animateToRegion(region, 600)` focus, `800` route fit |
| Offline banner | `FadeInDown.duration(300)` |

No looping animation. Never animate layout-critical properties without `Layout` animations. Always
Reanimated, never RN's `Animated`.

### 12.7 Haptics

`expo-haptics` on **every** interaction, called at the top of the press handler before any async work.

| Interaction | Feedback |
| --- | --- |
| Primary/committing (Get Directions, Submit, Import) | `Heavy` or `Medium` |
| Normal taps (marker, locate, back, dropdown) | `Light` |
| List selection | `Light` |
| Route re-render | `notificationAsync(Warning)` |
| Arrival | `notificationAsync(Success)` |
| Turn cue | `notificationAsync(Success)` |

### 12.8 Icons

`lucide-react-native` is the primary set. Sizes: 14–16 inline/meta · 18–20 in buttons · 22 on
floating controls · 32 hero · 48 empty state. `strokeWidth` 2 in dense rows, 2.5 on
controls/markers/headers. Marker glyphs render white at `size 16, strokeWidth 2.5` inside a green
tile. `MapPin` is the fallback. `@expo/vector-icons` survives only in `ErrorFallback`.

### 12.9 Code conventions

- One file per screen in `app/`; shared UI in `components/`; tokens in `constants/`; utilities in `lib/`.
- Styles: `StyleSheet.create` **at the bottom of the file**, semantic camelCase names.
- A stylesheet is a **`makeStyles(theme)` factory** called via `useMemo(() => makeStyles(theme), [theme])`.
  Layout-only rules live in a static `StyleSheet` inside the factory; colours come from the `theme`
  parameter, never a module-level import.
- Prefer `gap` over margin pairs.
- `Pressable` render-prop form: `style={({ pressed }) => [styles.x, pressed && styles.y]}`.
- No inline hex in new code. The only exception is the eight documented decorative
  `rgba(255,255,255,0.0x)` hero washes in `app/index.tsx` and `app/(auth)/sign-in.tsx` — they sit on
  a brand gradient that is dark green in *both* schemes, so a token would imply a distinction that
  does not exist. Both files carry a comment saying so.
- `overflow: "hidden"` on any rounded container holding a gradient.
- Avoid `any` in new props. TypeScript `strict` is on.
- A full-bleed screen that overrides the Android nav bar colour calls `useSystemBars(color)`.

### 12.10 Accessibility

- All touch targets ≥ 44×44; `hitSlop={8}` for small trailing icons.
- Never rely on colour alone: selected rows also change weight and add a `Check` icon.
- Permission prompts explain the value in the `Alert` title/body; failure paths always show a
  recovery message.
- Platform branches are explicit for geolocation, insets and map rendering — native and web
  behaviour is mirrored in every new feature.
- Portrait only.
- **Open:** no full VoiceOver/TalkBack audit has been done. The web map gap means the web
  placeholder list currently *is* the accessible path, which is the right fallback.

---

## 13. Setup & Operations

### 13.1 Prerequisites

| Tool | Version | Needed for |
| --- | --- | --- |
| Node.js | 22 (per `.replit` modules) | everything |
| npm | 9+ | everything |
| A Supabase project | — | database, auth, RLS |
| A Replit / Cloud Run account | — | hosting target (alternative hosts work) |
| Android Studio / Xcode | — | native device testing (Expo Go / dev client for a simulator) |

### 13.2 First run

```bash
# 1. Install
npm install                    # postinstall runs patch-package

# 2. Configure
cp .env.example .env           # then fill in the values below

# 3. Create the schema
npm run db:push                # Drizzle -> Postgres. Uses DIRECT_URL, falls back to DATABASE_URL

# 4. Apply the SQL migrations Drizzle cannot express
npx supabase db push           # 0001..0005 — RLS, FK, triggers, column grants
# ...or paste each file into the Supabase SQL editor

# 5. Seed
npm run db:seed                # idempotent: campuses, buildings, entrances, nodes, edges

# 6. Create an admin (optional, for the CMS)
npm run admin:grant you@example.com
# then sign out and back in — app_metadata is baked into the JWT at sign-in
```

### 13.3 Development

```bash
# Terminal 1 — API (port 5000)
npm run server:dev

# Terminal 2 — Metro (port 8081)
npm run expo:dev               # or: npm start
```

On Replit, `npm run expo:dev` sets `EXPO_PACKAGER_PROXY_URL`, `REACT_NATIVE_PACKAGER_HOSTNAME` and
`EXPO_PUBLIC_DOMAIN` from `REPLIT_DEV_DOMAIN` automatically.

> **The app boots and works with no backend at all.** Without Supabase configured, screens read
> `lib/data/campus-fallback.ts` and sign-in shows a "Sign-in unavailable" card. This is a deliberate
> property, not a happy accident — you can develop the whole map experience before provisioning
> anything.

### 13.4 Environment variables

| Variable | Scope | Required | Purpose |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | client (bundled) | for DB features | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | client (bundled) | for DB features | Anon key. `isSupabaseConfigured` is false without **both** |
| `EXPO_PUBLIC_DOMAIN` | client (bundled) | for `/api/route` | API base host |
| `DATABASE_URL` | server only | for `/api/route` + scripts | Postgres connection string (transaction pooler, port 6543) |
| `DIRECT_URL` | tooling only | for `db:push` | Direct connection, preferred by drizzle-kit |
| `SUPABASE_URL` | scripts only | for `admin:grant` | Falls back to `EXPO_PUBLIC_SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | scripts only | for `admin:grant` | **The only credential that can write `app_metadata`** |
| `PORT` | server | no (5000) | Listen port |
| `NODE_ENV` | server | no | Production warnings / server mode |
| `REPLIT_DEV_DOMAIN` | dev | no | CORS origin + packager host |
| `REPLIT_DOMAINS` | dev | no | Comma-separated extra CORS origins |
| `REPLIT_INTERNAL_APP_DOMAIN` | build | no | Build-time deployment domain |
| `TEMP` | dev | no | Windows temp path for `tmp-make-fixtures.ts` |

**Never rename an `EXPO_PUBLIC_*` variable to a non-prefixed one.** The `EXPO_PUBLIC_` prefix is what
inlines the value into the bundle. A service-role key without that prefix is a leaked key.

### 13.5 npm scripts

| Script | Command | What it does |
| --- | --- | --- |
| `start` | `npx expo start` | Metro |
| `expo:dev` | env + `expo start --localhost` | Metro, Replit-aware |
| `server:dev` | `NODE_ENV=development tsx server/index.ts` | API in dev |
| `expo:start:static:build` | `expo start --no-dev --minify --localhost` | Production Metro, no dev tools |
| `expo:static:build` | `node scripts/build.js` | Full static export → `static-build/` |
| `server:build` | `esbuild … --format=esm --outdir=server_dist` | Bundle the server |
| `server:prod` | `NODE_ENV=production node server_dist/index.js` | Run the bundle |
| `db:push` | `drizzle-kit push` | Schema → Postgres |
| `db:seed` | `tsx scripts/seed.ts` | Idempotent data seed |
| `admin:grant` | `tsx scripts/make-admin.ts` | Grant/revoke admin |
| `paths:collect` | `tsx scripts/collect-paths.ts` | GPS trace → survey CSV + SQL |
| `lint` / `lint:fix` | `expo lint [--fix]` | ESLint flat config |
| `postinstall` | `patch-package` | Apply `patches/` |

### 13.6 Surveying a campus (data collection workflow)

The step-free feature is only as good as the graph. The intended workflow:

```bash
# 1. Walk the campus recording a GPS track
#    Expo's background-location sample app, or any phone GPS logger
#    Accepted: raw JSON points, GeoJSON LineString, GPX

# 2. Convert the track into candidate nodes + edges
npm run paths:collect -- --track my-walk.json
#   → de-noises, RDP-simplifies, enforces node spacing so every turn is a node,
#     emits a review CSV and SQL

# 3. Human review
#   Open the CSV, discard false shortcuts (cuts through a wall, takes a wrong fork),
#   and add the attributes the engine needs: has_steps, has_ramp, covered, surface, lit

# 4. Commit
npm run db:seed        # edges are written by the seed today
#   (`--apply` is an intentional stub — reviewed SQL is committed by hand)
```

`MAX_SNAP_METERS = 150` and the "nodes at every turn" rule both depend on the spacing step, so do
not skip it.

---

## 14. Build, Deploy, Environments

### 14.1 Production build

```bash
npm run expo:static:build   # Metro export → static-build/{ios,android} + manifests + assets
npm run server:build        # esbuild → server_dist/index.js
npm run server:prod         # NODE_ENV=production node server_dist/index.js
```

`scripts/build.js` starts Metro, downloads the iOS and Android bundles plus manifests and assets,
rewrites bundle URLs to absolute, and writes `static-build/<platform>/manifest.json`. The Express
server serves those manifests to Expo Go based on the `expo-platform` header.

### 14.2 Replit → Cloud Run

`.replit` defines the deployment:

```
deploymentTarget = "cloudrun"
build = ["sh", "-c", "npm run expo:static:build && npm run server:build"]
run   = ["npm", "run", "server:prod"]

ports: 5000 (app) and 8081 → 80 (packager)
env:   PORT = 5000
```

Required at build time: `EXPO_PUBLIC_DOMAIN` (or `REPLIT_INTERNAL_APP_DOMAIN` for the
build-time domain). Required at run time: `DATABASE_URL`, `PORT`, and the `EXPO_PUBLIC_SUPABASE_*`
pair (already inlined during the build).

The two-tier hosting — static Expo bundles served by Express, plus the same Express process
answering `/api/route` — means one deployable unit, one port, one CORS origin.

### 14.3 Expo config notes

| Setting | Value | Note |
| --- | --- | --- |
| `newArchEnabled` | `true` | required by reanimated 4 |
| `experiments.typedRoutes` | `true` | compile-time route existence |
| `experiments.reactCompiler` | `true` | automatic memoization |
| `userInterfaceStyle` | `automatic` | required for `ThemeProvider` system mode |
| `orientation` | `portrait` | |
| plugins | `expo-router` (origin `https://replit.com/`), `expo-font`, `expo-web-browser`, `expo-image`, `expo-splash-screen`, `expo-status-bar` | |

### 14.4 Before a public launch

| Item | Status |
| --- | --- |
| Change `com.myapp` bundle/package ids | ❌ placeholder |
| `bundleIdentifier` / `package` set per store | ❌ |
| Real campus data (survey replaces `path-graph-fallback.ts`) | ❌ |
| Privacy policy / store listing / age rating | ❌ |
| Crash reporting (e.g. Sentry wired into `ErrorBoundary`) | ❌ not implemented |
| Analytics (events listed in the roadmap) | ❌ not implemented |
| Rate limiting on `/api` | ❌ not implemented |
| Security headers (`helmet`) | ❌ not implemented |
| Delete `scripts/tmp-*.ts` and `server/storage.ts` | ❌ scratch/orphaned code still present |
| Contrast audit (≥ 4.5:1 body text) in both schemes | ❌ unverified |
| `supabase/migrations/0005_admin_cms.sql` executed against a real Postgres | ❌ never run |
| Live round trip against Supabase for `/api/route` | ❌ needs provisioning |

---

## 15. Verification Gates

### 15.1 Standing gates

Run before any change lands:

```bash
npx tsc --noEmit        # typecheck
npm run lint            # ESLint — must be 0 errors, 0 warnings
npx expo export --platform web    # web bundle
npx expo export --platform ios    # native bundle (map + location paths)
```

The iOS export is not optional. The platform split in `CampusMap` and the `watchPositionAsync` path
mean web-only verification misses native regressions entirely.

### 15.2 Platform matrix

Every feature must be exercised on **iOS, Android and web**. Specifically: geolocation branches,
safe-area + web insets, haptics (no-op on web), the map placeholder, and auth persistence.

### 15.3 Manual verification recipes

| Area | Recipe |
| --- | --- |
| **Navigation** | Get directions → cue appears → walk the route → cue flips one maneuver ahead, one haptic each → expand the list, confirm auto-scroll → diverge >30 m for ~6 s → "Recalculating…" + one haptic + one re-route → arrive ≤15 m → success haptic, watcher stops → cancel mid-walk, confirm no leftover state |
| **Offline** | See §11.5 |
| **Step-free** | Toggle on → stairs edge excluded (`skippedStepEdges ≥ 1`) → final step reads "Arrive at *Main ramp entrance*" → toggle off → "Stair door" → origin >150 m off-graph → clean `reason` warning |
| **Favorites** | Toggle heart → optimistic update → kill and relaunch → still favorited → sign out → "Sign in to save favorites" appears instead of a dead heart |
| **Corrections** | Report wrong info as a guest → row lands with `user_id: null` → admin sees it in the queue → approve → building value changes **and** the status flips, in that order → `audit_log` has both the building diff and the status transition |
| **Import** | Paste 100 valid rows → 100 imported, audit rows written. Paste a CSV with a bad latitude → the issue names the 1-based file line, nothing is imported |
| **Theme** | Screenshot every screen in both schemes → override persists across a cold restart → an override that disagrees with the OS → confirm the map-tile mismatch is the *only* discrepancy |
| **Audit** | Make a building edit, an import, and a correction approval → the dashboard's recent audit list shows all three with correct actor and diff |

### 15.4 The testing gap

**There is no test runner in this repository.** This is the most significant quality gap and it is
tracked as Feature 16 in the roadmap.

Verification has so far been done with throwaway `tsx` scripts (`scripts/tmp-*.ts`), which were
deleted or left as scratch afterwards. Real coverage that exists only as a historical note:

| Suite | Assertions | Location (was) |
| --- | --- | --- |
| `snapToRoute` / `computeNavProgress` on a synthetic L-route | 34 | throwaway |
| Instruction table (depart, 6 turn modifiers, continue, new name, fork, roundabout+exit, arrive) | full table | throwaway |
| A* vs. reference Dijkstra, 100 node pairs × 4 option sets | 100 × 4 | `scripts/tmp-graph-check.ts` |
| Gates + wire contract + §4 progress integration | 85 | `scripts/tmp-graph-check.ts` |
| CSV / GeoJSON / correction coercion parsers | 32 | throwaway |

These modules are already **shaped for Jest** — `lib/navigation/graph.ts`, `geo-nav.ts`,
`instructions.ts`, `lib/import/*` and `lib/geo.ts` are pure functions with no I/O. That is a
deliberate architectural property, not luck.

---

## 16. Architecture Decision Log

Each entry: context → decision → consequence.

---

**ADR-01 — Supabase over Firebase/MongoDB**
*Context:* no working backend; in-memory `Map` storage; plaintext passwords; `drizzle.config.ts`
pointing at nothing.
*Decision:* Supabase hosted Postgres + Auth + RLS, keeping the existing Drizzle schema.
*Consequence:* zero schema rewrite, per-user scoping without server code, and a free tier that
covers launch. The cost is that RLS correctness becomes a first-class concern, which is why five SQL
migrations exist that Drizzle cannot generate.

---

**ADR-02 — Client reads Supabase directly; Express exists only for graph routing**
*Context:* the plan offered "drop Express entirely" vs. "thin proxy".
*Decision:* option **B-lite**. CRUD reads/writes go straight to PostgREST; Express serves
`POST /api/route` plus the landing page and static bundle.
*Consequence:* no server hop on any list, RLS is the single enforcement point, and the server's only
job is the computation a client genuinely cannot do. The rule this creates: **never mix read paths
for the same data.**

---

**ADR-03 — `getSupabase()` built on first use, not a module-level `createClient`**
*Context:* a top-level `createClient` with missing env vars throws during import.
*Decision:* export `isSupabaseConfigured` and a lazy `getSupabase()`.
*Consequence:* a white screen before the user ever reaches the login screen is impossible. The app
degrades to guest mode instead.

---

**ADR-04 — `app_metadata.role` is the RLS authority, `profiles.role` is a hint**
*Context:* users can update their own `profiles` row.
*Decision:* every policy tests `auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'`.
*Consequence:* a self-promotion `update` changes nothing. Only the service role can write
`app_metadata`, and `scripts/make-admin.ts` is the only code that does. The cost is a required
sign-out/sign-in after every grant, because the claim is baked into the JWT at sign-in.

---

**ADR-05 — Slugs in routes, uuids in foreign keys**
*Context:* mixing them produced the single worst bug in the project (below).
*Decision:* `app/index.tsx` pushes `selected.slug`; `useCampus` resolves on slug; the client passes
the slug onward; `server/graph.ts` resolves slug-or-uuid → uuid **before** the cache lookup.
*Consequence:* URLs stay stable and shareable, and both spellings share one cache entry.
*Bug this fixed:* `app/index.tsx` pushed `selected.id`, a uuid once Supabase was configured.
`useCampus` then queried `.eq("slug", <uuid>)`, matched nothing, and the "campus missing" overlay
took over the screen. In guest mode the id *was* the readable slug, so the screen worked — while the
server's `eq(path_nodes.campus_id, 'nsuk')` matched zero rows, and **step-free silently fell through
to OSRM every single time.**

---

**ADR-06 — The A\* engine lives in `lib/`, not `server/`**
*Context:* the plan put the algorithm and the DB loader in `server/graph.ts`.
*Decision:* split them. `lib/navigation/graph.ts` is pure (no DB, no fetch, no React);
`server/graph.ts` is only the loader and cache.
*Consequence:* the engine runs unchanged on the server, in the offline bundle, and in a unit test.
It is the single most test-shaped module in the repo.

---

**ADR-07 — The A\* heuristic is bounded by `cost / chord`, not by the minimum surface multiplier**
*Context:* `covered` edges get a 0.95 discount, which makes plain great-circle distance inadmissible
and lets A* return a subtly non-optimal path.
*Decision:* compute `minCostPerMeter = min(cost / chord)` over the included edges.
*Consequence:* A* stays provably optimal even when a path is shorter than the straight line between
its endpoints (covered passage, indoor link, mistyped distance). Verified against reference Dijkstra
on all 100 node pairs × 4 option sets.

---

**ADR-08 — `entrances` is the authority, `buildings.isAccessibleEntry` is not read**
*Context:* a single boolean on the building cannot express "there is a ramp next to the stairs".
*Decision:* routing consults `entrances` exclusively.
*Consequence:* a building can have both a stair door and a ramp door and be routed to correctly.
`isAccessibleEntry` is kept as a descriptive column, not a routing input.

---

**ADR-09 — Step-free filtering is structural, not a relaxation check**
*Context:* a per-edge check inside the search loop can be missed by a later relaxation.
*Decision:* drop `hasSteps` edges **before** adjacency lists are built.
*Consequence:* a stair edge cannot be reached at all. `skippedStepEdges` is also a useful metric.

---

**ADR-10 — `onTint` was added instead of flipping `white` in dark mode**
*Context:* the plan proposed making `white` resolve to the background colour in dark mode so existing
call sites would need no change.
*Decision:* `white` stays literally white; `onTint` carries the "foreground on brand green" meaning.
The compat shim (a default export of `palettes.light`) was removed so nothing can regress into it.
*Consequence:* every use of `white` in this app is a glyph or a label *sitting on* a green button, so
flipping it would put near-black text on a near-black button. One extra token, zero invisible bugs.

---

**ADR-11 — `ErrorBoundary` sits outside `ThemeProvider`; `ErrorFallback` reads the OS scheme**
*Context:* the boundary must catch a `ThemeProvider` crash — but then the context is unavailable
exactly when the fallback renders.
*Decision:* put the boundary outermost; make `useTheme()` return the light palette rather than throw;
have `ErrorFallback` read `useColorScheme()` directly.
*Consequence:* a provider crash produces a themed, recoverable screen instead of a second crash or a
blank frame.

---

**ADR-12 — System bars are one context value, not a per-screen effect**
*Context:* the map, the admin list and the two green-gradient screens disagree about the nav bar
colour, and a parent effect racing a child effect picks the wrong winner on navigate-back.
*Decision:* `useSystemBars` sets a single `systemBarColor` that the last-mounted screen owns and
releases on unmount.
*Consequence:* deterministic bar colour without an effect race.

---

**ADR-13 — The audit trigger is the only writer to `audit_log`**
*Context:* the plan offered "explicit client writes *or* a trigger".
*Decision:* trigger only, enforced in both directions — `trg_audit_buildings` /
`trg_audit_corrections` in SQL, and **no** RLS policy allowing a client to insert, and no policy at
all for update/delete.
*Consequence:* doing both would double every entry. The trigger also sees edits made from the SQL
editor or a script, and it computes the `changed` diff server-side where the old and new row are both
to hand. `lib/api/admin.ts` documents this at the top so nobody re-adds the writes.

---

**ADR-14 — Correction approval is two ordered writes, not a transaction**
*Context:* a PostgREST client has no transaction, and the plan's "apply inside a transaction" was
written for an Express-admin option that was dropped.
*Decision:* update the building **first**, then set `status = 'approved'`. Rejecting is one write.
*Consequence:* if the building update fails, the report stays `pending` and is retryable — rather
than being marked `approved` against a value that never landed. An `apply_correction` RPC would be
cleaner but needs `SECURITY DEFINER` plus a second copy of the admin check to keep in sync with RLS.
Two ordered writes with the failure ordering documented is the better trade.

---

**ADR-15 — Guest corrections send `user_id: null`**
*Context:* RLS must allow a guest to submit a correction for the feature to be useful pre-login.
*Decision:* the insert policy accepts `user_id is null` deliberately, and guests send `null` rather
than a fake id.
*Consequence:* a signed-in reporter and a guest produce the same row shape, so nothing downstream
depends on a session being present.

---

**ADR-16 — `importBuildingSchema` rejects blank coordinates instead of coercing to 0**
*Context:* `z.coerce.number()` runs `Number("")` → `0`. A spreadsheet row with an empty latitude
would import a building at Null Island and validate cleanly.
*Decision:* refuse a blank value first.
*Consequence:* found by the parser checks. A whole class of silent data corruption is closed at the
schema rather than per-import.

---

**ADR-17 — Route resolution is four-tier, and stale beats straight**
*Context:* campus Wi-Fi is patchy; a public router can be rate-limited or down.
*Decision:* fresh cache → campus graph (step-free only) → OSRM → **stale** cache → straight line.
*Consequence:* a 12-hour-old campus path is a real walkable path; a line between two points may go
through a building. Expiry downgrades quality instead of discarding the entry. `getStaleRoute` exists
solely for that middle step.

---

**ADR-18 — `networkMode: "always"`**
*Context:* the default (`"online"`) *pauses* queries while offline, which leaves the UI in a
permanent loading skeleton.
*Decision:* `networkMode: "always"` on queries and mutations.
*Consequence:* a query fails fast and React Query serves the persisted entry. This single flag is
the point of the offline feature.

---

**ADR-19 — `@tanstack/query-async-storage-persister`, not the sync one**
*Context:* the plan named `createAsyncStoragePersister` from `query-sync-storage-persister`; that
export does not exist there.
*Decision:* install the async persister (React Native's `AsyncStorage` has a Promise API) and
remove the sync package rather than leave it unused.

---

**ADR-20 — Route responses are validated on the way out *and* on the way in**
*Context:* `/api/route` is the one place the app's route geometry is produced in-house. A malformed
polyline would surface as an inexplicable off-route loop on the user's screen rather than as an
error.
*Decision:* `routeResponseSchema.safeParse` in `server/routes.ts` before the response leaves the
process, and again on the client.
*Consequence:* a graph regression becomes a 500 in a log, not a user staring at a map that keeps
saying "recalculating".

---

**ADR-21 — `useFavorites` returns `undefined` while disabled, not `[]`**
*Decision:* a disabled query returns `undefined`.
*Consequence:* `app/favorites.tsx` can distinguish "signed out" (show the CTA) from "signed in with
no favorites" (show the empty state). Returning `[]` collapses two different screens into one.

---

**ADR-22 — `router.replace`, not `router.navigate`, for favorites → map**
*Context:* Expo Router's `navigate` pops to the existing `/map` instance without re-reading params.
*Decision:* `router.replace({ pathname: "/map", params: { buildingId } })`.
*Consequence:* a replaced instance mounts fresh, reads the param and auto-selects. A bare deep link
behaves identically.

---

**ADR-23 — Soft delete keeps rows in the admin list, greyed, not in an archive tab**
*Decision:* `deleted_at` + greyed rows that stay visible.
*Consequence:* the operation people need most is *undo*, and a row that has left the screen cannot be
undone from it.

---

**ADR-24 — Import is paste-only, no file picker**
*Context:* `expo-document-picker` is not installed and `expo-image-picker` cannot read a `.csv`.
*Decision:* a paste area that works on web (drag-and-drop and paste) and on device.
*Consequence:* one dependency and one second path to a file the parser cannot explain — avoided.

---

**ADR-25 — The admin campus is a session context, not a route param**
*Context:* every CMS screen works on one campus at a time, and the import format has no campus column.
*Decision:* `AdminCampusProvider` in `app/admin/_layout.tsx`.
*Consequence:* the target is chosen once and remembered. A query parameter would have to be threaded
through every admin link, and it would put the staff tool on the public URL bar.

---

**ADR-26 — The admin area is a normal router subtree, not a separate web surface**
*Context:* the plan said "web-first admin".
*Decision:* `app/admin/*` as plain React Native screens with no map dependency.
*Consequence:* the requirement is met by the screens rendering identically everywhere — which is
what an admin carrying a phone around a campus actually needs.

---

**ADR-27 — Camera control stays in `app/map.tsx`; the nav hook takes callbacks**
*Context:* the hook needs to move the camera.
*Decision:* `onCameraFit` / `onFollowUser` callbacks, not a `MapView` ref.
*Consequence:* `lib/` stays free of map imports and the hook stays testable. It did cost the map
components a real `onRegionChangeComplete` prop, and that prop forwards the centre as a plain
`LatLon` rather than leaking react-native-maps's `(region, details)` event type across platforms.

---

**ADR-28 — A failed location watch is not a failed navigation**
*Decision:* if `watchUserLocation` rejects, keep the route and the step list on screen with an inline
note.
*Consequence:* losing live progress should not discard a usable route.

---

**ADR-29 — The re-route path never re-requests location permission**
*Decision:* re-route from the fix that triggered it.
*Consequence:* a mid-walk detour costs one router call, not a second permission round trip.

---

**ADR-30 — `onRegionChangeComplete` gates camera follow**
*Decision:* pan to the user on each fix **only if** they have not manually dragged in the last 5 s.
*Consequence:* auto-follow is useful and never fights the user.

---

**ADR-31 — `PROVIDER_DEFAULT` stays**
*Context:* a `customMapStyle` array would require `PROVIDER_GOOGLE` everywhere.
*Decision:* keep `PROVIDER_DEFAULT`; both providers follow the OS for tiles.
*Consequence:* no Google Maps API key in the bundle, and iOS users keep Apple Maps. The one accepted
mismatch: an explicit theme override that disagrees with the OS leaves tiles on the system
appearance while our chrome follows the override.

---

**ADR-32 — Seed data and guest fallback share one dataset**
*Decision:* `scripts/seed.ts` and `lib/data/campus-fallback.ts` import the same constants.
*Consequence:* the seeded database and the offline experience cannot drift. Ids are readable slugs;
the database assigns uuids.

---

**ADR-33 — `path_nodes` / `path_edges` carry a nullable `campus_id`**
*Context:* the plan had a single global graph.
*Decision:* nullable `campus_id` on both, with `campusId: "*"` spanning all campuses including null.
*Consequence:* the survey is per-campus, and a legacy/global graph is still addressable.

---

**ADR-34 — `path_edges.surface` is a NOT NULL enum, not free text**
*Decision:* `paved | gravel | dirt`, not null.
*Consequence:* the `SURFACE_FACTOR` cost model cannot silently read a typo as `undefined` and fall
back to a paved cost.

---

**ADR-35 — Instruction generation is name-agnostic; the destination is patched in at display**
*Decision:* the router stores "You have arrived"; `withDestinationName()` rewrites the arrive step.
*Consequence:* one cached route is reusable for any destination it was requested for, and the patch
is idempotent.

---

**ADR-36 — Step boundaries are derived from the polyline, forward-only, and memoised**
*Context:* the public OSRM demo returns **no** per-step geometry; each step is a single maneuver
point.
*Decision:* `stepOffsets()` walks the polyline once, matching each step's first/last vertex
forward-only, caching the result per step array.
*Consequence:* step advancement works with or without per-step geometry, and survives a router that
omits it.

---

**ADR-37 — Hysteresis is symmetric**
*Decision:* a step advances 5 m *past* the maneuver; the cue flips 5 m *before* it.
*Consequence:* a fix hovering on a boundary neither skips a step nor flickers between two cues.

---

**ADR-38 — `nearestNode` is a linear scan**
*Context:* a spatial index was considered.
*Decision:* linear.
*Consequence:* a hand-surveyed campus graph is hundreds of nodes, not millions. A spatial index would
cost more to maintain than it saves.

---

**ADR-39 — `MAX_SNAP_METERS = 150`**
*Decision:* a fix more than 150 m from any node is off-campus; routing gives up with a `reason`.
*Consequence:* no absurd line drawn to a remote junction. The `reason` becomes user-visible copy.

---

**ADR-40 — `staleTime` is 5 minutes, not `Infinity`**
*Context:* the original client had `staleTime: Infinity`.
*Decision:* 5 minutes once the data layer landed.
*Consequence:** content is admin-editable, and an infinite stale time meant a published building
never appeared. This is a correctness fix, not a tuning choice.

---

**ADR-41 — `components/CampusMap.tsx` exists as a static-analysis entry**
*Context:* Metro resolves `.native.tsx` / `.web.tsx`, but `tsc` and `eslint-import-resolver` do not,
producing a permanent `Cannot find module '@/components/CampusMap'`.
*Decision:* add `components/CampusMap.tsx` re-exporting the native types; Metro still resolves the
platform files first, so runtime is unchanged.
*Consequence:* `tsc` and `lint` are clean.

---

**ADR-42 — React Compiler is on, and animations are Reanimated-only**
*Decision:* both enforced.
*Consequence:* memoization is automatic; no manual `useMemo` for render performance beyond the
`makeStyles` factory, which exists to avoid rebuilding the style registry per render, not to
memoize computation.

---

**ADR-43 — No Redux / Zustand**
*Context:* three genuinely global concerns (auth, theme, admin campus).
*Decision:* Context + hooks + TanStack Query.
*Consequence:* `lib/prefs.ts` and `lib/home-location.ts` show the middle ground — local state for
speed, AsyncStorage as source of truth, `profiles` as a mirror — so preferences work signed-out and
still sync when signed in.

---

**ADR-44 — No test runner (an acknowledged gap)**
*Context:* verification has been done with throwaway `tsx` scripts.
*Decision:* keep every navigation/import/geo module pure so a test runner can be added without
refactoring.
*Consequence:* the modules are shaped for Jest today, and Feature 16 is the top-priority quality
item. Until then, the standing gates in §15.1 plus the manual recipes in §15.3 are the safety net.

---

**ADR-45 — `409` for an unconnected pair, not `404`**
*Decision:* `409` with a `reason`.
*Consequence:* the graph is fine; this pair is not connected — a different thing for the client to
explain, and the `reason` becomes user-visible copy.

---

**ADR-46 — `503` + `Retry-After: 60` for an unprovisioned graph**
*Decision:* 503 with `Retry-After`.
*Consequence:* an unprovisioned graph is a normal state, not a failure. The response says so and the
client is built to swallow it and fall through to OSRM.

---

**ADR-47 — Map-swap design: two overlay layouts rather than a parallel web implementation**
*Context:* `CampusMap.web.tsx` has no map.
*Decision:* keep the placeholder as the accessible fallback rather than a second implementation.
*Consequence:* web users get a usable list today; the real web map is scoped but not built.

---

## 17. Known Limitations

### 17.1 Product gaps

| Gap | Impact | Effort |
| --- | --- | --- |
| **No real web map** | web users get a list, not a map | one component, shares the `markers`/`routeCoords` prop contract |
| **No tests** | regressions are caught by hand | runner + the pure modules are ready |
| **No PWA / service worker** | web is not installable or offline-capable beyond the query cache | manifest + SW |
| **No crash reporting or analytics** | you cannot tell which buildings are searched or where routes fail | Sentry + PostHog |
| **No deep links** | `scheme: myapp` is unused; a shared building link does not open the sheet | expo-linking + universal/app links |
| **No notifications** | no pull-back; no "leave now" for events | expo-notifications + an `events` table |
| **No indoor navigation** | multi-storey buildings are a dead end | floor-plan storage + indoor graph |
| **No live campus context** | shuttles, closures, congestion invisible | Supabase Realtime or polling |
| **`bundleIdentifier` / `package` are `com.myapp`** | cannot ship to a store | one-line change |
| **No contrast audit** | two spots flagged: `theme.warning` on `theme.surface` (offline banner), `theme.gray` on `theme.card` (campus picker) | device pass |

### 17.2 Engine limitations (deliberate, in scope of a future pass)

| Limitation | Explanation |
| --- | --- |
| **The graph is only consulted when `stepFree` is on** | so `route.entrance` is `null` for every ordinary route and the arrival branch of `withDestinationName` never fires there. The "graph intra-campus, OSRM for long trips" split from §5.5 is not implemented. |
| **The step-free toggle is in the pre-route sheet branch** | while navigating it is off-screen; you cancel to reach it. The re-route-on-toggle effect is already wired for when you do. |
| **Guest mode + a live server degrades entrance selection** | bundled fallback building ids (`nsuk-senate`) do not exist in the database, so `entrancesFor()` misses and the walk ends at the raw destination point. With Supabase configured the ids are uuids and door selection works. Step filtering still applies either way. |
| **`stepFreeSatisfied` is false for a step-free route to a raw point** | no surveyed door means the final approach is genuinely unsurveyed, so claiming step-free would over-promise. The warning row fires deliberately. |
| **`collect-paths.ts --apply` is a stub** | `toSql` emits `path_nodes` only; edges are written by `scripts/seed.ts`. |
| **`preferCovered` is fully wired server-side** | cost, cache key, validation — but no client UI, so it is never sent. |
| **`invalidateGraphCache` has no caller** | reserved for the admin CMS mutating the graph. |
| **`server/storage.ts` is orphaned** | `IStorage` / `MemStorage`, nothing imports it. |
| **`scripts/tmp-*.ts` scratch files remain** | not referenced by any npm script. |
| **`aliases` are searched but the search is naive** | case-insensitive `includes` over name + description + aliases. With 50–200 buildings this needs ranking (exact > prefix > alias), typo tolerance, and category chips. |
| **`opening_hours` is free-form text** | no parsing, no validation, and not used by routing (a route at 19:55 to a building that closes at 20:00 will not warn). |
| **No OSRM key server-side** | the public demo is still called directly from the client, so it is rate-limited and unkeyed. |
| **`/api/route` is unauthenticated and unthrottled** | read-only over public graph data, but it is a free compute endpoint. |
| **Graph cache is 15 minutes with no invalidation** | an admin graph edit is not visible for up to 15 minutes. |

---

## 18. Roadmap

Priorities are ordered by impact on the product promise (get a person reliably to a door) before
reach (make them come back).

| Phase | Item | Rationale |
| --- | --- | --- |
| **P0 — Correctness** | Test runner + promote the existing ad-hoc suites to Jest | the pure modules are already shaped for it; this is the top quality risk |
| | `npm run typecheck` and a migration check in CI | `tsc --noEmit` + lint are currently manual |
| | Execute `0005_admin_cms.sql` against a real Postgres | the plpgsql bodies, the `jsonb_each` diff join and the policies are unproven |
| | Contrast audit (≥ 4.5:1) in both schemes | two specific spots already flagged |
| | Replace `path-graph-fallback.ts` with a real survey | the step-free feature is only as good as the graph |
| **P1 — Reliability** | Rate limiting + `helmet` on `/api` | free compute endpoint today |
| | Server-side OSRM key + a server-side route cache | removes the client → public demo dependency |
| | `invalidateGraphCache` wired to the admin graph mutations | removes the 15-minute stale window |
| | `/api/route` authentication | |
| | Real web map (MapLibre/Leaflet) sharing the prop contract | the largest single product gap |
| | Service worker + PWA manifest | installable, offline web |
| | Store ids (`com.myapp` → real) | unblocks release |
| **P2 — Navigation quality** | `opening_hours` parsed and enforced by the router (gate + building hours) | "I got locked out" is a real failure mode |
| | Graph for ordinary (non-step-free) routes; entrance-aware arrival always | `route.entrance` is null today for ordinary routes |
| | Wire `collect-paths.ts --apply` | completes the survey workflow |
| | `preferCovered` UI | already server-side |
| | Surface `covered` / `lit` as a user preference | cost model supports it |
| | Better search: ranking, typo tolerance, category chips, "near me" | naive `includes` does not scale past ~50 buildings |
| | `pg_trgm` full-text once the building count grows | |
| **P3 — Reach** | Deep links (`nsuknav://map?building=library`) + universal/app links | share a building; currently `scheme` is unused |
| | Crash reporting wired into `ErrorBoundary` | the boundary already catches the error |
| | Privacy-respecting analytics: `marker_tap`, `route_requested`, `route_failed`, `search_no_results`, `location_denied` | |
| | Feature flags | |
| **P4 — Differentiators** | `events` table + agenda screen + "leave now" from the walk ETA | Google Maps does not know campus schedules |
| | Timetable import (ICS/JSON) | |
| | Supabase Storage + floor plans + indoor routing | turns a map into a wayfinding product |
| | Supabase Realtime: shuttle positions, closures, library occupancy | makes the app the campus's operational dashboard |
| | One-tap "take me home" improvements + saved routes | |

---

## 19. Extension Guide

### 19.1 Add a building category

1. `shared/schema.ts` → extend the `buildings.category` enum and `BuildingCategory` in
   `shared/types.ts`.
2. `components/MarkerIcon.tsx` → add the key to the icon map and pick a lucide glyph
   (16 px, `strokeWidth 2.5`, `MapPin` as fallback).
3. `db:push` for the enum change.
4. Update the admin `category` picker in `components/BuildingForm.tsx`.

### 19.2 Add a correctable field to corrections

1. `shared/schema.ts` → add the column to the `corrections.field` enum **and** to the
   `correctionFields` whitelist.
2. `lib/import/correction-values.ts` → add the label and the coercion function. This is the single
   coercion point shared by the modal and the queue.
3. `app/admin/corrections.tsx` → no change; the now → proposed diff reads from `currentFieldValue`.
4. `supabase/migrations/` → new file to alter the enum and add the RLS-independent mapping.

### 19.3 Add a path-graph attribute

1. `shared/schema.ts` → column on `path_edges` or `entrances`; a NOT NULL enum if it feeds the cost
   model (so a typo cannot read as `undefined`).
2. `lib/navigation/graph.ts` → add the factor to `edgeCostPerMeter`, and if it *filters* rather than
   *weighs*, make it a structural drop like `hasSteps` so it cannot be missed by a relaxation.
3. If it changes topology, add it to the **server cache key** (`server/graph.ts`); a cost change also
   changes the optimal path.
4. `shared/schema.ts` → add to `routeOptionsSchema` if it is client-selectable.
5. `scripts/collect-paths.ts` → emit it in the review CSV.

### 19.4 Add a new server endpoint

1. `server/routes.ts` → add to the `api` router.
2. `shared/schema.ts` → add a `zod` schema for the request; validate with `.safeParse` and render
   errors with `fromZodError`.
3. **Validate the response too** if it carries geometry or a polyline (ADR-20).
4. Map errors to the right status: `400` invalid, `409` unconnected, `503` unavailable + `Retry-After`.
5. Do **not** return campus/building data from a new endpoint — that data has exactly one read path
   (ADR-02).

### 19.5 Add a screen

1. `app/<route>.tsx` — one file per screen.
2. Register it in the `app/_layout.tsx` `Stack`.
3. `const s = useMemo(() => makeStyles(theme), [theme])` — colours from `theme.*`, never an import
   from `constants/colors.ts`.
4. `useSafeAreaInsets()` plus `webTopInset = 67` / `webBottomInset = 34` on absolute chrome.
5. Haptics at the top of every press handler.
6. `pressed` feedback on every `Pressable`.
7. Loading / error+retry / empty states (the map and the campus picker are the reference).
8. Verify on **iOS, Android and web** — the platform split hides web regressions.

### 19.6 Add a query

1. `lib/api/<domain>.ts` — a `use*` hook returning a TanStack Query result.
2. `queryKey` array: `["domain", ...scopes]`.
3. `enabled: !!dependency` where a dependency is required; return `undefined` while disabled so the
   screen can tell "not applicable" from "empty" (ADR-21).
4. Map snake_case → camelCase in the `queryFn` (see `toBuilding` in `lib/api/campuses.ts`).
5. Optimistic mutations: `onMutate` snapshot → `onError` restore → `onSettled` invalidate. Do **not**
   go optimistic if the mutation is two ordered writes (ADR-14).

### 19.7 Change the routing algorithm

`lib/navigation/graph.ts` is pure — change it without touching the server, then re-verify optimality
against the reference-Dijkstra comparison (all node pairs × all option sets) and confirm the
heuristic is still admissible. If the change alters which path is optimal, bump nothing (there is no
cache version) but be aware that **cached routes live for 6 hours** and will not reflect the change
for existing users.

---

## Appendix A — Quick Reference

| I want to… | Go to |
| --- | --- |
| Add a feature | §19 |
| Change a color or font | `style.md` + §12 |
| Add a database table | §7 + `shared/schema.ts`, then a `supabase/migrations/000N_*.sql` for RLS |
| Change the routing cost | §9.2 + §19.3 |
| Add a correction field | §19.2 |
| Debug a routing failure | §15.3 (step-free) + `scripts/tmp-graph-check.ts` |
| Set up from scratch | §13.2 |
| Deploy | §14 |
| Understand a past decision | §16 |
| Know what is not done | §17 |

## Appendix B — Document Map

| File | Purpose | Status |
| --- | --- | --- |
| `DOCUMENTATION.md` | this file — complete reference | **authoritative** |
| `style.md` | design system rules | authoritative for visual conventions |
| `IMPLEMENTATION.md` | per-feature plans + implementation records with verification tables | historical, very detailed, accurate for its sections |
| `FEATURES.md` | roadmap (17 features, P0–P3 phasing) | partially consumed — F1/2/3/4/5/7/10/13 are built; the rest are still open |
| `PROJECT_OVERVIEW.md` | early snapshot | **stale** — describes a 2-screen guest-only build with no server routes |
