# CampusNav — Feature Roadmap (Real-World Readiness)

Suggested features to take this from a demo to a shippable product. Ordered roughly by priority/impact. Each entry notes *why it matters*, *what to build*, and *where it fits in the existing code*.

---

### 1. Supabase backend: hosted Postgres, Auth & Realtime
**Why:** there is no working backend — `server/routes.ts` is an empty scaffold, `server/storage.ts` uses an in-memory `Map` that wipes on restart, the `users` table stores plaintext passwords, and `drizzle.config.ts` points at a `DATABASE_URL` nobody hosts. Supabase gives free hosted Postgres + auth + storage + realtime **while keeping your existing Drizzle schema**, unlike Firebase/MongoDB which would force a NoSQL rewrite.
**Build:**
- Create the Supabase project; set `DATABASE_URL` (Supabase connection string) in env, run `npm run db:push` — `shared/schema.ts` migrates as-is.
- Add `@supabase/supabase-js` + `lib/supabase.ts` (URL/anon key from `EXPO_PUBLIC_*` env vars); point `server/storage.ts` at a Drizzle/Supabase `DbStorage`, or drop Express for data reads and query Supabase directly with TanStack Query.
- Replace hand-rolled auth with Supabase Auth (email OTP or magic link + Google) — delete the plaintext `password` column; add a `role` column for admin.
- Enable **Row Level Security** on every table (campuses/buildings public-read, user favorites scoped to `auth.uid()`); policies written in SQL alongside migrations.
- Supabase Storage for building photos / floor-plan images (feeds feature 6).
- Supabase Realtime subscriptions for live events/closures (feeds feature 17) instead of hand-rolling WebSocket code.
- Keep Express only as a thin proxy if needed (OSRM key caching, rate limiting); otherwise deploy the static Expo build alone and cut server cold-starts.
**Impact:** free tier covers launch (500MB DB, 50k MAU, 1GB storage); eliminates the largest chunk of custom backend/security code; zero rewrite of the Drizzle schema.

---

### 2. Real data layer: campuses, buildings, and routes from Postgres
**Why:** `NSUK_MARKERS` and `CAMPUSES` are hardcoded in `app/map.tsx` / `app/index.tsx`; the DB schema only has a `users` table and `server/routes.ts` is an empty scaffold.
**Build:**
- Tables: `campuses`, `buildings` (name, category, description, lat/lng, icon, floor, opening_hours), `paths`/`edges` for campus-internal walkways.
- `GET /api/campuses`, `GET /api/campuses/:id/buildings?q=`, `POST /api/buildings` (admin) — or equivalent PostgREST/Supabase queries.
- Replace `MemStorage` with a Drizzle-backed `DbStorage`; load markers with TanStack Query instead of module constants.
**Impact:** unlocks multi-campus support, admin edits, and every feature below.

---

### 3. Offline-first caching & sync
**Why:** campus Wi-Fi/cell coverage is patchy; the app currently makes a live OSRM call and has zero persistence (AsyncStorage is installed but unused).
**Build:**
- Cache campus/building payloads in `@react-native-async-storage/async-storage` (React Query `persister` + `onlineManager`).
- Cache the last computed route + last known user location so directions work offline.
- Show an "offline / cached data" banner using the existing pill/badge patterns.
**Impact:** the #1 reliability complaint for navigation apps.

---

### 4. Turn-by-turn walking navigation with live re-routing
**Why:** today the app draws a polyline and an ETA; the user must watch the map themselves.
**Build:**
- `expo-location` `watchPositionAsync` (foreground) to track the user along the route.
- Step list from OSRM/Valhalla legs (or a GraphHopper/ORS foot profile with instructions), rendered in the bottom sheet as "Turn left at Senate Building — 40 m".
- Off-route detection → automatic re-route with a `Haptics.notificationAsync` alert and a "Recalculating…" state.
- Progress bar + remaining distance in the sheet, using the existing distance pill styles.
**Impact:** the actual product promise ("navigate campus").

---

### 5. Accessible / inclusive routing
**Why:** straight-line and generic road routing ignores ramps, stairs, gates, and construction — critical for wheelchair users, cyclists, and luggage/carts.
**Build:**
- `accessibility` flags on building entrances and path edges (steps, ramp, tactile paving, gate hours).
- A "Step-free route" toggle in the bottom sheet (secondary button style) that re-queries the router with accessibility constraints.
- Multiple entrances per building so routes end at the right door.
**Impact:** equity + compliance (often a university procurement requirement).

---

### 6. Indoor navigation & floor plans
**Why:** the main library, senate building, and faculty blocks are multi-storey; GPS dies indoors.
**Build:**
- Upload floor-plan images/SVGs per building (Supabase Storage); indoor map screen with a simple 2D canvas.
- Indoor points (offices, labs, toilets, lifts, stairs) + floor switcher.
- Handoff logic: outdoor route → entrance → indoor route, with a "You are outdoors" / "Enter building" prompt.
**Impact:** turns a campus map into a complete wayfinding product.

---

### 7. Favorites, recent places, and saved routes
**Why:** students repeat the same trips (hostel → library → faculty) daily.
**Build:**
- Heart/favorite on the marker bottom sheet; `favorites` table (RLS-scoped to the signed-in user) or local AsyncStorage store.
- "Recent searches" list in the search dropdown (reuse `searchResultItem` rows).
- One-tap "Take me home" (saved default location) as a floating action on the map.
**Impact:** massive repeat-use and retention boost, trivial to build.

---

### 8. Events, timetable integration & smart scheduling
**Why:** campus life is time-driven — lectures, exams, convocations (there's already a Convocation Square marker).
**Build:**
- `events` table (title, location building, start/end, category) with `GET /api/events`.
- Calendar/agenda screen listing upcoming events with a "Directions" button that deep-links to `/map` with the destination preselected.
- Optional: import a student's class timetable (ICS/JSON) and suggest routes with a leave-by time based on the walk ETA the app already computes.
**Impact:** differentiates from Google Maps, which doesn't know campus schedules.

---

### 9. Search 2.0: fuzzy, ranked, and category-driven
**Why:** current search is a case-insensitive `includes()` over 4 markers.
**Build:**
- Fuzzy matching (typo tolerance) + ranking (exact > prefix > alias), searching names, aliases ("the VC's lodge"), categories, and room numbers.
- Category filter chips above the map (Hostels, Lecture Theatres, Cafeterias, Sports, Health, Toilets, Parking) — use the badge/pill styles.
- "Search near me" that biases results by distance from `userLocation`.
- Consider Postgres full-text/trigram search (`pg_trgm`) server-side once the building count grows.
**Impact:** with 50–200 buildings, naive substring search becomes unusable.

---

### 10. Admin CMS / contribution workflow
**Why:** coordinates and descriptions will go stale; non-developers must be able to fix them.
**Build:**
- Role-based auth (Supabase Auth `role` claim or `users.role`) and an admin web route.
- CRUD UI for buildings/events, CSV/GeoJSON bulk import, and a moderation queue for user-submitted corrections ("Report wrong info" button on the bottom sheet).
- Audit log of edits.
**Impact:** keeps data fresh without a release.

---

### 11. Security, auth & production hardening
**Why:** the schema stores plaintext passwords, there are no API routes yet, and the OSRM/public endpoints are called directly from clients.
**Build:**
- Auth via Supabase Auth (feature 1); otherwise hash passwords (bcrypt/argon2). Enable RLS on every table — deny-by-default.
- Rate-limit `/api` (express-rate-limit), helmet, strict CORS allow-list, input validation with Zod on every route (zod-validation-error is already a dependency).
- Proxy routing through the server (`/api/route`) so OSRM/ORS keys and quotas stay server-side, with a server-side route cache.
- Secrets only in env vars; add a `.env.example`; make `getApiUrl()` degrade gracefully when `EXPO_PUBLIC_DOMAIN` is unset (it currently throws, breaking web).
**Impact:** required before any public launch.

---

### 12. Real web map (and PWA install)
**Why:** `CampusMap.web.tsx` is a placeholder list — web users get no map at all, and the Replit deployment serves a landing page.
**Build:**
- Implement the web branch with `react-native-maps`'s web support or a Leaflet/MapLibre wrapper, sharing the same `markers`/`routeCoords` props contract so `app/map.tsx` is unchanged.
- Keep the list as an accessibility fallback, not the primary UI.
- Add PWA manifest + service worker for installable/offline web.
**Impact:** the deployed URL becomes genuinely useful.

---

### 13. Dark mode & dynamic theming
**Why:** `constants/colors.ts` exports only `light`; `userInterfaceStyle: "automatic"` in `app.json` means iOS can render dark chrome against light-only styles, and `ErrorFallback` already branches on `useColorScheme()` inconsistently.
**Build:**
- Add a `dark` token set (dark surfaces, desaturated greens that pass contrast) and a `useTheme()` hook.
- Flip the landing gradient and card/sheet surfaces per scheme; respect system default with a manual override stored in AsyncStorage.
**Impact:** polish, battery (OLED), and OS-reviewer expectations.

---

### 14. Notifications & deep links
**Why:** nothing pulls the user back in, and `scheme: "myapp"` + expo-router deep links are unused.
**Build:**
- expo-notifications for event reminders ("Convocation Square event in 30 min — leave now, 8 min walk").
- Canonical deep links: `nsuknav://map?building=library`, universal links (Android App Links / iOS Universal Links) so shared building links open straight to the sheet.
- Share button on the bottom sheet that copies a deep link.
**Impact:** growth loop + genuine utility.

---

### 15. Analytics, crash reporting & A/B hooks
**Why:** no telemetry exists; you can't tell which buildings are searched, where routes fail, or where users abandon.
**Build:**
- Privacy-respecting analytics (PostHog/Sentry) with events: `marker_tap`, `route_requested`, `route_failed`, `search_no_results`, `location_denied`.
- Sentry for JS crashes (pairs with the existing `ErrorBoundary` — report `error` there).
- Feature flags so new features (e.g. indoor nav) can roll out gradually.
**Impact:** closes the loop between the roadmap and reality.

---

### 16. Tests, CI and quality gates
**Why:** zero test files; `npm run lint` is the only gate.
**Build:**
- Jest + React Native Testing Library for `lib/` and helpers (`decodeOSRMGeometry`, `calculateStraightDistance`, formatters — pure functions, easy wins).
- MSW/nock tests for the OSRM client and API routes; a Playwright smoke test for the deployed web build.
- GitHub Actions: `lint` + `typecheck` (`tsc --noEmit`) + tests on PR; Drizzle migration check.
**Impact:** prevents regressions as the team grows.

---

### 17. Real-time campus context (shuttles, congestion, closures)
**Why:** static maps miss live conditions.
**Build:**
- Shuttle/bus live positions on the map via Supabase Realtime channels (or WebSocket — `ws` is already a dependency — / polling through React Query).
- Report-a-closure/incident flow (admin-approved) rendered as a map overlay that forces route recalculation.
- Crowd/occupancy hints for library floors via the events/booking system.
**Impact:** makes the app the campus's operational dashboard, not just a map.

---

## Suggested sequencing

| Phase | Features | Outcome |
| --- | --- | --- |
| **P0 — Foundation** | 1 (Supabase), 2 (data layer), 11 (security), 16 (tests/CI) | Real API + DB, safe to expose |
| **P1 — Core UX** | 4 (turn-by-turn), 9 (search 2.0), 7 (favorites), 12 (web map) | Competitive navigation experience |
| **P2 — Reach** | 3 (offline), 14 (notifications/deep links), 13 (dark mode), 15 (analytics) | Retention + discoverability |
| **P3 — Differentiators** | 5 (accessible routing), 6 (indoor), 8 (events/timetable), 10 (admin CMS), 17 (live context) | Un-matchable vs. generic maps |
