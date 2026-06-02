# Mobile App Design (React Native + Expo)

Engineering design for the **native iOS/Android client** of Home Meal Planner.
This is the source of truth for the mobile build. It defers to
[`01_database_design.md`](01_database_design.md) for schema and
[`04_api_design.md`](04_api_design.md) for the API contract — the mobile client
**consumes the existing API**, it does not reimplement domain logic.

The phased task list that delivers this design lives in
[`../MOBILE_IMPLEMENTATION_TRACKER.md`](../MOBILE_IMPLEMENTATION_TRACKER.md)
(phases `M0`–`M3`).

## 1. Why a native app

Users have asked for installable App Store / Play Store apps, not a mobile web
page. The backend is already prepared for this:
[`04_api_design.md` § 1](04_api_design.md) states the route-handler paths are
"the stable URL contract (also used by a future mobile client)", and
[`02_system_architecture.md` § Future scaling](02_system_architecture.md) calls
out adding "a mobile client against the same API". The mobile app reuses that
surface verbatim.

### Goals

- Native iOS + Android apps with **full feature parity** with the web app: auth,
  onboarding, today, week plan, grocery, household + invites, notifications,
  settings.
- Native push notifications.
- App Store + Play Store distribution.

### Non-goals (v1)

- Admin / operator tooling — stays web-only (see
  [`../docs/06_admin_operator_spec.md`](../docs/06_admin_operator_spec.md)).
- Offline-first **writes** — v1 caches reads only; mutations require connectivity.
- Reimplementing any business logic on-device — the engine, permissions, and
  validation remain server-side and RLS-enforced.

## 2. Architecture

```
┌─────────────────┐     HTTPS (Bearer JWT)      ┌──────────────────┐
│  Mobile app     │ ──────────────────────────► │  Next.js /api/*  │
│  (Expo / RN)    │                             │  (route handlers)│
│                 │  Supabase Auth SDK (login)  └────────┬─────────┘
│                 │ ──────────────────────────►          │ RLS
└─────────────────┘            Supabase Auth     ┌────────▼─────────┐
                                                 │  Supabase / PG   │
                                                 └──────────────────┘
```

The backend is a **shared service layer**: the app talks to the same route
handlers the web app's client components call, and authenticates against the same
Supabase project. No new app servers.

### Monorepo (npm workspaces)

The repo becomes a lightweight monorepo so the app can share pure TypeScript
without copy-paste, while the Next.js app stays exactly where it is today.

```
mealmenuplanner/
├── app/ lib/ components/ ...   # existing Next.js web app (unchanged location)
├── packages/
│   └── shared/                 # NEW — pure, platform-agnostic TypeScript
│       ├── recommendation/     # re-export of lib/recommendation (see note)
│       ├── types/              # shared domain types / DTO shapes
│       └── validation/         # pure validators (no I/O, no server-only)
├── mobile/                     # NEW — Expo app
│   ├── app/                    # expo-router screens
│   ├── src/api/                # typed HTTP client → /api/*
│   ├── src/auth/               # Supabase Auth + secure token storage
│   └── ...
└── package.json                # workspaces: ["packages/*", "mobile"]
```

**Risk control:** in `M0`, `packages/shared` **re-exports** `lib/recommendation`
rather than physically moving it. The recommendation engine is pure and
deterministic (no `server-only`), so it is safe to import from the app; keeping
it in place means **no web imports change**. A physical move into
`packages/shared` is an optional later cleanup, not a blocker.

> Anything marked `"server-only"` (the entire `lib/services/*` layer, auth
> guards, the Supabase server/service-role clients) **must not** be imported by
> the app — it depends on `next/headers` and the Node/edge server context. The
> app reaches that logic only over HTTP.

## 3. Auth design

The app authenticates **directly with Supabase Auth** via
`@supabase/supabase-js` (already a dependency), then attaches the resulting JWT
to every API call.

- **Session storage:** `expo-secure-store` (iOS Keychain / Android Keystore) as
  the Supabase client's storage adapter, so the session persists securely across
  launches.
- **Methods:**
  - email/password — `signInWithPassword`
  - magic link / OTP — `signInWithOtp`
  - Google OAuth — `expo-auth-session` + `expo-web-browser`, with a deep-link
    redirect (`myapp://auth-callback`).
- **API authentication:** every request to `/api/*` sends
  `Authorization: Bearer ${session.access_token}`.

### Required backend change (the only edit to existing code)

Route handlers currently resolve the user from **cookies only** —
`createServerSupabaseClient()` in [`../lib/db/server.ts`](../lib/db/server.ts)
seeds the client from `cookies()`. A mobile request carries no auth cookies, so
it would resolve as unauthenticated.

The fix is additive and minimal: have `createServerSupabaseClient()` also read
the incoming `Authorization` header (via `headers()` from `next/headers`) and,
when a bearer token is present, pass it through `global.headers.Authorization`
on `createServerClient`. That single header makes **both**
`supabase.auth.getUser()` (used by
[`../lib/auth/session.ts`](../lib/auth/session.ts) `getAuthUser`) and
PostgREST/RLS resolve the mobile user's JWT.

```ts
// sketch — inside createServerSupabaseClient()
const hdrs = await headers();
const authz = hdrs.get("authorization") ?? undefined; // "Bearer <jwt>"
return createServerClient<Database>(url, anonKey, {
  ...(authz ? { global: { headers: { Authorization: authz } } } : {}),
  cookies: {
    /* unchanged getAll / setAll */
  },
});
```

Properties:

- **Zero web behavior change.** Cookies remain the path for browser requests;
  the header path only engages when an `Authorization` header is present.
- **No `proxy.ts` change.** The edge proxy
  ([`../proxy.ts`](../proxy.ts)) only does cookie refresh + HTML redirect gating.
  Its matcher does still run on `/api/*`, but `/api` is not in its protected
  prefixes, so it attempts a cookie-based `getUser()` (finds no session) and
  falls straight through without redirecting — a harmless no-op for header-auth
  requests.
- **Defense-in-depth intact.** Permission `can_*` checks, active-membership
  checks, and RLS all run exactly as before — they key off the resolved user,
  regardless of how the JWT arrived.

This contract is documented in
[`04_api_design.md`](04_api_design.md) (`M0-5`).

## 4. API client (`mobile/src/api/`)

A thin, typed `fetch` wrapper — not a generated SDK — that mirrors the web app's
conventions:

- **Auth:** injects `Authorization: Bearer ${access_token}` on every call.
- **Base URL:** configurable — prod (`https://mymealtoday.com`) and a dev
  override for the local clone (`:3100` / `:3000`).
- **Envelope handling:** unwraps the success envelope (single resource, or
  `{ data, page }` for collections per
  [`04_api_design.md` § 1](04_api_design.md)).
- **Error mapping:** maps the uniform error envelope
  `{ error: { code, message, details } }` to typed errors mirroring the
  [`../lib/errors`](../lib/errors) codes: `VALIDATION_ERROR`, `UNAUTHENTICATED`,
  `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL`. On
  `UNAUTHENTICATED` the app attempts a Supabase token refresh, then re-auths.
- **Idempotency:** generates and sends an `Idempotency-Key` (UUID v4) on the
  generation endpoints (`meal-plans/today/generate`, `meal-plans/week/generate`,
  `grocery-list/regenerate`) and **reuses the same key on retry**, per
  [`04_api_design.md` § 3](04_api_design.md). ⚠️ **Backend prerequisite:** that
  contract is documented but **not yet implemented** — no route handler currently
  reads the header — so a flaky-connection retry is **not** replay-protected
  today and can create duplicate plans/lists. Implementing it server-side is a
  hard prerequisite, tracked as `M0-8`. The client sends the key from day one
  (forward-compatible) but must not assume dedup until `M0-8` lands.
- **Pagination:** passes `limit` / `cursor`, reads `page.nextCursor` /
  `page.hasMore`.

**Server-state:** TanStack Query handles caching, retries, background refetch,
and a read cache for graceful offline viewing.

## 5. UI

- **Components:** React Native core components + **NativeWind** so Tailwind
  styling intent carries over from the web app. **No Base UI** — it is web-only.
- **Icons:** `lucide-react-native` (web uses `lucide-react`).
- **Navigation:** `expo-router` (file-based), with a bottom tab bar for the
  primary surfaces (Today / Week / Grocery / Household / More).
- **Toasts/feedback:** a React Native toast lib (web uses `sonner`).

## 6. Screen ↔ endpoint map (full parity)

The app calls the existing endpoints; no new backend routes are needed beyond the
auth change and the push-token endpoint (§7).

| Area          | Screens                                                                                  | Endpoints                                                                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth          | sign in / sign up / magic-link / Google                                                  | Supabase Auth SDK (direct)                                                                                                                                          |
| Onboarding    | multi-step, autosave + resume (see [`06_onboarding_design.md`](06_onboarding_design.md)) | `POST` / `GET /api/onboarding/draft`, `POST /api/onboarding/complete`, catalog endpoints (dishes / combinations / accompaniments)                                   |
| Today         | view; accept / reject; swap; suggest-another; lock / unlock; eating-out; cooked          | `POST .../meal-plans/today/generate`, `GET /api/meal-plan-items/{id}/candidates`, accept / reject / replace / lock / unlock / eating-out / cooked / suggest-another |
| Week          | weekly plan view                                                                         | `POST .../meal-plans/week/generate`, plan reads                                                                                                                     |
| Grocery       | list view; check off items; regenerate                                                   | `GET .../grocery-list`, `POST .../grocery-list/regenerate`, `PATCH /api/grocery-list-items/{id}`                                                                    |
| Household     | members; roles / permissions; create / delete; preferences; food / dish prefs            | households + preferences + members + food-preferences + dish-preferences endpoints                                                                                  |
| Invites       | create; view; accept; decline                                                            | `POST /api/households/{householdId}/invites` (create), `GET /api/invites/{token}` (view), `.../invites/{token}/accept`, `.../invites/{token}/decline`               |
| Notifications | list; mark read; read-all; preferences; **push**                                         | notifications endpoints + push registration (§7)                                                                                                                    |
| Settings      | profile; household switcher; sign out                                                    | mixed                                                                                                                                                               |

Domain rules are enforced server-side and surfaced through the API, so the app
just renders them:

- **Chosen dishes are exclusive** — recommendations / "try another" are already
  hard-filtered to the household's built list server-side.
- **Prep-aware suggestions** — dishes needing advance prep that can't finish in
  time are filtered out before the app sees them.
- **Variety rotation** — no repeats within `variety_gap_days` unless explicitly
  requested.
- **Explainable reasons** — each suggestion returns a short human-readable reason
  the app displays verbatim.

## 7. Push notifications (native) — Phase M3

The web app sends email + in-app notifications
([`09_notifications_design.md`](09_notifications_design.md)). The app adds native
push via **Expo Push**, additively:

- **Registration:** after sign-in, `expo-notifications` obtains an Expo push
  token; the app upserts it server-side.
- **New backend surface:**
  - a `device_tokens` table (migration under
    [`../supabase/migrations/`](../supabase/migrations/), applied to cloud dev
    via the Supabase MCP `apply_migration`), keyed to `user_id` with
    `{ token, platform }` and RLS so a user only manages their own tokens;
  - `POST /api/notifications/device-tokens` to upsert the current user's token.
- **Dispatch:** extend the notifier
  ([`09_notifications_design.md`](09_notifications_design.md)) with an **Expo Push
  adapter** so the same events that fan out email / in-app also push. Email and
  in-app channels stay intact — this is purely additive.

## 8. Distribution

- **Build:** Expo + **EAS Build** with managed credentials (no local Xcode /
  Android Studio required to produce store builds).
- **Accounts:** Apple Developer Program ($99/yr) and Google Play Console ($25
  one-time) — not yet set up; tracked as `M3-4`.
- **Rollout:** dev build on a real device → TestFlight + Play internal testing →
  public submission.
- **Privacy:** the app handles sensitive dietary data. Reuse the existing privacy
  stance from
  [`../docs/10_security_privacy_permissions.md`](../docs/10_security_privacy_permissions.md)
  — dietary **preferences** framing, no medical claims, medical disclaimer for
  health tags — and complete the App Store privacy labels / Play data-safety form
  accordingly.

## 9. Verification

- **Backend auth change:**
  - Vitest in [`../lib/db/`](../lib/db/): a request carrying a valid bearer token
    resolves a user; one without resolves none / 401s.
  - CI gates (`npm run lint`, `typecheck`, `test`, `format:check`).
  - Manual: `curl` `GET /api/households` with `Authorization: Bearer <token>`
    vs. without, against the `:3100` clone; confirm 200-with-data vs. 401.
  - Confirm the **web app still works** — the cookie path is unchanged.
- **Mobile (per phase):** run an Expo dev build on a real device pointed at the
  `:3100` clone and at prod; walk each flow end-to-end — sign in, complete
  onboarding (kill + reopen the app to prove **resume**), generate today's plan,
  accept / reject / swap a meal, check off groceries, manage a household + send
  an invite, read notifications. Confirm error envelopes surface as friendly
  messages and that the idempotency key prevents duplicate plans on a
  flaky-network retry.
- **Push (M3):** trigger a prep-reminder / plan event; confirm a push arrives on
  device and that email + in-app still fire.
- **Store builds:** EAS build succeeds for both platforms; the app installs via
  TestFlight and Play internal testing.

> **Environment notes.** This machine has no Docker, so there is no local
> Supabase stack — verify against **cloud dev**. Pushing to `main` does **not**
> deploy; test the surface that actually runs the latest code (the `:3100` clone
> for this tree).
