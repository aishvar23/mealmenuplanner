# Mobile Implementation Tracker

Targeted, trackable tasks for building the **native iOS/Android app** (React
Native + Expo) for Home Meal Planner. Tasks reference the mobile design doc that
specifies them, [`design/10_mobile_app_design.md`](design/10_mobile_app_design.md),
and reuse the existing `/api/*` backend.

This tracker is separate from the web build's
[`IMPLEMENTATION_TRACKER.md`](IMPLEMENTATION_TRACKER.md). Phases are `M0`–`M3`.

## How to use

- Every task has a stable ID (e.g. `M1-3`). To work on something, just say
  **"work on M1-3"** (or a range like "M0-1..M0-7") and that scopes the work.
- Tick a box (`[ ]` → `[x]`) when a task is **done and verified**; use `[~]` for
  in progress. Keep the **Progress summary** counts in sync.
- `Design` references point to the section of
  [`design/10_mobile_app_design.md`](design/10_mobile_app_design.md) a task
  implements. The database schema in
  [`design/01_database_design.md`](design/01_database_design.md) remains the
  source of truth for names.

### Status legend

| Marker | Meaning                   |
| ------ | ------------------------- |
| `[ ]`  | Not started               |
| `[~]`  | In progress               |
| `[x]`  | Done & verified           |
| `[!]`  | Blocked (note why inline) |

## Progress summary

| Phase | Area                       | Done / Total | Status      |
| ----- | -------------------------- | ------------ | ----------- |
| M0    | Foundations & backend auth | 8 / 8        | Complete    |
| M1    | Auth + core daily loop     | 7 / 7        | Complete    |
| M2    | Full parity                | 6 / 6        | Complete    |
| M3    | Native push + store launch | 3 / 7        | In progress |
| M4    | Meal Provider Workspace    | 0 / 14       | Planned     |
|       | **Total (M0–M3)**          | **24 / 28**  |             |

> **M4 (Meal Provider Workspace) is tracked as Track C, not M-IDs.** Per **ADR-17**,
> the mobile provider screens are built **in lockstep with web — same PR** — so they
> are driven by the same ADO work items (Epic **#15**, Issues #16+) and the **Track C**
> task list in
> [`design/planning/meal-provider/05_two_developer_implementation_tracker.md`](design/planning/meal-provider/05_two_developer_implementation_tracker.md)
> (MP-C-000 … MP-C-070), **not** by new `M4-*` IDs here. This row exists only so the
> mobile tracker reflects that provider parity is in scope; see the M4 note below.

**Status:** all _codeable_ work is complete — the daily loop + full parity (M0–M2)
and native-push plumbing (M3-1/2/3) plus the EAS build config (M3-5 scaffolding,
`eas.json`). The remaining tasks are **account-bound and can't run from this
environment**: `M3-4` (Apple/Google accounts), the rest of `M3-5` (`eas login` +
`eas init` to mint the EAS `projectId` + signing credentials), `M3-6` (TestFlight /
Play internal builds via `eas build`), and `M3-7` (store listings + submission).
Once `eas init` injects `extra.eas.projectId`, push registration (M3-3) starts
minting tokens automatically.

> **Backend reads added for M1.** The web app reads plans / household lists /
> the grocery screen server-side in React Server Components, so those had no HTTP
> routes. M1 added thin, additive, member-gated GET routes the mobile client
> needs (zero web change, documented in `design/04_api_design.md`):
> `GET /api/households`, `GET …/meal-plans/today`, `GET …/meal-plans/week`, and
> `GET …/grocery-list/current`. All reuse existing services + have route tests.

---

## M0 — Foundations & backend auth

> Design: §2 (architecture / monorepo), §3 (auth / backend change), §4 (API
> client).

- [x] **M0-1** Convert repo to npm workspaces; add `packages/shared` and
      `mobile` workspaces (root `package.json`). No web behavior change.
- [x] **M0-2** `packages/shared`: re-export `lib/recommendation`; expose shared
      domain types and pure validators (nothing `server-only`).
- [x] **M0-3** Backend: add bearer-token auth in `lib/db/server.ts` — read the
      `Authorization` header and pass it through `global.headers`, alongside the
      existing cookie path. No web regression.
- [x] **M0-4** Test: Vitest in `lib/db/` proving a bearer token resolves a user
      and an unauthenticated request 401s; run all CI gates (`lint`, `typecheck`,
      `test`, `format:check`).
- [x] **M0-5** Document the bearer-auth contract in
      `design/04_api_design.md`.
- [x] **M0-6** Scaffold the Expo app under `mobile/` (expo-router, NativeWind,
      TanStack Query, base navigation shell). _Done: SDK 56 app; expo-router
      file-based nav with an auth gate + bottom tabs (Today/Week/Grocery/
      Household/More); NativeWind 4 + monorepo-aware Metro; `QueryClient`. Mobile
      `tsc` clean; `expo config` resolves. Device run deferred (no emulator here)._
- [x] **M0-7** Wire the Supabase client in the app with an `expo-secure-store`
      session adapter; build the typed API client (`mobile/src/api/`) with envelope
      unwrapping, error mapping, and idempotency-key support. _Done: Supabase
      client + chunked SecureStore adapter (handles the 2KB limit) + `AuthProvider`;
      `apiRequest`/`getCollection` inject the bearer token, unwrap envelopes, map
      the error envelope to typed `ApiError`, refresh-and-retry once on 401, and
      send a reusable `Idempotency-Key`._
- [x] **M0-8** Implement the `Idempotency-Key` contract from
      `design/04_api_design.md` §3 server-side — the three generation handlers
      (`meal-plans/today/generate`, `meal-plans/week/generate`,
      `grocery-list/regenerate`) currently ignore the header, so mobile retries are
      not replay-protected. Read + persist the key, replay within the 24h window,
      and `409 idempotency_key_reused` on reuse with a different body. Backend
      prerequisite for safe mobile retries (`M0-7`). _Done: `idempotency_keys`
      table (migration `20260602120000`, applied to cloud dev, RLS member-scoped);
      `lib/services/idempotency` (`withIdempotency`) wired into all three handlers;
      15 unit tests._

## M1 — Auth + core daily loop

> Design: §3 (auth), §6 (Today / Week / Grocery).

- [x] **M1-1** Sign in / sign up / magic-link screens; secure session
      persistence and refresh. _Done: `(auth)/sign-in` with email/password,
      sign-up, and magic-link modes (`src/auth/actions.ts`), friendly error
      mapping, and a "check your email" confirmation state. Session persists via
      the M0 secure-store adapter; the auth gate redirects on `onAuthStateChange`._
- [x] **M1-2** Google OAuth deep-link flow (`expo-auth-session` +
      `mmp://auth-callback`). _Done: `signInWithGoogle` (`src/auth/oauth.ts`) via
      `signInWithOAuth({ skipBrowserRedirect })` + `WebBrowser.openAuthSessionAsync`,
      handling both PKCE (`exchangeCodeForSession`) and implicit (`setSession`)
      redirects. `useAuthDeepLinks` (root layout) also turns magic-link / OAuth
      deep links arriving through the OS into a session (warm + cold start)._
- [x] **M1-3** Today board: generate, view, accept / reject a meal. _Done:
      `(tabs)/today` + `useTodayBoard`; reads `GET …/meal-plans/today`, generates
      missing configured slots (idempotent), reject-with-reason sheet._
- [x] **M1-4** Today: swap / suggest-another / lock-unlock. _Done: candidates
      picker (`SwapSheet` → `replace`), `suggest-another`, lock/unlock toggle._
- [x] **M1-5** Today: eating-out + mark-cooked. _Done: eating-out + cooked
      actions on the `MealCard`, with the eating-out body + "plan a dish" return._
- [x] **M1-6** Week plan view. _Done: `(tabs)/week` + `useWeekBoard`; reads
      `GET …/meal-plans/week` grouped by day, with idempotent week generation._
- [x] **M1-7** Grocery list: view, check off items, regenerate (idempotent).
      _Done: `(tabs)/grocery` + `useGrocery`; reads `GET …/grocery-list/current`,
      optimistic check-off, category grouping, idempotent regenerate._

## M2 — Full parity

> Design: §6 (Onboarding / Household / Invites / Notifications / Settings).

- [x] **M2-1** Onboarding: multi-step flow with autosave + resume. _Done:
      `app/onboarding.tsx` + `src/onboarding/` (draft types, options, completion
      helpers, step metadata, `useOnboarding`). Six steps (basics → food → schedule
      → allergies/health → budget → review) mirroring design/06 § 2; debounced
      field autosave + immediate save on step nav (`PUT /api/onboarding/draft`),
      the design/06 § 5 save-status strings, resume prompt (Resume / Start over)
      from `GET …/draft`, and `POST …/complete` on finish (gated on the minimum
      required set). The tabs layout now routes a signed-in user with no household
      to onboarding; completion force-refetches households and lands on Today.
      Reusable `SelectChips` / `TagInput` / `NumberField` added. Mobile `tsc` clean,
      Prettier clean. Device run deferred (no emulator here)._
- [x] **M2-2** Household: members list, roles / permissions. _Done: the Household
      tab (`app/(tabs)/household.tsx`) now lists the roster via
      `GET …/members` (`useMembers`), sorted active-first. Tapping a member opens
      `MemberSheet`; a caller with `can_remove_members` can change a non-owner /
      non-self member's role (`PATCH …/members/{id}`) — re-applying that role's
      default flags — toggle individual `can_\*` flags, or remove them
(`POST …/members/{id}/remove`). Owner + self rows are read-only (ownership
transfer not exposed in M2-2). Extended the mobile wire types with the full
`CanFlags`set +`Member`DTO (and corrected`MemberRole` `guest`→`viewer`to
match the DB enum). Mobile`tsc` clean, Prettier clean. Device run deferred.\_
- [x] **M2-3** Household: create / delete, preferences, food / dish preferences.
      _Done: a `(household)` stack with **Preferences** (`PATCH …/preferences`,
      reusing the onboarding option lists + controls, gated by
      `can_edit_household_preferences` — read-only otherwise), **My dishes**
      (`GET`/`PATCH …/food-preferences` liked-dish names), and **Create** (`POST
/api/households`). The Household tab gained a Manage section linking these
      plus owner-only **Delete** (`DELETE …`, confirm dialog → refetch households
      → gate re-resolves). Expanded the wire `HouseholdPreferences`/`PreferencesPatch`
      types. **Additive backend:** `GET /api/households/{id}/food-preferences`
      (reuses `getMyLikedDishes`; the web seeded its editor in an RSC) with a route
      test. The P10 dish-catalog/combinations builder (`…/dish-preferences`) stays
      deferred, as in M2-1's onboarding. Mobile + web `tsc` clean, route tests +
      Prettier pass. Device run deferred._
- [x] **M2-4** Invites: create, accept, decline, list. _Done: `src/api/invites.ts` + `usePendingInvites`. The Household tab shows **Pending invites** and an
      **Invite someone** action (gated by `can_invite_members`) →
      `(household)/invite` (email + role + optional guest window → `POST …/invites`,
      then the one-time link with native Share). An `app/invite/[token]` landing
      screen previews (`GET /api/invites/{token}`, unauthenticated) and accepts
      (`POST …/accept` → refetch households → Today) or declines (`POST …/decline`);
      reachable via the `mmp://invite/{token}` deep link (https universal links are
      M3). **Additive backend:** `GET /api/households/{id}/invites` (reuses
      `listPendingInvites`) with a route test. Mobile + web `tsc` clean, route tests + Prettier pass. Device run deferred._
- [x] **M2-5** Notifications: list, mark read, read-all, preferences. _Done:
      `src/api/notifications.ts` + `useNotifications`/`useUnreadCount`. A
      `(settings)` stack with **Notifications** (`GET /api/notifications` inbox,
      unread dots, tap-to-read `POST …/{id}/read`, "Mark all read"
      `POST …/read-all`) and **Email notifications** (`GET`/`PUT
/api/notification-preferences` per the active household, settable categories
      mirroring the web). The More tab links to both and shows an unread badge. All
      endpoints already existed — no backend change. Mobile `tsc` clean, Prettier
      pass. Device run deferred._
- [x] **M2-6** Settings: profile, household switcher, sign out. _Done: the More
      tab shows a read-only profile (email + display name from the session — no
      profile-edit endpoint exists), a **Switch household** row → `(settings)/
households` (`useHouseholdSwitcher`: tap to switch active via `PUT
…/active`, star to set preferred via `PUT …/preferred`, seeding the
      refreshed list into the shared cache so the daily loop follows instantly),
      links to Notifications / Email notifications, and Sign out. Mobile `tsc`
      clean, Prettier pass. Device run deferred._

## M3 — Native push + store launch

> Design: §7 (push), §8 (distribution).

- [x] **M3-1** `device_tokens` table (migration applied to cloud dev via Supabase
      MCP) + `POST /api/notifications/device-tokens` to upsert the current user's
      token (RLS-scoped). _Done: migration `20260602130000_m3_1_device_tokens`
      (applied to cloud dev) — `device_tokens` keyed to `user_id` with
      `{ token unique, platform }`, self-only RLS, and a `register_device_token`
      SECURITY DEFINER RPC that upserts on `token` and reassigns across users on a
      shared device (stamps `user_id = auth.uid()`). `database.types.ts` hand-patched
      (table + RPC). Service `lib/services/notification/device-token.ts`
      (`registerDeviceToken`) + the route with 3 tests. Web `tsc` + tests pass; the
      0029 SECURITY DEFINER advisor is the same by-design lint as the other RPCs._
- [x] **M3-2** Expo Push adapter in the notifier — additive; email + in-app stay
      intact. _Done: `ExpoPushNotifier` + `HttpExpoPushTransport` (batches to the
      Expo Push API, gated on `EXPO_ACCESS_TOKEN` — a true no-op when unset, like
      the Resend email gate), registered in the notifier registry and exposed via
      the router (`sendEventPush` / `isPushConfigured`). A `push-fanout` runs in
      `safeEmitHouseholdEvent` AFTER the in-app write + email fan-out, resolving
      recipient device tokens via a new `get_event_push_tokens` SECURITY DEFINER
      RPC (migration `20260602140000`, applied to cloud dev) — push opt-in = having
      a registered token, so it's not gated by the email prefs. `database.types.ts`
      hand-patched for the RPC. 7 new tests; full `lib/events` suite + web `tsc`
      pass._
- [x] **M3-3** Device push registration after sign-in. _Done: added
      `expo-notifications` + `expo-device` (+ the `expo-notifications` config
      plugin). `registerForPushNotifications` (`src/notifications/`) requests
      permission, mints an Expo push token, and upserts it via the new
      `notificationsApi.registerDeviceToken` → `POST …/device-tokens`. A
      `PushRegistrar` mounted under `AuthProvider` runs it on the transition to a
      session (and re-runs if the signed-in user changes). Best-effort: no-ops on a
      simulator, on denied permission, or before an EAS `projectId` exists (M3-5),
      never surfacing an error. Mobile `tsc` clean; `expo config` resolves with the
      plugin. Device run deferred._
- [ ] **M3-4** Set up Apple Developer + Google Play Console accounts. _Blocked:
      account-bound (Apple $99/yr + Google $25), external to this environment._
- [~] **M3-5** EAS Build config + signing credentials; bundle / application IDs.
  _Scaffolding done: `mobile/eas.json` with `development` (dev-client, iOS
  simulator), `preview` (internal), and `production` profiles, each setting
  `EXPO_PUBLIC_API_BASE_URL` (`:3100` for dev, prod otherwise); bundle /
  application IDs already set in `app.json` (`com.mealmenuplanner.app`), and the
  `expo-notifications` plugin wired (M3-3). **Blocked (account-bound):**
  generating signing credentials + the EAS `projectId` needs `eas login` +
  `eas init` / first `eas build` against your Expo account — that also injects
  `extra.eas.projectId` (which push registration waits on) and the iOS/Android
  signing keys. Set the Supabase `EXPO_PUBLIC_\*` values as EAS environment
  variables/secrets, not committed.\_
- [ ] **M3-6** TestFlight + Play internal testing builds. _Blocked: needs the
      M3-4 accounts + an `eas build` run (account-bound)._
- [ ] **M3-7** Store listings, privacy labels / data-safety form; public
      submission. _Blocked: account-bound store-console work._

## M4 — Meal Provider Workspace (mobile parity)

> **Tracked as Track C, in lockstep with web (ADR-17).** These are **not** standalone
> `M4-*` tasks: each mobile provider screen ships **in the same PR** as its web twin,
> driven by ADO Epic **#15** and the **Track C** list (`MP-C-000 … MP-C-070`) in
> [`design/planning/meal-provider/05_two_developer_implementation_tracker.md`](design/planning/meal-provider/05_two_developer_implementation_tracker.md).
> The mobile engineering design is `design/10_mobile_app_design.md` §10.

- **Foundation:** `MP-C-000` — Jest + RNTL harness, `mobile/src/api/provider.ts`
  client, fixture wiring, `test:mobile` folded into `test:all` (CP1, the Track-C
  analogue of the regression-suite freeze #34). **No mobile provider screen closes
  before it.**
- **Screens (parity twins, each in its paired `MP-B` PR):** owner shell + nav, member
  shell + workspace switcher, owner/member onboarding, members invite/approval, menu
  builder, today's menu, member response (confirm·update·cancel·locked), preparation +
  native share/export, owner dashboard — `MP-C-010 … MP-C-060`.
- **Test bar:** Jest + RNTL unit/hook (`test:mobile`) + **manual Expo smoke** per item.
  **Mobile UI E2E (Detox/Maestro) is deferred** — no iOS sim / Android emulator on this
  Windows host — tracked as `decision`-gated `MP-C-070` (Q-8). This is the one
  acknowledged gap below the web E2E bar.
