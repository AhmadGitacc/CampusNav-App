# Deployment Guide — Backend + Android APK Build

This guide covers two things, **in this order**:

1. Deploying the Express backend (`server/`) so it is reachable over HTTPS.
2. Building a standalone Android APK that talks to that backend.

> **Order is load-bearing.** `EXPO_PUBLIC_*` variables are **inlined into the JS
> bundle at build time** by Metro (see `lib/query-client.ts` and
> `lib/supabase.ts`). The APK you ship will permanently point at whatever
> backend domain you configure *when you build it*. Deploy the backend first,
> then build the APK against it. Changing the domain later means rebuilding the
> APK.

---

## Part 1 — Backend Deployment

### 1.1 What the backend is

An Express 5 server (`server/index.ts`) that:

- Serves the API under `/api` (`server/routes.ts`): `GET /api/health`,
  `POST /api/route` (step-free campus-graph routing).
- Connects to **Supabase Postgres** through Drizzle (`server/db.ts`), using the
  **transaction pooler** (`DATABASE_URL`, port 6543) so it works on
  serverless/container hosts.
- In production mode, also serves the static Expo web build and landing page
  (not needed for the APK flow, but harmless).

### 1.2 Prerequisites

- Node.js 22+ (matches the `nodejs-22` module in `.replit`).
- A [Supabase](https://supabase.com) project.
- A hosting target with a **public HTTPS domain**, e.g.:
  - **Replit deployment** (already wired up in `.replit` → Cloud Run), or
  - Any container/VPS host: Render, Railway, Fly.io, Cloud Run, DigitalOcean,
    or a plain VPS behind nginx/Caddy.

### 1.3 Provision the database

1. In the Supabase dashboard, collect:
   - **Project URL + anon key** (Settings → API) → client-side variables.
   - **Service-role key** (Settings → API) → scripts only, never shipped.
   - **Transaction pooler URI** (Database → Connection string → URI, port
     **6543**) → `DATABASE_URL`.
   - **Direct connection URI** (port **5432**) → `DIRECT_URL`.
2. Create your env file:

   ```bash
   cp .env.example .env
   # fill in EXPO_PUBLIC_*, DATABASE_URL, DIRECT_URL, SUPABASE_*, PORT
   ```

3. Push the Drizzle schema (must use the **direct** connection):

   ```bash
   npm run db:push
   ```

4. Apply the SQL migrations under `supabase/migrations/` — these contain
   triggers, RLS policies, and functions that Drizzle cannot express. Paste
   each file into the Supabase **SQL Editor** in filename order, or pipe them
   through `psql` with your direct connection string:

   ```
   0001_auth_profiles.sql
   0002_campus_data.sql
   0003_path_graph.sql
   0004_favorites.sql
   0005_admin_cms.sql
   ```

5. Seed campus data and (optionally) grant yourself admin:

   ```bash
   npm run db:seed        # campuses, buildings, path graph
   npm run admin:grant    # requires SUPABASE_SERVICE_ROLE_KEY
   ```

   `npm run admin:grant` writes `app_metadata.role = "admin"`; sign out and back
   in afterward so the claim is baked into a fresh JWT.

### 1.4 Environment variables (server)

| Variable | Purpose | Notes |
|---|---|---|
| `PORT` | Listen port | Defaults to `5000` if unset. |
| `DATABASE_URL` | Postgres pooler URI | Port **6543**. TLS is required; `server/db.ts` sets `rejectUnauthorized: false` for the pooler's self-signed cert. |
| `DIRECT_URL` | Postgres direct URI | Port **5432**. Only used by `npm run db:push` (drizzle.config.ts). |
| `SUPABASE_URL` | Supabase project URL | Scripts only (`admin:grant`). |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin API key | Scripts only. **Never** bundle into the app. |
| `REPLIT_DOMAINS` / `REPLIT_DEV_DOMAIN` | CORS allow-list | Read by `setupCors` in `server/index.ts`. |

> **CORS note for the APK:** native Android (React Native) requests do not send
> an `Origin` header, so the CORS middleware lets them through untouched — no
> extra configuration is required for the APK itself. The allow-list only
> matters for browser (web) clients. If you later host the web build on your own
> domain, add it to the allow-list or to `REPLIT_DOMAINS`.

### 1.5 Build and run

```bash
# Bundle the server with esbuild → server_dist/
npm run server:build

# Run the production bundle
NODE_ENV=production node server_dist/index.js
```

On Replit / Cloud Run this is already encoded in `.replit`:

```
build: npm run expo:static:build && npm run server:build
run:   npm run server:prod
```

For a VPS, run it under a process manager, e.g.:

```bash
npm run server:build
npm install -g pm2
NODE_ENV=production pm2 start server_dist/index.js --name campusnav
```

…and terminate TLS in front of it (Caddy or nginx + Let's Encrypt). The server
binds `0.0.0.0` and only needs one port (default `5000`).

### 1.6 Verify the deployment

```bash
curl https://your-backend-domain/api/health
# → {"ok":true}
```

`/api/health` is the authoritative liveness check. For the routing endpoint:

```bash
curl -X POST https://your-backend-domain/api/route \
  -H "Content-Type: application/json" \
  -d '{ "from": { "lat": 9.1, "lng": 7.7 }, "campusId": "...", ... }'
```

Expected outcomes:

| Response | Meaning |
|---|---|
| `200` with a route payload | Healthy, graph loaded. |
| `409` | Graph is fine; those two points aren't connected. |
| `503` + `Retry-After: 60` | Graph unprovisioned — the client falls back to public OSRM. Check that `npm run db:seed` loaded the path graph and `DATABASE_URL` is set. |
| `500` | Usually `DATABASE_URL` missing/wrong — check server logs. |

The app degrades gracefully if the backend is down (OSRM fallback + persisted
offline cache), but **step-free routing and the admin CMS require a live
backend**.

---

## Part 2 — Android APK Build

The project is a **bare Expo** app: there is no `android/` directory and no
`eas.json` in the repo yet. You have two options.

### 2.1 Before you build — checklist

- [ ] Backend deployed and `https://your-backend-domain/api/health` returns `{"ok":true}`.
- [ ] `app.json` → `expo.android.package` changed from the placeholder
      `com.myapp` to your real application id (e.g. `com.nsuk.navigator`).
      **Changing it after first publish is a breaking change** (Android treats
      it as a different app).
- [ ] `app.json` → `expo.version` and an Android `versionCode` set (bump
      `versionCode` for every release you want Android to treat as an upgrade).
- [ ] `expo-location` added to `plugins` in `app.json` with a
      `locationWhenInUse` permission message — navigation needs location, and
      standalone builds must declare the permission explicitly:

      ```json
      ["expo-location", {
        "locationWhenInUsePermission": "Allow NSUK Navigator to use your location for campus navigation."
      }]
      ```

- [ ] You know the three `EXPO_PUBLIC_*` values to bake in:
  - `EXPO_PUBLIC_DOMAIN` — backend host, **no protocol** (e.g.
    `campusnav.example.com`). `lib/query-client.ts` prepends `https://` itself.
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`

  These are safe to embed in the APK (Supabase RLS protects the data); the
  service-role key must **never** appear in any client build.

### 2.2 Option A — EAS Build (recommended, no local Android SDK)

EAS runs the build in Expo's cloud and handles signing.

1. Install and log in:

   ```bash
   npm install -g eas-cli
   eas login
   ```

2. Create `eas.json` at the repo root:

   ```json
   {
     "cli": { "version": ">= 12.0.0" },
     "build": {
       "preview": {
         "distribution": "internal",
         "android": { "buildType": "apk" },
         "env": {
           "EXPO_PUBLIC_DOMAIN": "your-backend-domain.example.com",
           "EXPO_PUBLIC_SUPABASE_URL": "https://your-project-ref.supabase.co",
           "EXPO_PUBLIC_SUPABASE_ANON_KEY": "your-anon-key"
         }
       },
       "production": {
         "android": { "buildType": "app-bundle" },
         "env": {
           "EXPO_PUBLIC_DOMAIN": "your-backend-domain.example.com",
           "EXPO_PUBLIC_SUPABASE_URL": "https://your-project-ref.supabase.co",
           "EXPO_PUBLIC_SUPABASE_ANON_KEY": "your-anon-key"
         }
       }
     }
   }
   ```

   `preview` produces the **APK** you asked for; `production` produces an
   `.aab` for Play Store submission.

3. Run the build:

   ```bash
   eas build -p android --profile preview
   ```

4. When it finishes, EAS prints a download URL — that file is your APK.
   EAS-managed signing is fine for internal distribution; for Play Store,
   upload your own keystore via `eas credentials`.

### 2.3 Option B — Local build (requires Android SDK + JDK 17)

1. Install the env vars, then generate native projects:

   ```bash
   # .env must contain the EXPO_PUBLIC_* values from 2.1
   npx expo prebuild -p android --clean
   ```

2. Build the release APK:

   ```bash
   cd android
   ./gradlew assembleRelease        # Windows: gradlew.bat assembleRelease
   ```

   Output: `android/app/build/outputs/apk/release/app-release.apk`

3. The default Gradle build is signed with a debug-style keystore; for
   distribution, configure a release keystore in
   `android/app/build.gradle` (`signingConfigs`).

### 2.4 Install and verify on a device

```bash
adb install app-release.apk
```

Verification checklist on-device:

1. App boots (splash → home) — proves the `EXPO_PUBLIC_*` values were baked in
   correctly (a missing `EXPO_PUBLIC_DOMAIN` on native throws at first API
   call; missing Supabase keys degrade to guest mode).
2. Tap a route request — if the backend is live you get a step-free campus
   route; if it's down you get the OSRM fallback (check `adb logcat` for
   `503` / network errors).
3. Kill the network, relaunch — previously fetched campuses/buildings should
   render from the persisted React Query cache (offline-first behaviour).

### 2.5 Rebuilding rules

- Change `EXPO_PUBLIC_DOMAIN` or any `EXPO_PUBLIC_*` value → **rebuild** the
  APK. They are compile-time constants.
- Backend-only changes (routes, graph, DB) → **no rebuild needed**; the APK
  picks them up on the next request.
- There is no `expo-updates` OTA channel configured, so any JS change also
  requires a new APK build.

---

## Quick reference — npm scripts

| Script | What it does |
|---|---|
| `npm run server:dev` | Dev API on port 5000 (tsx, watch) |
| `npm run server:build` | esbuild production bundle → `server_dist/` |
| `npm run server:prod` | Run the production bundle |
| `npm run db:push` | Push Drizzle schema (uses `DIRECT_URL`) |
| `npm run db:seed` | Seed campuses/buildings/graph |
| `npm run admin:grant` | Grant admin via `app_metadata` (service-role key) |
| `npx expo prebuild -p android` | Generate `android/` for local builds |
| `eas build -p android --profile preview` | Cloud-build the APK |
