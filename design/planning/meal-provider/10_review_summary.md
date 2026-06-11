# 10 — Review Summary (Meal Provider Workspace)

> **Source specs:** design spec → [`design/meal-provider/01_design_spec.md`](../../meal-provider/01_design_spec.md);
> use-case spec → [`design/meal-provider/02_use_case_spec.md`](../../meal-provider/02_use_case_spec.md).

Executive review of the planning package. For detail see `00`–`09`.

---

## Verified current architecture

- **Next.js 16 + React 19 + TypeScript**, App Router; **Supabase** (Postgres, Auth, RLS)
  via `@supabase/ssr`; three clients in `lib/db/` (per-request RLS, browser, service-role).
  **One auth identity**: `createServerSupabaseClient()` guards against cookie/bearer split
  identity, so mobile bearer works on the same `/api/*` routes.
- **Household tenancy**: `households` + `household_members` (8 `can_*` flags, status, expiry,
  one-live-membership partial unique). Native Postgres enums; `set_updated_at` triggers.
- **Routing**: `proxy.ts` gates protected prefixes; **`app/(app)/layout.tsx` forces
  no-household users to `/onboarding`** — the central blocker for provider-only users.
- **Workspace pointers** `users.active_household_id`/`preferred_household_id` exist
  (`p9_beta_feedback`) but are **household-typed** (can't store a provider).
- **Patterns to reuse:** typed errors + single envelope (`lib/errors`), hand-rolled
  validators (no Zod), hashed-token invites + preview RPC, `emit_household_event` audit +
  fan-out, `idempotency_keys` + `withIdempotency`, **pg_cron** jobs (no Edge Functions),
  Resend email transport + pure renderers, cursor pagination, `@mmp/shared` subpath exports,
  Vitest (mocked) + Playwright (`e2e/fixtures/auth.ts`).
- **Missing (net-new):** CSV/download util, print page/`@media print`, optimistic-concurrency
  `version`, aggregation/batch concept, cross-type workspace switcher, local-Supabase
  integration harness (no Docker → cloud-dev + e2e).
- Latest migration `20260602140000_m3_2_event_push_tokens.sql`; `git status` clean.

## Proposed implementation approach

- **Separate provider tenancy**: ~20 `provider_*` tables + RLS helpers
  (`is_active_provider_member`, `is_provider_owner`); never touch household tables.
- **Workspace-aware routing**: keep `(app)` household-only; add `(provider-owner-app)` +
  `(provider-member-app)` route groups; a workspace resolver returns `WorkspaceRef[]` and
  post-login routes by it (provider-only users no longer hit household onboarding).
- **Full mobile parity (ADR-17)**: every web provider screen ships its `mobile/` (RN + Expo)
  twin **in the same PR** (Track C), against the same `/api/*` + `@mmp/shared/provider`. Mobile
  bar = Jest + RNTL unit/hook (`test:mobile` in `test:all`) + manual Expo smoke; **mobile UI
  E2E deferred** (Q-8) — no iOS sim / Android emulator on this Windows host yet.
- **Reuse, don't reinvent**: errors/envelope, invites (hashed token, accept→`awaiting_approval`),
  events (`provider_activity_events` + `emit_provider_event`), email transport, pg_cron,
  idempotency. **Net-new** only where nothing exists: CSV (with injection defense), print,
  aggregation, batch revisions, optimistic concurrency.
- **Cutoff** = pg_cron 5-min sweep → idempotent `process_provider_cutoff` (lock day, auto-accept
  consented subscriptions, lock responses, batch rev 1, post-commit email).
- **Immutable batch revisions**; override→stale→regenerate; CSV/print/email always from a
  persisted revision.

## Major refactors

- **Post-login routing** (`proxy.ts`, `lib/auth/route-access.ts`, `app/(app)/layout.tsx`,
  `app/auth/callback/route.ts`) → workspace-aware. This is the only change to existing
  hot-path code; everything else is additive.
- **Account menu** gains a workspace switcher entry (single serialized edit).
- **Generated DB types** regenerated once per schema checkpoint (A-only).

## Tasks by developer

- **Developer A (domain/platform):** 22 tasks.
- **Developer B (web product):** 16 tasks.
- **Track C (mobile product, ADR-17):** 14 tasks (MP-C-000 + 12 screen-parity twins of
  MP-B-010..060 + the deferred MP-C-070 mobile E2E). The 12 screen twins ship **in their
  paired MP-B PRs** — extra work, not extra PRs.
- **Total:** 52 tasks across 6 checkpoints (+1 deferred), in **38 PRs**.

## Immediately parallelizable

- **A:** MP-A-001 (`READY`) now; the schema/service chain unblocks in order after CP0.
- **B:** MP-B-001 (`READY`) now; MP-B-011/012/040/060 against mock fixtures before any A API.
- Contract-first: every B UI task consumes fixtures (MP-B-001) until the matching A API merges;
  A validates services/RLS via tests before B's screens exist.

## Blocked tasks (and why)

- **MP-A-012E / MP-A-121 / MP-B-030** — menu-edit-after-response policy (Q-1 / ADR-7 / R-05).
  (MP-A-012 menu **schema** is not blocked — only its optional unique-week index defers to E3.)
- **MP-B-010 / MP-A-015** — workspace pointer + routing (Q-2 / ADR-1) — safe default exists,
  but routing edit should land with the decision recorded.
- **MP-A-101 / MP-B-020** — provider onboarding draft (Q-6 / ADR-6) — safe default exists.

## Shared conflict zones

`proxy.ts` · `lib/auth/route-access.ts` · `app/(app)/layout.tsx` · `app/auth/callback/route.ts`
· `components/auth/account-menu.tsx` · `lib/db/database.types.ts` (A-only) ·
`lib/errors/domain-errors.ts` · `packages/shared` exports · `package.json` ·
`design/04_api_design.md` (amend in planning folder only). Single owner per checkpoint —
matrix in `06_integration_plan.md`.

## Key risks

- R-01 household redirect bounces provider users (H/H) · R-05 menu edits invalidate responses
  (M/H) · R-03/R-04 RLS / cross-provider leakage (M/H) · R-07 duplicate cutoff (M/H) ·
  R-15 household regression (M/H). All have mitigations; R-01 and R-05 gate specific tasks
  until ADR-1/ADR-7 are signed off.

## Decisions needing approval

1. **ADR-7 / Q-1** — menu-edit-after-response policy (**hard blocker** for menu-edit tasks).
2. **ADR-1 / Q-2** — workspace-pointer shape (generalized table vs client-only).
3. **ADR-6 / Q-6** — provider onboarding draft store (server vs client).
4. **ADR-15 / Q-4** — separate `provider_notifications` vs unified inbox.
5. **ADR-17 / Q-8** — the **deferred mobile UI E2E runner** (Detox vs Maestro; Android emulator
   vs EAS/cloud-device). Decided as deferred for now: mobile screens ship at parity under
   unit/hook + Expo-smoke coverage; the runner choice is a `decision`+`backlog` item that blocks
   only MP-C-070, nothing else.
6. Provisional safe defaults are documented for all of the above; only #1 must be resolved
   before dependent code starts. ADR-17 (mobile parity at full scope, one-PR lockstep) is
   **finalized** — only its E2E-runner sub-decision (#5) stays open.

## Recommended first PRs

1. **MP-A-001** — provider contracts package + error codes + fixtures (CP1).
2. **MP-B-001** — mock provider client wired to fixtures (CP1).
3. **MP-A-010** — org/membership/invite schema + RLS + types (CP2).
4. **MP-A-100 + MP-B-010** — workspace resolver + workspace-aware routing (CP2, coordinated).

## Recommended merge order

CP1 (contracts) → CP2 (read-only workspace + routing) → CP3 (membership + menu authoring) →
CP4 (responses + cutoff) → CP5 (preparation outputs). Household + mobile regression suites are
a merge gate at every checkpoint.

---

PLANNING STATUS: READY_FOR_REVIEW
