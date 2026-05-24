# Implementation Tracker

Targeted, trackable tasks for building Home Meal Planner. Tasks are grouped into
phases that follow the [MVP roadmap](docs/12_mvp_roadmap.md) and reference the
[design docs](design/00_design_index.md) that specify them.

## How to use

- Every task has a stable ID (e.g. `P3-2`). To work on something, just say
  **"work on P3-2"** (or a range like "P0-5..P0-12") and that scopes the work.
- Tick a box (`[ ]` → `[x]`) when a task is **done and verified**; use `[~]` for
  in progress. Keep the **Progress summary** counts in sync.
- `Design` links point to the spec a task implements. The database schema in
  [design/01](design/01_database_design.md) is the source of truth for names.

### Status legend

| Marker | Meaning                   |
| ------ | ------------------------- |
| `[ ]`  | Not started               |
| `[~]`  | In progress               |
| `[x]`  | Done & verified           |
| `[!]`  | Blocked (note why inline) |

## Progress summary

| Phase | Area                        | Done / Total | Status      |
| ----- | --------------------------- | ------------ | ----------- |
| —     | Product specs (`docs/`)     | ✅           | Complete    |
| —     | Design docs (`design/`)     | ✅           | Complete    |
| P0    | Project setup & schema      | 14 / 16      | In progress |
| P1    | Auth & household foundation | 6 / 8        | In progress |
| P2    | Onboarding (save/resume)    | 0 / 7        | Not started |
| P3    | Dish admin / content        | 0 / 8        | Not started |
| P4    | Recommendation engine       | 0 / 8        | Not started |
| P5    | Meal planning               | 0 / 7        | Not started |
| P6    | Household collaboration     | 0 / 9        | Not started |
| P7    | Grocery & prep              | 0 / 6        | Not started |
| P8    | Notifications               | 0 / 6        | Not started |
| P9    | Beta hardening              | 0 / 7        | Not started |
|       | **Total**                   | **20 / 82**  |             |

**Suggested next task:** **P1 is underway** — `P1-1` (Google OAuth) and `P1-3`
(server-side session resolution + the `proxy.ts` edge gate + the `(app)`-shell
backstop) are both code-complete and CI-green; `P1-1`'s only gap is the operator
wiring Google credentials into the cloud project's Auth provider (an ops step,
like `P0-3`'s prod project). `P1-4` (`lib/auth` permission guards) and `P1-5`
(the `household` create service, backed by the `create_household` security
definer RPC) are now done and CI-green; together they regenerated
`lib/db/database.types.ts` from cloud dev via MCP, so the service layer has real
table, enum, and RPC types. `P1-6` (the first route handlers, `POST
/api/households` + `GET /api/households/{id}`) and `P1-7` (`PATCH
/api/households/{id}/preferences`) are now done and CI-green — built thin over
the `createHousehold`/`getHousehold`/`updatePreferences` services, the
`getActiveMembership` + `hasPermission` guards, the `withErrorBoundary` envelope,
and the shared `lib/services/household/dto.ts` mappers, `lib/http/request.ts`
body parser, and `lib/validation/uuid.ts` guard. **Next is `P1-8`** (`GET
/api/households/{id}/members`, a `(member)` read returning the bounded member
collection per design/04 § 4.4) — it reuses the same `getActiveMembership` gate,
the `toCanFlagsDto` mapper, and the route-handler pattern, joining
`household_members` to `users` for each member's `displayName`. `P1-2`
(email/password + magic-link) is an
independent parallel track. Still open from P0: `P0-14` (seed:
ingredient catalog + 100 starter dishes, needs dish content authored first) and
`P0-3`'s prod-project step. The advisor is clean (security:
only the 2 intended self-scoped helper WARNs; performance: 0 WARN, only expected
INFO on the empty DB). **DB workflow proven:** author each migration as a file
under `supabase/migrations/`, apply to the cloud dev project
(`dultruvperqxtqtbochp`) via the Supabase MCP `apply_migration`, then rename the
local file to match the version the MCP records so file + remote history stay in
sync (no Docker needed). `P0-3` is wired up in-repo; its only remaining piece is
the account owner creating a separate **prod** project before launch (see
[supabase/README.md](supabase/README.md)).

---

## P0 — Project setup & schema

> Design: [02](design/02_system_architecture.md), [01](design/01_database_design.md) · Roadmap: Phase 1 (Foundation)

- [x] **P0-1** Scaffold Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui; base folder layout per [design/02](design/02_system_architecture.md)
- [x] **P0-2** Repo tooling: ESLint, Prettier, `tsconfig`, `.gitattributes` (normalize LF), `.env.example`
- [~] **P0-3** Create Supabase **dev** and **prod** projects; wire up Supabase CLI + local dev — _CLI pinned as dev dep, `supabase init` + tuned `config.toml` (auth, redirects, Google provider scaffold), `db:*` npm scripts, and `supabase/README.md` setup guide are done. Remaining: account owner runs `supabase login`, creates the two cloud projects, and `supabase link` per [supabase/README.md](supabase/README.md) (needs Docker for the local stack)._
- [x] **P0-4** Supabase client factories: server (RLS, per-request JWT), browser (anon), service-role (jobs only) per [design/02](design/02_system_architecture.md)
- [x] **P0-5** Migration: extensions (`pgcrypto`, `pg_cron`, `pg_trgm`) + all enum types + `set_updated_at()` trigger fn — _applied to cloud dev project `dultruvperqxtqtbochp` (migration `20260523033224`); verified 3 extensions, 17 enums, fn present._
- [x] **P0-6** Migration: identity/household tables (`users`, `households`, `household_preferences`, `household_members`, `household_profile_drafts`, `household_invites`, `user_food_preferences`) — _applied to cloud dev (migration `20260523034352`); 7 tables verified (9 checks, 13 FKs, 7 updated_at triggers, RLS auto-enabled). Standalone + partial-unique indexes deferred to P0-10; per-table `set_updated_at` triggers attached here._
- [x] **P0-7** Migration: content tables (`dishes`, `ingredients`, `dish_ingredients`, `dish_prep_tasks`, `dish_pairings`) — _applied to cloud dev (migration `20260523034643`); 5 tables verified (5 checks incl. `no_self_pair`, 5 FKs incl. `ingredient_id` ON DELETE RESTRICT, `dishes.total_time_minutes` stored-generated, 5 updated_at triggers, RLS auto-enabled). Standalone indexes deferred to P0-10._
- [x] **P0-8** Migration: planning tables (`meal_plans`, `meal_plan_items`, `meal_feedback`, `grocery_lists`, `grocery_list_items`) — _applied to cloud dev (migration `20260523123828`); 5 tables verified (2 checks, 13 FKs, nullable `dish_id`/`ingredient_id` ON DELETE SET NULL, 4 updated_at triggers — `meal_feedback` is append-only with none). Standalone indexes incl. `uq_active_plan_per_start` deferred to P0-10._
- [x] **P0-9** Migration: audit/notification tables (`household_activity_events`, `notifications`) — _applied to cloud dev (migration `20260523124339`); 2 tables verified (5 FKs, `actor_user_id` ON DELETE SET NULL on both, `recipient_user_id` CASCADE, append-only so no updated_at triggers). All 19 MVP tables now exist (V2 `notification_preferences` deferred). Standalone indexes deferred to P0-10._
- [x] **P0-10** Migration: all indexes + unique/check constraints from [design/01](design/01_database_design.md) — _applied to cloud dev (migration `20260523124631`); all 22 standalone indexes verified present, incl. 2 GIN (`ix_dishes_meal_slots_gin`, `ix_dishes_name_trgm` via `extensions.gin_trgm_ops`) and the 3 partial-unique invariants (`uq_one_active_draft_per_user`, `uq_one_live_membership`, `uq_active_plan_per_start`). Inline CHECK/UNIQUE constraints already shipped with their tables in P0-6..P0-9._
- [x] **P0-11** Migration: RLS helper fns `is_active_member()`, `has_permission()` — _applied to cloud dev (migration `20260523125031`); both SECURITY DEFINER + STABLE, `search_path=''` with fully-qualified `public.household_members` (hardened over the doc's `=public`), real-time `expires_at > now()` check. Smoke-tested (return false, no error). Followed by hardening migration `20260523125527` (per user decision): REVOKE EXECUTE from anon/PUBLIC on both helpers + the pre-existing `rls_auto_enable`, keeping `authenticated`+`service_role` on the helpers (required for P0-12 policies). Verified — all 3 anon (0028) warnings cleared and `rls_auto_enable` fully locked; the 2 self-scoped `authenticated` (0029) WARNs on the helpers remain by design._
- [x] **P0-12** Migration: enable RLS + policies on every household-scoped + content table ([design/03](design/03_auth_and_security_design.md)) — _applied to cloud dev (migration `20260523130250`); RLS enabled on all 19 tables with 43 policies (none missing). Security advisor clean except the 2 intended self-scoped helper WARNs; the 19 `rls_enabled_no_policy` INFOs are cleared. `auth.uid()`/`auth.jwt()` wrapped as `(select …)` → 0 `auth_rls_initplan` perf warnings. Follow-up cleanup migration `20260523131032` split the `for all` write policies into per-command + scoped every policy `to authenticated` → **0 WARN-level perf lints** (61 policies; only expected INFO `unindexed_foreign_keys`/`unused_index` remain on the empty DB). Several interpretation calls documented in the migration header (users self-only, meal_plan(\_items) today-OR-weekly write backstop, content reads join to active dish)._
- [x] **P0-13** `auth.users` → public `users` profile provisioning trigger — _applied to cloud dev (migration `20260523131356`); `handle_new_auth_user()` SECURITY DEFINER (`search_path=''`, qualified, execute revoked from anon/authenticated/public) + `trg_provision_user_profile` after-insert trigger on `auth.users`. Verified live: a throwaway `auth.users` insert provisioned `public.users` with correct mapping (display_name←full_name, avatar_url, auth_provider←google); delete cascaded both rows. Advisor unchanged (no new WARN)._
- [ ] **P0-14** Seed: ingredient catalog + 100 starter dishes (active only after quality checklist, [docs/06](docs/06_admin_operator_spec.md))
- [x] **P0-15** `lib/errors` typed domain errors + single error→response boundary ([design/02](design/02_system_architecture.md), [design/04](design/04_api_design.md)) — _7 typed errors (`ValidationError`/`Unauthenticated`/`Forbidden`/`NotFound`/`Conflict`/`RateLimited`/`Internal`) extending a `DomainError` base with stable `code` + `httpStatus`; `boundary.ts` maps any throw → the design/04 §2 envelope (`toErrorEnvelope`, `errorResponse`, `withErrorBoundary`), non-domain errors → generic INTERNAL 500 logged server-side, `RateLimitedError` sets `Retry-After`. typecheck + lint + format clean. Unit tests deferred to P0-16 (no test runner yet)._
- [x] **P0-16** App shell (auth/app/admin layouts, navigation) + CI (lint, typecheck, test) — _**CI/tests:** Vitest (`vitest.config.ts`, node env, `@/` alias), `test`/`test:watch` scripts, 13 `lib/errors` tests, `.github/workflows/ci.yml` (lint · format · typecheck · test · build on push/PR, Node 22). **App shell:** layouts for `(app)` (header + responsive `AppNav`: Today/Plan/Grocery/Household + notifications), `admin` (Operator Console + `AdminNav`), and `(auth)` (centered); placeholder pages for the nav targets + sign-in; branded landing replacing the boilerplate; root metadata fixed. Build prerenders all 11 routes; full CI sequence green locally._

## P1 — Auth & household foundation

> Design: [03](design/03_auth_and_security_design.md), [04](design/04_api_design.md) · Roadmap: Phase 1

- [x] **P1-1** Supabase Auth: Google OAuth (PKCE) sign-in + callback — _`GoogleSignInButton` (browser anon client → `signInWithOAuth({ provider: 'google', redirectTo: /auth/callback })`, PKCE) on the sign-in screen; `app/auth/callback/route.ts` exchanges the code for a session (`exchangeCodeForSession`), setting the HTTP-only auth cookies via the per-request server client, then redirects to a sanitized same-origin `next` (default `/today`); provider/exchange failures bounce to `/sign-in?error=…` (generic message, surfaced as an alert). Google provider flipped `enabled = true` in `config.toml` (env-based creds; design/03 § 2). lint · format · typecheck · test · build all green. **Operator step before live use:** create the Google OAuth 2.0 Web client and enable Google in the cloud project's Auth → Providers with those credentials + redirect URIs (mirrors the P0-3 prod-project ops gap)._
- [ ] **P1-2** Email/password + magic-link auth
- [x] **P1-3** Server-side session resolution, SSR cookies, route middleware for the authenticated shell — _**Edge proxy** `proxy.ts` (Next 16's renamed `middleware` convention — migrated to silence the deprecation): seeds an `@supabase/ssr` client from request cookies, calls `getUser()` to revalidate + refresh the JWT and write fresh HTTP-only cookies back (the only place that can, since Server Components can't write cookies), then gates by path — unauthenticated hits on the `(app)` shell + `/admin` → `/sign-in?next=…` (refreshed cookies carried onto the redirect), authenticated hits on `/sign-in` → `/today`; matcher skips Next internals + static assets. **Session resolution** `lib/auth/session.ts`: `getAuthUser()` (verified `User | null` via `getUser()`, never trusts the raw cookie) + `requireAuthUser()` (throws `UnauthenticatedError` for route handlers/actions). **Pure helpers** `lib/auth/route-access.ts` (`PROTECTED_PREFIXES`, `isProtectedPath` with `/`-boundary matching, `isAuthPath`, open-redirect-safe `buildSignInUrl`) + barrel `index.ts`. `(app)/layout.tsx` now resolves the user server-side as a defense-in-depth backstop (redirects if null) and renders the account-initial avatar; removed its P1-3 TODO. **Verified:** 8 new `route-access` unit tests (21 total green); lint · format · typecheck · test · build all green; dev-server smoke test confirmed 307→`/sign-in?next=` for `/today`, `/household/members`, `/admin` and 200 for `/` + `/sign-in`._
- [x] **P1-4** `lib/auth` permission guards: active-membership check + `can_*` flag check, returning typed errors — _Split like the session and route-access pair. Pure module `lib/auth/permissions.ts` (edge-safe, no `server-only`): the `PERMISSION_FLAGS` vocabulary (the eight permission flags), the `Permission` and `MembershipContext` types, `isMembershipActive` (mirrors the `is_active_member` SQL helper, including the real-time expiry check with strict greater-than), `hasPermission`, and the row-to-context mappers. Server-only module `lib/auth/guards.ts`: `getActiveMembership` (the non-throwing primitive — requires a verified session via `requireAuthUser`, loads the caller's active `household_members` row through the per-request RLS client, applies the expiry backstop itself, and returns the context or null for "authenticated but not a member"), `requireActiveMember` (throws `ForbiddenError`, design/03 section 6 node E2), and `requirePermission` (throws `ForbiddenError`, nodes E2/E3). Flags are the runtime source of truth (design/03 section 4); RLS stays the independent backstop. Reads that prefer a 404 over a 403 (existence-hiding, design/04 section 2) call `getActiveMembership` and translate a null result to `NotFoundError`; the returned context feeds P1-6's permission view. Side effect: first code to query a domain table, so `lib/db/database.types.ts` was regenerated from cloud dev via the Supabase MCP (the `db:types` script needs Docker) — real types for all 19 tables, 17 enums, and the 2 RLS helper functions, replacing the empty stub. 21 new unit tests (42 total); lint, format, typecheck, test, and build all green._
- [x] **P1-5** `household` service: create household + owner membership (all `can_*` = true) — _Atomicity plus the RLS bootstrap (the creator is not a member yet, so the `hm_insert` policy cannot pass under their own JWT) are both solved by a `security definer` Postgres function `create_household(p_name)` (migration applied to cloud dev, version `20260523235403`): it inserts the `households` row (`created_by_user_id` = the caller) and the owner `household_members` row (role owner, permanent, active, every permission flag true) in one transaction, then returns the new id. Hardened like the other helpers (`search_path` empty, fully-qualified names, EXECUTE revoked from public/anon and granted to authenticated; it raises on a null `auth.uid()` or empty/oversized name as a backstop). Service `lib/services/household/create-household.ts`: `createHousehold` requires a session, validates and trims the name via the pure `normalizeHouseholdName` (throws `ValidationError`), invokes the RPC through the per-request RLS client, and returns `{ householdId }`. Verified live with an impersonated authenticated call inside a rolled-back transaction (name trimmed, owner active and permanent, all 8 flags true); advisor shows only the 3 by-design self-scoped security-definer WARNs. 10 new tests (52 total); lint, format, typecheck, test, and build all green._
- [x] **P1-6** `POST /api/households` + `GET /api/households/{id}` (with `currentUserPermissions`) — _the first route handlers, kept thin per design/04 § 1: resolve session, run guard, delegate to one service, serialize. **`POST /api/households`** (`app/api/households/route.ts`) parses the body, validates `name` is present, calls `createHousehold` (P1-5), and returns `201 { householdId }`. **`GET /api/households/{householdId}`** (`app/api/households/[householdId]/route.ts`, Next 16 async `params`) calls the new `getHousehold` service and returns `200` with the full DTO. Both are wrapped in `withErrorBoundary` (P0-15) so every throw becomes the standard envelope. New `getHousehold` service (`lib/services/household/get-household.ts`): gates on `getActiveMembership` (P1-4) and surfaces a non-member or expired guest as `NotFoundError` (404, existence-hiding per design/04 § 2), 404s a malformed-UUID path param before querying, then loads the `households` row plus the optional `household_preferences` row (a raw-created household has none until P1-7/P2-6) under the per-request RLS client. New shared modules carry the camelCase translation boundary and request parsing, both reused by P1-7/P1-8: `lib/services/household/dto.ts` (`toPreferencesDto`, `toCanFlagsDto`, `toCurrentUserPermissionsDto`, `HouseholdDto`) and `lib/http/request.ts` (`readJsonObject`, malformed/non-object body becomes a 400 `ValidationError`). 23 new tests (75 total) covering the DTO mappers, the service gate/mapping/error paths, body parsing, and both handlers' status + envelope wiring; lint, format, typecheck, test, and build all green._
- [x] **P1-7** `PATCH /api/households/{id}/preferences` (gated by `can_edit_household_preferences`) — _partial update of any subset of preference fields, returning the full updated `preferences` DTO (same shape as the household read). Route handler `app/api/households/[householdId]/preferences/route.ts` stays thin (await `params`, `readJsonObject`, delegate, serialize) under `withErrorBoundary`. New `updatePreferences` service (`lib/services/household/update-preferences.ts`) implements design/04 § 2's FORBIDDEN-vs-NOT_FOUND policy precisely via `getActiveMembership` + `hasPermission` (P1-4): a non-member or expired guest gets 404 (existence-hiding, matching the P1-6 read), an active member lacking `can_edit_household_preferences` gets 403, and a household with no preferences row yet gets 404. Validation runs after authorization, then a guarded `update().eq().select().maybeSingle()` under the per-request RLS client (the independent backstop). The inbound camelCase→snake_case validation+translation is a pure, separately-tested module `lib/services/household/validate-preferences.ts` (`buildPreferencesUpdate`): every rule mirrors a doc 01 `household_preferences` CHECK/enum/type (family size 1..50, counts ≥ 0, variety gap 0..60, nullable positive cooking times, `meals_to_plan` from `meal_slot`, enums from the generated `Constants` so they can't drift), collects all field issues into one `ValidationError`, ignores unknown keys, and rejects an empty update. Extracted the UUID guard shared with P1-6 into `lib/validation/uuid.ts` (`isUuid`) and refactored `get-household` onto it. 28 new tests (103 total); lint, format, typecheck, test, and build all green._
- [ ] **P1-8** Members read API: `GET /api/households/{id}/members`

## P2 — Onboarding (save/resume)

> Design: [06](design/06_onboarding_design.md) · Roadmap: Phase 2

- [ ] **P2-1** Multi-step onboarding wizard UI with forward/back navigation
- [ ] **P2-2** `GET /api/onboarding/draft` + `PUT /api/onboarding/draft` (one in-progress draft per user)
- [ ] **P2-3** Autosave after each step + debounced field autosave; save-state UI states
- [ ] **P2-4** Resume detection + "Continue setup" prompt (completion %, last saved, Resume / Start over)
- [ ] **P2-5** Minimum-required-field validation (name, family size, diet, meals, cooking time, cuisine)
- [ ] **P2-6** `POST /api/onboarding/complete` atomic transaction (household + preferences + owner membership + mark draft completed → redirect Today)
- [ ] **P2-7** Scheduled job: mark drafts `abandoned` after 30 days idle

## P3 — Dish admin / content

> Design: [docs/06](docs/06_admin_operator_spec.md), [04](design/04_api_design.md) · Roadmap: Phase 3

- [ ] **P3-1** Admin role gating + operator console shell
- [ ] **P3-2** Dish list: search by name, filter (cuisine/slot/diet/status/missing-metadata), sort by recently updated
- [ ] **P3-3** Add/edit dish form (all `dishes` fields)
- [ ] **P3-4** Ingredient manager (CRUD, categories, allergen, common names, substitutes)
- [ ] **P3-5** Dish-ingredient editor (quantity per serving, unit, required/optional)
- [ ] **P3-6** Prep-task editor (task name, required-before-minutes, description)
- [ ] **P3-7** Pairing editor (main/side/rice/bread/condiment/beverage)
- [ ] **P3-8** Activate/archive dish with quality-checklist validation before activation

## P4 — Recommendation engine

> Design: [05](design/05_recommendation_engine_design.md) · Roadmap: Phase 4

- [ ] **P4-1** Input loaders (household prefs, active members, candidate dishes for slot, recent history/feedback)
- [ ] **P4-2** Hard filters (diet, allergy, slot, prep-impossible, do-not-suggest-again, guest restrictions)
- [ ] **P4-3** Soft scoring functions with the exact weights from [design/05](design/05_recommendation_engine_design.md)
- [ ] **P4-4** Variety/rotation penalty (`variety_gap_days`)
- [ ] **P4-5** Prep-feasibility scoring (deadline vs `required_before_minutes` vs now)
- [ ] **P4-6** Explanation generator (human-readable `reason` from winning positive factors)
- [ ] **P4-7** Ranked output contract (`dishId`, `score`, `reason`, `missingConstraints`, `prepTasks`, `pairedDishes`)
- [ ] **P4-8** Unit tests over scoring with fixture households/dishes (pure functions)

## P5 — Meal planning

> Design: [08](design/08_meal_planning_grocery_prep_design.md) · Roadmap: Phase 5

- [ ] **P5-1** `POST .../meal-plans/today/generate` + Today screen (with recommendation reason)
- [ ] **P5-2** Accept / reject / suggest-another; record `meal_feedback` + penalize rejected
- [ ] **P5-3** `POST .../meal-plans/week/generate` + weekly Plan screen (honor `meals_to_plan`)
- [ ] **P5-4** `POST /api/meal-plan-items/{id}/replace` (records reason, notifies on confirmed change)
- [ ] **P5-5** `POST /api/meal-plan-items/{id}/eating-out` (no rotation penalty + triggers grocery regen)
- [ ] **P5-6** Lock / unlock meal (locked items excluded from regeneration)
- [ ] **P5-7** Meal history view + mark cooked (feeds variety logic)

## P6 — Household collaboration

> Design: [07](design/07_household_collaboration_design.md), [03](design/03_auth_and_security_design.md) · Roadmap: Phase 6

- [ ] **P6-1** Create invite: `POST .../invites` (hashed-at-rest token, expiry, email send)
- [ ] **P6-2** `GET /api/invites/{token}` unauthenticated, safe payload only (no sensitive household data)
- [ ] **P6-3** Accept / decline invite (`.../accept`, `.../decline`) → activate membership
- [ ] **P6-4** Member list + permissions management UI
- [ ] **P6-5** `PATCH .../members/{id}` update role/permissions (gated)
- [ ] **P6-6** Remove member (`.../remove`) — loses access, keeps activity attribution
- [ ] **P6-7** Leave household (`.../leave`) for non-owners
- [ ] **P6-8** Ownership transfer (required before owner can leave)
- [ ] **P6-9** Temporary-guest expiry: `expire_guests` scheduled job + real-time `expires_at > now()` checks

## P7 — Grocery & prep

> Design: [08](design/08_meal_planning_grocery_prep_design.md) · Roadmap: Phase 7

- [ ] **P7-1** Grocery generation algorithm: aggregate `dish_ingredients`, scale by `family_size`, merge same ingredient+unit, group by category
- [ ] **P7-2** Grocery list screen + check-off (`checked` flag)
- [ ] **P7-3** Regeneration triggers + `POST .../grocery-list/regenerate` (idempotent, one list per plan)
- [ ] **P7-4** Prep-task extraction for upcoming meals + deadline computation
- [ ] **P7-5** Prep reminders surfaced on dashboard
- [ ] **P7-6** `prep_reminders` hourly scheduled job (timezone-aware)

## P8 — Notifications

> Design: [09](design/09_notifications_design.md) · Roadmap: Phase 8

- [ ] **P8-1** `lib/events` activity-event writer (one `household_activity_events` row per domain change)
- [ ] **P8-2** Notification fan-out (all active members minus actor → one `notifications` row each)
- [ ] **P8-3** In-app notifications: `GET /api/notifications`, mark read, unread badge
- [ ] **P8-4** Notifier port abstraction (pluggable channel adapters)
- [ ] **P8-5** Email adapter for invites (transactional provider) with retry
- [ ] **P8-6** Wire menu/schedule/member-change events into the relevant services

## P9 — Beta hardening

> Design: [docs/13](docs/13_success_metrics.md) · Roadmap: Phase 9

- [ ] **P9-1** Analytics/metrics events (north-star + activation/engagement metrics)
- [ ] **P9-2** In-app feedback collection
- [ ] **P9-3** E2E tests of key flows (onboarding, generate, invite/accept, grocery)
- [ ] **P9-4** Permission-matrix tests (RLS + service guards across roles)
- [ ] **P9-5** Seed data improvements from recommendation-quality feedback
- [ ] **P9-6** Accessibility & responsive pass
- [ ] **P9-7** Beta with 10–20 households for 2 weeks + bug-fix buffer
