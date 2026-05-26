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

| Phase   | Area                              | Done / Total | Status      |
| ------- | --------------------------------- | ------------ | ----------- |
| —       | Product specs (`docs/`)           | ✅           | Complete    |
| —       | Design docs (`design/`)           | ✅           | Complete    |
| P0      | Project setup & schema            | 15 / 16      | In progress |
| P1      | Auth & household foundation       | 8 / 8        | Complete    |
| P2      | Onboarding (save/resume)          | 7 / 7        | Complete    |
| P3      | Dish admin / content              | 8 / 8        | Complete    |
| P4      | Recommendation engine             | 8 / 8        | Complete    |
| P5      | Meal planning                     | 7 / 7        | Complete    |
| P6      | Household collaboration           | 9 / 9        | Complete    |
| P7      | Grocery & prep                    | 6 / 6        | Complete    |
| P8      | Notifications                     | 6 / 6        | Complete    |
| P9      | Beta hardening                    | 0 / 7        | Not started |
| P10     | Meal combinations & 3-mode dishes | 7 / 7        | Complete    |
| BUG-014 | Dish & ingredient images          | 2 / 7        | In progress |
|         | **Total**                         | **77 / 82**  |             |

**Suggested next task:** **P1 is complete** — `P1-1` (Google OAuth) and `P1-3`
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
body parser, and `lib/validation/uuid.ts` guard. `P1-8` (`GET
/api/households/{id}/members`) is now done and CI-green — the household's active
roster as the design/04 § 1 `{ data, page }` collection envelope (bounded, no
cursor). Because `users` is RLS self-only (P0-12), display names come through a
new `list_household_members` SECURITY DEFINER RPC — the **safe projection** the
P0-12 note promised — which exposes only `display_name` (never email/phone),
re-checks the caller's active membership, and returns the real-time active roster
(`status = 'active'` AND `expires_at > now()`). Built thin over the shared
`getActiveMembership` gate, the new `toMemberDto` mapper, and a new
`lib/http/collection.ts` (`boundedCollection`). `P1-2` (email/password +
magic-link sign-in) is now done and CI-green — both flows run on the browser
anon client and the existing `/auth/callback` PKCE exchange, added to the
sign-in screen via new `EmailPasswordForm` / `MagicLinkForm` / `EmailSignIn`
components plus `Input` / `Label` UI primitives, with the open-redirect-safe
`next` handling extracted into shared `route-access` helpers. **With P1-2 done,
all of P1 is complete.** `P2-1` (the multi-step onboarding wizard UI) is now done
and CI-green — it opens P2: the navigable six-step wizard at `/onboarding`
(rendered outside the `(app)` nav shell, since a new user has no household yet),
built over a new pure, client-safe `lib/onboarding` step model
(`steps.ts` step ids matching `current_step` plus clamped `nextStep`/`prevStep`
navigation, `draft.ts` for the `draft_data` shape, `options.ts` for the
enum-derived choices) that the draft API will reuse. Forward/back navigation is
free per the design; in-memory state only — autosave (P2-3), resume hydration
(P2-4 via the wizard's `initialStep`/`initialData` seams), required-field gating
(P2-5), and the completion transaction (P2-6 via `handleFinish`) are the wired-up
follow-ups. The wizard's interactive render needs an authenticated Supabase
session, so it wasn't exercised live here (no local `.env.local`); the proxy gate
on the new `/onboarding` prefix was confirmed live (307 to `/sign-in`), and the
full component tree is covered by typecheck + build. `P2-2` (the `GET` +
`PUT /api/onboarding/draft` endpoints) is now done and CI-green — the draft read
returns the single `in_progress` draft (or `null`) and the autosave `PUT`
idempotently upserts it, recomputing `completion_percentage` server-side and
re-stamping `last_saved_at`; built thin over a new `onboarding` service
(`getDraft`/`saveDraft`, the lenient `parseDraftUpdate` envelope validator, the
shared `toDraftDto`) and a new pure, client-safe `lib/onboarding/completion.ts`
(the required-field model + `computeCompletionPercentage`) that the wizard reuses,
with a `409`/`23505` race guard on the concurrent-create path. **With P2-3..P2-7
done, all of P2 is complete** — the wizard now autosaves (debounced field +
per-step) with the spec save-state strings (P2-3), detects and resumes an
in-progress draft via the server-loaded resume prompt (P2-4), gates Finish on the
minimum required set client-side and re-validates strictly server-side (P2-5),
promotes the draft into live household/preferences/owner-membership rows through
the atomic, idempotent `complete_onboarding` SECURITY DEFINER function and
`POST /api/onboarding/complete` then redirects to Today (P2-6), and a daily
pg_cron job (`abandon_stale_drafts`) reclaims 30-day-idle drafts (P2-7). **With
P3-1..P3-8 done, all of P3 is complete** — the operator console (`/admin`) can
now manage the global dish/ingredient catalog without DB access: admin-role
gating (the `app_role` claim via `isAdminUser`/`requireAdmin`, enforced in the
proxy, the admin layout, and every admin service), the dish list
(search/filter/sort), the add/edit dish form, the ingredient manager, the
dish-ingredient / prep-task / pairing editors, and checklist-gated
activate/archive. The `admin` service runs on the service-role client (the
admin-tooling path design/02 sanctions) behind `requireAdmin()`, with the
content-table `app_role` write-RLS as the in-band backstop; no new migration was
needed (content tables + RLS shipped in P0-7/P0-12). **With P4-1..P4-8 done, all
of P4 is complete** — the deterministic, explainable recommendation engine
(design/05) now ranks active dishes for a slot and explains every suggestion. It
splits into a pure, client-safe `lib/recommendation` core (a single tuning config
with the verbatim doc-04 weights; the hard filters — the diet-type matrix plus
the vegan dairy/egg and jain onion/garlic ingredient refinements, the active-member
allergy union, slot match, do-not-suggest-again, and prep-impossible exclusion;
the soft scoring factors; variety rotation incl. the in-run "used" set; prep
feasibility on an injected clock; the weight-ordered explanation generator; and
the `recommendSlot` pipeline that emits the design/05 § 9 output contract with a
deterministic tiebreak) and a server-only `lib/services/recommendation` (the four
input loaders plus the composing `recommendForSlot`, gated by active membership
with existence-hiding 404s). Allergy safety required a new SECURITY DEFINER
projection RPC `list_household_food_preferences` (migration `20260524162541`) so
every active member's restrictions load regardless of the caller's
`can_edit_household_preferences` flag — the same safe-projection pattern as P1-8,
verified live in a rolled-back tx (an active member sees all co-members' prefs, a
non-member sees none); the advisor shows only the 6 by-design self-scoped
SECURITY DEFINER WARNs (the 5 prior plus the new RPC). The engine is read-only and
persists nothing — the today/week generate endpoints, Today screen, and
`meal_plan_items` writes are P5, built on `recommendForSlot`. 101 new tests (423
total); lint, format, typecheck, test, and build all green. **P5 (meal planning)
is now complete** (see the P5 section): `recommendForSlot` backs the today/week
generate endpoints, the per-item actions, and the Today/Plan/History screens.
**P6 (household collaboration) is now complete** (see the P6 section): invites
(hashed-at-rest token, unauthenticated preview, accept/decline), member
role/permission management, remove, leave, ownership transfer, and the
guest/invite expiry jobs — so **the suggested next task is `P7-1`** (grocery
generation). Still open
from P0: only `P0-3`'s prod-project step (`P0-14` seed is now done — see its
task note). The advisor is clean (security:
only the 5 by-design self-scoped SECURITY DEFINER WARNs — the 4 prior plus
`complete_onboarding`; the `abandon_stale_drafts` job is not user-callable so it
does not appear; performance: 0 WARN, only expected INFO on the empty DB). **DB workflow proven:** author each migration as a file
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
- [x] **P0-14** Seed: ingredient catalog + 100 starter dishes (active only after quality checklist, [docs/06](docs/06_admin_operator_spec.md)) — _131 ingredients and 100 dishes (755 dish-ingredient links, 26 advance-prep tasks, 28 pairings) authored as structured data under `supabase/seed/` (`ingredients.mjs`, `dishes.mjs`) and emitted to `supabase/seed.sql` by `generate.mjs`, a no-dependency Node generator. The generator validates every dish against the schema enums, the activation quality checklist (name, cuisine, at least one meal slot, diet, total time greater than zero, at least one ingredient), and the recommendation-engine diet rules (a vegan dish carries no dairy or eggs_meat ingredient and no non-vegan term such as paneer or honey; a jain dish has no onion or garlic; eggetarian and pescatarian obey their meat-kind rules) BEFORE writing SQL — so the seed can only contain activatable, engine-coherent dishes, all seeded `active`. Allergen types (dairy, gluten, egg, fish, shellfish, tree nuts, peanut, sesame, soy) are set deliberately so the allergy hard-filter is testable. Idempotent: deterministic ids plus `on conflict do nothing`; parents seeded directly, child tables via name-join. Two engine-coherence catches surfaced during authoring and were fixed in the catalog (Tofu common names triggered the `paneer`/`curd` terms; Thai Green Curry uses coconut milk, which the engine treats as non-vegan via the `milk` term, so it is labelled vegetarian). Applied to cloud dev `dultruvperqxtqtbochp` via the Supabase MCP and **verified live**: counts match exactly (131 ingredients, 100 dishes all active, 755 links, 26 prep, 28 pairings), 0 dishes fail the activation checklist, 0 orphan rows, and 0 diet-coherence violations across vegan, jain, veg-family, and meal-slot DB checks. Diet spread: 43 vegan, 32 vegetarian, 9 non-vegetarian, 6 eggetarian, 5 pescatarian, 5 jain. Regenerate with `node supabase/seed/generate.mjs`; the canonical `supabase/seed.sql` is also what `supabase db reset` loads locally._
- [x] **P0-15** `lib/errors` typed domain errors + single error→response boundary ([design/02](design/02_system_architecture.md), [design/04](design/04_api_design.md)) — _7 typed errors (`ValidationError`/`Unauthenticated`/`Forbidden`/`NotFound`/`Conflict`/`RateLimited`/`Internal`) extending a `DomainError` base with stable `code` + `httpStatus`; `boundary.ts` maps any throw → the design/04 §2 envelope (`toErrorEnvelope`, `errorResponse`, `withErrorBoundary`), non-domain errors → generic INTERNAL 500 logged server-side, `RateLimitedError` sets `Retry-After`. typecheck + lint + format clean. Unit tests deferred to P0-16 (no test runner yet)._
- [x] **P0-16** App shell (auth/app/admin layouts, navigation) + CI (lint, typecheck, test) — _**CI/tests:** Vitest (`vitest.config.ts`, node env, `@/` alias), `test`/`test:watch` scripts, 13 `lib/errors` tests, `.github/workflows/ci.yml` (lint · format · typecheck · test · build on push/PR, Node 22). **App shell:** layouts for `(app)` (header + responsive `AppNav`: Today/Plan/Grocery/Household + notifications), `admin` (Operator Console + `AdminNav`), and `(auth)` (centered); placeholder pages for the nav targets + sign-in; branded landing replacing the boilerplate; root metadata fixed. Build prerenders all 11 routes; full CI sequence green locally._

## P1 — Auth & household foundation

> Design: [03](design/03_auth_and_security_design.md), [04](design/04_api_design.md) · Roadmap: Phase 1

- [x] **P1-1** Supabase Auth: Google OAuth (PKCE) sign-in + callback — _`GoogleSignInButton` (browser anon client → `signInWithOAuth({ provider: 'google', redirectTo: /auth/callback })`, PKCE) on the sign-in screen; `app/auth/callback/route.ts` exchanges the code for a session (`exchangeCodeForSession`), setting the HTTP-only auth cookies via the per-request server client, then redirects to a sanitized same-origin `next` (default `/today`); provider/exchange failures bounce to `/sign-in?error=…` (generic message, surfaced as an alert). Google provider flipped `enabled = true` in `config.toml` (env-based creds; design/03 § 2). lint · format · typecheck · test · build all green. **Operator step before live use:** create the Google OAuth 2.0 Web client and enable Google in the cloud project's Auth → Providers with those credentials + redirect URIs (mirrors the P0-3 prod-project ops gap)._
- [x] **P1-2** Email/password + magic-link auth — _two passwordless-capable email flows added to the sign-in screen alongside the P1-1 Google button, all running on the browser (anon) Supabase client (which persists the session in cookies the server reads) and the existing `/auth/callback` PKCE code-exchange route (design/03 § 1–2). `EmailPasswordForm` (`components/auth/email-password-form.tsx`) does both `signInWithPassword` and account creation (`signUp`) behind an in-form mode toggle: on a synchronous success (sign-in, or sign-up when email confirmation is off and a session comes back) it does a full `window.location.assign` to the resolved post-auth path so the proxy + server layouts pick up the fresh session; when the project requires confirmation it surfaces a "check your email" notice (the emailed link returns to `/auth/callback`). `MagicLinkForm` (`magic-link-form.tsx`) calls `signInWithOtp` with `emailRedirectTo` at the callback and passes `data.magic_link` so a brand-new user is provisioned `auth_provider = 'magic_link'` by the P0-13 trigger (ignored for existing users). A small `EmailSignIn` (`email-sign-in.tsx`) client island toggles between the password and magic-link forms so the sign-in page stays a server component. New `Input`/`Label` UI primitives (`components/ui/`, shadcn base-nova tokens matching `Button`) back the forms. The open-redirect-safe `next` is honored only on the in-session paths (email links round-trip and land on the default route), via a shared, now-tested `isSafeRelativePath` + `resolvePostAuthRedirect` + `DEFAULT_POST_AUTH_PATH` extracted into `lib/auth/route-access.ts` and reused by `buildSignInUrl` and the `/auth/callback` route (replacing its private `safeNext`). No password-reset flow in MVP — magic link is the recovery path. 4 new `route-access` unit tests (121 total); lint, format, typecheck, test, and build all green; dev-server smoke test confirmed `/sign-in` renders Google + password + magic-link surfaces and a protected route still 307s to `/sign-in?next=`. **Operator step before live use:** in the cloud project's Auth settings confirm Email provider enabled, the email-confirmation toggle matches the intended sign-up UX, and `/auth/callback` is in the redirect allow-list (mirrors the P1-1 Google ops gap)._
- [x] **P1-3** Server-side session resolution, SSR cookies, route middleware for the authenticated shell — _**Edge proxy** `proxy.ts` (Next 16's renamed `middleware` convention — migrated to silence the deprecation): seeds an `@supabase/ssr` client from request cookies, calls `getUser()` to revalidate + refresh the JWT and write fresh HTTP-only cookies back (the only place that can, since Server Components can't write cookies), then gates by path — unauthenticated hits on the `(app)` shell + `/admin` → `/sign-in?next=…` (refreshed cookies carried onto the redirect), authenticated hits on `/sign-in` → `/today`; matcher skips Next internals + static assets. **Session resolution** `lib/auth/session.ts`: `getAuthUser()` (verified `User | null` via `getUser()`, never trusts the raw cookie) + `requireAuthUser()` (throws `UnauthenticatedError` for route handlers/actions). **Pure helpers** `lib/auth/route-access.ts` (`PROTECTED_PREFIXES`, `isProtectedPath` with `/`-boundary matching, `isAuthPath`, open-redirect-safe `buildSignInUrl`) + barrel `index.ts`. `(app)/layout.tsx` now resolves the user server-side as a defense-in-depth backstop (redirects if null) and renders the account-initial avatar; removed its P1-3 TODO. **Verified:** 8 new `route-access` unit tests (21 total green); lint · format · typecheck · test · build all green; dev-server smoke test confirmed 307→`/sign-in?next=` for `/today`, `/household/members`, `/admin` and 200 for `/` + `/sign-in`._
- [x] **P1-4** `lib/auth` permission guards: active-membership check + `can_*` flag check, returning typed errors — _Split like the session and route-access pair. Pure module `lib/auth/permissions.ts` (edge-safe, no `server-only`): the `PERMISSION_FLAGS` vocabulary (the eight permission flags), the `Permission` and `MembershipContext` types, `isMembershipActive` (mirrors the `is_active_member` SQL helper, including the real-time expiry check with strict greater-than), `hasPermission`, and the row-to-context mappers. Server-only module `lib/auth/guards.ts`: `getActiveMembership` (the non-throwing primitive — requires a verified session via `requireAuthUser`, loads the caller's active `household_members` row through the per-request RLS client, applies the expiry backstop itself, and returns the context or null for "authenticated but not a member"), `requireActiveMember` (throws `ForbiddenError`, design/03 section 6 node E2), and `requirePermission` (throws `ForbiddenError`, nodes E2/E3). Flags are the runtime source of truth (design/03 section 4); RLS stays the independent backstop. Reads that prefer a 404 over a 403 (existence-hiding, design/04 section 2) call `getActiveMembership` and translate a null result to `NotFoundError`; the returned context feeds P1-6's permission view. Side effect: first code to query a domain table, so `lib/db/database.types.ts` was regenerated from cloud dev via the Supabase MCP (the `db:types` script needs Docker) — real types for all 19 tables, 17 enums, and the 2 RLS helper functions, replacing the empty stub. 21 new unit tests (42 total); lint, format, typecheck, test, and build all green._
- [x] **P1-5** `household` service: create household + owner membership (all `can_*` = true) — _Atomicity plus the RLS bootstrap (the creator is not a member yet, so the `hm_insert` policy cannot pass under their own JWT) are both solved by a `security definer` Postgres function `create_household(p_name)` (migration applied to cloud dev, version `20260523235403`): it inserts the `households` row (`created_by_user_id` = the caller) and the owner `household_members` row (role owner, permanent, active, every permission flag true) in one transaction, then returns the new id. Hardened like the other helpers (`search_path` empty, fully-qualified names, EXECUTE revoked from public/anon and granted to authenticated; it raises on a null `auth.uid()` or empty/oversized name as a backstop). Service `lib/services/household/create-household.ts`: `createHousehold` requires a session, validates and trims the name via the pure `normalizeHouseholdName` (throws `ValidationError`), invokes the RPC through the per-request RLS client, and returns `{ householdId }`. Verified live with an impersonated authenticated call inside a rolled-back transaction (name trimmed, owner active and permanent, all 8 flags true); advisor shows only the 3 by-design self-scoped security-definer WARNs. 10 new tests (52 total); lint, format, typecheck, test, and build all green._
- [x] **P1-6** `POST /api/households` + `GET /api/households/{id}` (with `currentUserPermissions`) — _the first route handlers, kept thin per design/04 § 1: resolve session, run guard, delegate to one service, serialize. **`POST /api/households`** (`app/api/households/route.ts`) parses the body, validates `name` is present, calls `createHousehold` (P1-5), and returns `201 { householdId }`. **`GET /api/households/{householdId}`** (`app/api/households/[householdId]/route.ts`, Next 16 async `params`) calls the new `getHousehold` service and returns `200` with the full DTO. Both are wrapped in `withErrorBoundary` (P0-15) so every throw becomes the standard envelope. New `getHousehold` service (`lib/services/household/get-household.ts`): gates on `getActiveMembership` (P1-4) and surfaces a non-member or expired guest as `NotFoundError` (404, existence-hiding per design/04 § 2), 404s a malformed-UUID path param before querying, then loads the `households` row plus the optional `household_preferences` row (a raw-created household has none until P1-7/P2-6) under the per-request RLS client. New shared modules carry the camelCase translation boundary and request parsing, both reused by P1-7/P1-8: `lib/services/household/dto.ts` (`toPreferencesDto`, `toCanFlagsDto`, `toCurrentUserPermissionsDto`, `HouseholdDto`) and `lib/http/request.ts` (`readJsonObject`, malformed/non-object body becomes a 400 `ValidationError`). 23 new tests (75 total) covering the DTO mappers, the service gate/mapping/error paths, body parsing, and both handlers' status + envelope wiring; lint, format, typecheck, test, and build all green._
- [x] **P1-7** `PATCH /api/households/{id}/preferences` (gated by `can_edit_household_preferences`) — _partial update of any subset of preference fields, returning the full updated `preferences` DTO (same shape as the household read). Route handler `app/api/households/[householdId]/preferences/route.ts` stays thin (await `params`, `readJsonObject`, delegate, serialize) under `withErrorBoundary`. New `updatePreferences` service (`lib/services/household/update-preferences.ts`) implements design/04 § 2's FORBIDDEN-vs-NOT_FOUND policy precisely via `getActiveMembership` + `hasPermission` (P1-4): a non-member or expired guest gets 404 (existence-hiding, matching the P1-6 read), an active member lacking `can_edit_household_preferences` gets 403, and a household with no preferences row yet gets 404. Validation runs after authorization, then a guarded `update().eq().select().maybeSingle()` under the per-request RLS client (the independent backstop). The inbound camelCase→snake_case validation+translation is a pure, separately-tested module `lib/services/household/validate-preferences.ts` (`buildPreferencesUpdate`): every rule mirrors a doc 01 `household_preferences` CHECK/enum/type (family size 1..50, counts ≥ 0, variety gap 0..60, nullable positive cooking times, `meals_to_plan` from `meal_slot`, enums from the generated `Constants` so they can't drift), collects all field issues into one `ValidationError`, ignores unknown keys, and rejects an empty update. Extracted the UUID guard shared with P1-6 into `lib/validation/uuid.ts` (`isUuid`) and refactored `get-household` onto it. 28 new tests (103 total); lint, format, typecheck, test, and build all green._
- [x] **P1-8** Members read API: `GET /api/households/{id}/members` — _the household's active roster as the design/04 § 1 collection envelope (`{ data, page }`; a bounded set, so `page.hasMore = false`, no cursor). The wrinkle: `users` is RLS self-only (P0-12 deferred co-member display-name visibility to here), so a join under the per-request client would null out other members' names. Solved with a `list_household_members(p_household_id)` SECURITY DEFINER RPC (migration `20260524013904`) — the **safe projection** the P0-12 note promised: it joins `household_members` to `users` past the self-only policy but returns **only** `display_name` (never email/phone, design/03 § 9 least exposure), and re-checks the caller is an active member (`is_active_member`) so it can't enumerate another household's roster even if called directly. Rows are the real-time active roster — `status = 'active'` AND `expires_at > now()`, mirroring `is_active_member`'s per-row test so an expired guest drops out without waiting for the `expire_guests` job — ordered by `joined_at` (owner first). Hardened like the other helpers (`search_path=''`, fully-qualified names, EXECUTE revoked from public/anon, granted to authenticated). New `listMembers` service (`lib/services/household/list-members.ts`) gates on `getActiveMembership` (P1-4) and 404s a non-member (existence-hiding, matching the P1-6 read; defense-in-depth with the RPC's own check), invokes the RPC under the per-request RLS client, and maps rows via the new `toMemberDto` (`lib/services/household/dto.ts`, reusing `toCanFlagsDto`). New shared `lib/http/collection.ts` (`boundedCollection`, `Collection<T>`, `PageInfo`) carries the design/04 § 1 list envelope (reused by P8 notifications later). Route handler `app/api/households/[householdId]/members/route.ts` stays thin under `withErrorBoundary`. Regenerated `lib/db/database.types.ts` from cloud dev via MCP (now types the new RPC). Verified live in a rolled-back tx: an active member sees every co-member's display name, an expired-but-unswept guest is filtered out, a non-member gets zero rows. Security advisor: only the 4 by-design self-scoped SECURITY DEFINER WARNs (the new helper joins the 3 existing). 14 new tests (117 total); lint, format, typecheck, test, and build all green._

## P2 — Onboarding (save/resume)

> Design: [06](design/06_onboarding_design.md) · Roadmap: Phase 2

- [x] **P2-1** Multi-step onboarding wizard UI with forward/back navigation — _the six-step wizard from [design/06](design/06_onboarding_design.md) § 2 (`household_basics`, `food_preferences`, `meal_schedule`, `allergies_health`, `budget`, `review`) with free forward/back navigation, mounted at `/onboarding`. **Pure model** in a new client-safe `lib/onboarding` (no `server-only`, no Supabase I/O): `steps.ts` (the ordered `STEP_IDS` matching the `current_step` values, `ONBOARDING_STEPS` metadata, and `stepIndex`/`isValidStep`/`nextStep`/`prevStep` clamped navigation + `stepMeta`), `draft.ts` (the `DraftData` payload shape keyed by step exactly as design/06 § 3, all fields optional since a draft is partial, enum fields typed from the generated DB enums), and `options.ts` (the selectable choices: diet/spice/budget/meal-slot value sets derived from `Constants` with exhaustive label maps so a new enum value forces a label; cuisines + health tags as curated free-text lists). The draft API (P2-2) reuses this model. **UI**: a server-component route page (`app/onboarding/page.tsx`) outside the `(app)` shell with the same `getAuthUser` backstop as the app layout; a client `OnboardingWizard` holding `draftData` + `currentStep` in memory, rendering `WizardProgress` (step counter + bar + labels) and the active step over Back/Next/Finish controls; six step components (`components/onboarding/steps/`) bound to their slice; and reusable controlled field helpers (`fields.tsx`: `Field`, single-select `OptionGroup`, multi-select `OptionChips`, free-text `TagInput`, `BooleanToggle`, `NumberInput` that maps empty to `undefined`). Review summarizes every section and jumps back to edit. **Deliberately deferred to later P2 tasks**: autosave + save-state UI (P2-3), resume hydration (P2-4, via the wizard's `initialStep`/`initialData` props), required-field enforcement (P2-5), and the completion transaction (P2-6, via the `handleFinish` seam — today it shows a finishable-state notice). 25 new tests (136 total) over the step-model navigation + option lists; lint, format, typecheck, test, and build all green. Live: the proxy gates the new `/onboarding` prefix (307 to `/sign-in?next=/onboarding`); the authenticated wizard render needs a Supabase session not available locally (no `.env.local`), so it is covered by typecheck + build rather than a live smoke test._
- [x] **P2-2** `GET /api/onboarding/draft` + `PUT /api/onboarding/draft` (one in-progress draft per user) — _the draft read + autosave endpoints (design/06 § 5, § 6, § 9), kept thin per design/04 § 1: resolve session, delegate to one service, serialize. **`GET`** returns the caller's single `in_progress` draft as the design/06 § 9 shape (`status`, `currentStep`, `completionPercentage`, `lastSavedAt`, `draftData`) or `null` when none exists (the client then starts a fresh wizard; the first `PUT` creates the row). **`PUT`** is an idempotent upsert of that one draft: it recomputes `completion_percentage` server-side and re-stamps `last_saved_at` regardless of client input, then returns the saved draft in the same shape (the wizard derives its relative "Saved …" string from the returned `lastSavedAt`). New `onboarding` service (`lib/services/onboarding/`): `getDraft` (scoped to the caller via RLS plus an explicit `user_id` and `status = 'in_progress'` filter, so `maybeSingle` is exact under the `uq_one_active_draft_per_user` partial index); `saveDraft` (update the existing in-progress row, else insert — no `ON CONFLICT` on the partial index; a Postgres `23505` unique violation on the insert means a concurrent device won the in-progress slot, surfaced as `ConflictError` 409 so the client re-reads to reconcile, design/06 § 5); the pure `parseDraftUpdate` (lenient autosave envelope validation — `currentStep` must be a known wizard step and `draftData` a JSON object, leaf validation deferred to completion P2-6, the advisory `completionPercentage` ignored); and the shared `toDraftDto` mapper. The percentage comes from a new pure, client-safe `lib/onboarding/completion.ts` (`REQUIRED_FIELD_IDS` plus presence predicates and `computeCompletionPercentage` = `round(satisfied / 6 * 100)` over the six minimum-required fields, design/06 § 2, § 3; plus `missingRequiredFields` and `isDraftComplete` for P2-5), so the wizard bar (P2-1) and the server compute "done" identically. Route handler `app/api/onboarding/draft/route.ts` (`GET` + `PUT`) stays thin under `withErrorBoundary`; no proxy change needed — `/api/onboarding/...` is not an `(app)` shell prefix, so the endpoint self-guards via `requireAuthUser` (a 401 envelope, not a redirect). 35 new tests (171 total) over the completion model, the envelope validator, both services (update, insert, conflict, and error paths), and the handlers' status + envelope wiring; lint, format, typecheck, test, and build all green. The authenticated request path needs a Supabase session not available locally (no `.env.local`), so the endpoints are covered by typecheck + build rather than a live smoke test._
- [x] **P2-3** Autosave after each step + debounced field autosave; save-state UI states — _wires the P2-1 wizard to the P2-2 `PUT` (design/06 § 5). New client hook `useDraftAutosave` (`components/onboarding/use-draft-autosave.ts`) owns persistence: a debounced (~800 ms) field autosave on every edit plus an immediate per-step save on Next/Back, both hitting the idempotent `PUT /api/onboarding/draft` through thin fetch helpers (`draft-client.ts`). Saves are **serialized** on a promise chain (so `saveNow` resolves to the most recent server draft and last-write-wins), **coalesced** (an unchanged snapshot is not re-sent), and resilient: a `409` triggers a `GET` reconcile + one retry, other failures keep local edits and auto-retry with capped backoff (1s/2s/4s) on top of a manual retry control, and a `beforeunload` handler warns while edits are unsaved. The save-state indicator (`save-indicator.tsx`) renders the exact spec strings via a new pure, tested `lib/onboarding/save-state.ts` (`formatRelativeLastSaved` → `Saving...` · `Saved just now` · `Last saved N minutes ago` · `Save failed. Retry.`); the wizard ticks a 30s timer so the relative string stays current. 9 new `save-state` tests; lint, format, typecheck, test, and build all green._
- [x] **P2-4** Resume detection + "Continue setup" prompt (completion %, last saved, Resume / Start over) — _design/06 § 6, Flow 2 steps 6–7. The `/onboarding` page now loads the caller's in-progress draft server-side (`getDraft`, P2-2) and hands it to a new client `OnboardingExperience` (`components/onboarding/onboarding-experience.tsx`) so there is no resume-vs-fresh flash. No in-progress draft → a fresh wizard at step 1 (the first autosave creates the row). An in-progress draft → the `ResumePrompt` ("Continue setting up your household profile? You're N% done. Last saved …") with Resume / Start over (both derived from the loaded draft via `formatRelativeLastSaved`). Resume hydrates the wizard from `draftData` and deep-links to `currentStep` (validated through `isValidStep`, clamped to the first step otherwise). Start over resets the single in-progress draft to empty via one `PUT` — keeping the `uq_one_active_draft_per_user` invariant satisfied with no transient second draft — then opens a fresh wizard seeded with the reset row's id (a deliberate simplification of the doc's abandon-old-+-create-new, since the API surface in design/04 § 4.2 exposes only GET/PUT/complete; user-visible behavior is identical). Covered by typecheck + build (the authenticated render needs a Supabase session not available locally); the proxy still 307s `/onboarding` → `/sign-in?next=/onboarding` (confirmed live)._
- [x] **P2-5** Minimum-required-field validation (name, family size, diet, meals, cooking time, cuisine) — _enforced on both sides (design/06 § 2). **Client:** the wizard gates "Finish" on the presence-based `isDraftComplete`/`missingRequiredFields` (the pure `lib/onboarding/completion.ts` shipped in P2-2) and, on the Review step, lists each still-missing required field as a button that jumps back to the owning step. **Server (authoritative):** a new pure, separately-tested `lib/services/onboarding/validate-completion.ts` (`buildCompletionPayload`) does strict leaf validation — required fields present AND every leaf a valid enum / integer-in-range, mirroring each `households`/`household_preferences` CHECK/enum/type from doc 01 (enum sets from the generated `Constants` so they can't drift) — collecting all issues into one `ValidationError` (→ `VALIDATION_ERROR`, design/04 § 4.2; supersedes design/06's "422"). It also **normalizes**: trims the name, applies the schema defaults for the optional fields (spice `'medium'`, variety gap `7`, leftovers `true`, budget `'medium'`, adults/kids `0`), and emits the owner's `user_food_preferences` payload only when something was entered. 14 new `validate-completion` tests; runs as part of the P2-6 service so an incomplete draft never opens the completion transaction._
- [x] **P2-6** `POST /api/onboarding/complete` atomic transaction (household + preferences + owner membership + mark draft completed, redirect Today) — _design/06 § 7, design/04 § 4.2. The all-or-nothing, RLS-bootstrapping write is the `complete_onboarding(p_draft_id, p_household, p_preferences, p_food_preferences)` SECURITY DEFINER function (migration `20260524150953`, applied to cloud dev `dultruvperqxtqtbochp`): under a `FOR UPDATE` lock on the caller's draft it creates (or reuses an early `household_id`) the `households` row, the 1:1 `household_preferences`, the optional owner `user_food_preferences`, and the owner `household_members` row (permanent, active, every `can_\*`flag true), then marks the draft`completed` — all in one transaction. Idempotent: an already-`completed`draft returns its`householdId` and writes nothing. Hardened like P1-5/P1-8 (`search*path=''`, fully-qualified, EXECUTE revoked from public/anon, granted to authenticated). New `completeOnboarding` service (`complete-draft.ts`) validates the `draftId`(uuid), loads the draft to short-circuit an already-completed one (no re-write) and 404 a missing/unowned one, runs the strict`buildCompletionPayload` (P2-5), invokes the RPC, and maps PG error codes (`P0002`→404, `23514`/`23505`→409, else 500). Thin route `app/api/onboarding/complete/route.ts`returns`201 { householdId, status }`; the wizard's "Finish" saves-then-completes and `window.location.assign("/today")`. Regenerated `lib/db/database.types.ts`from cloud dev via MCP (now types`complete_onboarding`+`abandon_stale_drafts`). **Verified live** in a rolled-back tx (impersonated authenticated call): one household + prefs + owner row + food prefs created, draft `completed`, and an idempotent second call with garbage input created nothing new and didn't overwrite. 18 new tests (service + handler); advisor shows only the 5 by-design self-scoped SECURITY DEFINER WARNs (the 4 prior + `complete_onboarding`). lint, format, typecheck, test, build all green.*
- [x] **P2-7** Scheduled job: mark drafts `abandoned` after 30 days idle — _design/06 § 8. New `abandon_stale_drafts()` SQL function (migration `20260524151007`, applied to cloud dev) moves `in_progress` drafts with `last_saved_at < now() - interval '30 days'` to `abandoned`, returning the swept count; idempotent and a safe no-op on an empty table. Because it is a pure in-DB sweep with no external calls it runs as a direct Supabase-managed pg_cron job (no Edge Function needed) — `cron.schedule('abandon-stale-onboarding-drafts', '17 3 * * *', …)` (daily 03:17 UTC; cron.schedule upserts by name so it is reset-safe). Keying off `last_saved_at` means any autosave keeps a draft alive; abandoning frees the `uq_one_active_draft_per_user` slot so a returning user starts clean. Hardened (`search_path=''`, fully-qualified) and locked down — EXECUTE revoked from public/anon/**authenticated** (a system job, never user-callable), which is why it does not appear in the SECURITY DEFINER advisor. Verified the cron row is registered and `active`._

## P3 — Dish admin / content

> Design: [docs/06](docs/06_admin_operator_spec.md), [04](design/04_api_design.md) · Roadmap: Phase 3

- [x] **P3-1** Admin role gating + operator console shell — _operator access is a
      distinct **admin role** (not a household `can_\*`flag): the pure`isAdminUser`
predicate (`lib/auth/admin.ts`) reads the server-controlled `app*role`claim
from the verified user's`app_metadata`, and the server `requireAdmin()` guard
(`lib/auth/guards.ts`) throws `UnauthenticatedError`/`ForbiddenError`. Gated at
three layers (design/03 § 5): the edge proxy bounces signed-in non-operators
off `/admin`to`/today`(and unauthenticated visitors to`/sign-in`), the
admin layout re-checks server-side as the backstop, and every admin service
calls `requireAdmin()`. The console shell (`app/admin/layout.tsx`+ home) now
links the dish and ingredient tools. **Operator step before live use:** set`raw_app_meta_data.app_role = 'admin'`on the operator's auth user (and, for the
content-table`app_role` write-RLS backstop to fire under a user JWT, add a
      Supabase access-token hook that surfaces it as a top-level claim) — mirrors the
      P1-1 Google-credentials ops gap. 8 new auth tests.*
- [x] **P3-2** Dish list: search by name, filter (cuisine/slot/diet/status/missing-metadata), sort by recently updated — _server-rendered list at
      `/admin/dishes` (`listDishes`), newest-updated first. Filters live in the URL
      (the `DishListControls` client bar writes query params, the page re-reads them
      via the pure, lenient `parseDishListFilters` and re-queries), so views are
      shareable. "Missing metadata" flags dishes lacking a cheap-to-query activation
      field (cuisine or total time); ingredient completeness is surfaced by the
      per-dish checklist._
- [x] **P3-3** Add/edit dish form (all `dishes` fields) — _`DishForm` covers every
      editable `dishes` column (design/01): name, description, cuisine, region, meal
      slots, diet, prep/cook time, difficulty, spice, and the eight descriptor flags.
      Create (`/admin/dishes/new`) starts a `draft` and routes to the editor; edit
      saves via PATCH. `status` and the generated `total_time_minutes` are never
      written here — activation is the dedicated checklist-gated action (P3-8)._
- [x] **P3-4** Ingredient manager (CRUD, categories, allergen, common names) — _the
      `IngredientManager` (`/admin/ingredients`) creates/edits/deletes ingredients
      over local state seeded server-side. A duplicate name is a 409; an ingredient
      still used by a dish can't be deleted (the `dish_ingredients` ON DELETE RESTRICT
      FK surfaces as a 409). The `ingredients` schema has no `substitutes` column
      (design/01 is the source of truth), so that docs/06 field is intentionally
      omitted._
- [x] **P3-5** Dish-ingredient editor (quantity per serving, unit, required/optional) — _the `DishIngredientsEditor` adds/removes ingredient links from
      the catalog with a per-serving quantity, unit (defaulting to the ingredient's
      default unit), and required/optional flag. `unique(dish_id, ingredient_id)` is a
      409; a bad `ingredientId` FK is a 400._
- [x] **P3-6** Prep-task editor (task name, required-before-minutes, description) — _the `PrepTasksEditor` manages advance-prep tasks (e.g. "soak chickpeas 480 min
      ahead") that feed the prep-aware recommendation rule (P4/P7)._
- [x] **P3-7** Pairing editor (main/side/rice/bread/condiment/beverage) — _the
      `PairingsEditor` adds/removes directional, typed pairings against the dish
      catalog (self excluded). A self-pair is rejected client-side and by the
      `no_self_pair` CHECK; a duplicate pairing is a 409. Pairings are immutable links
      (create + delete only)._
- [x] **P3-8** Activate/archive dish with quality-checklist validation before activation — _the pure `evaluateQualityChecklist` (`quality-checklist.ts`) maps the
      docs/06 checklist to the schema: name, cuisine, ≥1 meal slot, diet, total time
      &gt; 0, and ≥1 ingredient are **required** gates; prep tasks and tags are
      advisory. `setDishStatus` runs it on the `active` transition and 400s (listing
      every unmet item) when the dish is not ready; `archived`/`draft` are always
      allowed. The `QualityChecklistPanel` shows live status and disables Activate
      until ready, and the server re-checks so a stale client can't force it._

> **P3 architecture & verification.** No new migration — the content tables and
> their RLS shipped in P0-7/P0-12. The `admin` service (`lib/services/admin/`)
> runs on the **service-role client** (the one user-facing path design/02
> sanctions for it), which is also the only way to read non-`active` dishes that
> the operator console needs; `requireAdmin()` is the gate that actually protects
> authoring, with the content-table `app_role` write-RLS as the in-band backstop.
> Services are kept thin behind pure validators (`validate-*.ts`, mirroring the
> P1-7 preferences pattern) and DTO mappers, with FK/unique/check Postgres errors
> mapped to typed `Conflict`/`Validation` errors. The API surface is
> `app/api/admin/dishes` (+ `[dishId]`, `/status`, and the `ingredients` /
> `prep-tasks` / `pairings` sub-collections) and `app/api/admin/ingredients`, all
> thin under `withErrorBoundary`. 151 new tests (services, validators, DTOs,
> checklist, route wiring); lint, format, typecheck, test (322 total), and build
> all green. Live: the proxy 307s `/admin` + `/admin/dishes` to `/sign-in` and the
> content API returns a 401 envelope unauthenticated; the authenticated operator
> render needs a Supabase session + `app_role` not available locally, so the UI is
> otherwise covered by typecheck + build.\_

## P4 — Recommendation engine

> Design: [05](design/05_recommendation_engine_design.md) · Roadmap: Phase 4

- [x] **P4-1** Input loaders (household prefs, active members, candidate dishes for slot, recent history/feedback) — _server-only `lib/services/recommendation/load-inputs.ts` reads each input group under the per-request RLS client and maps rows to the engine's camelCase domain types. Candidate dishes (and their bulk-loaded ingredients, prep tasks, pairings) come straight from RLS (which exposes only `active` content). Member food preferences go through a new `list_household_food_preferences` SECURITY DEFINER RPC (migration `20260524162541`), because `ufp_select` would otherwise hide co-members' allergies from a plain member — breaking allergy safety; the RPC re-checks active membership and returns only the engine-needed fields. History pre-aggregates `meal_plan_items` (within the variety window) and all-time `meal_feedback` into the engine's signal sets._
- [x] **P4-2** Hard filters (diet, allergy, slot, prep-impossible, do-not-suggest-again, guest restrictions) — _pure predicates in `hard-filters.ts` (+ `diet.ts`, `allergens.ts`, `prep.ts`). Diet is an explicit config matrix tightened by the strictest active-member override, with the vegan (no dairy/egg) and jain (no onion/garlic) ingredient refinements doc 04 calls out. Allergy union matches whole words against ingredient name/common-names/allergen-type (so "egg" excludes egg, not eggplant). Guest restrictions need no special rule: an active guest's prefs are loaded into the member set, so they fold into the diet/allergy rules._
- [x] **P4-3** Soft scoring functions with the exact weights from [design/05](design/05_recommendation_engine_design.md) — _`scoring.ts`: one config object holds the verbatim doc-04 weights; `scoreDish` returns the labelled factors that fired. Disliked ingredients/dishes and liked dishes fold into the existing factors (per the § 5 note) rather than adding new weights._
- [x] **P4-4** Variety/rotation penalty (`variety_gap_days`) — _the `+40` not-repeated / `-60` recently-cooked swing, where "recently cooked" is any history row in the window OR a dish already chosen earlier in a weekly run (the in-memory `usedThisRun` set, § 6.1/§ 10)._
- [x] **P4-5** Prep-feasibility scoring (deadline vs `required_before_minutes` vs now) — _`prep.ts` + `mealtimes.ts`: compares the longest prep lead against minutes-until-mealtime on an injected clock (UTC mealtimes, a documented MVP simplification). Returns none / deferrable (soft `-60` + emit the prep task) / impossible (hard exclude for today)._
- [x] **P4-6** Explanation generator (human-readable `reason` from winning positive factors) — _`explanation.ts` collects the positive factors that fired, orders them by weight (stable tiebreak), maps each to a phrase, and joins with an Oxford comma. Negative factors are never narrated — they surface as `missingConstraints`._
- [x] **P4-7** Ranked output contract (`dishId`, `score`, `reason`, `missingConstraints`, `prepTasks`, `pairedDishes`) — _`engine.ts` `recommendSlot` runs the filters, scores survivors, sorts `score desc, total_time asc, id asc`, and returns the top-N output contract. The composing `recommendForSlot` service loads inputs and runs it (read-only; no persistence — that is P5)._
- [x] **P4-8** Unit tests over scoring with fixture households/dishes (pure functions) — _101 new tests over the text matcher, diet matrix + refinements, allergens, prep/mealtimes, scoring weights, the explanation sentence, and whole-pipeline golden + determinism runs, plus the loaders (stub) and the service gate/integration. 423 total; lint, format, typecheck, test, build all green._

> **P4 architecture & verification.** The engine is a pure, deterministic,
> rule-based scorer (design/05) with two layers: the client-safe core
> `lib/recommendation` (no `server-only`, no I/O — config, types, the hard
> filters, soft scoring, variety, prep, explanation, and the `recommendSlot`
> pipeline) and the server-only `lib/services/recommendation` (the input loaders +
> the composing `recommendForSlot`). Decoupling row shapes from the engine's
> camelCase domain types keeps scoring trivially unit-testable with plain
> fixtures (`test-fixtures.ts`), and the only clock is an injected `now`, so prep
> edge cases are reproducible. One new migration (`20260524162541`) adds the
> `list_household_food_preferences` SECURITY DEFINER projection so allergy
> filtering sees every active member regardless of the caller's permissions
> (the P1-8 safe-projection pattern); types were regenerated from cloud dev via
> MCP. Verified live in a rolled-back tx (active member sees all co-members'
> prefs, non-member sees none); security advisor clean except the 6 by-design
> self-scoped SECURITY DEFINER WARNs. The engine is read-only; the generate
> endpoints + Today/Plan screens that persist `meal_plan_items` are P5.

## P5 — Meal planning

> Design: [08](design/08_meal_planning_grocery_prep_design.md) · Roadmap: Phase 5

- [x] **P5-1** `POST .../meal-plans/today/generate` + Today screen (with recommendation reason) — _resolves/creates a single-day `meal_plans` row, runs the P4 engine for the slot, and upserts the `meal_plan_items` cell (`status = 'suggested'`, the explanation in `reason`). Returns the design/08 § 2 `{ mealPlanId, mealPlanItem, alternatives }` shape (a superset of the design/04 § 4.5 contract — the runner-ups let the client offer "Suggest another" without a round trip). Locked cells and `eating_out` cells are returned untouched (idempotency, design/08 § 2 step 2). The Today screen (`/today`) resolves the caller's household, renders one `SlotCard` per `meals_to_plan` slot, and wires generate/accept/reject/suggest-another/eating-out/lock to the action endpoints with per-card local state._
- [x] **P5-2** Accept / reject / suggest-another; record `meal_feedback` + penalize rejected — _three item actions following the design/04 `meal-plan-items/{id}/{action}` convention. **Accept** → `status = 'accepted'`. **Suggest another** (no reason) re-runs the recommender excluding the current dish and overwrites the cell in place (`generateToday` with `excludeDishIds`). **Reject** inserts a `meal_feedback` row (the recommender reads it: `do_not_suggest_again` is a hard exclude, `disliked`/`kids_disliked` a soft penalty) and marks the cell `rejected` **keeping its dish** so the rotation + feedback→dish signals the P4 loader derives stay correct; it returns ranked alternatives for the Replace step rather than overwriting (which would lose the rejection signal — the cell is one row). Filling the slot is Replace (P5-4)._
- [x] **P5-3** `POST .../meal-plans/week/generate` + weekly Plan screen (honor `meals_to_plan`) — _walks every `(date, slot)` over the range for `household_preferences.meals_to_plan` only, skips locked + `eating_out` cells, and excludes dishes already chosen this run (`chosenThisRun` hard-exclude layered on the engine's history rotation, design/08 § 3) so the week has variety; writes all picks in one bulk upsert. Gated by `can_change_weekly_schedule`. The Plan screen (`/plan`) renders the upcoming 7-day grid with Generate-week + per-cell Swap/Eating-out/Lock, refreshing via `router.refresh()` since the week is server-rendered._
- [x] **P5-4** `POST /api/meal-plan-items/{id}/replace` (records reason, notifies on confirmed change) — _validates the chosen `replacementDishId` is an eligible dish for the slot (or picks the top recommendation when omitted), records a `meal_feedback` row when a rejection reason is supplied, swaps the dish, and sets the cell `accepted` (design/08 § 5). Returns the item + `groceryListUpdated`. 409 when the cell is locked. The confirmed-meal-change `meal_changed` notification (design/08 § 5 step 6, P8) and grocery regeneration (P7) are marked hook points._
- [x] **P5-5** `POST /api/meal-plan-items/{id}/eating-out` (no rotation penalty + triggers grocery regen) — _clears `dish_id` and sets `eating_out` (design/08 § 6); because no `cooked` row is recorded and the dish is nulled, the dish keeps no rotation footprint — the fairness rule holds automatically via the P4 history query's `status` filter. 409 when locked. Grocery regen (P7) is a marked hook._
- [x] **P5-6** Lock / unlock meal (locked items excluded from regeneration) — _flips `meal_plan_items.locked` (design/08 § 7); the weekly generator's locked branch skips these cells, and locking is orthogonal to status. The `meal_locked`/`meal_unlocked` notification (P8) is a marked hook; no grocery change._
- [x] **P5-7** Meal history view + mark cooked (feeds variety logic) — _`meal_plan_items` is the history (design/08 § 8); `listMealHistory` reads past cells (most-recent-first) and the Plan screen renders them with a "Mark cooked" affordance. `POST .../{id}/cooked` sets the terminal `cooked` status (gated by `can_change_today_menu`, the date-aware rule for past cells), which is exactly what the P4 rotation query counts._

> **P5 architecture & verification.** No new migration — the planning tables and
> their RLS shipped in P0-8/P0-12, and every P5 write is satisfied by the
> per-request RLS client (the `mp_*`/`mpi_*`/`mf_insert` policies allow today-OR-weekly
> inserts/updates and self feedback inserts), so no SECURITY DEFINER bootstrap was
> needed (unlike P1-5/P2-6). The new `mealPlan` service (`lib/services/meal-plan/`)
> composes the read-only P4 engine with persistence and is kept thin behind pure,
> separately-tested modules: `validate.ts` (request validators reusing the
> recommendation date helpers), `dto.ts` (snake→camel mappers), `access.ts` (the
> FORBIDDEN-vs-NOT_FOUND gate + the **date-aware** item permission — today cell →
> `can_change_today_menu`, future cell → `can_change_weekly_schedule`, design/08 § 5),
> `plans.ts` (plan resolve/create with a `uq_active_plan_per_start` race re-read),
> `suggest.ts` (read-only slot ranking with `excludeDishIds`), `generate.ts`
> (today + weekly), `items.ts` (the per-item actions), and `reads.ts` (the
> Today/Plan/History projections). A new `resolveCurrentHousehold` in the
> `household` service backs the screens (earliest-joined active membership, since
> a user can be in more than one household; switcher is a future enhancement). The
> endpoint surface is `app/api/households/{id}/meal-plans/{today,week}/generate`
> and the `app/api/meal-plan-items/{id}/{accept,reject,suggest-another,replace,eating-out,lock,unlock,cooked}`
> actions, all thin under `withErrorBoundary`. **Cross-phase hooks (not yet wired):**
> grocery regeneration (design/08 § 9/§ 10, P7) and the menu/lock/eating-out
> notifications (design/09, P8) are marked inline where § 5/§ 6/§ 10 call for them —
> those services don't exist yet, mirroring how P4 left persistence to P5.
> **Known limitation:** `do_not_suggest_again` is derived by the P4 loader joining
> `meal_feedback` to the live `meal_plan_items.dish_id`; once that cell is later
> overwritten (a replacement), the permanent exclusion no longer resolves to the
> originally-rejected dish — a clean fix is a `meal_feedback.dish_id` snapshot
> column + loader change, deferred so P5 stays schema-free. 81 new tests (validators,
> DTOs, the access gate, plan resolver, generate branches incl. the weekly
> skip/exclusion rules, the item actions, reads, `resolveCurrentHousehold`, and all
> ten route handlers); 504 total. lint, format, typecheck, test, and build all
> green. The authenticated Today/Plan render needs a Supabase session + content
> not available locally, so the screens are covered by typecheck + build; the
> proxy still gates `/today` + `/plan` and the API self-guards (401 envelope)
> unauthenticated. **With P6 done (see the P6 section), the suggested next task is
> `P7-1`** (grocery generation). Still open from P0: `P0-14` (seed catalog +
> 100 dishes — needed before the recommender has anything to suggest live) and
> `P0-3`'s prod-project step.

## P6 — Household collaboration

> Design: [07](design/07_household_collaboration_design.md), [03](design/03_auth_and_security_design.md) · Roadmap: Phase 6

- [x] **P6-1** Create invite: `POST .../invites` (hashed-at-rest token, expiry, email send) — _the inviter (gated by `can_invite_members`) inserts the `household_invites` row under the per-request RLS client (`hi_insert`); no SECURITY DEFINER needed since they are an active member. The token is a bearer secret: a fresh 256-bit `base64url` plaintext is generated, only its `sha256` hash is stored, and the plaintext is returned once inside `inviteLink` (design/03 § 7, `lib/services/invite/token.ts`). The invite's full resolved 8-flag permission set (role defaults overlaid with overrides) is stored on the row so accept just copies it. `validateCreateInvite` enforces `invite_has_target` (email or phone), the `member_role` (owner not invitable) / `membership_type` enums, and a non-null future `expiresAt` — required for a guest, defaulted to 7 days for a permanent invite. Email/SMS send is the P8 notification hook (the link is returned for manual sharing meanwhile)._
- [x] **P6-2** `GET /api/invites/{token}` unauthenticated, safe payload only (no sensitive household data) — _served via the `get_invite_preview` SECURITY DEFINER RPC (migration `20260524175648`), the only anon-callable function. It hashes nothing itself — the route hashes the plaintext and passes the hash — and returns ONLY the safe projection (household name, inviter display name, membership type, role, expiry) for a pending, unexpired invite, keyed by the unguessable token hash. Per design/03 § 7 there is **no existence oracle**: any unknown/expired/used token yields the same generic `NOT_FOUND` (this collapses the design/04 § 4.3 CONFLICT reasons on the public path deliberately)._
- [x] **P6-3** Accept / decline invite (`.../accept`, `.../decline`) → activate membership — _`accept_invite` / `decline_invite` SECURITY DEFINER RPCs (same migration): the invitee is not yet a member, so the `hi_update` / `hm_insert` RLS would reject under their JWT — the functions bootstrap past it, acting only on the token-addressed row and writing a membership for `auth.uid()` alone. Accept is one transaction: invite `pending → accepted` + insert the `active` membership (role / type / permissions / window from the invite; a temporary guest carries the invite expiry, a permanent member gets `null`), guarded by `uq_one_live_membership` (`23505 → 409 already a member`); a non-pending/expired invite raises `23514 → 409`, an unknown token `P0002 → 404` (no oracle). The public `/invite/{token}` landing page renders the preview + Accept/Decline; a `401` bounces to `/sign-in?next=/invite/{token}`._
- [x] **P6-4** Member list + permissions management UI — _the `/household` screen resolves the caller's household + active roster (`listMembers`, P1-8) and renders the `HouseholdMembers` client panel: invite form (creates + shows the one-time link), the roster with role/type/status/expiry, and — gated by the caller's `currentUserPermissions` — per-member role change, transfer-ownership, remove, and a leave button. Mutations re-sync via `router.refresh()`._
- [x] **P6-5** `PATCH .../members/{id}` update role/permissions (gated) — _`updateMember` gated by `can_remove_members`. `validateMemberUpdate` accepts a `role` and/or a subset of top-level camelCase `can_\*` flags. A plain edit re-applies the role's default bundle (if role changed) then overlays explicit flags, under the RLS client (`hm*update`). The owner is immutable via this path (409); setting `role: "owner"` is the transfer trigger (P6-8). A non-member → 404, lacking the flag → 403.*
- [x] **P6-6** Remove member (`.../remove`) — loses access, keeps activity attribution — _`removeMember` (gated by `can_remove_members`) soft-sets `active → removed` under the RLS client, so the user fails `is_active_member` on their next request while history/attribution survive. The owner can't be removed (409, transfer first) and you can't remove yourself (409, use leave)._
- [x] **P6-7** Leave household (`.../leave`) for non-owners — _`leaveHousehold` sets the caller's own membership `active → left` (`hm_update` allows `user_id = auth.uid()`). An owner is blocked (409) — they must transfer ownership first._
- [x] **P6-8** Ownership transfer (required before owner can leave) — _`transfer_ownership` SECURITY DEFINER function (migration `20260524175707`) atomically promotes the target to owner (every flag) and demotes the outgoing owner to admin, preserving exactly-one-owner; it re-verifies the caller is this household's active owner (`42501 → 403`). Exposed through the member-update path (`role: "owner"`); the leave guard (P6-7) enforces "transfer before leave."_
- [x] **P6-9** Temporary-guest expiry: `expire_guests` scheduled job + real-time `expires_at > now()` checks — _`expire_guests()` (hourly) + `expire_invites()` (daily) pg_cron jobs (migration `20260524175722`) flip lapsed `temporary_guest` members / `pending` invites to their terminal status for durable bookkeeping. The **authoritative** enforcement is the real-time `expires_at > now()` check already in `is_active_member` / `has_permission`, the invite RPCs, and `isMembershipActive` — so access stops the instant the window closes, independent of the jobs (design/03 § 8). Both functions are `EXECUTE`-revoked from all user roles (system jobs)._

> **P6 architecture & verification.** Three migrations, all functions only — the
> `household_invites` / `household_members` tables + RLS shipped in P0-6/P0-12, so
> no schema change. Invites store a **hashed** token (the `invite` service owns
> generation + `sha256` hashing in `lib/services/invite/token.ts`, never plaintext
> at rest). The unauthenticated preview and the accept/decline/transfer writes are
> SECURITY DEFINER RPCs (the invitee/owner-bootstrap pattern of P1-5/P2-6),
> hardened like the others (`search_path = ''`, fully-qualified, `auth.uid()`
> schema-qualified, EXECUTE locked down). Create invite, remove, and leave run on
> the per-request RLS client (the caller is already an active member). Services are
> thin behind pure validators (`validate.ts`, `validate-member.ts`) and DTO mappers;
> the new `defaultPermissionsForRole` / `parsePermissionOverrides` / camelCase
> `PERMISSION_CAMEL_KEYS` live in the pure `lib/auth/permissions` model and are
> shared by the invite + member-update validators. The endpoint surface is
> `app/api/households/{id}/invites`, `app/api/invites/{token}(/accept|/decline)`,
> `app/api/households/{id}/members/{memberId}(/remove)`, and
> `app/api/households/{id}/leave`, all thin under `withErrorBoundary`; the UI is the
> `/household` members panel + the public `/invite/{token}` landing page (rendered
> outside the `(app)` shell). Types were regenerated from cloud dev via MCP.
> **Verified live** in a rolled-back tx (13 assertions): preview returns the safe
> projection and an unknown hash returns nothing; a guest accepts and lands active
> with the invite's viewer flags + carried expiry; a second accept is blocked
> (`23514`); ownership transfer leaves exactly one owner and demotes the old owner
> to admin; a non-owner transfer is blocked (`42501`); and `expire_guests` flips a
> lapsed guest to `expired`. **Cross-phase hooks (not yet wired):** the
> `member_joined` / `member_removed` / `permissions_changed` activity events and
> notification fan-out (design/07 § 6, § 9, § 10; P8) are marked inline in the SQL
> functions and services, mirroring how P5 deferred notifications. 99 new tests
> (603 total); lint, format, typecheck, test, and build all green. Security advisor:
> the new `get_invite_preview` adds the **one** by-design anon-callable (0028) WARN
> — intentional for the unauthenticated landing, keyed by the unguessable token
> hash and exposing only the safe projection — and accept/decline/preview/transfer
> add to the by-design self/capability-scoped SECURITY DEFINER (0029) WARNs;
> `expire_guests`/`expire_invites` don't appear (EXECUTE revoked).

## P7 — Grocery & prep

> Design: [08](design/08_meal_planning_grocery_prep_design.md) · Roadmap: Phase 7

- [x] **P7-1** Grocery generation algorithm: aggregate `dish_ingredients`, scale by `family_size`, merge same ingredient+unit, group by category — _pure, unit-tested core `aggregateGroceryLines` (`lib/services/grocery/aggregate.ts`): one entry per planned-meal occurrence (a dish planned twice counts twice), `scaledQty = quantity_per_serving * family_size` summed, merge key `(ingredient_id, unit)` (same unit sums; different unit stays separate — the documented unit-conversion concern), category-ordered via the shared `lib/grocery/labels` `CATEGORY_ORDER` (the doc-08 § 9 display order: vegetables → pantry). Source set is `dish_id is not null and status NOT IN ('eating_out','skipped')` (design/08 § 9). The server loaders read planned items + `dish_ingredients` + `ingredients` + `family_size` under the per-request RLS client._
- [x] **P7-2** Grocery list screen + check-off (`checked` flag) — _`/grocery` resolves the caller's current plan (longest active plan covering today, else the most recent) and renders the `GroceryBoard`: items grouped by category, each line checkable, with a Regenerate control (gated client-side on `can_manage_grocery_list`). `GET /api/households/{id}/grocery-list?mealPlanId=…` returns the design/04 § 4.6 shape (member-gated, 404 for no list yet); `PATCH /api/grocery-list-items/{id}` flips `checked` (gated by `can_manage_grocery_list`, household resolved from the parent list, RLS-hidden rows read as 404)._
- [x] **P7-3** Regeneration triggers + `POST .../grocery-list/regenerate` (idempotent, one list per plan) — _the explicit endpoint is gated by `can_manage_grocery_list` and verifies the plan is in the caller's household; the write is the `replace_grocery_list` SECURITY DEFINER RPC (migration `20260524192232`) — upserts the one `grocery_lists` row (`unique(meal_plan_id)`), deletes + re-inserts items from the TS-computed jsonb (`checked` resets, the documented MVP trade-off, design/08 § 10), re-checks active membership so the RLS bypass is tenancy-safe. Side-effect regeneration (best-effort, never fails the meal mutation) is wired into today/week generate, replace, and eating-out, plus a `family_size` preferences change (rescales existing lists for active plans) — exactly the design/08 § 10 trigger table._
- [x] **P7-4** Prep-task extraction for upcoming meals + deadline computation — _pure, unit-tested `computePrepReminders` (`lib/services/prep/deadlines.ts`): `prepDeadline = mealtime − required_before_minutes`, reusing the recommender's `mealtimeUtcMs` (UTC slot clock, the same documented MVP simplification — no household tz yet), sorted earliest-first with an `overdue` flag. The server `getUpcomingPrepTasks` (member-gated) loads the next 48h of planned items (`status NOT IN ('eating_out','skipped')`) joined to `dish_prep_tasks`._
- [x] **P7-5** Prep reminders surfaced on dashboard — _the Today screen renders the derived, deadline-sorted prep list (`PrepReminders`, a server component) with overdue items highlighted (design/08 § 11). This is the always-available delivery path — it needs neither the cron job nor P8._
- [x] **P7-6** `prep_reminders` hourly scheduled job (timezone-aware) — _`prep_reminders()` pg_cron job (migration `20260524192351`, hourly at :13) finds prep tasks entering their window this hour and inserts `prep_task_due` in-app notifications for active members (system actor), dedup-guarded (hourly window + a 2-hour same-recipient/message guard, since the `notifications` table has no entity_id to key on — a P8 schema decision). UTC slot clock (no household tz column yet). EXECUTE revoked from all user roles (system job). Because the canonical `lib/events` fan-out + dedup schema are owned by P8 (P5/P6 likewise deferred fan-out), the job delivers the in-app rows directly for now; the dashboard path (P7-5) is independent of it._

> **P7 architecture & verification.** Two migrations, both functions only — the
> planning/grocery tables + RLS shipped in P0-8/P0-12, so no schema change. The
> grocery list is a **derived projection** (design/08 § 9/§ 10): the algorithm is
> pure, unit-tested TS (`lib/services/grocery/aggregate.ts`) and the write is the
> idempotent `replace_grocery_list` SECURITY DEFINER RPC (upsert one list, delete +
> re-insert items from jsonb), which re-checks active membership so it can bypass
> the `can_manage_grocery_list` write-RLS for the **side-effect** regen (a permitted
> meal change must keep the list in sync even if its actor lacks the grocery flag)
> while staying tenancy-safe — the explicit regenerate endpoint still gates the flag
> at the service layer. Side-effect regen is best-effort (a grocery glitch never
> fails the meal mutation). Prep is read-only: a pure deadline core + a member-gated
> dashboard read, plus the hourly `prep_reminders` cron job for the in-app inbox.
> Services are thin behind the pure aggregate/deadline cores, request validators,
> and DTO mappers; the endpoint surface is `app/api/households/{id}/grocery-list`
> (+ `/regenerate`) and `app/api/grocery-list-items/{id}`, all thin under
> `withErrorBoundary`; the UI is the `/grocery` board + the Today prep panel. Types
> were regenerated from cloud dev via MCP (now type `replace_grocery_list` +
> `prep_reminders`). **Verified live** in a rolled-back tx: an active member's first
> call materializes one list (`Salt,Spinach`), a second call keeps exactly one list
> and replaces its items (`Rice`, idempotent `unique(meal_plan_id)`), and a
> non-member is blocked (`42501`); `prep_reminders()` is a safe no-op on the empty
> DB and its hourly cron row is `active`. **Cross-phase hooks (not yet wired):** the
> grocery/menu/prep activity events + notification fan-out (design/09, P8) are marked
> inline. 51 new tests (654 total); lint, format, typecheck, test, and build all
> green. Security advisor: `replace_grocery_list` adds the **one** expected
> by-design self-scoped SECURITY DEFINER (0029) WARN; `prep_reminders` does not
> appear (EXECUTE revoked). **With P7 done, the suggested next task is `P8-1`**
> (activity-event writer). Still open from P0: `P0-14` (seed catalog + 100 dishes)
> and `P0-3`'s prod-project step.

## P8 — Notifications

> Design: [09](design/09_notifications_design.md) · Roadmap: Phase 8

- [x] **P8-1** `lib/events` activity-event writer (one `household_activity_events` row per domain change) — _the writer is `emitHouseholdEvent` / `safeEmitHouseholdEvent` (`lib/events/emit.ts`), which renders the title+message (design/09 § 6) and threads one call to the `emit_household_event` SECURITY DEFINER RPC. The RPC writes exactly **one** audit row per change (always — even when fan-out yields no recipients), carrying the actor, `entity_type`/`entity_id`, and `old_value`/`new_value` snapshots. Both `notifications` and `household_activity_events` have NO authenticated insert policy (P0-12: "server/service-role path only"), so rather than the service-role client (banned from request paths), the RPC runs SECURITY DEFINER on the caller's per-request RLS client with an `is_active_member` tenancy guard — the same pattern as `replace_grocery_list`._
- [x] **P8-2** Notification fan-out (all active members minus actor → one `notifications` row each) — _the same `emit_household_event` RPC (migration `20260524200532`) does the design/09 § 4 fan-out atomically with the audit write: active members (`status = 'active'` AND not expired) **minus the actor**, UNION explicit `extraRecipientIds` (the affected member who is not the actor — e.g. the removed member, or whose role/permissions changed, design/09 § 2 recipient note), deduped, one `notifications` row each with the pre-rendered title+message. **Verified live** in a rolled-back tx (`member_removed` with an extra recipient): 1 audit row; 2 notifications — the active member and the removed member got one each, the actor got none (roadmap acceptance: "actor does not receive duplicate"), and an expired-but-unswept guest was excluded. EXECUTE revoked from anon, granted to authenticated; advisor shows only the expected by-design self-scoped (0029) WARN._
- [x] **P8-3** In-app notifications: `GET /api/notifications`, mark read, unread badge — _the `notification` service (`lib/services/notification/`): `listNotifications` returns the design/09 § 7 inbox shape (`items` / `unreadCount` / `nextCursor`), recipient-scoped by RLS (`notif_select`) plus an explicit `recipient_user_id` filter, cursor-paginated `(created_at desc, id desc)` via a pure opaque keyset cursor (`cursor.ts`); `markNotificationRead` is idempotent (writes `read_at` only when null, re-reads to disambiguate already-read vs not-found → existence-hiding 404) and `markAllNotificationsRead` clears the badge in one statement. Endpoints `GET /api/notifications`, `POST /api/notifications/{id}/read`, `POST /api/notifications/read-all`, all thin under `withErrorBoundary` and self-guarding via `requireAuthUser` (401, not a redirect — not an `(app)` prefix). UI: the `/notifications` inbox (server-rendered first page + the client `NotificationList` with per-item / mark-all read and "Load more") and the header `NotificationBell` unread badge (server-rendered count, refreshed on mount + tab focus)._
- [x] **P8-4** Notifier port abstraction (pluggable channel adapters) — _`lib/events/notifier/`: the `Notifier` port (`port.ts`, the design/09 § 1 `Channel` / `NotificationPayload` / `send` interface), a `NotifierRegistry` mapping `Channel` to adapter, and `buildDefaultRegistry()` wiring all five channels — a real `EmailNotifier` plus no-op adapters for `inApp` (in-app rows are the §4 batch insert, not a post-commit send, design/09 § 5), `push`, `whatsapp`, and `sms`. Adding push later is registering one adapter — no domain code changes (the design/02 extraction seam)._
- [x] **P8-5** Email adapter for invites (transactional provider) with retry — _`EmailNotifier.sendInvite` (`email.ts`) renders the invite email (`invite-email.ts`, pure + HTML-escaped per design/09 § 6) and sends it through a `ResendEmailTransport` (`email-transport.ts`, the Resend REST API) wrapped in `retryWithBackoff` (`retry.ts`, bounded exponential backoff with an injectable clock, design/09 § 9). Unconfigured (no `RESEND_API_KEY`) the adapter is a best-effort no-op, so local dev needs no provider and a failed email never blocks invite creation (the link is also returned for manual sharing). The router's `sendInviteEmail` resolves the adapter from the registry and swallows transport failures._
- [x] **P8-6** Wire menu/schedule/member-change events into the relevant services — _`safeEmitHouseholdEvent` is called (best-effort, after the mutation, mirroring `safeRegenerateGroceryListForPlan`) from: `mealPlan` items (`meal_changed` on replace, `meal_rejected`, `meal_marked_eating_out`, `meal_locked`/`meal_unlocked`) and weekly generate (`weekly_plan_generated`); `household` services (`member_left` — emitted **before** the status flip so the leaver still passes the tenancy guard; `member_removed` with the removed user as an extra recipient; `role_changed`/`permissions_changed` with the affected member as an extra recipient); and `invite` (`member_invited` in-app fan-out + the invitee email; `invite_accepted` after the accept RPC makes the caller an active member). The actor is excluded inside the RPC, so no self-notifications._

> **P8 architecture & verification.** One migration, function-only — the
> `notifications` / `household_activity_events` tables + RLS shipped in P0-9/P0-12,
> so no schema change. The cross-cutting `lib/events` module (design/02) is the
> single write path: a pure, client-safe core (`types.ts` event taxonomy,
> `templates.ts` content templates with the verbatim docs/09 examples, `format.ts`
> slot-label / short-date / actor-name helpers) plus the server-only
> `emit.ts` orchestrator over the atomic `emit_household_event` RPC, and the
> `notifier/` port + registry + adapters (a real Resend `EmailNotifier` with
> retry; no-op `inApp`/`push`/`whatsapp`/`sms`). In-app delivery is the §4 batch
> insert (durable on commit); external delivery (the invite email) is best-effort
> and out of band (design/09 § 9). The `notification` service backs the inbox API +
> the `/notifications` screen + the header badge. Migration `20260524200532` adds
> `emit_household_event` (SECURITY DEFINER, `search_path = ''`, fully-qualified,
> `is_active_member` tenancy guard, EXECUTE revoked from anon and granted to
> authenticated — the P1-5/P7-3 RLS-bootstrap pattern); types were regenerated
> from cloud dev via MCP (the new RPC's nullable args are hand-annotated, since the
> generator omits arg nullability). **Verified live** in a rolled-back tx: the
> fan-out notifies active members + extra recipients, excludes the actor and an
> expired guest, and writes one audit row; all throwaway rows rolled back (no DB
> pollution). Security advisor: `emit_household_event` adds the **one** expected
> by-design self-scoped SECURITY DEFINER (0029) WARN. Prep reminders still deliver
> in-app rows directly via the P7-6 `prep_reminders` cron job (system actor); a
> future pass can fold them onto this path. `invite_declined` is intentionally not
> wired — the decliner is not an active member, so the standard tenancy-guarded
> fan-out doesn't apply; a clean fix folds it into the `decline_invite` RPC,
> deferred. 57 new tests (711 total); lint, format, typecheck, test, and build all
> green. The authenticated inbox/badge render needs a Supabase session not
> available locally, so the UI is covered by typecheck + build; the API self-guards
> (401) unauthenticated. **With P8 done, the suggested next task is `P9-1`**
> (analytics/metrics). Still open from P0: `P0-14` (seed catalog + 100 dishes) and
> `P0-3`'s prod-project step.

## P9 — Beta hardening

> Design: [docs/13](docs/13_success_metrics.md) · Roadmap: Phase 9

- [ ] **P9-1** Analytics/metrics events (north-star + activation/engagement metrics)
- [ ] **P9-2** In-app feedback collection
- [ ] **P9-3** E2E tests of key flows (onboarding, generate, invite/accept, grocery)
- [ ] **P9-4** Permission-matrix tests (RLS + service guards across roles)
- [ ] **P9-5** Seed data improvements from recommendation-quality feedback
- [ ] **P9-6** Accessibility & responsive pass
- [ ] **P9-7** Beta with 10–20 households for 2 weeks + bug-fix buffer

## P10 — Meal combinations & 3-mode preferred dishes

> Design: extends [docs/04](docs/04_recommendation_engine.md),
> [docs/07](docs/07_onboarding_save_resume_spec.md), and
> [design/01](design/01_database_design.md). Plan:
> `.claude/plans/we-just-add-a-warm-dragonfly.md`.
>
> Expands the onboarding "preferred dishes" step into **three card-based modes** —
> Select admin-curated meal combinations, Build your own (per-dish frequency tier +
> "goes with" accompaniments), or Let the system decide — for the South-Asian
> "dal + dry veg + bread + rice" plate. Combinations are a fixed set of catalog
> dishes; frequency is a three-tier enum (`daily` / `once_a_week` /
> `once_in_a_while`); user-built combos reach the catalog via **pending admin
> review**. Confirmed scope: everything end-to-end.

- [x] **P10-1** Schema: `meal_combinations` + `meal_combination_items` tables,
      `combination_status` + `meal_frequency` enums, `dishes.popularity_count`,
      `household_dish_preferences` + `household_dish_accompaniments`, indexes, RLS,
      and the `increment_combination_popularity` / `increment_dish_popularity` /
      `propose_meal_combination` SECURITY DEFINER RPCs — _migrations
      `20260525210000`..`20260525210300`, applied to cloud dev via MCP; types
      regenerated; security advisor shows only the expected by-design SECURITY
      DEFINER WARNs. Combinations are global content (auth read of `active` + admin
      write + proposer self-read); the frequency/accompaniment tables are
      household-scoped (`is_active_member` / `can_edit_household_preferences`)._
- [x] **P10-2** Seed: admin-curated starter combinations — _`supabase/seed/combinations.mjs`
      (8 combos covering vegetarian/vegan/jain/non-veg, e.g. Rajma Chawal Thali,
      Idli Sambar Chutney) wired into `generate.mjs` with diet-coherence validation;
      regenerated `seed.sql`; applied to cloud dev (8 combos / 24 items, descending
      seed popularity)._
- [x] **P10-3** Onboarding: 3-mode card UI + data plumbing — _expanded the
      `PreferredDishes` draft shape; new catalog services/routes
      (`/api/onboarding/combinations`, `/api/onboarding/accompaniments`, shared
      `diet-compatibility.ts`, popularity-ordered dish catalog); `DishCard` /
      `CombinationCard` / `BuildDishConfig` / `ModeCard` components; the rewritten
      `preferred-dishes-step.tsx`; `validate-completion.ts` + the
      `complete_onboarding` RPC (`20260525210400`, +`p_combination_prefs`) persist
      combos/frequency/goes-with; review-step + edit round-trip updated._
- [x] **P10-4** Recommendation engine: combination popularity + frequency tier —
      _added `popularDish` / `frequencyDaily` / `frequencyOnceInAWhile` factors
      (types/config/scoring/explanation) behind a `combinations.enabled` config flag
      so the doc-04 baseline stays reproducible; a `daily`-tier dish waives the
      variety-gap penalty (the "everyday staple" intent); loaders read
      `dishes.popularity_count`, the household's `household_dish_preferences`, and
      the popular-combination dish set, threaded through `recommend.ts` + weekly
      `generate.ts`. typecheck, lint, format:check, and all 759 tests green._
- [x] **P10-5** Promotion workflow: daily-approval hook submits a self-built combo
      as `proposed` (`safeProposeCombination` in `acceptItem`), admin review service + routes + pages (`/admin/combinations`, list/approve/reject), nav link — _**Promotion:** `safeProposeCombination` (new `lib/services/meal-plan/propose-combination.ts`) fires from `acceptItem`; when the accepted dish has household `household_dish_accompaniments` (a Mode-2 self-built plate) it submits main + accompaniments through the `propose_meal_combination` SECURITY DEFINER RPC (active-member gate, active-dish validation, name dedupe), best-effort so a glitch never fails the accept. The combo diet is the household's own diet (the plate is coherent by construction); cuisine comes off the main dish. **Review:** new `admin` service `combinations.ts` (`listCombinations` by status, `approveCombination` to active, `rejectCombination` to rejected) on the service-role client behind `requireAdmin`, resolving member-dish names plus the proposer + household display names via id-to-name lookups (no embedded FK-hint joins, matching admin/client.ts). Routes `GET /api/admin/combinations` and `POST /api/admin/combinations/{id}/status`; the server-rendered `/admin/combinations` page (status tabs, proposed = FIFO review queue) with a `CombinationReviewActions` client island, plus the nav + console-home links. No new migration (reuses the P10-1/P10-3 tables + RPC)._
- [x] **P10-6** Tests: engine factor/explanation/variety coverage, validate-completion
      modes, admin combinations service, diet-compatibility unit — _35 new tests (759 to 794): the P10 scoring factors (popularDish via own-popularity-or-popular-combo, frequencyDaily +35 / frequencyOnceInAWhile −20, the daily-staple variety waiver, and the combinations-disabled doc-04 baseline); the explanation phrases for the new positive factors; `validate-completion` combinations + build modes (selected-combo dedupe + uuid guard, built-dish to liked-dish mapping, bad-frequency reject); the admin combinations service (hydrate/order/approve/reject/404 paths); the `safeProposeCombination` hook (payload shape, no-accompaniments / no-prefs / no-dish no-ops, best-effort error swallow); and a `diet-compatibility` unit. items.test asserts accept fires the hook._
- [x] **P10-7** Verification: RPC checks in a rolled-back tx; end-to-end manual walk
      of all 3 modes + admin approval + regenerate; quality gates — _RPC + RLS verified live on cloud dev in rolled-back transactions: `propose_meal_combination` inserts a `proposed` user_proposed combo with both dishes in sort order and is idempotent on re-submit (same id); a non-member call raises 42501 (403) and a fewer-than-two-dish or inactive-dish set raises 23514; and the approval transition flips a combo from member-invisible (`proposed`) to globally readable (`active`) for a different authenticated user. Live gating: `/admin/combinations` 307s to `/sign-in` and both combination APIs return the 401 envelope unauthenticated. Security advisor unchanged (P10 added no migration; only the by-design self-gated SECURITY DEFINER WARNs). Quality gates green: lint, typecheck, 794 tests, format:check, build. The full authenticated admin UI walk needs the operator `app_role` (the documented ops gap), so the console render is covered by typecheck + build._

> **P10 complete.** All seven tasks are done and verified on branch
> `feat/p10-meal-combinations` (typecheck, lint, format:check, 794 tests, build
> green; RPC + RLS checks in rolled-back transactions on cloud dev). The completion
> RPC bumps combo popularity (Mode 1), writes `household_dish_preferences` /
> accompaniments + dish popularity (Mode 2), and folds built mains into
> `liked_dishes`; accepting a self-built plate now promotes it to the admin review
> queue (P10-5). Open design note: Mode 1 combo selections influence
> recommendations only via **global** combo popularity (no per-household
> combo-selection table yet — deferred, see the plan's risks).
