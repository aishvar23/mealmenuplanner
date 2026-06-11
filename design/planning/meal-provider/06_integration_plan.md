# 06 — Integration Plan (Meal Provider Workspace)

> **Source specs:** design spec → [`design/meal-provider/01_design_spec.md`](../../meal-provider/01_design_spec.md);
> use-case spec → [`design/meal-provider/02_use_case_spec.md`](../../meal-provider/02_use_case_spec.md).

Six checkpoints. Each defines merge prerequisites, contract tests, regression
suite, smoke tests, owner, conflict-resolution, and rollback. A **temporary owner
is assigned for every shared file at every checkpoint** (table at the end).

Branch/merge strategy: `05_two_developer_implementation_tracker.md`.

---

## Checkpoint 0 — Planning approval (no code)

- **Required approvals:** `00_repository_findings.md`, `02_architecture_decisions.md`
  (esp. provisional ADR-1/6/15 and blocked ADR-7), `03_contracts.md`,
  `04_database_and_rls_plan.md`, `05` tracker. Resolve `09_open_questions.md` E1–E5
  enough to unblock CP2/CP3 schema.
- **Owner:** tech lead. **Exit:** sign-off recorded; provisional ADRs accepted or amended.
- **Rollback:** N/A (no code).

## Checkpoint 1 — Shared contracts

- **Merge:** MP-A-001 (enums, DTOs, `WorkspaceRef`, error codes, fixtures, mock-client
  interface), MP-B-001 (mock client wired to fixtures).
- **Merge prerequisites:** CP0 approved; `@mmp/shared/provider` export convention confirmed;
  provider `details.reason` map reviewed against the closed 7-code `ERROR_CODES` (no enum change).
- **Contract tests:** types compile; fixtures conform to DTOs; `details.reason` discriminator
  values are stable; no envelope/auth/`ERROR_CODES` change.
- **Regression suite:** full `lint`/`typecheck`/`test`; existing household unit + e2e green.
- **Smoke:** `npm run build`; mobile package still builds (`@mmp/shared` consumers).
- **Owner:** Developer A (package), Developer B (mock). **Conflict-resolution:** A owns
  `lib/errors` + `packages/shared` this checkpoint; B branches after A merges.
- **Rollback:** revert package export + error-code commit (no DB).

## Checkpoint 2 — Read-only workspace

- **Merge:** MP-A-010 (org/membership/invite schema+RLS), MP-A-015 (workspace pointer, if
  approved), MP-A-100 (workspace resolver + `GET /api/providers`), MP-A-120 (menu read APIs);
  MP-B-010 (workspace-aware routing), MP-B-011/012 (owner+member shells, switcher),
  MP-B-040 (read-only Today's Menu).
- **Merge prerequisites:** ADR-1 resolved; migrations applied to cloud dev; types regenerated
  (A-only); routing change reviewed line-by-line.
- **Contract tests:** `GET /api/providers` shape matches `ProviderSummaryDto[]`; today-menu
  matches `MenuDayDto`.
- **Regression suite:** household login + `/today` + household e2e (MUST stay green — routing
  touched); mobile bearer auth smoke.
- **Smoke:** provider-only user logs in → not redirected to household onboarding → reaches
  provider entry; multi-workspace chooser appears.
- **Owner:** shared routing files = **MP-B-010 single owner**; `database.types.ts` = A.
- **Conflict-resolution:** routing edits land in one PR; A's resolver merges first, B rebases.
- **Rollback:** revert routing PR (code-only); schema rollback only if unreleased.

## Checkpoint 3 — Membership & menu authoring

- **Merge:** MP-A-011 (catalog), MP-A-101 (onboarding), MP-A-102 (invite/approval),
  MP-A-110 (catalog APIs), MP-A-012 (menu schema — ADR-7-independent), MP-A-012E + MP-A-121
  (structural-edit guard + authoring/publish — **after ADR-7**);
  MP-B-020 (owner onboarding), MP-B-022 (invite/approval UI), MP-B-030 (menu builder — after ADR-7).
- **Merge prerequisites:** ADR-6 + ADR-7 + E3 resolved; RLS integration tests green.
- **Contract tests:** catalog/menu/member DTOs; completeness validator matches contract.
- **Regression suite:** household flows; provider CP2 smoke still green.
- **Smoke:** onboarding→dashboard; invite→accept→awaiting→approve→active; build complete menu→publish.
- **Owner:** A owns schema/types; B owns UI. **Conflict-resolution:** menu-edit affordance gated
  on ADR-7 decision recorded in `09`.
- **Rollback:** revert authoring PRs; schema forward-fix preferred once rows exist.

## Checkpoint 4 — Responses & cutoff

- **Merge:** MP-A-013 (response schema), MP-A-130 (response service+APIs), MP-A-131 (suggestions),
  MP-A-141 (cutoff job+RPC), MP-A-170 (events/notifications); MP-B-021 (member onboarding),
  MP-B-041 (response UI + lock state).
- **Merge prerequisites:** optimistic-concurrency + cutoff contracts frozen; cutoff job
  idempotency test green; deterministic-clock harness in place.
- **Contract tests:** `SaveProviderResponseRequest`/`MemberResponseDto`; conflict envelope.
- **Regression suite:** household + provider CP2/CP3 smoke.
- **Smoke:** confirm/update/cancel before cutoff; post-cutoff mutation rejected (backend);
  cutoff job locks + counts + creates batch rev1 idempotently; auto-accept requires consent.
- **Owner:** A (domain), B (UI). **Conflict-resolution:** none expected (disjoint files).
- **Rollback:** `cron.unschedule` + revert; locked data preserved.

## Checkpoint 5 — Preparation outputs

- **Merge:** MP-A-014 (batch/events/notif schema), MP-A-140 (aggregation), MP-A-150 (override+
  regenerate), MP-A-160 (CSV), MP-A-161 (email); MP-B-050 (preparation UI), MP-B-051 (print),
  MP-B-060 (dashboard), MP-B-070 (E2E suite).
- **Merge prerequisites:** batch/CSV/print/email DTOs frozen; aggregation reconciliation test
  green; CSV-injection tests green.
- **Contract tests:** `BatchDto`/`PrintViewDto`/`ProviderSummaryEmailParams`; CSV column order.
- **Regression suite:** full household + provider E2E; mobile API regression.
- **Smoke:** aggregate reconciles with individual; CSV downloads + injection-safe; print opens
  (A4/letter); override→stale→regenerate→resend; email from persisted revision; email failure
  doesn't lose batch.
- **Owner:** A (backend), B (UI/E2E). **Conflict-resolution:** none expected.
- **Rollback:** revert export/email/UI PRs; immutable batches retained.

---

## Shared-file temporary-owner matrix

| Shared file                        | CP1                                                       | CP2              | CP3        | CP4        | CP5                                  |
| ---------------------------------- | --------------------------------------------------------- | ---------------- | ---------- | ---------- | ------------------------------------ |
| `proxy.ts`                         | —                                                         | **B (MP-B-010)** | B (frozen) | B (frozen) | B (frozen)                           |
| `lib/auth/route-access.ts`         | —                                                         | **B (MP-B-010)** | B          | B          | B                                    |
| `app/(app)/layout.tsx`             | —                                                         | **B (MP-B-010)** | —          | —          | —                                    |
| `app/auth/callback/route.ts`       | —                                                         | **B (MP-B-010)** | —          | —          | —                                    |
| `components/auth/account-menu.tsx` | —                                                         | **B (MP-B-012)** | —          | —          | —                                    |
| `components/app-nav.tsx`           | —                                                         | —                | —          | —          | — (B adds provider nav in own group) |
| `lib/db/database.types.ts`         | —                                                         | **A**            | **A**      | **A**      | **A**                                |
| `lib/errors/domain-errors.ts`      | **A (MP-A-001)**                                          | —                | —          | —          | —                                    |
| `packages/shared` exports          | **A (MP-A-001)**                                          | —                | —          | —          | —                                    |
| `package.json`                     | A (if dep)                                                | serialized       | serialized | serialized | serialized                           |
| `design/04_api_design.md`          | amendment in planning folder only — never edited in place |

**Rule:** generated DB types are regenerated only by Developer A, once per schema
checkpoint; Developer B never edits them. Any need to change a shared file outside
its assigned owner/checkpoint goes through a small dedicated integration PR with
both developers' review.

## Conflict-resolution procedure (all checkpoints)

1. Rebase the feature branch on the merge target before opening the PR.
2. If a shared file conflicts, the **assigned owner** for that checkpoint resolves;
   the other developer rebases onto the resolved state.
3. Contract changes (any `03` edit) trigger a re-publish of fixtures + a rebase of
   all open B branches.
4. Never resolve a generated-types conflict by hand — regenerate from cloud dev.

## Rollback procedure (all checkpoints)

- Code-only changes: revert the PR. Schema: prefer forward-fix migrations once
  cloud-dev rows exist; destructive drops only while a table is still unreleased.
  Cron: `cron.unschedule`. Routing: revert the single routing PR (household flows
  restore immediately).
