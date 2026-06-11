# 08 — Risk Register (Meal Provider Workspace)

> **Source specs:** design spec → [`design/meal-provider/01_design_spec.md`](../../meal-provider/01_design_spec.md);
> use-case spec → [`design/meal-provider/02_use_case_spec.md`](../../meal-provider/02_use_case_spec.md).

Each: **id · description · likelihood · impact · repo evidence · mitigation ·
detection · rollback · owner · blocking status**. L/M/H scales.

---

### R-01 — Household onboarding redirect bounces provider-only users

- **Likelihood:** H (default behavior) · **Impact:** H (provider-only users can't use app).
- **Evidence:** `app/(app)/layout.tsx` `if(!current) redirect("/onboarding")` (`00`§C1).
- **Mitigation:** ADR-1 workspace-aware routing (MP-B-010); provider route groups alongside `(app)`.
- **Detection:** Playwright "provider-only user not redirected to household onboarding"; household-login regression.
- **Rollback:** revert routing PR (household flows restore). **Owner:** B. **Blocking:** Yes until ADR-1 resolved (blocks MP-B-010).

### R-02 — Workspace persistence overloads household pointer

- **Likelihood:** M · **Impact:** M (wrong-tenant landing / data confusion).
- **Evidence:** `users.active_household_id` FK→households (`00`§C3, `20260601120000_p9_beta_feedback.sql`).
- **Mitigation:** generalized `user_active_workspace` (ADR-1) or client-only fallback; pointer RPC verifies membership.
- **Detection:** unit test pointer rejects non-member; switch E2E. **Rollback:** drop pointer table → client-only. **Owner:** A/B. **Blocking:** No (safe default exists).

### R-03 — RLS leakage on provider tables

- **Likelihood:** M · **Impact:** H (privacy/tenancy breach).
- **Evidence:** auto-enable-RLS trigger = deny-by-default but **policies are mandatory** (`00`§B3, memory rls-auto-enable-trigger).
- **Mitigation:** RLS helpers + per-table policies (`04`§3/4); RLS integration tests before release.
- **Detection:** MP-A-180 cross-provider/own-only tests; `get_advisors` lints. **Rollback:** tighten policy in forward migration. **Owner:** A. **Blocking:** No (gated by tests at CP2+).

### R-04 — Cross-provider data access (A reads B)

- **Likelihood:** M · **Impact:** H.
- **Evidence:** every table carries `provider_id`; helpers scope by it (`04`).
- **Mitigation:** `is_active_provider_member(provider_id)` on all policies; never trust client `providerId`.
- **Detection:** UC-SECURITY-003 integration + multi-provider E2E. **Rollback:** policy fix. **Owner:** A. **Blocking:** No.

### R-05 — Published menu edits invalidate existing responses

- **Likelihood:** M · **Impact:** H (silent order corruption).
- **Evidence:** no revalidation infra in repo (ADR-7).
- **Mitigation:** ADR-7 — block structural edits once a response exists / cancel-recreate.
- **Detection:** integration test "structural edit blocked with response present". **Rollback:** revert edit endpoint. **Owner:** A. **Blocking:** Yes (blocks MP-A-012E/MP-A-121/MP-B-030 until ADR-7 confirmed).

### R-06 — Cutoff race conditions

- **Likelihood:** M · **Impact:** H (double/partial processing).
- **Evidence:** repo idempotency via `FOR UPDATE` + unique keys (`00`§B6/A8).
- **Mitigation:** ADR-10 — lock menu-day row, state transition once, unique batch revision.
- **Detection:** concurrent-run integration test. **Rollback:** re-derive from locked responses. **Owner:** A. **Blocking:** No.

### R-07 — Duplicate cutoff execution (cron retry / overlap)

- **Likelihood:** M · **Impact:** H.
- **Evidence:** pg_cron jobs are idempotent by design (`00`§B11).
- **Mitigation:** `locked_at` short-circuit + `unique(menu_day_id,revision)`; email post-commit.
- **Detection:** "run twice → identical totals" test. **Rollback:** N/A (idempotent). **Owner:** A. **Blocking:** No.

### R-08 — Auto-accept without consent

- **Likelihood:** L · **Impact:** H (unwanted orders; trust/legal).
- **Evidence:** subscription consent constraint (`04`§2.4, BR-002).
- **Mitigation:** DB check `auto_accept_enabled=false OR consented_at IS NOT NULL`; cutoff job re-checks consent.
- **Detection:** eligibility unit + cutoff integration. **Rollback:** disable auto-accept branch. **Owner:** A. **Blocking:** No.

### R-09 — Stale member writes overwrite newer state

- **Likelihood:** M · **Impact:** M.
- **Evidence:** no `version` column exists today (`00`§D4).
- **Mitigation:** `version` + `WHERE version=expected` (ADR-?, `03`§6).
- **Detection:** concurrency test. **Rollback:** N/A. **Owner:** A. **Blocking:** No.

### R-10 — Batch/email mismatch (email shows different data than batch)

- **Likelihood:** M · **Impact:** M (wrong prep quantities cooked).
- **Evidence:** email transport + pure renderers (`00`§A9/A10); ADR-12.
- **Mitigation:** email built from persisted revision; never recompute in render; resend references explicit revision.
- **Detection:** email-from-fixture-batch test. **Rollback:** resend correct revision. **Owner:** A. **Blocking:** No.

### R-11 — CSV formula injection / malformed export

- **Likelihood:** M · **Impact:** M (spreadsheet exploit / broken file).
- **Evidence:** **no CSV util exists** (`00`§D1).
- **Mitigation:** ADR-13 — RFC-4180 escaping + `= + - @` prefix defense; deterministic UTF-8.
- **Detection:** CSV-safety unit tests. **Rollback:** disable export route. **Owner:** A. **Blocking:** No.

### R-12 — Mobile API compatibility regression

- **Likelihood:** L · **Impact:** H (breaks shipped app).
- **Evidence:** bearer identity guard + `mobile/src/api/*` contract parity (`00`§A1/A19).
- **Mitigation:** additive routes only; same auth path; `@mmp/shared/provider` subpath (don't break existing exports).
- **Detection:** mobile API regression suite; bearer-auth smoke. **Rollback:** revert package export. **Owner:** A. **Blocking:** No.

### R-17 — Web↔mobile parity drift (ADR-17)

- **Likelihood:** M · **Impact:** M (mobile silently lags web; "full parity" rule breaks).
- **Evidence:** mobile UI shares no code with web; mobile UI E2E is **deferred** (Q-8), so a
  regression can't be caught by an automated device run yet.
- **Mitigation:** **one-PR lockstep** (ADR-17 §2) — each web UI item ships its `mobile/` twin in
  the same PR, so parity can't silently fall behind; **Jest + RNTL** unit/hook tests required per
  Track C task (`test:mobile` in `test:all`); **manual Expo smoke** recorded in each PR; the
  deferred E2E gap is tracked openly as a `decision` item, never a silent skip.
- **Detection:** `test:mobile` in the gate; PR review checks the paired MP-C deliverable +
  Expo-smoke note. **Rollback:** revert the PR (web + mobile together). **Owner:** B (web) + C
  (mobile), same PR. **Blocking:** No (gated by the regression suite + PR review).

### R-13 — Migration rollback / data loss

- **Likelihood:** L · **Impact:** M.
- **Evidence:** migration-driven, cloud-dev apply via MCP (`00`§B12).
- **Mitigation:** additive migrations; prefer forward-fix once rows exist; pointer table has zero-migration fallback.
- **Detection:** `list_migrations` sync check; `get_advisors`. **Rollback:** reverse-order drops only while unreleased. **Owner:** A. **Blocking:** No.

### R-14 — Merge conflicts between developers

- **Likelihood:** M · **Impact:** M (lost time).
- **Evidence:** shared files enumerated (`00`§G, `06` matrix).
- **Mitigation:** single-owner-per-checkpoint for shared files; types regenerated by A only; contract-first fixtures.
- **Detection:** CI on rebased branches. **Rollback:** re-resolve via assigned owner / regenerate types. **Owner:** both. **Blocking:** No.

### R-15 — Regression to existing household flows

- **Likelihood:** M · **Impact:** H (DoD 23).
- **Evidence:** routing + account-menu + shared exports are touched (`06` matrix).
- **Mitigation:** keep `(app)` household-only; additive provider groups; household + mobile regression green at every checkpoint.
- **Detection:** household Playwright + unit regression as a merge gate. **Rollback:** revert offending PR. **Owner:** both. **Blocking:** No (gated by regression suite).

### R-16 — Provider events forced into household-scoped tables

- **Likelihood:** L · **Impact:** M.
- **Evidence:** `household_activity_events`/`notifications` `household_id NOT NULL` (`00`§C2).
- **Mitigation:** ADR-3/15 separate `provider_activity_events`/`provider_notifications`.
- **Detection:** insert tests on provider events. **Rollback:** drop tables. **Owner:** A. **Blocking:** No.

---

## Top blocking risks (gate implementation)

- **R-01 / R-05** — require ADR-1 and ADR-7 sign-off before MP-B-010 and MP-A-012E/MP-A-121/MP-B-030.
  All other risks have safe defaults or are gated by the test/regression suites, not by a pending decision.
