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
| P1    | Auth & household foundation | 1 / 8        | In progress |
| P2    | Onboarding (save/resume)    | 0 / 7        | Not started |
| P3    | Dish admin / content        | 0 / 8        | Not started |
| P4    | Recommendation engine       | 0 / 8        | Not started |
| P5    | Meal planning               | 0 / 7        | Not started |
| P6    | Household collaboration     | 0 / 9        | Not started |
| P7    | Grocery & prep              | 0 / 6        | Not started |
| P8    | Notifications               | 0 / 6        | Not started |
| P9    | Beta hardening              | 0 / 7        | Not started |
|       | **Total**                   | **15 / 82**  |             |

**Suggested next task:** **P1 is underway** — `P1-1` (Google OAuth sign-in +
callback) is code-complete and CI-green; the only gap is the operator wiring
Google credentials into the cloud project's Auth provider (an ops step, like
`P0-3`'s prod project). **Next is `P1-3`** (server-side session resolution + SSR
cookie refresh in route middleware + redirect-unauthenticated for the `(app)`
shell) — it pairs with the `lib/db/server.ts` "session refresh happens in the
route middleware (P1-3)" note and the `(app)/layout.tsx` auth-gating TODO, and
unblocks every authenticated screen. `P1-2` (email/password + magic-link) and
`P1-4` (`lib/auth` permission guards) follow. Still open from P0: `P0-14` (seed:
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
- [ ] **P1-3** Server-side session resolution, SSR cookies, route middleware for the authenticated shell
- [ ] **P1-4** `lib/auth` permission guards: active-membership check + `can_*` flag check, returning typed errors
- [ ] **P1-5** `household` service: create household + owner membership (all `can_*` = true)
- [ ] **P1-6** `POST /api/households` + `GET /api/households/{id}` (with `currentUserPermissions`)
- [ ] **P1-7** `PATCH /api/households/{id}/preferences` (gated by `can_edit_household_preferences`)
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
