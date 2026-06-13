# 05 — Two-Developer Implementation Tracker (Meal Provider Workspace)

> **Source specs:** design spec → [`design/meal-provider/01_design_spec.md`](../../meal-provider/01_design_spec.md);
> use-case spec → [`design/meal-provider/02_use_case_spec.md`](../../meal-provider/02_use_case_spec.md).
> Task "Use cases" rows (UC-…) reference the use-case spec.

**Main deliverable.** Parallel tracks converging through explicit contracts
(`03_contracts.md`) and checkpoints (`06_integration_plan.md`).

- **Developer A — Domain & platform:** shared contracts (where assigned),
  migrations, RLS, provider services, APIs, cutoff processing, aggregation, CSV +
  email backend, integration/RLS tests.
- **Developer B — Web product experience:** workspace routing, provider shells,
  provider + member onboarding UI, menu builder, member response UI, preparation
  UI, print UI, Playwright E2E. Builds against contract **fixtures** until A's APIs land.
- **Track C — Mobile experience (ADR-17):** the `mobile/` (React Native + Expo)
  counterpart of every Track B screen, at **full parity**. Track C consumes the same
  bearer `/api/*` routes and `@mmp/shared/provider` contracts via a new
  `mobile/src/api/provider.ts` client (mirroring `mobile/src/api/*`); it shares **no
  component code** with web. **Each MP-C-xxx ships in the _same PR_ as its paired
  MP-B-xxx** (one PR, both platforms — ADR-17 §2), so a UI item is never `Done`
  web-only. Track C builds against the same MP-B-001 fixtures/mocks until A's APIs land.

> **Mobile test bar (ADR-17 §3/§4).** Track C tasks add **Jest + React Native
> Testing Library** unit/hook tests (joining the constant suite via `npm run
test:mobile`) and are proven by a **manual Expo smoke** per item. **Mobile UI E2E
> (Detox/Maestro) is deferred** behind a `decision`-tagged item (Q-8) — no iOS sim on
> this Windows host, no Android emulator/cloud-device runner yet. The mobile harness +
> API-client scaffold + `test:mobile` wiring is stood up once in **MP-C-000** before
> any mobile provider feature item closes.

> **Split rationale vs. the PDF default:** kept as-is. The repo already has a clean
> service-layer / UI seam (`lib/services/*` vs `app/**` + `components/*`), so the
> domain/product division maps directly onto existing ownership boundaries with
> minimal shared-file contention. The only deviation: **the shared contract package
> (MP-A-001) is Developer A-owned but is a Checkpoint-1 hard gate for both** — B
> consumes it immediately via fixtures.

**Status values:** `READY` (no unresolved dependency) · `BLOCKED` (decision/contract
unresolved) · `NOT_STARTED` (prereqs exist but not yet startable) · `IN_PROGRESS` ·
`REVIEW` · `DONE`. Initial statuses set below.

**Branch strategy (per PDF §21):**
A: `feature/provider-contracts` → `feature/provider-schema-rls` →
`feature/provider-services-api` → `feature/provider-cutoff-aggregation` →
`feature/provider-exports-email`.
B: `feature/provider-workspace-shells` → `feature/provider-owner-onboarding-ui` →
`feature/provider-menu-builder-ui` → `feature/provider-member-response-ui` →
`feature/provider-preparation-ui-e2e`.
Each task = ~one focused PR. Rebase after shared-contract changes. Never co-edit
generated DB types.
**Track C rides Track B's branches:** each `MP-C-xxx` commits to the **same branch /
PR** as its paired `MP-B-xxx` (mobile files live under `mobile/`, disjoint from the
web app, so there is no web↔mobile file contention). The one exception is `MP-C-000`
(mobile test harness + API-client scaffold), which lands on its own branch
`feature/provider-mobile-harness` at CP1 before any paired mobile screen.

**Shared/serialized files (single owner per checkpoint — see `06`):** `proxy.ts`,
`lib/auth/route-access.ts`, `app/(app)/layout.tsx`, `components/auth/account-menu.tsx`,
`components/app-nav.tsx`, `lib/db/database.types.ts`, `lib/errors/domain-errors.ts`,
`packages/shared` exports, `package.json`, `app/auth/callback/route.ts`.

**Global "do not modify" for every task:** existing household tables/services/RLS,
`design/*`/`docs/*` source-of-truth docs (amendments go in this planning folder),
other track's owned files. Out-of-scope domains (payments/pickup/delivery/capacity/
marketplace/post-cutoff comms) must not appear.

**Every task's Claude-Code verification (baseline, applies to all):** read
`CLAUDE.md` + relevant `design/*`; `git status`; confirm owned vs shared files;
search for existing utilities before writing new; preserve auth/error conventions;
add tests; run `format:check`, `lint`, `typecheck`, `test` (+ relevant Playwright);
report ambiguity with file/symbol/observed-behavior/why.

---

## Track A — Domain & platform

### MP-A-001 — Provider shared contracts package — `READY`

- **Track:** A · **Checkpoint:** 1 · **Branch:** provider-contracts · **Conflict risk:** Medium (`packages/shared`, `lib/errors`).
- **Objective:** Publish provider enums/unions, DTOs, `WorkspaceRef`, error codes, and a typed mock-API client interface + shared fixtures, so B can start immediately.
- **Use cases:** all (contract foundation); spec §7, `03`.
- **Files:** `packages/shared/src/provider/*` (new subpath export — verify export map first), `lib/errors/domain-errors.ts` (add codes only), `packages/shared/src/provider/fixtures.ts`.
- **Do not modify:** any DB/migration, route handlers, UI.
- **Produces:** all `03` contracts + fixtures. **Consumes:** none.
- **Steps:** add `@mmp/shared/provider` subpath (confirm convention vs existing `/types`); author enums/DTOs/`WorkspaceRef`/`SaveProviderResponseRequest`; define the provider `details.reason` discriminator map onto the existing 7 `ERROR_CODES` (no enum change — see `03`§3); author fixtures importing the DTO types; export typed mock-client interface.
- **DB/API/UI impact:** none / contract-only / none.
- **Tests:** type-level tests; fixtures compile against DTOs; error-code map unit test.
- **Acceptance:** B can import contracts + fixtures; no envelope/auth change; existing tests green.
- **DoD:** merged at Checkpoint 1; types build; `typecheck` green.
- **Rollback:** revert package export + error-code additions.
- **Verify:** confirm `@mmp/shared` export-map convention before adding subpath; do not duplicate household types.

### MP-A-010 — Provider enums + org/membership/invite schema + RLS — `BLOCKED`→`READY` after Checkpoint-0

- **Track:** A · **Checkpoint:** 2 · **Branch:** provider-schema-rls · **Conflict risk:** Medium (`database.types.ts`).
- **Objective:** Migrations for `pmp_1_enums`, `provider_organizations`, `provider_memberships`, `provider_invites`, `provider_subscriptions` + RLS helpers/policies; regenerate types.
- **Use cases:** UC-PROVIDER-001, UC-MEMBER-_, UC-SUBSCRIPTION-_; `04`§2.1–2.4, §3–4.
- **Files:** `supabase/migrations/*pmp_1_*`, `*pmp_2_*`, `*pmp_7_*` (helpers/policies for these tables), `lib/db/database.types.ts` (regenerate).
- **Do not modify:** household tables/policies.
- **Produces:** provider tenancy tables + `is_active_provider_member`/`is_provider_owner`. **Consumes:** MP-A-001 enums.
- **Steps:** author enums; tables w/ FKs/indexes/partial-unique/checks (`04`); RLS helpers + policies; apply to cloud dev via MCP; regen types; sync migration list.
- **DB impact:** new enums + 4 tables + helpers/policies. **API/UI:** none.
- **Tests:** RLS integration (owner vs customer vs cross-provider) on cloud dev; partial-unique one-live-membership; helper-function self-scope.
- **Acceptance:** RLS denies cross-provider + customer-on-owner-data; one live membership enforced.
- **DoD:** migrations applied to cloud dev; types regenerated; tests green.
- **Conflict note:** owns the regen of `database.types.ts` for this checkpoint.
- **Rollback:** reverse-order drops (data-loss caveat once rows exist).
- **Verify:** auto-enable-RLS trigger means policies are mandatory; confirm no policy recursion (SECURITY DEFINER helpers).

### MP-A-011 — Catalog schema + RLS — `DONE` (#21)

- **Track:** A · **Checkpoint:** 3 · **Branch:** provider-schema-rls · **Conflict risk:** Medium (types).
- **Objective:** `provider_catalog_items` (+ `source_dish_id`) + RLS + archive semantics.
- **Use cases:** UC-CATALOG-001/002; `04`§2.5. **Produces:** catalog table. **Consumes:** MP-A-010.
- **Steps/Tests/Acceptance:** table + policies; archive=is_active=false; RLS owner-write/customer-no-access; history preserved on archive.
- **Rollback:** drop table. **Verify:** `source_dish_id` nullable `on delete set null`.

### MP-A-012 — Menu schema + RLS — `DONE` (#22, PR pmp_4_menu)

- **Track:** A · **Checkpoint:** 3 · **Branch:** provider-schema-rls · **Conflict risk:** Medium.
- **Objective:** `provider_weekly_menus`, `provider_menu_days`, `provider_menu_components`, `provider_menu_alternatives`, `provider_customization_groups/options` + RLS + indexes (incl. cutoff sweep index). **Table shape only — no edit-policy enforcement (that is MP-A-012E).**
- **Use cases:** UC-MENU-001..003, UC-RESPONSE-002/004; `04`§2.6–2.11. **Consumes:** MP-A-011. **Produces:** menu tables + RLS.
- **Not blocked on ADR-7:** the menu-edit-after-response policy affects the publish/edit guard (MP-A-012E / MP-A-121), **not** table shape, so schema proceeds independently. Only the **optional** overlapping-week unique index is gated on E3 — ship the tables without it and add later if E3 forbids overlap.
- **Steps:** author tables w/ FKs/indexes/partial-unique/checks (`04`§2.6–2.11); cutoff-sweep index on `(cutoff_at,status)`; finite-max checks on customization options; RLS owner-write / approved-customer-read-published; apply to cloud dev; regen types.
- **DB impact:** 6 tables + policies. **API/UI:** none.
- **Tests:** publish-read RLS; awaiting-customer sees no menu; cutoff index present; finite-max check rejects unbounded extra.
- **Rollback:** drop tables. **Verify:** required-group set is provider-configured, not global; do NOT add the unique-week index until E3 is decided.

### MP-A-012E — Menu structural-edit guard (ADR-7 enforcement) — `BLOCKED` (ADR-7 / Q-1)

- **Track:** A · **Checkpoint:** 3 · **Branch:** provider-services-api · **Conflict risk:** Low.
- **Objective:** Enforce the approved menu-edit-after-response policy in the domain layer: detect whether any member response exists for a menu day and **block structural edits** (components/alternatives/customizations/cutoff) once one does; allow non-structural edits (note). Surface `VALIDATION_ERROR`/`CONFLICT` with the appropriate `details.reason`. Consumed by MP-A-121 (publish/edit RPC) and MP-B-030 (builder affordance).
- **Use cases:** UC-MENU-004/005; `02`ADR-7. **Consumes:** MP-A-012 schema, MP-A-013 responses (to detect existence). **Produces:** the structural-edit guard contract.
- **BLOCKED on:** ADR-7 / Q-1 — the exact policy (block vs revision vs cancel-recreate) must be signed off before this guard is implemented. Safe default = block structural edits + cancel/recreate.
- **Steps:** add `hasAnyResponse(menuDayId)` check; classify edits structural vs non-structural; gate in the menu mutation service; emit the right error `details.reason`.
- **Tests:** structural edit blocked when a response exists; non-structural edit allowed; correct error reason.
- **Rollback:** remove guard (reverts to no-edit-after-publish behavior). **Verify:** must not silently invalidate member responses (UC-MENU-005).

### MP-A-013 — Response + suggestion schema + RLS — `DONE` (#23, migration `pmp_5_responses`)

- **Track:** A · **Checkpoint:** 4 · **Branch:** provider-schema-rls.
- **Objective:** `provider_member_responses` (+`version`), `_items`, `_customizations`, `provider_meal_suggestions` + RLS (self-scope) + indexes.
- **Use cases:** UC-RESPONSE-_, UC-SUGGEST-_; `04`§2.12–2.15. **Tests:** customer reads only own response; owner reads all; index on `(menu_day_id,status)`.
- **Rollback:** drop tables.
- **Shipped (PR AB#23):** the 4 tables + `version` + indexes; RLS **read posture** — responses/items/customizations are SELECT-only (member self via the `can_read_provider_response`/`_item` chain helpers, owner all); every response mutation flows through the server-derived MP-A-130/141/150 RPCs (quantities are client-never-controlled). Suggestions grant member self-INSERT + owner UPDATE. Verified by a rolled-back impersonation probe (self/owner/cross-provider matrix). The read half of MP-A-130 (`getMyResponse` + `GET /api/provider-menu-days/{id}/my-response`) shipped in the same PR; the save/confirm/cancel + cutoff + concurrency path is the MP-A-130 remainder (#23 stays in Doing).

### MP-A-014 — Batch + events + notifications schema — `DONE` (#25, migration `pmp_6_batches_events_notifications`)

- **Track:** A · **Checkpoint:** 5 · **Branch:** provider-schema-rls.
- **Objective:** `provider_preparation_batches` (unique revision), `_lines`, `provider_activity_events`, `provider_notifications` + RLS (owner-only batch; recipient-scoped notif).
- **Use cases:** UC-BATCH-_, UC-OVERRIDE-_, UC-NOTIFY-\*; `04`§2.16–2.19. **Tests:** customer cannot read batch/lines; revision uniqueness; append-only.
- **Rollback:** drop tables.
- **Shipped (PR AB#25):** the 4 tables + checks (revision≥1, status∈{current,stale}, email_status∈{queued,sent,failed}, non-negative totals/quantities) + unique `(menu_day_id, revision)` + indexes; `can_read_provider_batch` chain helper; RLS — **batches/lines/events are owner-SELECT-only** (no customer access to the aggregate roster or owner audit), **notifications are recipient-scoped** read + mark-read; every row is written by the server-role cutoff/regenerate/emit RPCs (MP-A-141/150/170, not in this PR). Verified by a rolled-back impersonation probe (owner reads batch/line/event; approved customer reads only their own notification; outsider sees nothing). Applied to cloud dev + types regenerated.

### MP-A-015 — Workspace pointer + onboarding-draft schema — `PARTIAL` (#17: pointer done; ADR-6 draft deferred to CP3)

- **Track:** A · **Checkpoint:** 2 · **Branch:** provider-schema-rls · **Conflict risk:** Low.
- **Objective:** `user_active_workspace` + `set_active_workspace` RPC (ADR-1); `provider_onboarding_drafts` + abandon job (ADR-6) — **only if** approved; else mark fallback (client-side / no draft).
- **Use cases:** UC-WORKSPACE-001/002, UC-PROVIDER-002. **Tests:** pointer RPC rejects non-member.
- **Rollback:** drop table; routing falls back to client-side.

### MP-A-100 — Workspace resolver service + `GET /api/providers` — `DONE` (#17)

- **Track:** A · **Checkpoint:** 2 · **Branch:** provider-services-api · **Conflict risk:** Low.
- **Objective:** `lib/services/workspace/resolve.ts` returning `WorkspaceRef[]`; `GET /api/providers` → `ProviderSummaryDto[]`.
- **Use cases:** UC-WORKSPACE-001/002; `03`§2/§8. **Produces:** workspace discovery API (B consumes). **Consumes:** MP-A-001, MP-A-010.
- **Steps:** read provider memberships + household memberships; map to `WorkspaceRef`; route handler w/ `withErrorBoundary`.
- **Tests:** service unit (mocked) + route test; multi-provider isolation.
- **Acceptance:** provider-only user resolves with no household and is not forced to onboarding.
- **Rollback:** remove route/service.

### MP-A-101 — Provider onboarding service + APIs — `BLOCKED` (ADR-6) → otherwise `NOT_STARTED`

- **Track:** A · **Checkpoint:** 3 · **Branch:** provider-services-api.
- **Objective:** `complete_provider_onboarding` RPC + `POST /api/providers`, `PATCH`, `POST .../complete-onboarding`.
- **Use cases:** UC-PROVIDER-001/002; `03`§8. **Tests:** atomic create (no orphan on failure); IANA tz validation; route auth.
- **Rollback:** remove routes/RPC.

### MP-A-102 — Membership invite/approval services + APIs — `NOT_STARTED` (after MP-A-010)

- **Track:** A · **Checkpoint:** 3 · **Branch:** provider-services-api · **Conflict risk:** Low.
- **Objective:** `accept_provider_invite`→awaiting; approve/reject/remove RPCs; invite create + preview; member list. Reuse hashed-token (ADR-5).
- **Use cases:** UC-MEMBER-001..005; `03`§8. **Tests:** accept→awaiting (not active); approval gates menu access; expired invite rejected; preview leaks nothing sensitive; rate-limit invite endpoint.
- **Rollback:** remove routes/RPCs.

### MP-A-110 — Catalog service + APIs — `DONE` (#21)

- **Track:** A · **Checkpoint:** 3 · **Branch:** provider-services-api.
- **Objective:** create/update/archive catalog; grouped-by-component read; `GET/POST/PATCH /api/providers/{id}/catalog`.
- **Use cases:** UC-CATALOG-\*; `03`§8. **Tests:** quantity>0/unit/name validation; cross-provider write denied; archive hides from new menus.
- **Rollback:** remove routes/service.

### MP-A-120 — Menu read service + APIs — `DONE` (#22)

- **Track:** A · **Checkpoint:** 2/3 · **Branch:** provider-services-api · **Conflict risk:** Low.
- **Objective:** menu-day read + today/weekly read with owner/customer authorization; `GET /api/provider-menu-days/{id}`, `today-menu`, `weekly-menu`. **(Read-only; no publish/mutation here — split out.)**
- **Use cases:** UC-VIEW-001/002; `03`§8. **Tests:** cross-provider RLS integration; awaiting customer sees no menu; unpublished hidden from customer.
- **Rollback:** remove routes. **Verify:** do not implement publishing/mutation in this task (PDF "good task" example).

### MP-A-121 — Menu authoring/publish service + APIs — `BLOCKED` (ADR-7)

- **Track:** A · **Checkpoint:** 3 · **Branch:** provider-services-api.
- **Objective:** create weekly/day/components/alternatives/customizations; `validateMenuCompleteness`; publish; edit policy per ADR-7.
- **Use cases:** UC-MENU-001..005; `03`§5/§8. **Tests:** completeness validator unit; publish failure cases; edit blocked once response exists (per ADR-7).
- **Rollback:** remove routes/RPC. **Verify:** ADR-7 must be resolved before edit affordance.

### MP-A-130 — Member response service + APIs (cutoff + concurrency) — `NOT_STARTED` (after MP-A-013, MP-A-120)

- **Track:** A · **Checkpoint:** 4 · **Branch:** provider-services-api · **Conflict risk:** Low.
- **Objective:** `save_provider_response` (derive quantities, validate alternatives/customizations/limits, enforce `cutoff_at>now()` + `version`), confirm, cancel; `GET/PUT my-response`, `confirm`, `cancel`.
- **Use cases:** UC-RESPONSE-001..009; `03`§6/§7. **Tests:** server derives quantity; alt must belong to component; extra>max rejected (no partial write); post-cutoff mutation rejected; stale version → conflict; cross-provider item rejected.
- **Rollback:** remove routes/RPC.

### MP-A-131 — Suggestions service + APIs — `NOT_STARTED` (after MP-A-013)

- **Track:** A · **Checkpoint:** 4 · **Branch:** provider-services-api · **Conflict risk:** Low.
- **Objective:** create suggestion (rate-limited); accept-as-option/reject (owner).
- **Use cases:** UC-SUGGEST-\*; BR-012. **Tests:** suggestion never alters response/batch; rate-limit; owner-only resolution.
- **Rollback:** remove routes.

### MP-A-140 — Aggregation domain + persistence — `PARTIAL` (#25: pure fn done; persistence deferred with the cutoff tx)

- **Track:** A · **Checkpoint:** 5 · **Branch:** provider-cutoff-aggregation · **Conflict risk:** Low.
- **Objective:** pure `aggregatePreparation()` keyed catalogItem+unit+spice+salt; included vs extra separate; persistence to batch lines.
- **Use cases:** UC-BATCH-002; `04`§6. **Tests:** the spec's worked example (UC-BATCH-002) reconciles exactly; never mixes units; included/extra separate.
- **Rollback:** remove module.
- **Shipped (PR AB#25):** the **pure** `aggregatePreparation()` (`lib/services/provider/aggregation.ts`) — folds per-member `PreparationLine[]` into the aggregate roster keyed `catalogItemId+canonicalUnit+spiceLevel+saltLevel`, summing included/extra separately, deterministic order (component group → name → unit → spice → salt). 9 Vitest cases incl. the UC-BATCH-002 worked example, unit-isolation, included/extra separation, no-input-mutation. **Persistence to batch lines is deferred** — it runs inside the cutoff (MP-A-141) / regenerate (MP-A-150) transaction, both of which depend on MP-A-130 (response save RPC, the #23 follow-up); this PR ships only the DB-free half.

### MP-A-141 — Cutoff processor (job + RPC) — `NOT_STARTED` (after MP-A-130, MP-A-140)

- **Track:** A · **Checkpoint:** 4/5 · **Branch:** provider-cutoff-aggregation · **Conflict risk:** Low.
- **Objective:** `process_provider_cutoff` (lock day, auto-accept eligible+consented, lock responses, count, batch rev1, mark locked) + pg_cron 5-min sweep. Idempotent (ADR-10).
- **Use cases:** UC-CUTOFF-001/002, UC-SUBSCRIPTION-002, BR-001/002/003; `04`§5/§7. **Tests:** idempotent re-run (no dup batch/auto-accept/quantities); no-response counted; cancelled not auto-accepted; auto-accept uses default only + requires consent.
- **Rollback:** `cron.unschedule` + remove RPC. **Verify:** email queued **after** commit.

### MP-A-150 — Provider override + batch regenerate — `NOT_STARTED` (after MP-A-141)

- **Track:** A · **Checkpoint:** 5 · **Branch:** provider-cutoff-aggregation.
- **Objective:** `provider_override_response` (reason, preserve original, event, mark stale); `regenerate_provider_batch` (rev N+1, old immutable); `provider-override`/`regenerate` endpoints.
- **Use cases:** UC-OVERRIDE-001/002; `03`§7. **Tests:** override audited; old revision immutable; new revision correct; email NOT auto-resent.
- **Rollback:** remove routes/RPCs.

### MP-A-160 — CSV export backend — `NOT_STARTED` (after MP-A-140)

- **Track:** A · **Checkpoint:** 5 · **Branch:** provider-exports-email · **Conflict risk:** Low.
- **Objective:** `lib/services/provider/export/csv.ts` (UTF-8, deterministic, RFC-4180, formula-injection defense); owner-only `aggregate.csv`/`individual.csv` routes from persisted batch.
- **Use cases:** UC-BATCH-003/004; ADR-13; `03`§11. **Tests:** escaping (comma/quote/newline); injection prefix (`=+-@`); deterministic order; owner-only; totals reconcile with aggregate.
- **Rollback:** remove util/routes.

### MP-A-161 — Summary email backend + resend — `NOT_STARTED` (after MP-A-141)

- **Track:** A · **Checkpoint:** 5 · **Branch:** provider-exports-email.
- **Objective:** pure `renderProviderSummaryEmail()`; `providerSummaryEmailService` building DTO from persisted batch; `email_status`; `resend-email` endpoint. Reuse `EmailTransport` (ADR-12).
- **Use cases:** UC-CUTOFF-003, UC-OVERRIDE-003, UC-NOTIFY-004; `03`§13. **Tests:** email built from persisted revision; failure records status w/o rolling back batch; resend sends exact revision.
- **Rollback:** remove service/route.

### MP-A-170 — Provider events + notification fan-out — `NOT_STARTED` (after MP-A-014)

- **Track:** A · **Checkpoint:** 4/5 · **Branch:** provider-services-api.
- **Objective:** `emit_provider_event` (audit + fan-out to `provider_notifications`); wire into publish/approve/cutoff/override flows; redaction rules.
- **Use cases:** UC-NOTIFY-001..004; §19.4. **Tests:** no notify to removed/rejected; no token/allergy/full-note logging; audit always written.
- **Rollback:** remove RPC + call sites.

### MP-A-180 — Integration/RLS test suite (cloud dev) — `NOT_STARTED` (rolling, per schema task)

- **Track:** A · **Checkpoint:** 2–5 · **Branch:** matches the feature under test.
- **Objective:** the integration/RLS coverage in `07_test_strategy.md` §RLS/integration (owner/customer/cross-provider, invite/approval, pre/post-cutoff, auto-accept tx, idempotent cutoff, override, regenerate, customer-cannot-read-batch).
- **Tests:** as listed. **Acceptance:** every security UC has a passing test. **Rollback:** remove tests.
- **Verify:** no Docker — runs against cloud dev / e2e; document any skipped local-only checks.

---

## Track B — Product experience

### MP-B-001 — Typed mock provider API client + fixture wiring — `READY`

- **Track:** B · **Checkpoint:** 1 · **Branch:** provider-workspace-shells · **Conflict risk:** Low.
- **Objective:** Implement the mock client against MP-A-001 contracts/fixtures so all B UI can run before APIs exist.
- **Use cases:** all (fixture foundation); PDF contract-first. **Consumes:** MP-A-001.
- **Files:** `components/provider/__fixtures__/*` or `lib/provider-client/mock.ts` (B-owned).
- **Tests:** mock returns fixtures matching DTOs. **Acceptance:** B screens render from mocks. **Rollback:** remove mock.

### MP-B-010 — Workspace resolver consumption + post-login routing — `DONE` (#17; auto-redirect-on-single-workspace deferred to the provider shells #18)

- **Track:** B · **Checkpoint:** 2 · **Branch:** provider-workspace-shells · **Conflict risk:** **High** (`proxy.ts`, `route-access.ts`, `(app)/layout.tsx`, `auth/callback`).
- **Objective:** Make post-login workspace-aware: stop forcing provider-only users to household onboarding; route per `WorkspaceRef`; add provider prefixes to `PROTECTED_PREFIXES`.
- **Use cases:** UC-WORKSPACE-001; `02`ADR-1. **Consumes:** MP-A-100 (or mock).
- **Files:** `proxy.ts`, `lib/auth/route-access.ts`, `app/auth/callback/route.ts`, `app/(app)/layout.tsx` (guard branch), new `app/workspace/` chooser.
- **Tests:** Playwright — provider-only user not redirected to `/onboarding`; chooser on multi-workspace; household user unchanged (regression).
- **Acceptance:** household flows green; provider-only user reaches a provider entry.
- **Conflict note:** **serialized** — single owner this checkpoint; coordinate with MP-A-100.
- **Rollback:** revert routing edits (code-only).

### MP-B-011 — Provider owner shell + nav — `NOT_STARTED` (after MP-B-010)

- **Track:** B · **Checkpoint:** 2 · **Branch:** provider-workspace-shells.
- **Objective:** `app/(provider-owner-app)/provider/layout.tsx` + nav (Dashboard, Today's Responses, Weekly Menu, Members, Preparation, Settings). No grocery/household nav.
- **Use cases:** §13.1. **Files:** `app/(provider-owner-app)/*`, `components/provider-owner/nav.tsx`. **Tests:** component nav render. **Rollback:** remove group.

### MP-B-012 — Provider member shell + nav + workspace switcher — `NOT_STARTED` (after MP-B-010)

- **Track:** B · **Checkpoint:** 2 · **Branch:** provider-workspace-shells · **Conflict risk:** Medium (`account-menu.tsx`).
- **Objective:** `app/(provider-member-app)/providers/[providerId]/layout.tsx` (today/week/responses/account + awaiting-approval); `components/workspace/` switcher; add switcher entry to account menu (serialized).
- **Use cases:** UC-WORKSPACE-002, §14.4. **Tests:** Provider A data never in Provider B; awaiting state shows no menu. **Rollback:** remove group + revert account-menu edit.

### MP-B-020 — Provider owner onboarding UI — `BLOCKED` (ADR-6) → else `NOT_STARTED`

- **Track:** B · **Checkpoint:** 3 · **Branch:** provider-owner-onboarding-ui.
- **Objective:** onboarding wizard (provider name/owner/contact/timezone/cutoff/recipients/approval-required + catalog seed); resumable per ADR-6; reuse `Field`/`OptionGroup`.
- **Use cases:** UC-PROVIDER-001/002. **Consumes:** MP-A-101 (or mock). **Tests:** Playwright onboarding → dashboard; required-field gating. **Rollback:** remove UI.

### MP-B-021 — Minimal member onboarding UI — `NOT_STARTED` (after MP-B-012)

- **Track:** B · **Checkpoint:** 3 · **Branch:** provider-owner-onboarding-ui.
- **Objective:** name/phone/allergy-ack/optional spice/optional auto-accept consent; **must not** show any household field; route to Today or awaiting.
- **Use cases:** UC-MEMBER-ONBOARD-001. **Tests:** none of the forbidden household fields present; consent only when eligible. **Rollback:** remove UI.

### MP-B-022 — Member invite/approval UI (owner) — `NOT_STARTED` (after MP-B-011)

- **Track:** B · **Checkpoint:** 3 · **Branch:** provider-owner-onboarding-ui.
- **Objective:** Members page (invite by email/phone, pending list, approve/reject/remove, copy/resend on email failure).
- **Use cases:** UC-MEMBER-001..005; §13.4. **Consumes:** MP-A-102 (or mock). **Tests:** Playwright invite→accept→approve→active. **Rollback:** remove UI.

### MP-B-030 — Menu builder UI — `BLOCKED` (ADR-7)

- **Track:** B · **Checkpoint:** 3 · **Branch:** provider-menu-builder-ui · **Conflict risk:** Low.
- **Objective:** structured builder (date, cutoff, required groups, default item, qty/unit, alternatives, spice/salt support, extras + max, optional price labels, publish validation). **No free-form JSON editor.**
- **Use cases:** UC-MENU-001..003; §13.3. **Consumes:** MP-A-120/121 (or mock) + completeness contract. **Tests:** component validation (incomplete menu blocks publish); edit-after-response affordance per ADR-7. **Rollback:** remove UI.

### MP-B-040 — Today's Menu (read-only) UI — `NOT_STARTED` (after MP-B-012)

- **Track:** B · **Checkpoint:** 2 · **Branch:** provider-member-response-ui.
- **Objective:** read-only Today's Menu (provider/date/cutoff/countdown/default package/alternatives/customizations/note). Countdown util (net-new small util).
- **Use cases:** UC-VIEW-001/002. **Consumes:** MP-A-120 (or mock). **Tests:** no published menu → empty state; awaiting → no data. **Rollback:** remove page.

### MP-B-041 — Member response UI (confirm/update/cancel + lock state) — `NOT_STARTED` (after MP-B-040)

- **Track:** B · **Checkpoint:** 4 · **Branch:** provider-member-response-ui.
- **Objective:** select alternatives/spice/salt/extras (within max + price labels); confirm/update/cancel before cutoff; optimistic-concurrency reload-on-conflict; **locked state** (all read-only, badge, "contact provider outside app").
- **Use cases:** UC-RESPONSE-001..009; §14.2/14.3. **Consumes:** MP-A-130 (or mock). **Tests:** Playwright confirm/update/cancel before cutoff; cannot edit after cutoff (UI + backend); conflict reload. **Rollback:** remove UI.

### MP-B-050 — Provider preparation UI — `NOT_STARTED` (after MP-A-140/150 contracts)

- **Track:** B · **Checkpoint:** 5 · **Branch:** provider-preparation-ui-e2e.
- **Objective:** Preparation page (batch metadata, aggregate table, individual table, CSV actions, print action, email status + resend, revision history, stale-batch warning).
- **Use cases:** UC-BATCH-001, §13.5. **Consumes:** MP-A-140/150/160/161 (or mock). **Tests:** stale warning when overridden; CSV download; owner-only. **Rollback:** remove UI.

### MP-B-051 — Print page UI — `NOT_STARTED` (after MP-B-050)

- **Track:** B · **Checkpoint:** 5 · **Branch:** provider-preparation-ui-e2e.
- **Objective:** server-rendered `/provider/preparation/{batchId}/print`, owner-only, `@media print`, A4+letter, repeated headers, aggregate→individual, revision+timestamp, no interactive controls.
- **Use cases:** UC-BATCH-005; §17; ADR-14. **Consumes:** print-view DTO. **Tests:** print layout smoke. **Rollback:** remove page.

### MP-B-060 — Owner dashboard UI — `NOT_STARTED` (after MP-B-011 + read APIs)

- **Track:** B · **Checkpoint:** 4/5 · **Branch:** provider-preparation-ui-e2e.
- **Objective:** dashboard cards (today's menu state, cutoff, time remaining, confirmed/no-response/cancelled/auto-accepted counts, batch state, email status).
- **Use cases:** §13.2. **Tests:** card render from fixtures. **Rollback:** remove UI.

### MP-B-070 — Playwright E2E suite — `NOT_STARTED` (rolling, per checkpoint)

- **Track:** B · **Checkpoint:** 2–5 · **Branch:** provider-preparation-ui-e2e.
- **Objective:** the E2E flows in `07_test_strategy.md` (onboarding, invite/accept/approve, land on Today, confirm/update/cancel, no-edit-after-cutoff, aggregate visible, CSV download, print opens, multi-provider isolation) + provider fixtures extending `e2e/fixtures/auth.ts`.
- **Tests:** as listed; deterministic clock for cutoff. **Acceptance:** every in-scope E2E flow green; household E2E regression green. **Rollback:** remove specs.

---

## Track C — Mobile experience (ADR-17, full parity)

Track C delivers the `mobile/` counterpart of every Track B screen. **Each MP-C-xxx
ships in the same PR as its paired MP-B-xxx** (one PR, both platforms). Mobile files
(`mobile/app/(provider-*)/*`, `mobile/src/provider/*`, `mobile/src/api/provider.ts`)
are disjoint from the web app, so there is **no web↔mobile contention**. Mobile test
bar per task: **Jest + RNTL** unit/hook tests (run via `npm run test:mobile`) +
**manual Expo smoke**. Mobile UI E2E is **deferred** (MP-C-070 / Q-8).

### MP-C-000 — Mobile provider harness + API client + fixtures — `READY`

- **Track:** C · **Checkpoint:** 1 · **Branch:** provider-mobile-harness · **Conflict risk:** Low (own files + `mobile/package.json`, root `package.json` scripts).
- **Objective:** Stand up the mobile provider foundation so every later MP-C task has a test bar and a typed client — the Track-C analogue of #34. (a) Add **Jest + jest-expo + React Native Testing Library** to `mobile/` with a `test` script; (b) add a root `test:mobile` script (`npm run test --workspace @mmp/mobile`) and fold it into `test:all`; (c) author `mobile/src/api/provider.ts` (typed client over `/api/*`, mirroring `mobile/src/api/*`, consuming `@mmp/shared/provider`); (d) wire the MP-B-001 fixtures/mock so mobile screens render before A's APIs land.
- **Use cases:** all (mobile foundation); ADR-17. **Consumes:** MP-A-001 contracts, MP-B-001 fixtures.
- **Files:** `mobile/package.json` (add `test` + devDeps), `mobile/jest.config.js`, `mobile/jest.setup.ts`, `mobile/src/api/provider.ts`, `mobile/src/provider/__fixtures__/*`, root `package.json` (`test:mobile`, `test:all`).
- **Do not modify:** web `app/**`, `lib/**`; existing `mobile/` household screens.
- **Tests:** one example RNTL hook/render test green; `npm run test:mobile` runs in CI/Node; provider client type-checks against `@mmp/shared/provider`.
- **Acceptance:** `test:mobile` is green and part of `test:all`; a sample provider screen renders from fixtures in a Jest test. **DoD:** merged at CP1; `typecheck` (mobile `tsc`) + `test:mobile` green.
- **Rollback:** revert harness commit (remove `test:mobile` from `test:all` first so the gate stays green).
- **Verify:** confirm the npm-workspaces invocation for `test:mobile`; do not point `test:all` at a non-existent script (would wedge the gate). Mobile E2E is **not** in scope here — deferred to MP-C-070.

### Screen-parity tasks (each ships in its paired MP-B PR)

Each task below is **the mobile counterpart of its paired web task**: same use cases,
same acceptance criteria, same checkpoint, same PR — only the surface differs (RN
screens under `mobile/app` + hooks under `mobile/src/provider`, against
`mobile/src/api/provider.ts`). Status mirrors the paired B task (same blockers:
ADR-1/6/7).

| Task         | Pairs with | CP  | Mobile surface (new in `mobile/`)                                                                                                                                               |
| ------------ | ---------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MP-C-010** | MP-B-010   | 2   | **DONE (#17)** — live provider-client seam + provider entry from the More tab (`app/(settings)/providers`); route groups land with the shells (MP-C-011/012).                   |
| **MP-C-011** | MP-B-011   | 2   | `app/(provider-owner)/_layout.tsx` + owner nav (dashboard/responses/menu/members/prep).                                                                                         |
| **MP-C-012** | MP-B-012   | 2   | `app/(provider-member)/[providerId]/_layout.tsx` + workspace switcher; awaiting state.                                                                                          |
| **MP-C-020** | MP-B-020   | 3   | Owner onboarding wizard (resumable per ADR-6); reuse mobile `TextField`/`SelectChips`.                                                                                          |
| **MP-C-021** | MP-B-021   | 3   | Minimal member onboarding (no household fields); consent only when eligible.                                                                                                    |
| **MP-C-022** | MP-B-022   | 3   | Members screen: invite, pending list, approve/reject/remove, copy/resend on failure.                                                                                            |
| **MP-C-030** | MP-B-030   | 3   | Menu builder (structured; no free-form JSON); edit-after-response affordance per ADR-7.                                                                                         |
| **MP-C-040** | MP-B-040   | 2   | Read-only Today's Menu (default package/alternatives/customizations/cutoff countdown).                                                                                          |
| **MP-C-041** | MP-B-041   | 4   | Member response (alternatives/spice/salt/extras + max); confirm/update/cancel; locked.                                                                                          |
| **MP-C-050** | MP-B-050   | 5   | Preparation screen (batch meta, aggregate + individual tables, email status + resend).                                                                                          |
| **MP-C-051** | MP-B-051   | 5   | Mobile export/share of the persisted batch revision (native share sheet → CSV/PDF). The web `@media print` page stays web-only; mobile parity = share/export, not a print page. |
| **MP-C-060** | MP-B-060   | 4/5 | Owner dashboard cards (menu state, cutoff, counts, batch + email status).                                                                                                       |

**Per-task DoD (all screen-parity tasks):** RN screen matches the web acceptance
criteria; Jest + RNTL unit/hook tests added; manual Expo smoke recorded in the PR; no
web file touched; ships in the paired MP-B PR. Multi-provider isolation (Provider A
data never shown under Provider B) is asserted in MP-C-012's tests, mirroring MP-B-012.

### MP-C-070 — Mobile provider UI E2E suite — `BLOCKED` (decision: Q-8 / ADR-17 §4)

- **Track:** C · **Checkpoint:** post-CP5 (deferred) · **Branch:** n/a until unblocked.
- **Objective:** the Detox- or Maestro-driven mobile equivalent of the MP-B-070
  Playwright flows (onboarding → invite/accept/approve → Today → confirm/update/cancel
  → no-edit-after-cutoff → aggregate → export), added to the constant suite.
- **BLOCKED on:** the deferred mobile-E2E-runner decision (Detox vs Maestro; Android
  emulator vs EAS/cloud-device) — this Windows / no-Docker host cannot run it today.
  Until resolved, mobile UI is covered by MP-C-000+ unit/hook tests + Expo smoke.
- **Backlog:** logged as a `decision`+`backlog` ADO Issue under Epic #15 (see Q-8).
- **Verify:** do **not** add a mobile-E2E gate to `test:all` until a runner exists in CI.

---

## Parallelism map

- **A can start immediately:** MP-A-001 (`READY`). After Checkpoint-0 approval and
  MP-A-010, the whole A schema/service chain unblocks in dependency order.
- **B can start immediately (on fixtures/mocks):** MP-B-001 (`READY`); then
  MP-B-011/012/040/060 against mocks before any A API exists.
- **C can start immediately:** MP-C-000 (`READY`) — mobile harness + client + fixtures,
  independent of A/B beyond the MP-A-001 contracts + MP-B-001 fixtures. After CP1, each
  MP-C-xxx is built **with** its paired MP-B-xxx (same PR), so Track C's blockers and
  ordering mirror Track B's exactly.
- **Fixture-before-API points:** MP-B-011/012/020/022/030/040/041/050/060 all consume
  mock fixtures (MP-B-001) until the matching A API merges.
- **Integration-test-before-UI points:** MP-A-180 RLS/integration tests run per schema
  task before B's corresponding screens exist.
- **Serialized shared files this program:** `proxy.ts`/`route-access.ts`/`(app)/layout.tsx`/
  `auth/callback` (MP-B-010, single owner); `account-menu.tsx` (MP-B-012);
  `database.types.ts` (A-only, regenerated per schema checkpoint); `lib/errors` codes
  (MP-A-001); `packages/shared` exports (MP-A-001); `package.json` (whoever adds a dep, serialized).
- **Merge order (high level):** MP-A-001 → MP-B-001 + MP-C-000 (CP1) → MP-A-010/100 +
  MP-B-010/011/012/040 (each with its MP-C-010/011/012/040 in the same PR) (CP2)
  → MP-A-011/101/102/110/120/121 + MP-B-020/022/030 (+MP-C-020/022/030) (CP3)
  → MP-A-013/130/131/141/170 + MP-B-021/041 (+MP-C-021/041) (CP4)
  → MP-A-014/140/150/160/161 + MP-B-050/051/060/070 (+MP-C-050/051/060) (CP5).
  MP-C-070 (mobile E2E) is deferred past CP5 (Q-8).
- **Avoid co-editing:** no task has both developers editing the same file in the same
  checkpoint; the shared files above are single-owner per checkpoint.

## Counts

- **Developer A:** 22 tasks (MP-A-001, 010–012, 012E, 013–015, 100–102, 110, 120–121, 130–131, 140–141, 150, 160–161, 170, 180).
- **Developer B (web UI):** 16 tasks (MP-B-001, 010–012, 020–022, 030, 040–041, 050–051, 060, 070).
- **Track C (mobile UI):** 14 tasks (MP-C-000, 010–012, 020–022, 030, 040–041, 050–051,
  060, 070). The 12 screen-parity tasks (MP-C-010..060) each ship **in the paired MP-B PR**
  — they add work, not extra PRs. MP-C-000 is its own CP1 PR; MP-C-070 is deferred.
- **Total:** 52 tasks across 6 checkpoints (+1 deferred), in **38 PRs** (A's + B's, with
  each mobile screen folded into its B PR; MP-C-000 the only extra PR).
- **READY now:** MP-A-001, MP-B-001, MP-C-000. **BLOCKED:** MP-A-012E/015/101/121,
  MP-B-010/020/030 + their mobile twins MP-C-010/020/030 (on ADR-1/6/7); MP-C-070 (Q-8
  decision). MP-A-012 (menu schema) is **no longer blocked on ADR-7** — only its optional
  unique-week index defers to E3. Remainder `NOT_STARTED` pending in-track prerequisites.
