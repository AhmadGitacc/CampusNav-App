# CampusNav — Implementation Plan

Detailed build guide for selected features from `FEATURES.md`:

| # | Feature |
| --- | --- |
| 1 | Supabase backend (Postgres, Auth, RLS, Storage, Realtime) |
| 2 | Real data layer — campuses & buildings instead of hardcoded arrays |
| 3 | Offline-first caching & sync |
| 4 | Turn-by-turn walking navigation with live re-routing |
| 5 | Accessible / step-free routing |
| 7 | Favorites, recent places & saved routes |
| 10 | Admin CMS / contribution workflow |
| 13 | Dark mode & dynamic theming |

**Dependency order:** 1 → 2 → (3, 7, 10 parallel) → 4 → 5 → 13.

## Progress

| Step | Status |
| --- | --- |
| **§0 Shared refactors (M0)** | ✅ **Complete** |
| **§1 Supabase backend (M1)** | ✅ **Code complete** — awaiting project provisioning |
| **§2 Real data layer (M2)** | ✅ **Code complete** — awaiting `db:push` + `db:seed` |
| **§3 Offline caching (M3)** | ✅ **Code complete** — needs a device offline pass |
| §4 Turn-by-turn navigation (M4) | ✅ **Code complete** — needs a device walk-through |
| **§5 Accessible routing (M5)** | ✅ **Code complete** — awaiting `db:push` + `db:seed` |
| §7 Favorites (M3) | ✅ **Code complete** — awaiting `db:push` + `db:seed` |
| §10 Admin CMS (M3) | ✅ **Code complete** — awaiting `db:push` + migration 0005 + `admin:grant` |
| **§13 Dark mode (M6)** | ✅ **Code complete** — needs a device dark-mode pass |

---

## 0. Shared refactors — ✅ COMPLETE

Small extractions several features depend on. Touch `app/map.tsx` once instead of repeatedly.

| Move | From → To | Used by | Status |
| --- | --- | --- | --- |
| `formatDistance`, `formatWalkTime`, `calculateStraightDistance` | `app/map.tsx` → `lib/geo.ts` | 2, 4, 5, 7 | ✅ |
| `decodeOSRMGeometry` | `app/map.tsx` → `lib/geo.ts` | 4 | ✅ |
| `getMarkerIcon(icon)` (duplicated in `map.tsx` + `CampusMap.native.tsx`) | → `components/MarkerIcon.tsx` | 2 | ✅ |
| Marker/POI type `Marker` | → `shared/types.ts` (`{ id, title, description, lat, lng, icon }`) | all | ✅ |
| Campus/markers fetching | → `lib/api/campuses.ts` | 2, 3, 7 | ✅ Done in §2 |
| Location acquisition (duplicated twice in `map.tsx`) | → `lib/location.ts` → `getCurrentUserLocation()` | 4, 7 | ✅ |
| *(added)* `fetchWalkingRoute` + `WalkingRoute` type | `app/map.tsx` → `lib/routing.ts` | 3, 4 | ✅ |

### Files created
| File | Contents |
| --- | --- |
| `shared/types.ts` | `LatLon`, `LatLngPair`, `MarkerIconName`, `CampusMarker`, `Campus` — shared by app + server, no runtime deps |
| `lib/geo.ts` | `toLatLon`, `toLatLngPair`, `calculateStraightDistance` (Haversine), `formatDistance`, `formatWalkTime`, `formatEstimatedWalkTime`, `estimateWalkSeconds`, `decodeOSRMGeometry`, `boundsOf` (camera fit) |
| `lib/location.ts` | `getCurrentUserLocation()` (native `expo-location` + web `navigator.geolocation`), `LocationPermissionError` |
| `lib/routing.ts` | `fetchWalkingRoute()` (OSRM foot) + `WalkingRoute` interface |
| `components/MarkerIcon.tsx` | Single icon mapping (style.md §8: white 16px, strokeWidth 2.5, `MapPin` fallback) |

### Files changed
- `app/map.tsx` — 966 → 775 lines. Removed 5 local helpers and both duplicated geolocation blocks; now imports them. `any` marker types replaced with `CampusMarker` / `LatLon`. Route camera fit now uses `boundsOf()` (identical math). The `~N min walk` inline template became `formatEstimatedWalkTime()` (same output).
- `components/CampusMap.native.tsx` / `CampusMap.web.tsx` — props typed with `CampusMarker` / `LatLon`; both `Array<T>`-shaped inline types removed; native map uses the shared `MarkerIcon`.

### Style compliance
- `components/MarkerIcon.tsx` (new) uses `colors.light.white` from `constants/colors.ts` rather than a raw hex, per style.md §1.
- No new UI was introduced, so no other style.md rules were touched. All extracted helpers are pure — future UI work should consume these modules, not re-inline them.

### Verification
| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | 1 error — `Cannot find module '@/components/CampusMap'` — **pre-existing** (Metro resolves `.native.tsx`/`.web.tsx`; `tsc` and `eslint-import-resolver` do not). Confirmed identical on unmodified code. |
| `npm run lint` | 3 errors (same 3 pre-existing: 1 `import/no-unresolved` + 2 `react/display-name` on untouched `forwardRef` lines). Baseline was 3 errors **+ 2 warnings** — the 2 `@typescript-eslint/array-type` warnings are now fixed. |

> To silence the pre-existing 3 errors, add `components/CampusMap.d.ts` re-exporting the native component types (planned with §12 real web map).


---

## 1. Feature 1 — Supabase backend

### 1.1 Project & environment

```bash
npm i @supabase/supabase-js react-native-url-polyfill
# already installed: @react-native-async-storage/async-storage
```

Create a Supabase project, then add to `.env` (and Replit/Cloud Run secrets):

```bash
# client (bundled by Expo — safe to expose)
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
# server only
DATABASE_URL=postgres://postgres.<ref>:<password>@aws-0.<region>.pooler.supabase.com:6543/postgres
DIRECT_URL=postgres://postgres.<ref>:<password>@db.<ref>.supabase.co:5432/postgres
EXPO_PUBLIC_DOMAIN=<your deploy host>
```

> Use the **pooler** (port 6543, transaction mode) for the serverless/Express runtime and `DIRECT_URL` for `drizzle-kit push` migrations.

Create `.env.example` documenting these (Feature 11 requirement).

### 1.2 Drizzle → Supabase

`drizzle.config.ts` — swap `url` for the split URLs:

```ts
export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
  // migrations use DIRECT_URL for drizzle-kit
});
```

`server/db.ts` (new — used by every future route):

```ts
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  ssl: { rejectUnauthorized: false },
});

export const db = drizzle({ client: pool, schema });
```

`npm run db:push` should now succeed against Supabase — no schema rewrite.

### 1.3 Supabase client in the app

```ts
// lib/supabase.ts
import "react-native-url-polyfill/auto";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: Platform.OS === "web" ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === "web",
  },
});
```

### 1.4 Schema changes (Feature 1 + auth)

In `shared/schema.ts`, **drop `password`**, add role + profile:

```ts
export const profiles = pgTable("profiles", {
  id: varchar("id").primaryKey().references(() => authUsers.id), // auth.users via raw SQL
  role: varchar("role", { enum: ["student", "admin"] }).notNull().default("student"),
  displayName: text("display_name"),
  homeLat: doublePrecision("home_lat"),
  homeLng: doublePrecision("home_lng"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

Auth users live in Supabase's `auth.users` — declare them with `pgTable("users", ...)` **only for typing**, or manage the `profiles` FK in raw SQL migration:

```sql
-- supabase/migrations/0001_profile_fk.sql
alter table public.profiles
  add constraint profiles_id_fkey
  foreign key (id) references auth.users (id) on delete cascade;
```

> **Password column removal:** `npm run db:push` will offer to drop `users.password` — accept. The legacy `MemStorage`/`IStorage` in `server/storage.ts` can be deleted once Feature 2 lands.

### 1.5 Auth flow

- New screens: `app/(auth)/sign-in.tsx`, `app/(auth)/verify.tsx` (email OTP / magic link — no password UI needed).
- Session context in `app/_layout.tsx`:

```tsx
// lib/useAuth.ts
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return { session, loading, signIn: ..., signOut: ... };
}
```

- **Guest access stays first-class:** landing screen keeps working with no session (RLS allows public reads); sign-in is optional and only gates favorites/admin (Features 7, 10).
- Replace the current route guard logic: `app/index.tsx` → if session exists show "Continue as {name}" instead of the Guest badge.

### 1.6 Row Level Security (deny by default)

```sql
-- supabase/migrations/0002_rls.sql
alter table public.campuses   enable row level security;
alter table public.buildings  enable row level security;
alter table public.favorites  enable row level security;
alter table public.corrections enable row level security;

create policy "campuses public read"   on public.campuses  for select using (true);
create policy "buildings public read"  on public.buildings for select using (true);

create policy "own favorites" on public.favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "admin write buildings" on public.buildings
  for all using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

create policy "insert own corrections" on public.corrections
  for insert with check (auth.uid() = user_id);

-- set admin: supabase.auth.admin.updateUserById(uid, { app_metadata: { role: 'admin' } })
```

> Admin role lives in **`app_metadata`** (server-set, not client-forgeable). Client-side role checks are for UX only — RLS is the real gate.

### 1.7 Storage buckets

```sql
insert into storage.buckets (id, name, public) values
  ('building-photos', 'building-photos', true),
  ('floor-plans', 'floor-plans', true);

create policy "public read photos" on storage.objects
  for select using (bucket_id in ('building-photos','floor-plans'));
```

### 1.8 Keep or drop Express?

| Option | When |
| --- | --- |
| **A. Drop Express** — static Expo build only, all data via Supabase client | Simplest; recommended to start |
| **B. Thin Express proxy** — `/api/route` (OSRM key + cache), `/api/*` server-side validation, rate limiting | Needed for Feature 4/5 route proxying and Feature 11 hardening |

Recommendation: **B-lite**. Keep `server/` for the routing proxy + landing page; move all CRUD reads/writes to direct Supabase queries.

**Deliverables:** working `db:push`, sign-in screen, RLS enabled, `.env.example`, `MemStorage` deleted.

### ✅ §1 Implementation record

Everything below is written and verified. **Live provisioning is the only remaining step** (needs your Supabase account).

| Item | Status | Where |
| --- | --- | --- |
| 1.1 deps + env docs | ✅ | `@supabase/supabase-js@^2.117.2`, `react-native-url-polyfill@^4.0.0`, `@types/pg` added; `.env.example` created (`.env` already gitignored) |
| 1.2 Drizzle → Supabase | ✅ | `server/db.ts` (pool + `db`, TLS relaxed for the pooler), `drizzle.config.ts` prefers `DIRECT_URL` and falls back to `DATABASE_URL` |
| 1.3 Supabase client | ✅ | `lib/supabase.ts` |
| 1.4 schema | ✅ | `profiles` table added; plaintext `password` column **removed**; `server/storage.ts` reworked to `IStorage`/`MemStorage` over profiles |
| 1.5 auth flow | ✅ | `components/AuthProvider.tsx`, `lib/useAuth.ts`, `app/(auth)/sign-in.tsx`, mounted in `app/_layout.tsx`, landing badge + account link updated |
| 1.6 RLS | ✅ (profiles) | `supabase/migrations/0001_auth_profiles.sql` |
| 1.7 storage buckets | ⬜ Deferred | Buckets are for building photos / floor plans — created with §6 and §10 |
| 1.8 Express | ✅ Decision | Keeping `server/` as a thin proxy (routing cache, rate limiting) + landing page; CRUD goes through Supabase directly. No code change needed yet |

**Deliberate deviations from the plan**
- `lib/supabase.ts` exposes `getSupabase()` + `isSupabaseConfigured` instead of a module-level `createClient` call. A top-level `createClient` with missing env vars throws during import, which would white-screen the app before the user ever reaches the login screen. The client is now built on first use.
- No `app/(auth)/verify.tsx`: `signInWithOtp` completes through the deep link, so the sign-in screen has an inline "check your inbox" state rather than a separate route.
- `server/storage.ts` was reworked rather than deleted — `server/routes.ts` still imports the module surface, so removing it outright would break the build. The `IStorage` contract is now profile-shaped and still in-memory until §2 swaps in Drizzle.
- Only `profiles` RLS is written. Policies for `campuses`/`buildings` (§2), `favorites` (§7) and `corrections` (§10) are issued **with their tables** — creating them now would reference non-existent relations.

**Style compliance for the new sign-in screen** (all per `style.md`)
- Brand gradient `["#054A14", "#0B6623", "#0D7A2B"]` + the same decorative circle overlay as the landing screen.
- Hero icon `64×64`, radius 20, `rgba(255,255,255,0.15)`; title `28 / Inter_700Bold`; subtitle `15 / Inter_400Regular` @ 0.7 alpha, `lineHeight 22`.
- Card: white, radius 20, `padding 24`, `gap 16`, shadow `offset {0,8} / 0.15 / 24 / elevation 8`.
- Input: radius 14, `borderWidth 1.5`, `paddingH 16 / paddingV 14`, `backgroundSecondary` fill, focus border switches to `#0B6623`.
- Primary CTA: gradient button, `paddingVertical 16`, `16 / Inter_600SemiBold`; disabled state `["#C8D6C8", …]` with gray icon+label.
- Back control is a `44×44` touch target with `hitSlop={8}`; haptics on every press (Light for back/secondary, Medium for submit).
- Safe-area insets + the `webTopInset 67` / `webBottomInset 34` web compensation.
- Enter/exit motion limited to the landing screen's `FadeInDown` stagger; no new animation vocabulary.
- New colour token `danger: "#C62828"` added to `constants/colors.ts` (light palette had no error colour) and used for the inline error text — no raw hex introduced in new code.
- Screens use `StyleSheet.create` at the bottom with semantic names, matching §10 of `style.md`.

**Verification**
| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | 1 error — the pre-existing `@/components/CampusMap` platform-resolution issue. No new errors. |
| `npm run lint` | 3 errors (the same 3 pre-existing), **0 warnings**. |
| Route types | `.expo/types/router.d.ts` regenerated so `router.push("/(auth)/sign-in")` typechecks under `typedRoutes`. |

**To activate (requires your Supabase account)**
1. Create the project, then copy the API values into `.env` from `.env.example`.
2. `npm run db:push` — creates `users` (without `password`) and `profiles`.
3. `supabase db push` (or paste `supabase/migrations/0001_auth_profiles.sql` into the SQL editor) — adds the `auth.users` FK, the signup trigger and the RLS policies.
4. Auth → Email: enable the magic-link/OTP template. Optionally disable password sign-up, since the app never uses it.
5. Set an admin: `supabase.auth.admin.updateUserById(uid, { app_metadata: { role: 'admin' } })` (script lands with §10).

Until step 1–3 are done the app still boots and the whole map feature works in guest mode — the sign-in screen shows a "Sign-in unavailable" card instead of failing.


---

## 2. Feature 2 — Real data layer

### 2.1 Schema

```ts
// shared/schema.ts additions
export const campuses = pgTable("campuses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),          // "nsuk"
  name: text("name").notNull(),
  location: text("location").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  zoom: doublePrecision("zoom").notNull().default(0.008),
  icon: text("icon").default("map-pin"),
});

export const buildings = pgTable("buildings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campusId: varchar("campus_id").notNull().references(() => campuses.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  category: varchar("category", { enum: ["admin","faculty","library","event","hostel","cafeteria","sports","health","parking","toilet"] })
    .notNull().default("faculty"),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  icon: text("icon").default("map-pin"),   // maps to lucide via MarkerIcon
  aliases: text("aliases").array(),        // ["VC's lodge", "admin block"]
  openingHours: text("opening_hours"),
  isAccessibleEntry: boolean("is_accessible_entry").notNull().default(true),
});

export const insertCampusSchema = createInsertSchema(campuses);
export const insertBuildingSchema = createInsertSchema(buildings);
export type Campus = typeof campuses.$inferSelect;
export type Building = typeof buildings.$inferSelect;
```

Feature 5 extends this with `entrances` and `path_edges` (see §5).

### 2.2 Seed script

`scripts/seed.ts` (run with `tsx`, uses `server/db.ts`):

- 1 campus row for NSUK (`slug: "nsuk"`, `8.8471, 7.8776`).
- The 4 existing markers from `NSUK_MARKERS` mapped to buildings, with `category` set (`admin`, `faculty`, `library`, `event`).
- Idempotent: `onConflictDoUpdate` on a natural key (`campusId + name`).
- Script entry: `"db:seed": "tsx scripts/seed.ts"` in `package.json`.

### 2.3 Query layer (client-side, via Supabase)

```ts
// lib/api/campuses.ts
export function useCampuses() {
  return useQuery({
    queryKey: ["campuses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("campuses").select("*").order("name");
      if (error) throw error;
      return data as Campus[];
    },
    staleTime: 30 * 60_000,
  });
}

export function useBuildings(campusId: string | undefined) {
  return useQuery({
    queryKey: ["buildings", campusId],
    enabled: !!campusId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings").select("*").eq("campus_id", campusId).order("name");
      if (error) throw error;
      return data as Building[];
    },
    staleTime: 30 * 60_000,
  });
}
```

> React Query is already configured in `lib/query-client.ts`. Change `staleTime: Infinity` → `staleTime: 5 * 60_000` so content edits propagate; Feature 3 adds a persister on top.

**Optional server route alternative:** `GET /api/campuses`, `GET /api/campuses/:id/buildings?q=` in `server/routes.ts` using `db.select(...)`. Choose one path — don't mix client Supabase reads with Express reads for the same data.

### 2.4 Screen rewiring

**`app/index.tsx`**
- Delete the `CAMPUSES` const; `const { data: campuses, isLoading } = useCampuses()`.
- Picker `FlatList` renders `campuses ?? []`; add a skeleton row while loading and an inline error + retry button (use `components/ErrorFallback` styling) on failure.
- Keep local `selectedCampusId` in state; optionally persist with AsyncStorage so returning users skip the picker.
- Still navigate with `router.push({ pathname: "/map", params: { campusId, lat, lng } })`.

**`app/map.tsx`**
- Delete `NSUK_MARKERS`; `const { data: buildings } = useBuildings(params.campusId)`.
- Pass `markers: buildings ?? []` into `CampusMap` (map `Building` → the existing marker prop shape; column names are snake_case in Postgres — either `.camelCase()` in select or map in the queryFn).
- Search `useMemo` runs over `buildings` and adds `aliases` to the match fields.
- Show a loading indicator over the map until buildings resolve; empty state ("No buildings yet") if the campus has none.
- Header label: replace hardcoded `"NSUK Campus"` with the campus name fetched via `useCampuse(campusId)`.

**`components/CampusMap.*.tsx`**
- No API change (already takes `markers[]`) — only ensure the `Building` → marker mapping is shared.

**Deliverables:** zero hardcoded coordinates in `app/`, DB-backed map, seed script.

### ✅ §2 Implementation record

**Chosen path:** client-side Supabase reads only. The optional Express route alternative was *not* used, so campus/building data has exactly one read path (matches the "don't mix" rule above).

| Item | Status | Where |
| --- | --- | --- |
| `campuses` + `buildings` Drizzle tables | ✅ | `shared/schema.ts` |
| Composite unique `(campus_id, name)` for idempotent seed | ✅ | `shared/schema.ts` |
| `Building` / `BuildingCategory` domain types | ✅ | `shared/types.ts` |
| Single source dataset (seed + guest fallback) | ✅ | `lib/data/campus-fallback.ts` |
| `useCampuses` / `useCampus(slug)` / `useBuildings(slug)` | ✅ | `lib/api/campuses.ts` |
| snake_case → camelCase mapping | ✅ | `lib/api/campuses.ts` |
| RLS: public read, admin write | ✅ | `supabase/migrations/0002_campus_data.sql` |
| Idempotent seed + `db:seed` script | ✅ | `scripts/seed.ts` |
| `CAMPUSES` removed; loading + error/retry in picker | ✅ | `app/index.tsx` |
| `NSUK_MARKERS` removed; DB-backed markers | ✅ | `app/map.tsx` |
| Map loading / error+retry / empty overlays | ✅ | `app/map.tsx` |
| Campus name in header from DB | ✅ | `app/map.tsx` |
| `staleTime` `Infinity` → 5 min (content is editable) | ✅ | `lib/query-client.ts` |
| Actionable "DATABASE_URL is not set" error | ✅ | `server/db.ts` |

**Design notes**

- **Routes carry slugs, foreign keys carry uuids.** `useCampus(slug)` resolves the slug first; `useBuildings` then filters `buildings.campus_id` by the resolved uuid. Keeps URLs stable and shareable.
- **Guest mode is preserved.** When `isSupabaseConfigured` is false, both screens read `lib/data/campus-fallback.ts` instead of querying. That same file feeds `db:seed`, so the seeded database and the offline experience cannot drift.
- **The dataset lives in one place.** Seed script and fallback import the same `SEED_CAMPUSES` / `SEED_BUILDINGS`; fallback ids are readable slugs while the DB assigns uuids.
- **`aliases` is not yet used in search.** The column exists and is seeded; the search `useMemo` still matches name + description only (title/description are the marker shape). Widening search is Feature 9.
- **Campus ids passed to `/map` are slugs**, so `useCampus(params.campusId)` resolves correctly on first mount without an extra round trip.

**Verification**

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | ✅ clean (0 errors) |
| `npm run lint` | ✅ clean (0 errors, 0 warnings) |
| `npx expo export --platform web` | ✅ bundles — guest-mode path renders without Supabase |
| Seed SQL correctness | ✅ upserts emit `on conflict ("campus_id","name")` and `default` for `id`/`zoom`/`icon`/`created_at` |
| `npm run db:seed` without credentials | ✅ fails fast with the actionable `DATABASE_URL is not set` message |
| Live query against Postgres | ⏸️ needs provisioning |

**Also cleared while verifying** (pre-existing, unrelated to §2):

- `react/display-name` on both `forwardRef` map components → added explicit `displayName`.
- `TS2307` / `import/no-unresolved` for `@/components/CampusMap` → added `components/CampusMap.tsx` as the static-analysis entry (Metro still resolves `.web.tsx` / `.native.tsx` first, so runtime is unchanged) and configured the TypeScript resolver in `eslint.config.js`.

**To activate against a real project**

```bash
cp .env.example .env      # fill in Supabase URL, anon key, DIRECT_URL, DATABASE_URL
npm run db:push           # creates campuses + buildings from shared/schema.ts
npx supabase db push      # or paste 0001/0002 into the SQL editor, for RLS
npm run db:seed           # idempotent
```

---

## 3. Feature 3 — Offline-first caching & sync

### 3.1 Install

```bash
npm i @tanstack/react-query-persist-client @tanstack/query-sync-storage-persister @react-native-community/netinfo
```

(`netinfo` is the RN standard; `expo-network` alone doesn't emit connect/disconnect events.)

### 3.2 Persist the query cache

```ts
// lib/query-client.ts (additions)
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-sync-storage-persister";

export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "campusnav-query-cache",
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      staleTime: 5 * 60_000,
      gcTime: 24 * 60 * 60_000,       // keep cached data a full day
      retry: 2,
      networkMode: "always",
      refetchOnReconnect: true,       // replaces refetchOnWindowFocus
    },
    mutations: { networkMode: "always" },
  },
});
```

Wrap the app in `app/_layout.tsx`:

```tsx
<PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 24 * 60 * 60_000 }}>
  <QueryClientProvider client={queryClient}> ... </QueryClientProvider>
</PersistQueryClientProvider>
```

> `getApiUrl()` currently **throws** when `EXPO_PUBLIC_DOMAIN` is unset — this breaks offline boot. Fix: return `""` (relative URLs) on web/dev and only throw inside `apiRequest` when a real network call is attempted.

### 3.3 Connectivity state

```ts
// lib/useOnline.ts
export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => NetInfo.addEventListener((s) => setOnline(!!s.isConnected)), []);
  return online;
}
```

### 3.4 Offline banner

`components/OfflineBanner.tsx` — fixed pill matching `styles.hintBar` from `map.tsx` (white bg, radius 30, icon + `Inter_500Medium 14`). Render under the search bar when `!online`, with copy "Offline — showing saved campus data". Animate in with `FadeInDown.duration(300)`.

### 3.5 Route + location cache

```ts
// lib/route-cache.ts
const KEY = (a: LatLon, b: LatLon) =>
  `route:${a.latitude.toFixed(4)},${a.longitude.toFixed(4)}|${b.latitude.toFixed(4)},${b.longitude.toFixed(4)}`;
const TTL = 6 * 60 * 60_000; // 6h — paths don't change often

export async function getCachedRoute(a, b) { /* AsyncStorage.getItem + TTL check */ }
export async function setCachedRoute(a, b, route) { /* JSON.stringify + timestamp */ }
```

In `fetchWalkingRoute()` (`app/map.tsx` → move to `lib/routing.ts`):

1. `getCachedRoute(from, to)` → hit? return it (instant, offline-safe).
2. Miss → fetch OSRM; on success `setCachedRoute(...)`; on failure → try cached anyway before falling back to straight-line.

Cache `userLocation` under `last:location` (TTL 10 min) so a cold offline start can still draw a route from the last known position.

**Also cache campus payloads yourself?** Not needed — React Query's persister already stores `["campuses"]` / `["buildings", id]` responses.

**Deliverables:** kill the app offline → reopen → buildings render from cache and a previously-computed route still appears.

### ✅ §3 Implementation record

| Item | Status | Where |
| --- | --- | --- |
| `react-query-persist-client`, `query-async-storage-persister`, `netinfo` | ✅ | `package.json` |
| `queryPersister` (key `campusnav-query-cache`) + 24h `maxAge` | ✅ | `lib/query-client.ts` |
| `networkMode: "always"`, `retry: 2`, `refetchOnReconnect: true` | ✅ | `lib/query-client.ts` |
| `getApiUrl()` no longer throws at boot; throws only on a real native call | ✅ | `lib/query-client.ts` |
| `PersistQueryClientProvider` wired; splash held until restore | ✅ | `app/_layout.tsx` |
| `useOnline()` connectivity hook | ✅ | `lib/useOnline.ts` |
| `OfflineBanner` pill (hint-bar tokens) | ✅ | `components/OfflineBanner.tsx` |
| Route cache (6h TTL) + stale-route fallback | ✅ | `lib/route-cache.ts` |
| `fetchWalkingRoute` reads cache → OSRM → stale → straight line | ✅ | `lib/routing.ts` |
| Last known location cached (10m TTL) + used as fallback | ✅ | `lib/location.ts`, `app/map.tsx` |

**Deviations from the plan (both deliberate)**

1. **`@tanstack/query-async-storage-persister`, not `query-sync-storage-persister`.** The plan named `createAsyncStoragePersister` from the *sync* package; that export doesn't exist there. RN `AsyncStorage` has a Promise-based API, so it needs the async persister. The sync package was removed rather than left unused.
2. **`PersistQueryClientProvider` is not nested inside a second `QueryClientProvider`** (the plan's snippet wrapped both). The provider already renders one internally, and nesting two with the same client only adds a redundant context layer. Children still mount before restore, so the splash is held via the provider's `onSuccess`/`onError` callbacks instead.

**Design notes**

- **`networkMode: "always"` is the point of the feature.** A query that pauses while offline would leave the UI waiting forever. Letting it run means it fails fast, and React Query serves the persisted entry.
- **Route resolution is four-tier:** fresh cache → OSRM → *stale* cache → straight line. A 12-hour-old campus path is far more useful than a line between two points, so expiry downgrades quality instead of discarding the entry. `getStaleRoute` exists solely for that middle step.
- **Cache keys round coordinates to 4 decimals (~11m)** so GPS jitter doesn't produce a new entry per request.
- **Location writes to the cache on every successful fix**, which is what lets `handleGetDirections` route offline from the last known position.
- **Storage is always fail-soft.** Every `AsyncStorage` call in `lib/route-cache.ts` is wrapped in `try/catch`; a full or unavailable store degrades to "no cache" instead of breaking routing.

**Verification**

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | ✅ clean (0 errors) |
| `npm run lint` | ✅ clean (0 errors, 0 warnings) |
| `npx expo export --platform web` | ✅ bundles |
| Splash never hangs on a corrupt cache | ✅ `onError` sets restored too, and the provider settles via `.finally` |
| Cold offline start renders cached buildings | ⏸️ needs a device/simulator pass |

**To verify offline behaviour by hand**

1. Run online, open a campus, tap a marker, get directions (populates the route cache).
2. Enable airplane mode (or DevTools → Offline on web).
3. Kill and relaunch. Buildings render from the persisted query cache, the offline pill shows, and "Get Directions" still draws the cached route from the last known position.

> Automated coverage for the cache/route logic lands in Feature 16 (tests & CI) — there is no test runner in the project yet.

---

## 4. Feature 4 — Turn-by-turn walking navigation

### 4.1 Router: get real steps

Public OSRM supports maneuver steps:

```
https://router.project-osrm.org/route/v1/foot/{lon},{lat};{lon},{lat}
  ?overview=full&geometries=polyline&steps=true&annotations=duration,distance
```

Response: `routes[0].legs[0].steps[]` each with `maneuver.{type, modifier, bearing_after}`, `name`, `distance`, `duration`, and `geometry`.

```ts
// lib/routing.ts
export interface NavStep {
  instruction: string;
  distance: number;      // m
  duration: number;      // s
  location: { latitude: number; longitude: number }; // maneuver point
  geometry: { latitude: number; longitude: number }[]; // this step's polyline
}
export interface RouteResult {
  coordinates: LatLon[];
  steps: NavStep[];
  distanceMeters: number;
  durationSeconds: number;
}
```

**Instruction generation** (`lib/navigation/instructions.ts`) — pure function, easily unit-tested:

| `type` / `modifier` | Output |
| --- | --- |
| `depart` | "Head {compass direction}" |
| `turn` + `left` / `right` / `slight left` / `slight right` / `sharp left` / `sharp right` | "Turn left", "Slight left", … |
| `continue` | "Continue on {street or path}" |
| `new name` | "Continue onto {name}" |
| `arrive` | "Arrive at {destination name}" |
| `roundabout` + `exit` | "Enter roundabout, take exit {n}" |
| `fork` | "Keep {left/right}" |

Compose with street names: `"Turn left onto Faculty Rd"`. Skip zero-length steps (< 2 m) when building the list.

> If OSRM's public demo rate-limits in production, the same call moves behind the Express proxy (`POST /api/route`) — the client contract stays identical (Feature 11).

### 4.2 Navigation state machine

New hook `lib/navigation/useWalkingNavigation.ts` — refactors the route logic currently inline in `handleGetDirections`:

```ts
type NavState = "idle" | "locating" | "routing" | "navigating" | "arrived" | "error";

function useWalkingNavigation(destination) {
  const [state, setState] = useState<NavState>("idle");
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [progress, setProgress] = useState({ remainingM: 0, remainingS: 0, stepIndex: 0 });
  ...
  return { state, route, progress, start, cancel, retry };
}
```

- `start()`: reuse `lib/location.ts` (permission → location), fetch/cached route, fit camera to bounding box (existing logic moves here), then `setState("navigating")` and start tracking.
- `cancel()`: clears watch + route (wraps current `handleDismissRoute`).

### 4.3 Live tracking

```ts
const sub = await Location.watchPositionAsync(
  { accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 2000 },
  (pos) => onPosition({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
);
```

Web: fall back to `watchPosition` via `navigator.geolocation` (same wrapper as today's `getCurrentUserLocation`), or hide live-tracking behind `Platform.OS !== "web"` in v1.

**Per-step progress** — project the fix onto the route polyline:

```ts
// lib/navigation/geo-nav.ts
export function snapToRoute(point, path): { index: number; offset: number; snapped: LatLon }
// nearest segment via cross-track distance; returns position along route
```

- `remainingM` = length from snapped point to end of route (recompute only every fix, cheap for ~500 points).
- Advance `stepIndex` when the snapped position passes a maneuver point (with a 5 m look-ahead so GPS jitter doesn't skip a step).
- **Turn cue:** when distance-to-next-maneuver < 15 m → `Haptics.notificationAsync(Success)` + auto-scroll steps list to that step.

### 4.4 Off-route detection & re-route

```ts
const offRoute = perpendicularDistance(point, route) > 30; // meters
// require 3 consecutive fixes (≈6s) before acting — avoids GPS noise
```

On trigger: `setState("routing")`, re-run `start()` with the current position as origin, fire `Haptics.notificationAsync(Warning)`, show "Recalculating…" over the sheet (reuse `locationLoading` spinner pattern).

### 4.5 Arrival

`distanceToDestination < 15 m` → `Haptics.notificationAsync(Success)`, stop the watch, replace sheet content with an "Arrived" state (check icon + destination name + "Done" button).

### 4.6 UI changes in `app/map.tsx` bottom sheet

Three sheet layouts keyed off `NavState` (keep `SlideInDown/SlideOutDown` transitions):

1. **Pre-route** (current): title, description, distance pill, "Get Directions".
2. **Navigating:** 
   - progress bar: `RouteProgressBar.tsx` — 6px track `#E8F5E9`, fill `#0B6623`, radius 3.
   - current instruction row: big icon (`TurnLeft`/`CornerDownLeft` from lucide) + `Inter_700Bold 18` text + "in 40 m" caption.
   - collapsible full step list (`components/NavigationSteps.tsx`) — reuse `searchResultItem` row styles; current step highlighted with `#E8F5E9`.
   - remaining distance/time pill (existing `distanceRow` styles) + "Cancel" secondary button.
3. **Arrived:** success state as above.

Camera: optional auto-follow — pan to center the user every fix *only if* the user hasn't manually dragged in the last 5 s (track via `onRegionChangeComplete`).

**Files:** `lib/routing.ts`, `lib/navigation/instructions.ts`, `lib/navigation/geo-nav.ts`, `lib/navigation/useWalkingNavigation.ts`, `components/RouteProgressBar.tsx`, `components/NavigationSteps.tsx`, edits to `app/map.tsx`.

**Tests:** `instructions.ts`, `snapToRoute`, off-route classifier (pure functions — Feature 16 fodder).

**Deliverables:** spoken-style step list, live progress, auto re-route, arrival detection.

### ✅ §4 Implementation record

| Item | Status | Where |
| --- | --- | --- |
| Geo primitives | ✅ | `lib/geo.ts` — `segmentDistance`, `polylineLength`, `initialBearing` |
| Instruction generator | ✅ | `lib/navigation/instructions.ts` — `NavStep`, maneuver → text/icon, `buildNavSteps`, `withDestinationName` |
| Geo-nav math | ✅ | `lib/navigation/geo-nav.ts` — `snapToRoute`, `stepOffsets`, `computeNavProgress`, thresholds (`OFF_ROUTE_*`, `STEP_HYSTERESIS_M`, `ARRIVAL_RADIUS_M`) |
| Router with steps | ✅ | `lib/routing.ts` — `steps=true`, parses + normalizes steps, synthesizes cues for cached/straight-line routes, adds `approximate` flag |
| Location watcher | ✅ | `lib/location.ts` — `watchUserLocation()` (native + web), caches every fix via `setLastLocation` |
| Navigation state machine | ✅ | `lib/navigation/useWalkingNavigation.ts` — `start`/`cancel`/`retry`, tracking, off-route confirmation, camera callbacks, arrival |
| UI components | ✅ | `components/RouteProgressBar.tsx`, `components/NavigationSteps.tsx` (+ exported `ManeuverGlyph`) |
| Map props for follow | ✅ | `components/CampusMap.native.tsx` (forwards `onRegionChangeComplete`), `components/CampusMap.web.tsx` (no-op) |
| Map screen | ✅ | `app/map.tsx` — rewired to the hook, three sheet layouts, camera follow/pan bookkeeping |
| Type safety & lint | ✅ | `npx tsc --noEmit` clean · `npm run lint` clean (0 errors, 0 warnings) |
| Web + iOS bundle | ✅ | `npx expo export --platform web` and `--platform ios` both succeed |

**Deviations from the plan (all deliberate)**

1. **`WalkingRoute`, not `RouteResult`.** The plan's §4.1 snippet introduced a new `RouteResult` interface, but `WalkingRoute` already exists (§0) and `lib/route-cache.ts` imports it. `WalkingRoute` was extended with `steps` instead of being renamed, so the cache contract and §5's endpoint contract stay one shape.
2. **The map ref stays in `app/map.tsx`.** The hook takes `onCameraFit` / `onFollowUser` callbacks rather than a `MapView` ref — `lib/` stays free of map imports and the hook stays testable.
3. **`RouteResult` shape is the endpoint.** §5's `POST /api/route` handler should return exactly `WalkingRoute`, so `useWalkingNavigation` works unchanged with `options.stepFree`.
4. **No `annotations=duration,distance`.** Per-step `distance`/`duration` already come with `steps=true`; the annotation payload would only duplicate them.
5. **Camera follow needed a real prop, so the map components grew one.** `onRegionChangeComplete` in react-native-maps 1.20 passes `(region: Region, details)` — *not* a `NativeSyntheticEvent` — so the component forwards the centre as a plain `LatLon` rather than leaking the event type across platforms.

**Design notes**

- **Instruction generation is name-agnostic.** The router does not know the destination, so the arrive step is stored as "You have arrived" and the destination is patched in at the display layer by `withDestinationName()`. That keeps one cached route reusable for any destination it was requested for, and the patch is idempotent.
- **Step boundaries are derived, not assumed.** OSRM step geometries concatenate into the route polyline, so `stepOffsets()` walks the polyline once, matching each step's first/last vertex forward-only, and memoises the result per step array. This keeps working when the router omits per-step geometry (see below), where every step degenerates to its maneuver point.
- **Hysteresis is symmetric.** A step only advances once the walker is 5 m *past* the maneuver, and the "next cue" flips 5 m *before* it — so a fix hovering on a boundary neither skips a step nor flickers between two cues.
- **Snapping is O(n) with a cached prefix sum.** Cumulative vertex distances live in a `WeakMap` keyed on the path array, so a fix every 2 s re-measures nothing; the per-segment projection uses a local equirectangular frame (sub-metre at campus scale).
- **A failed watch is not a failed navigation.** If `watchUserLocation` rejects, the route and step list stay on screen with an inline note instead of dropping to an error state — losing live progress shouldn't discard the route.
- **The re-route path never re-requests the location permission.** It re-routes from the fix that triggered it, so a mid-walk detour costs one router call, not a second permission round trip.
- **New tokens in `constants/colors.ts`:** `separator` (`#F0F2F0`), `surface`, `surfacePressed` — the three keys §13 asks for, added now because the new components need them and callers shouldn't branch on palette later.

**What the public OSRM demo actually returns** (checked live, NSUK gate → 1.57 km route):

| Field | Value | Consequence |
| --- | --- | --- |
| `steps[]` | 8 steps, distances summing to the full 1570 m | step list is complete |
| `steps[].geometry` | **absent** | each step is a single maneuver point; `stepOffsets()` matches those against the polyline instead |
| `steps[].name` | **empty for every step** | no "onto Faculty Rd" suffix in practice; the mapping is still implemented and unit-checked |
| `steps[].maneuver.location` | present | drives step boundaries |

Two consequences are worth remembering. First, a `continue` step with `modifier: "uturn"` is how the foot profile reports a U-turn — that needed an explicit case in both `describeManeuver` and `maneuverIcon`, or the sheet would have said "Continue" through a 180°. Second, because the demo has no per-step geometry, the live check confirmed the boundary matcher holds up: sampled at 0/25/50/75/99 % of the route, the step and cue indices advance monotonically and the final fix reports `remaining ≈ 0 m` with the cue on the arrive step.

**Verification**

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | ✅ clean (0 errors) |
| `npm run lint` | ✅ clean (0 errors, 0 warnings) |
| `npx expo export --platform web` | ✅ bundles |
| `npx expo export --platform ios` | ✅ bundles (native `watchPositionAsync` + map region path) |
| `snapToRoute` / `computeNavProgress` on a synthetic L-route | ✅ 34 assertions: origin/mid-leg/corner cue derivation, 5 m hysteresis holds at 3 m past a maneuver and releases by 12 m, remaining distance, off-route on both sides of the 30 m threshold, progress advancing past a corner, arrival at ≤ 15 m |
| Instruction table | ✅ `depart`/`turn` (all 6 modifiers)/`continue`/`new name`/`fork`/`roundabout`+exit/`arrive` all match the §4.1 table |
| `buildNavSteps` noise filter | ✅ sub-2 m middle steps dropped, first + last retained |
| `withDestinationName` | ✅ rewrites only the arrive step |
| Live OSRM round trip | ✅ 8 steps parsed, 61 coordinates, arrival fires at the last vertex |
| Walk a loop / forced detour / arrival on device | ⏸️ needs a device pass — see below |

> The geometry and instruction assertions were run with a throwaway `tsx` script, which was deleted afterwards. There is still no test runner in the project; promoting these to Jest lands with Feature 16, and `instructions.ts` + `geo-nav.ts` are already shaped for it (pure functions, no I/O).

**To verify by hand**

1. Open a campus, tap a building, press **Get Directions**. The sheet should switch to the progress bar + a cue (e.g. "Head east") and the step list should be present.
2. Walk the route. The cue should flip to the next maneuver as you approach it, one haptic per maneuver, and "in Xm" should count down.
3. Expand the steps list and confirm it auto-scrolls to the active row.
4. Diverge > 30 m and hold it for ~6 s. The sheet should show "Recalculating…", haptic once, and re-route from your current position.
5. Arrive within 15 m: success haptic, watch stops, sheet shows the arrived state.
6. Cancel mid-walk and re-open the sheet; the pre-route layout should return with no leftover state.
7. Toggle airplane mode before starting: directions should still work from the last known position and the step list should show synthesized cues.

---

## 5. Feature 5 — Accessible / step-free routing

### 5.1 Why a custom graph

OSRM/ORS foot profiles can't express "avoid stairs" or "use the ramp entrance". Since campus paths are internal anyway, build the graph server-side and run your own A* — full control over cost, gates, and entrances.

### 5.2 Schema

```ts
export const entrances = pgTable("entrances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  buildingId: varchar("building_id").notNull().references(() => buildings.id, { onDelete: "cascade" }),
  name: text("name"),                       // "Main ramp entrance"
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  hasRamp: boolean("has_ramp").notNull().default(false),
  hasSteps: boolean("has_steps").notNull().default(false),
  stepFree: boolean("step_free").notNull().default(true), // usable without climbing
  gated: boolean("gated").notNull().default(false),
  gateClosesAt: time("gate_closes_at"),     // e.g. "20:00"
});

export const pathNodes = pgTable("path_nodes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
});

export const pathEdges = pgTable("path_edges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fromNodeId: varchar("from_node_id").notNull().references(() => pathNodes.id),
  toNodeId: varchar("to_node_id").notNull().references(() => pathNodes.id),
  distanceM: doublePrecision("distance_m").notNull(),
  hasSteps: boolean("has_steps").notNull().default(false),
  hasRamp: boolean("has_ramp").notNull().default(false),
  covered: boolean("covered").notNull().default(false),   // sheltered
  surface: varchar("surface").default("paved"),           // paved|dirt|gravel
  lit: boolean("lit").notNull().default(true),
});
```

Graph is undirected — store each edge once, traverse both ways.

### 5.3 Graph service

```ts
// server/graph.ts
export interface RouteOptions { stepFree: boolean; avoidGatesAfter?: string; preferCovered?: boolean }

export async function buildGraph(opts: RouteOptions) {
  // 1. SELECT * FROM path_edges  (+ nodes)
  // 2. filter: if opts.stepFree → drop edges where has_steps = true
  // 3. cost = distanceM * multiplier(surface) * (covered ? 0.95 : 1)
  // 4. gates: if now > gateClosesAt → treat gated entrances as blocked
  // return { nodes: Map<id, {lat,lng}>, adj: Map<id, {to, cost, edgeId}[]> }
}

export function findPath(graph, fromNodeId, toNodeId): { nodeIds: string[]; geometry: LatLon[]; distanceM: number }
// A* with haversine heuristic
```

Nearest-node snapping for the user's raw GPS point and for each candidate entrance.

### 5.4 Entrance selection

```ts
// when stepFree: candidate entrances = entrances WHERE step_free AND buildingId = dest
// pick min cost from graph; route ends there, final step: "Arrive at Main ramp entrance"
// otherwise: nearest entrance regardless of flags
```

This is why `buildings.isAccessibleEntry` alone isn't enough — a building may have both a stair door and a ramp door.

### 5.5 API

```
POST /api/route
{ from: {lat,lng}, to: {lat,lng}, buildingId?, options: { stepFree: true } }
→ { geometry: LatLon[], steps: NavStep[], distanceM, durationS, entrance: {name, lat, lng} }
```

- Handler in `server/routes.ts` (finally non-empty): validate body with Zod (`insertRouteSchema`), build graph (cache the graph in memory, invalidate on admin edits), A*, return shaped exactly like `RouteResult` from Feature 4 — the client's `useWalkingNavigation` works unchanged with `options.stepFree`.
- Duration: `distanceM / 1.35` (≈1.35 m/s comfortable walking) — slightly slower than OSRM's assumption; keep OSRM for long inter-building trips where the public road network matters, custom graph for intra-campus.

### 5.6 UI

- **Toggle** in the bottom sheet under the distance pill — secondary button style from `style.md` (`borderWidth 1.5`, `#0B6623` border, `#E8F5E9` fill): 
  - inactive: `Footprints` icon + "Step-free route"
  - active: `Check` + "Step-free route on" + green fill
- Persist preference: `AsyncStorage` key `pref:stepFree` (default `false`), restored on mount; also mirrored to `profiles` when signed in.
- When active and no step-free path exists, show an inline warning row (`#E8F5E9` pill, amber text) — "No step-free path found; showing nearest entrance."
- Show the chosen entrance name in the final navigation step (Feature 4).

### 5.7 Data collection

`scripts/collect-paths.ts`: walk-campus tool that records `path_nodes`/`path_edges` from GPS traces + a small admin form (Feature 10) to flag steps/ramps per edge. Seed a first graph for the NSUK core loop.

**Deliverables:** step-free toggle honored end-to-end, entrance-aware arrival, admin-editable graph.

### ✅ §5 Implementation record

Most of §5 was already written before this pass; the pass fixed what stopped it from ever reaching the user.

| Item | Status | Where |
| --- | --- | --- |
| `entrances` / `path_nodes` / `path_edges` tables, `buildings.isAccessibleEntry`, `profiles.pref_step_free` | ✅ | `shared/schema.ts` |
| `insertRouteSchema` + `routeOptionsSchema` (`stepFree`, `preferCovered`, `avoidGatesAfter`) | ✅ | `shared/schema.ts` |
| Pure A\* engine — cost model, structural step-edge removal, gate filtering, admissible heuristic | ✅ | `lib/navigation/graph.ts` |
| DB loader + 15-min graph cache + `GraphUnavailableError` (503 + `Retry-After`) | ✅ | `server/graph.ts` |
| `POST /api/route` → 400 / 409 / 503, response re-validated before send | ✅ | `server/routes.ts` |
| Wire contract (`RouteEntrance`, `routeResponseSchema`) | ✅ | `lib/route-contract.ts` |
| Client resolution order: cache → graph (when step-free) → OSRM → stale → straight line | ✅ | `lib/routing.ts` |
| Cache key carries `stepFree` + campus + building | ✅ | `lib/route-cache.ts` |
| Nav hook threads `campusId` / `buildingId` / `stepFree` through a request-time ref | ✅ | `lib/navigation/useWalkingNavigation.ts` |
| Entrance name patched into the arrive step | ✅ | `lib/navigation/instructions.ts` → `withDestinationName` |
| Preference: AsyncStorage source of truth + `profiles` mirror | ✅ | `lib/prefs.ts` |
| Toggle, in-sheet warning row, re-route on toggle change | ✅ | `components/StepFreeToggle.tsx`, `app/map.tsx` |
| RLS: public read / admin write on all three graph tables | ✅ | `supabase/migrations/0003_path_graph.sql` |
| Seed graph: 10 nodes, 13 edges, 7 doors (incl. a gated one) | ✅ | `scripts/seed.ts`, `lib/data/path-graph-fallback.ts` |
| Survey tool | ✅ (file-based, by design) | `scripts/collect-paths.ts` |
| **Campus slug → uuid resolution on the server** | ✅ **this pass** | `server/graph.ts` → `resolveCampusRef()` |
| **`app/index.tsx` sends `selected.slug`, not `selected.id`** | ✅ **this pass** | `app/index.tsx` |
| **Column grant for `pref_step_free`** | ✅ **this pass** | `supabase/migrations/0003_path_graph.sql` |
| **Toggle hint corrected** ("Avoids stairs and ramps" → "Uses ramps and step-free entrances") | ✅ **this pass** | `components/StepFreeToggle.tsx` |

**The one blocking bug: slug and uuid were mixed across the link**

§2's stated rule is *"Routes carry slugs, foreign keys carry uuids"* — but nothing enforced it:

- `app/index.tsx` pushed `selected.id`, which is a **uuid** once Supabase is configured. `useCampus(slug)` then queried `.eq("slug", <uuid>)`, matched nothing, and `map.tsx`'s `campusMissing` overlay took over the screen. `server/graph.ts` was happy with that same uuid, but only by accident of the client sending the wrong thing for the right reason.
- In guest mode `selected.id` is the readable slug `"nsuk"`, the screen worked, and the server's `eq(path_nodes.campus_id, 'nsuk')` matched zero rows → `GraphNotSurveyedError` → 503 → swallowed by `routing.ts` → **step-free silently fell through to OSRM every time.**

One invariant now holds: `app/index.tsx` pushes `selected.slug`, `useCampus` looks up on slug, and `server/graph.ts` resolves slug-or-uuid → the uuid the graph tables are keyed on *before* consulting the graph cache, so both spellings share one cache entry and an already-canonical uuid still costs no query.

**Deliberate deviations from the plan**

1. **The A\* engine lives in `lib/navigation/graph.ts`, not `server/graph.ts`.** The plan put both in `server/`. Splitting it means the algorithm has no DB, Express or React import, so it runs unchanged in the offline bundle and in tests; `server/graph.ts` is only the loader and cache. `selectCandidates` / `routeOnGraph` / `attachEntrances` are the exports.
2. **`entrances.name` is `notNull` defaulting to `"Main entrance"`** (the plan had it nullable) and `path_nodes`/`path_edges` gained a nullable `campus_id` (not in the plan) so the survey is per-campus rather than one global graph.
3. **The graph is only consulted when `stepFree` is on** — which is what §5.6 implies for the UI and keeps §4's OSRM path untouched. See limitations below.
4. **`pathSurfaces` is an enum** (`paved`/`gravel`/`dirt`, not null) rather than a free `text` column, so the `SURFACE_FACTOR` cost model cannot silently read a typo as `undefined`.

**Known limitations (deliberately out of this pass's scope)**

- **Entrance-aware arrival only happens with the toggle on.** Because the graph is consulted only for step-free requests, `route.entrance` is `null` for every ordinary route, so `withDestinationName`'s entrance branch never fires there. §5.5's suggested distance split (graph intra-campus, OSRM for long trips) is not implemented.
- **The toggle lives in the pre-route sheet branch.** While navigating it is off-screen; you cancel to reach it (the re-route-on-toggle effect in `map.tsx` is already wired for when you do).
- **Guest mode + a live server degrades entrance selection.** The bundled fallback building ids (`nsuk-senate`) do not exist in the database, so `entrancesFor()` misses and the walk ends at the raw destination point. With Supabase configured the ids are uuids and door selection works. Step filtering still applies either way.
- **`stepFreeSatisfied` is false for a step-free route that reaches a raw point** (no surveyed door), so the warning row can fire on an edge-filtered route. Left alone: the final approach leg into the building really is unsurveyed, so claiming step-free would over-promise.
- **`collect-paths.ts --apply` is a stub** and `toSql` emits `path_nodes` only; edges are written by `scripts/seed.ts`.
- **`preferCovered` is fully wired server-side** (cost, cache key, validation) but has no client UI and is never sent.
- **`buildings.isAccessibleEntry` is never read by routing** — `entrances` is the authority, which is exactly §5.4's point.
- **`invalidateGraphCache` has no caller yet** (reserved for Feature 10), and `server/storage.ts` is now orphaned with nothing importing it.

**Verification**

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | ✅ clean (0 errors) |
| `npm run lint` | ✅ clean (0 errors, 0 warnings) |
| `npx expo export --platform web` | ✅ bundles (3137 modules) |
| M5: step-free excludes the stairs edge | ✅ `law→law-j→lib→ctr→court→ramp→senate`, `stair` never entered; `skippedStepEdges === 1` |
| M5: entrance name in the final step | ✅ `Arrive at Main ramp entrance` (vs `Stair door` when step-free is off) |
| M5: no-path warning cases | ✅ `origin-off-graph`, `empty-graph`, `unreachable`, `no-usable-entrance` all fail cleanly with a `reason` |
| A\* correctness | ✅ matches reference Dijkstra on all 100 node pairs × 4 option sets; heuristic proved admissible for every pair |
| Gates, wire contract, §4 progress integration | ✅ 85 checks passed, 0 failed (`scripts/tmp-graph-check.ts`) |
| Live round trip against Supabase | ⏸️ needs provisioning |

> The assertions above were run with `npx tsx scripts/tmp-graph-check.ts`, an existing scratch script. There is still no test runner in the project; promoting this to Jest lands with Feature 16.

**To activate (requires your Supabase account)**

```bash
cp .env.example .env      # DATABASE_URL, DIRECT_URL, EXPO_PUBLIC_* from §1
npm run db:push           # creates entrances + path_nodes + path_edges
npx supabase db push      # 0001/0002/0003 — RLS, and the pref_step_free grant
npm run db:seed           # idempotent: entrance + node + edge upserts
```

---

## 6. Feature 7 — Favorites, recent places & saved routes

### 6.1 Favorites table

```ts
export const favorites = pgTable("favorites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  buildingId: varchar("building_id").notNull().references(() => buildings.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [unique("favorites_user_building").on(t.userId, t.buildingId)]);
```

RLS from Feature 1 (`auth.uid() = user_id`) already scopes it. Requires sign-in — the heart button shows a "Sign in to save favorites" sheet for guests instead of failing.

### 6.2 Favorite toggle

```ts
// lib/api/favorites.ts
export function useFavorites() {
  return useQuery({
    queryKey: ["favorites"],
    queryFn: async () => { /* supabase select building_id from favorites */ },
    enabled: !!useAuth().session,
    staleTime: 60_000,
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (buildingId: string) => { /* upsert / delete */ },
    onMutate: async (buildingId) => {         // optimistic update
      await qc.cancelQueries({ queryKey: ["favorites"] });
      const prev = qc.getQueryData(["favorites"]);
      qc.setQueryData(["favorites"], (old) => toggleIn(old, buildingId));
      return { prev };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(["favorites"], ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ["favorites"] }),
  });
}
```

**UI:** `Heart` (lucide) in the bottom-sheet header next to `closeSheet` — 36×36 tile, `#F5F7F5` bg (matches `closeSheet` style), filled `#0B6623` + `Haptics.impactAsync(Medium)` when favorited.

### 6.3 Favorites screen

`app/favorites.tsx` (register in `app/_layout.tsx` Stack):
- Entered from a `Star` button added to the map top bar (`backButton` style, 44×44).
- Rows reuse `campusItem` styles from `index.tsx`: building icon tile, name, category caption, `ChevronRight`.
- Tap → `router.back()` + navigate to `/map` with `buildingId` param; `map.tsx` auto-selects it (`useEffect` on `buildingId` → `handleMarkerPress`).
- Empty state: centered `MapPin 48` + "No favorites yet" (`Inter_400Regular 14 #9E9E9E`).

### 6.4 Recent searches (no auth needed)

```ts
// lib/recent-searches.ts — AsyncStorage, capped at 10, most recent first
export async function pushRecent(building: { id, name, category })   // dedupe by id
export async function getRecents(): Promise<RecentItem[]>
export async function clearRecents()
```

Render in the search dropdown **above live results** under a "Recent" label when `searchQuery` is empty but the input is focused — reuse `searchResultItem` rows with a `Clock` icon. Clear button (`X`) at the label row's trailing edge.

Persist only after the user *selects* a result (not on every keystroke).

### 6.5 "Take me home"

- Store `home_lat`/`home_lng` on `profiles` (Feature 1); guests → AsyncStorage key `home:location`.
- Floating button on the map: same 44×44 `locateButton` style, `Home` icon, placed to the left of the locate button (adjust `topBar` to a 3-item row with `gap: 8`).
- Press → set `selectedMarker` to a synthetic marker at home with `title: "Home"`, then run existing `handleGetDirections`.
- Long-press → "Set home to current location" confirm dialog (only after `requestLocation()`).

**Deliverables:** heart toggle with optimistic UI, favorites screen, recents dropdown, one-tap home.

### ✅ §6 Implementation record

The map's existing single `[Locate]` top button became a `[Star][Home][Locate]` cluster; favorites and home both share the existing bottom sheet + navigation hook, so no new overlay states were needed.

| Item | Status | Where |
| --- | --- | --- |
| `favorites` table (`user_id` → profiles, `building_id` → buildings, unique pair, cascade deletes) | ✅ | `shared/schema.ts` |
| RLS `own favorites` (all operations, `auth.uid() = user_id`) | ✅ | `supabase/migrations/0004_favorites.sql` |
| `useFavorites` — PostgREST embedded `buildings` join, disabled for guests (→ `undefined`), 60s staleTime | ✅ | `lib/api/favorites.ts` |
| Optimistic `useToggleFavorite` — takes the full `Building` so the optimistic row is complete, rollback on error | ✅ | `lib/api/favorites.ts` |
| `toBuilding` exported for the join mapping | ✅ | `lib/api/campuses.ts` |
| Recents store — AsyncStorage, dedupe by id, cap 10, most recent first, persisted only on selection | ✅ | `lib/recent-searches.ts` |
| Home location — AsyncStorage source of truth + `profiles.home_lat/home_lng` mirror | ✅ | `lib/home-location.ts` |
| Favorites screen — guest CTA, loading/error/empty, rows with category caption, tap → recents + map | ✅ | `app/favorites.tsx`, `app/_layout.tsx` |
| `buildingId` param auto-selects its marker once on mount (one-shot ref against recreated navigation) | ✅ | `app/map.tsx` |
| Recents dropdown above live results ("Recent" label + clear `X`, `Clock` rows) when focused + empty query | ✅ | `app/map.tsx` |
| Heart in the sheet header (hidden unless the marker is a DB building); guest tap → "Sign in to save favorites" | ✅ | `app/map.tsx` |
| Home press → synthetic marker + `navigation.start()` (deferred one effect); long-press → confirm + `setHome` | ✅ | `app/map.tsx` |

**Deliberate deviations from the plan**

1. **Favorites navigates with `router.replace` + params — not `router.back()` + navigate.** Expo Router's `navigate` pops to the existing `/map` screen without re-reading params, so the `buildingId` auto-select would never re-fire. A replaced instance mounts fresh, reads the param, and selects. The map already renders from `params` (slug + lat/lng), so a bare deep link works the same way.
2. **The heart is gated on the marker being a DB building** (`buildings.some(b => b.id === marker.id)`), not on any selection. Guest/fallback markers are slugs (`nsuk-senate`) that never exist in `buildings`, so the synthetic "Home" marker and fallback data never show a heart that can't do anything.
3. **Guests still see the heart when a DB-backed building is selected** — it opens a "Sign in to save favorites" alert, which is the cleanest way to discover the feature without a session (§6.1 wanted it hidden).
4. **`useFavorites` returns `undefined` while disabled** rather than an empty array — lets the screen distinguish "signed out" (CTA) from "no favorites" (empty state).
5. **Home long-press reuses the locate flow**: it resolves `getCurrentUserLocation()` *then* confirms, so the saved point is always fresh and permission-gated. The header "ready" flag from `useHomeLocation` gates the press handler so a fast tap before the AsyncStorage read can't show a false "No home saved yet".

**Verification**

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | ✅ clean (0 errors) |
| `npm run lint` | ✅ clean (0 errors, 0 warnings) |
| `npx expo export --platform web` | ✅ bundles — favorites screen + heart/recents paths included |
| Typed routes regenerated | ✅ `/favorites` present in `router.d.ts` href unions (short-lived `expo start`; the §6.3 `router.push("/favorites")` and `router.replace({ pathname: "/map", ... })` calls typecheck) |

**To activate (requires your Supabase account)**

```bash
cp .env.example .env      # DATABASE_URL, DIRECT_URL, EXPO_PUBLIC_* from §1
npm run db:push           # creates the favorites table
npx supabase db push      # 0004 — favorites RLS policy
```

---

## 7. Feature 10 — Admin CMS / contribution workflow

### 7.1 Roles

- `profiles.role` (from Feature 1) + `app_metadata.role` claim for RLS.
- `lib/useRole.ts`: `const { role, isAdmin } = useRole()` reading `session.user.app_metadata.role`.
- Seed an admin: run `scripts/make-admin.ts <email>` → Supabase Admin API sets `app_metadata: { role: 'admin' }`.

### 7.2 Route protection (two layers — never client-only)

```tsx
// app/admin/_layout.tsx
export default function AdminLayout() {
  const { isAdmin, loading } = useRole();
  if (loading) return <LoadingScreen />;
  if (!isAdmin) return <Redirect href="/" />;   // UX gate
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

RLS (`admin write buildings` policy) remains the actual enforcement — a non-admin hitting the API directly gets zero rows changed.

### 7.3 Admin screens (in-app, web-first)

```
app/admin/
  _layout.tsx        # role gate
  index.tsx          # dashboard: counts, pending corrections
  buildings.tsx      # list + search + publish/unpublish
  buildings/new.tsx  # form
  buildings/[id].tsx # edit form
  corrections.tsx    # moderation queue
  import.tsx         # CSV / GeoJSON bulk import
```

Styling: reuse landing card (`styles.card`), input (`dropdown`), and button patterns; ship it as a separate web route on the existing deployment (no new project).

**Building form fields:** name, category (picker), lat/lng (with "use current location" and "pick on map" — map pick can be v2: numeric input + preview), description, aliases (comma-separated chip input), opening hours, icon picker (from the `MarkerIcon` set).

Validation with Zod (`insertBuildingSchema`) — errors rendered inline via `zod-validation-error` (already a dependency).

### 7.4 Mutations

```ts
// lib/api/admin.ts
export function useCreateBuilding()  // supabase insert + invalidate ["buildings", campusId]
export function useUpdateBuilding()  // update by id
export function useDeleteBuilding()  // soft delete preferred: deleted_at column
```

Every mutation: `onSuccess` → invalidate queries, `Haptics.notificationAsync(Success)`, toast.

### 7.5 CSV / GeoJSON import

- `lib/import/csv.ts`: small parser (handle quoted fields) → `z.array(importBuildingSchema).safeParse()`.
- `lib/import/geojson.ts`: parse `FeatureCollection` → map `properties.name/description/category`, `geometry.coordinates[0]` → `lng`/`lat`; reject non-Point features with a line-numbered error list.
- UI: file picker via `expo-image-picker` (already installed — `launchDocumentLibraryAsync`), preview table (first 10 rows), "Import N rows" → `supabase.from("buildings").insert(batch)` in chunks of 500.
- Errors shown per-row; successful import logs a row in `audit_log`.

### 7.6 Moderation (public corrections)

```ts
export const corrections = pgTable("corrections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  buildingId: varchar("building_id").references(() => buildings.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => profiles.id),
  field: text("field").notNull(),       // "lat" | "description" | ...
  newValue: text("new_value").notNull(),
  note: text("note"),
  status: varchar("status", { enum: ["pending","approved","rejected"] }).notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

- **Public side:** "Report wrong info" secondary button on the marker bottom sheet → modal (`index.tsx` modal styles) with field picker + value + note → insert (RLS allows own-row insert).
- **Admin side:** `app/admin/corrections.tsx` queue with Approve/Reject; approve applies the value to `buildings` inside a transaction and sets `status = 'approved'`.

### 7.7 Audit log

```ts
export const auditLog = pgTable("audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  actorId: varchar("actor_id"),
  action: text("action").notNull(),       // "building.update"
  entity: text("entity").notNull(),       // "buildings"
  entityId: text("entity_id"),
  diff: jsonb("diff"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

Write explicitly in each admin mutation (or a Postgres trigger `trg_audit_buildings` for belt-and-braces). Display read-only on the dashboard.

**Deliverables:** role-gated admin area, CRUD + import + moderation, audit trail.

### ✅ §7 Implementation record

The admin area is a normal Expo Router subtree at `app/admin/`, not a separate web surface. The plan's "web-first admin" is satisfied by every screen being plain React Native with no map dependency — they render identically on web and on device, which is what an admin carrying a phone around a campus actually needs.

| Item | Status | Where |
| --- | --- | --- |
| `buildings.deleted_at` (soft delete for unpublish) | ✅ | `shared/schema.ts`, `supabase/migrations/0005_admin_cms.sql` |
| `corrections` + `audit_log` tables, `insertCorrectionSchema`, `importBuildingSchema`, `markerIconNames` | ✅ | `shared/schema.ts` |
| `correctionFields` — the single whitelist of correctable columns | ✅ | `shared/schema.ts` |
| Correction RLS: insert own/`user_id is null`, read own, admin read + moderate | ✅ | `supabase/migrations/0005_admin_cms.sql` |
| Audit RLS: admin read, admin insert, **no** update/delete policy | ✅ | `supabase/migrations/0005_admin_cms.sql` |
| `trg_audit_buildings` — insert/update/delete with a per-column `changed` diff | ✅ | `supabase/migrations/0005_admin_cms.sql` |
| `trg_audit_corrections` — status transitions only | ✅ | `supabase/migrations/0005_admin_cms.sql` |
| `useRole` — reads `app_metadata.role` only, never `profiles.role` | ✅ | `lib/useRole.ts` |
| `npm run admin:grant` — Admin API writes `app_metadata`, mirrors `profiles.role`, `--revoke` | ✅ | `scripts/make-admin.ts`, `package.json` |
| `app/admin/_layout.tsx` — client-side gate, bounces non-admins, provider for the selected campus | ✅ | `app/admin/_layout.tsx` |
| `useAdminBuildings` (includes soft-deleted), `useAdminStats`, `useAdminAudit` | ✅ | `lib/api/admin.ts` |
| `useCreateBuilding`, `useUpdateBuilding`, `useSetBuildingPublished`, `useImportBuildings` (chunks of 500) | ✅ | `lib/api/admin.ts` |
| CSV parser — quoted fields, embedded commas/newlines, doubled quotes, BOM, CRLF, header aliases, per-row issues with 1-based file lines | ✅ | `lib/import/csv.ts` |
| GeoJSON parser — Point-only, `[lng, lat]` reordering, `properties` coercion, rejects other geometries by index | ✅ | `lib/import/geojson.ts` |
| Correction value coercion — one place, shared by the modal and the queue | ✅ | `lib/import/correction-values.ts` |
| `useSubmitCorrection` (guest-safe), `useCorrections` (joined to buildings), `useModerateCorrection` | ✅ | `lib/api/corrections.ts` |
| BuildingForm — create and edit share it, validated by `importBuildingSchema` | ✅ | `components/BuildingForm.tsx` |
| Dashboard — 3 stat tiles, 3 action rows, read-only audit list | ✅ | `app/admin/index.tsx` |
| Buildings list — search over name + aliases, publish toggle, unpublished rows greyed but visible | ✅ | `app/admin/buildings.tsx` |
| New / edit screens, edit screen carries its own publish toggle | ✅ | `app/admin/buildings/new.tsx`, `app/admin/buildings/[id].tsx` |
| Import screen — format tabs, paste area, review-then-commit, issues listed by line | ✅ | `app/admin/import.tsx` |
| Moderation queue — pending/approved/rejected tabs, now → proposed diff, validation warning, confirm-on-approve | ✅ | `app/admin/corrections.tsx` |
| Public "Report wrong info" in the marker sheet, only for DB buildings | ✅ | `app/map.tsx`, `components/ReportCorrectionModal.tsx` |
| Quiet admin link on the landing screen, admin-only | ✅ | `app/index.tsx` |
| `/admin` registered in the root `Stack` | ✅ | `app/_layout.tsx` |
| Public `useBuildings` excludes soft-deleted rows | ✅ | `lib/api/campuses.ts` |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` documented | ✅ | `.env.example` |

**Deliberate deviations from the plan**

1. **The trigger is the only writer to `audit_log`; the client writes nothing.** §7.7 offered "explicit writes *or* a trigger". Doing both would double every entry, and the trigger strictly sees more — it also captures edits made from the SQL editor or a script, and it computes the `changed` diff server-side where the old and new row are both to hand. `lib/api/admin.ts` documents this at the top so nobody re-adds the writes.
2. **Approval is two ordered writes, not one transaction.** A PostgREST client has no transaction, and the plan's "inside a transaction" was written for the Express-admin option that was dropped. The building update goes first; if it fails, the report stays `pending` and is retryable, rather than being marked `approved` against a value that never landed. Rejecting is a single write.
3. **No `apply_correction` RPC.** It would be the cleaner way to make approval atomic, but it needs `SECURITY DEFINER` plus its own admin guard, which is a second copy of the role check to keep in sync with the RLS policies. Two ordered writes with the failure ordering documented is a fair trade for one source of truth on "is this an admin".
4. **Import is paste-only, no file picker.** `expo-document-picker` is not installed and `expo-image-picker` cannot read a `.csv`. Drag-and-drop and paste both work on web, and the paste area is the same on device — the alternative was a dependency and a second path to a file the parser can't explain.
5. **The campus is a context in the admin layout, not a route param.** Every CMS screen works on one campus at a time and the import has no campus column, so the target is chosen once and remembered for the session. A query parameter would have to be threaded through every admin link, and it would put the staff tool on the public URL bar.
6. **Unpublished buildings stay in the admin list, greyed, rather than moving to an archive tab.** The operation people need most is undo, and a row that has left the screen can't be undone from it.
7. **`importBuildingSchema` rejects a blank coordinate instead of coercing it to `0`.** `z.coerce.number()` runs `Number("")` → `0`, so a spreadsheet row with an empty latitude would have imported a building at Null Island and validated cleanly. Found by the parser checks; `shared/schema.ts` now refuses blank first.
8. **Guest corrections are sent with `user_id: null`,** not the caller's id. The RLS insert policy accepts null deliberately, so a signed-in reporter and a guest produce the same row shape and nothing depends on the session being present.
9. **Event CRUD is out of scope.** There is no `events` table in §2, so §10 covers buildings, corrections, import and audit. Events would need the schema first.

**Verification**

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | ✅ clean (0 errors) |
| `npm run lint` | ✅ clean (0 errors, 0 warnings) |
| `npx expo export --platform web` | ✅ bundles — all 7 admin screens + the correction modal included |
| Typed routes regenerated | ✅ `/admin/*` present in `router.d.ts`; the `router.push` calls typecheck |
| Parser checks (32 assertions, throwaway script, since the repo has no test runner) | ✅ all pass — CSV quoting/BOM/CRLF/multiline fields/header aliases/bad rows, GeoJSON `[lng, lat]` ordering and non-Point rejection, correction coercion bounds |

**Not verified — needs a live database**

- `supabase/migrations/0005_admin_cms.sql` has never been executed. The `plpgsql` bodies, the `jsonb_each` join in the diff, and the RLS policies are unproven against a real Postgres.
- The audit trigger's interaction with the buildings write in the approval path is unexercised.
- `.env` service-role handling in `scripts/make-admin.ts` is unrun.
- No admin has ever opened the CMS.

**To activate (requires your Supabase account)**

```bash
npm run db:push            # buildings.deleted_at, corrections, audit_log
npx supabase db push       # 0005 — RLS policies + audit triggers
npm run db:seed            # only if seeding a fresh campus

npm run admin:grant you@example.com    # writes app_metadata.role = 'admin'
npm run admin:grant you@example.com -- --revoke
```

Then sign out and back in: `app_metadata` is baked into the JWT at sign-in, so a token minted before the grant will fail every policy until it is refreshed.

---

## 8. Feature 13 — Dark mode & dynamic theming

### 8.1 Theme tokens

```ts
// constants/colors.ts
export const palettes = {
  light: { /* existing keys, unchanged */ },
  dark: {
    text: "#E6EFE6",
    textSecondary: "#9FB09F",
    background: "#0E160E",
    backgroundSecondary: "#151F15",
    tint: "#4CAF50",           // lighter green — contrast on dark
    tintDark: "#0B6623",
    tintLight: "#123018",      // dark green surface (replaces #E8F5E9)
    accent: "#66BB6A",
    card: "#151F15",
    border: "#243224",
    shadow: "rgba(0,0,0,0.4)",
    white: "#0E160E",          // ⚠ semantic flips — see migration rules
    gray: "#7A877A",
    darkGray: "#B0BDB0",
    surface: "#1C281C",        // NEW: sheets, modals, inputs
    surfacePressed: "#22301F", // NEW: pressed state
    separator: "#212D21",      // NEW: replaces #F0F2F0
    danger: "#E57373",
  },
} as const;

export type ThemeName = keyof typeof palettes;
export type Theme = (typeof palettes)[ThemeName];
```

> Add the three missing keys (`surface`, `surfacePressed`, `separator`) to **both** palettes so callers don't branch.

### 8.2 ThemeProvider

```tsx
// components/ThemeProvider.tsx
type Mode = "system" | "light" | "dark";
const ThemeContext = createContext<{ theme: Theme; mode: Mode; setMode: (m: Mode) => void }>(...);

export function ThemeProvider({ children }) {
  const system = useColorScheme();               // "light" | "dark"
  const [mode, setMode] = useState<Mode>("system");
  useEffect(() => { AsyncStorage.getItem("theme:mode").then(v => v && setMode(v as Mode)); }, []);
  const scheme = mode === "system" ? (system ?? "light") : mode;
  const value = { theme: palettes[scheme], mode, setMode: (m) => { setMode(m); AsyncStorage.setItem("theme:mode", m); } };
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
```

Mount in `app/_layout.tsx` **inside** `ErrorBoundary`, wrapping the `Stack`:

```tsx
<ErrorBoundary>
  <QueryClientProvider ...>
    <ThemeProvider>
      <GestureHandlerRootView> ... <RootLayoutNav /> ... </GestureHandlerRootView>
    </ThemeProvider>
  </QueryClientProvider>
</ErrorBoundary>
```

Add `StatusBar` handling per screen: `barStyle={scheme === "dark" ? "light-content" : "dark-content"}` (landing keeps `light-content` always — green gradient is dark in both modes).

### 8.3 Migration rules for existing screens

Mechanical replacements — do screen by screen:

| Literal in code | Token |
| --- | --- |
| `#FFFFFF` (card/sheet/input bg) | `theme.surface` |
| `#F5F7F5` (screen bg / pressed) | `theme.backgroundSecondary` → pressed: `theme.surfacePressed` |
| `#1B2E1B` | `theme.text` |
| `#5A6B5A` | `theme.textSecondary` |
| `#0B6623` (icon/CTA) | `theme.tint` |
| `#E8F5E9` (pill/active bg) | `theme.tintLight` |
| `#D5E0D5` | `theme.border` |
| `#F0F2F0` | `theme.separator` |
| `#9E9E9E` | `theme.gray` |

- Styles can no longer live in a static `StyleSheet.create` with fixed colors — convert each screen to `const s = makeStyles(theme)` via `useMemo`, **or** keep `StyleSheet.create` for layout-only styles (position, radius, flex) and apply colors inline from `theme`. Recommended hybrid: `createStyles(theme)` memoized per screen.
- Files to convert (order): `constants/colors.ts` → `app/_layout.tsx` → `app/index.tsx` → `app/map.tsx` → `components/CampusMap.*` → `components/MarkerIcon.tsx` → admin/favorites screens → `components/ErrorFallback.tsx` (replace its duplicated ad-hoc theme with `useTheme()`).

### 8.4 Gradients

```ts
// landing + CTA in light:
["#054A14", "#0B6623", "#0D7A2B"]
// dark (subtler, less bloom on OLED):
["#04350E", "#064A15", "#07591A"]
```

Put in `constants/gradients.ts` as `GRADIENTS.brand.light/dark` and read from `useTheme()`.

### 8.5 Map styling

- **Native:** if the provider is Google (`PROVIDER_GOOGLE`), add `customMapStyle={require("../../assets/map-style-dark.json")}` when dark (generate at [mapsplatformstyler](https://mapstyle.withgoogle.com/)). Current code uses `PROVIDER_DEFAULT` (Apple Maps on iOS) — **Apple Maps has no custom style**, so either accept system-following light tiles or switch iOS to `PROVIDER_GOOGLE`. Document the choice in `style.md`.
- **Web:** `CampusMap.web.tsx` placeholder bg → `theme.backgroundSecondary`; the "open on your phone" copy stays.

### 8.6 System UI finishing touches

- `app.json`: keep `userInterfaceStyle: "automatic"`.
- `expo-splash-screen`: hide already handled; ensure `SplashScreen.hideAsync()` isn't blocked by theme loading (theme is AsyncStorage — load it before hiding, or accept a light flash).
- Status bar + navigation bar (Android): `expo-system-ui` already installed — `SystemUI.setBackgroundColorAsync(theme.background)`.

**Deliverables:** every screen legible in both schemes, user override persisted, no raw hex outside `constants/`.

### ✅ §8 Implementation record

| Area | Status | Where |
| --- | --- | --- |
| Palettes | ✅ | `constants/colors.ts` — `palettes.light` / `palettes.dark`, `ThemeName`, `Theme` |
| Provider | ✅ | `components/ThemeProvider.tsx` — `ThemeProvider`, `useTheme`, `useSystemBars` |
| Gradients | ✅ | `constants/gradients.ts` — `GRADIENTS.brand` / `GRADIENTS.action`, `brandGradient`, `actionGradient` |
| Screens | ✅ | All 4 public screens, all 6 admin screens, all 8 shared components |

**Deviations from the plan, and why**

1. **`white` was not flipped — `onTint` was added instead.** §8.1 proposed making `white` resolve to the background colour in dark mode so existing call sites would need no change. That does not survive contact with the code: every use of `white` in this app is a glyph or a label *sitting on* a green button, so flipping it puts near-black text on a near-black button. `white` stays literally white and `onTint` carries the "foreground on brand green" meaning. The compat shim that would have made the flip work at all — a default export of `palettes.light` that grows a `dark` sibling — was also removed rather than left behind, so nothing can regress into it.
2. **`makeStyles(theme)` factory instead of inline colour arrays.** §8.3 suggested a static `StyleSheet.create` plus inline overrides. With 256 colour references across 13 files, that would have meant rebuilding most of the style objects by hand. Instead each file's stylesheet became a factory called through `useMemo`, and colour rules moved to `theme.*` in place. Layout-only rules still live in a static `StyleSheet` inside the factory, so nothing is allocated per render beyond the registry.
3. **System bars are one context value, not a per-screen effect.** §8.6 called for `SystemUI.setBackgroundColorAsync(theme.background)`. The map, the admin list, and the two green-gradient screens all disagree about what that colour should be, and a parent effect racing a child effect picks the wrong winner on navigate-back. `useSystemBars` sets a single `systemBarColor` that the last-mounted screen owns and releases on unmount.
4. **`ErrorFallback` reads the OS scheme, not the context.** `ErrorBoundary` sits *outside* `ThemeProvider` in `app/_layout.tsx` so a provider crash is still caught — which means the context is unavailable exactly when the fallback renders. `useTheme()` returns the light palette instead of throwing for the same reason.
5. **`app/+not-found.tsx` was themed** even though it is a template file. It had a raw `#2e78b7` link colour, which was the last Windows-blue in the app.

**The one place raw colour values are still allowed**

Eight `rgba(255,255,255,0.0x)` literals remain across `app/index.tsx` and `app/(auth)/sign-in.tsx`. These are the decorative hero washes — soft circles and translucent panels over a brand gradient that is dark green in *both* schemes. They are not light/dark decisions, so a token would imply a distinction that does not exist. Both files carry a comment saying so. Everything else resolves through `theme.*`.

**Verification**

- `npx tsc --noEmit` — clean
- `npm run lint` — zero warnings, zero errors
- `npx expo export --platform web` — bundles (5.26 MB)
- Literal audit across `app/` and `components/` — 8 remaining, all documented above

**Not verified (needs a device)**

- Screenshots of every screen in both schemes, and the M6 contrast pass (≥ 4.5:1 for body text). Two spots to watch: `theme.warning` on `theme.surface` in the offline banner, and `theme.gray` on `theme.card` in the campus picker.
- The persisted override across a cold restart — `loadStoredMode` is awaited before the splash hides, but the flash it is meant to prevent has not been observed.
- An explicit in-app override that disagrees with the system: map tiles follow the OS (see `style.md` §Map) while our marker and route chrome follow the override. Known and accepted, not a bug.

---

## 9. Milestones & verification

| M | Features | Verify with |
| --- | --- | --- |
| **M0** | §0 shared refactors | `npm run lint`, `npx tsc --noEmit`, app behaves identically |
| **M1** | 1 | `db:push` succeeds; sign-in works on device + web; RLS blocks a non-admin write (test with anon key in SQL editor) |
| **M2** | 2 | Kill API → buildings still render; new building added in SQL shows on map after 5 min |
| **M3** | 3, 7, 10 | Airplane mode: cached buildings + last route appear; favorites survive restart; admin CSV import of 100 rows |
| **M4** | 4 | Walk a loop: steps advance, one forced detour triggers exactly one re-route, arrival fires at 15 m |
| **M5** | 5 | Step-free toggle excludes stairs edges; entrance name in final step; no-path warning case tested |
| **M6** | 13 | Screenshot every screen in both schemes; contrast ≥ 4.5:1 for body text |

**Cross-cutting checks per milestone:** `npm run lint` · `npx tsc --noEmit` · test on iOS/Android **and** web (the platform split in `CampusMap` means web regressions are easy to miss) · haptics on every new press target · safe-area + web insets on new absolutely positioned UI (per `style.md`).

**New dependencies introduced:** `@supabase/supabase-js`, `react-native-url-polyfill`, `@tanstack/react-query-persist-client`, `@tanstack/query-sync-storage-persister`, `@react-native-community/netinfo` — everything else reuses installed packages.
