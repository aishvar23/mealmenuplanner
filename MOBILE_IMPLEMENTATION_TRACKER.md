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
| M0    | Foundations & backend auth | 0 / 8        | Not started |
| M1    | Auth + core daily loop     | 0 / 7        | Not started |
| M2    | Full parity                | 0 / 6        | Not started |
| M3    | Native push + store launch | 0 / 7        | Not started |
|       | **Total**                  | **0 / 28**   |             |

**Suggested next task:** `M0-1` — convert the repo to npm workspaces and add the
`packages/shared` + `mobile` workspaces.

---

## M0 — Foundations & backend auth

> Design: §2 (architecture / monorepo), §3 (auth / backend change), §4 (API
> client).

- [ ] **M0-1** Convert repo to npm workspaces; add `packages/shared` and
      `mobile` workspaces (root `package.json`). No web behavior change.
- [ ] **M0-2** `packages/shared`: re-export `lib/recommendation`; expose shared
      domain types and pure validators (nothing `server-only`).
- [ ] **M0-3** Backend: add bearer-token auth in `lib/db/server.ts` — read the
      `Authorization` header and pass it through `global.headers`, alongside the
      existing cookie path. No web regression.
- [ ] **M0-4** Test: Vitest in `lib/db/` proving a bearer token resolves a user
      and an unauthenticated request 401s; run all CI gates (`lint`, `typecheck`,
      `test`, `format:check`).
- [ ] **M0-5** Document the bearer-auth contract in
      `design/04_api_design.md`.
- [ ] **M0-6** Scaffold the Expo app under `mobile/` (expo-router, NativeWind,
      TanStack Query, base navigation shell).
- [ ] **M0-7** Wire the Supabase client in the app with an `expo-secure-store`
      session adapter; build the typed API client (`mobile/src/api/`) with envelope
      unwrapping, error mapping, and idempotency-key support.
- [ ] **M0-8** Implement the `Idempotency-Key` contract from
      `design/04_api_design.md` §3 server-side — the three generation handlers
      (`meal-plans/today/generate`, `meal-plans/week/generate`,
      `grocery-list/regenerate`) currently ignore the header, so mobile retries are
      not replay-protected. Read + persist the key, replay within the 24h window,
      and `409 idempotency_key_reused` on reuse with a different body. Backend
      prerequisite for safe mobile retries (`M0-7`).

## M1 — Auth + core daily loop

> Design: §3 (auth), §6 (Today / Week / Grocery).

- [ ] **M1-1** Sign in / sign up / magic-link screens; secure session
      persistence and refresh.
- [ ] **M1-2** Google OAuth deep-link flow (`expo-auth-session` +
      `myapp://auth-callback`).
- [ ] **M1-3** Today board: generate, view, accept / reject a meal.
- [ ] **M1-4** Today: swap / suggest-another / lock-unlock.
- [ ] **M1-5** Today: eating-out + mark-cooked.
- [ ] **M1-6** Week plan view.
- [ ] **M1-7** Grocery list: view, check off items, regenerate (idempotent).

## M2 — Full parity

> Design: §6 (Onboarding / Household / Invites / Notifications / Settings).

- [ ] **M2-1** Onboarding: multi-step flow with autosave + resume.
- [ ] **M2-2** Household: members list, roles / permissions.
- [ ] **M2-3** Household: create / delete, preferences, food / dish preferences.
- [ ] **M2-4** Invites: create, accept, decline, list.
- [ ] **M2-5** Notifications: list, mark read, read-all, preferences.
- [ ] **M2-6** Settings: profile, household switcher, sign out.

## M3 — Native push + store launch

> Design: §7 (push), §8 (distribution).

- [ ] **M3-1** `device_tokens` table (migration applied to cloud dev via Supabase
      MCP) + `POST /api/notifications/device-tokens` to upsert the current user's
      token (RLS-scoped).
- [ ] **M3-2** Expo Push adapter in the notifier — additive; email + in-app stay
      intact.
- [ ] **M3-3** Device push registration after sign-in.
- [ ] **M3-4** Set up Apple Developer + Google Play Console accounts.
- [ ] **M3-5** EAS Build config + signing credentials; bundle / application IDs.
- [ ] **M3-6** TestFlight + Play internal testing builds.
- [ ] **M3-7** Store listings, privacy labels / data-safety form; public
      submission.
