# 08 — The Constant Regression Suite (testing backbone)

> **Owner item:** ADO Issue **#34** (`seq-00`, P0, `cp1`) — _Establish & freeze the
> constant regression suite._ This is the **testing backbone**: the autopilot runs
> it **before any feature item (#16+)**, and no feature item may close until this
> suite exists, is green, and is enforced as the pre-close gate.
>
> **Source specs:** test strategy → [`07_test_strategy.md`](07_test_strategy.md);
> integration plan / checkpoints → [`06_integration_plan.md`](06_integration_plan.md).

## 1. What the constant regression suite is

A **fixed, always-green baseline** that every work item must keep green and may only
**extend** — never skip or shrink. It is identified **once** here and frozen. It has
two layers, both already present and green in the repo at the time of freezing:

- **Vitest** — the colocated `*.test.ts` unit/service/route tests next to the code in
  `lib/`, `app/api/`, and `app/`. Run with `npm run test`.
- **Playwright** — the end-to-end UI specs in `e2e/specs/`. Run with `npm run test:e2e`.
- **Mobile Jest** (added by **MP-C-000**, ADR-17) — the `mobile/` Jest + React Native
  Testing Library unit/hook tests for mobile provider screens. Run with
  `npm run test:mobile`. This layer **grows** as Track C screens land; mobile UI E2E
  (Detox/Maestro) is **deferred** (Q-8), so it is **not** part of the suite yet.

**Baseline at freeze (run on `feature/regression-suite-backbone`):**

| Layer                     | Command            | Baseline                                       |
| ------------------------- | ------------------ | ---------------------------------------------- |
| Vitest unit/service/route | `npm run test`     | **152 files / 983 tests passing**              |
| Playwright E2E            | `npm run test:e2e` | **15 spec files** (real assertions + `fixme`s) |

The exact pass counts grow as items are added; the rule is that the number of
**passing** tests only ever increases and the suite stays green.

> **Repair on freeze.** Freezing surfaced that the E2E layer had silently drifted
> red across several specs — unnoticed because **E2E was never in CI** (only the
> Vitest gate ran). #34 repaired every drift to restore a green baseline and wires
> the (non-blocking) E2E CI job below so this class of rot can't silently recur:
>
> - **Onboarding diet selector** — became a multi-select chip set (`OptionChips`,
>   `role=button`) while `e2e/helpers/onboarding.ts` + `mealpref`/`onboarding` specs
>   still clicked a `radio`, stalling `global-setup` and every onboarding-dependent
>   spec at the "food preferences" step.
> - **Meal replacement** — the auto-cycling "Swap"/"Try another" was replaced by the
>   `SlotReplacementPicker` modal (BUG-022/023). The week board's control is now
>   "Change"; the Today board's "Try another" opens the picker. Updated
>   `e2e/helpers/today.ts`, `plan`, `grocery`, `recommendation`, and `mealcomp`
>   specs (the diet/side hard filters are now asserted across the whole picker
>   candidate set).
> - **Account menu** — split into discrete Preferences/Members/Manage-households
>   items; `profile` spec assertions scoped to the open menu popup.
> - **Lock control** — the weekly board's locked cell shows "Unlock to edit" (not
>   "Unlock meal").
> - **Edit-mode save** — "Save changes" now lands on `/preferences` (not
>   `/household`); fixed `finishEdit`.
> - **Lint hygiene** — Playwright's generated `playwright-report/`/`test-results/`
>   artifacts are excluded from ESLint so the local gate stays clean after a run.

### 1.1 Frozen Playwright specs (`e2e/specs/`)

`a11y`, `admin`, `auth`, `collab`, `grocery`, `image`, `mealcomp`, `mealpref`,
`mobile`, `notif`, `onboarding`, `plan`, `profile`, `recommendation`, `security`,
`workspace` (MP-B-010: workspace-aware post-login routing — provider-only →
`/workspace` chooser, household member unchanged → `/today`).

Implemented, deterministically-verifiable behavior runs as real assertions;
not-yet-built features are `test.fixme` with a one-line reason (see
[`e2e/README.md`](../../../e2e/README.md) for the coverage matrix). `fixme`s are
placeholders for future items to turn green — they are **not** failures.

### 1.2 Mandatory always-green areas

Per `07_test_strategy.md` §1.12, the suite **must** always keep green, and no feature
may regress:

- **Household flows** — the existing unit + Playwright coverage of login, onboarding,
  today, plan, grocery, members/collaboration, notifications, admin console, security.
- **Mobile API contract** — the bearer-auth and existing `/api/*` response shapes that
  the `mobile/` Expo client depends on. This is covered today by the colocated
  `app/api/**/route.test.ts` route tests (envelope + auth/permission paths) and the
  `e2e/specs/mobile.spec.ts` responsive flows. Any change to an `/api/*` route must
  keep those route tests green so the mobile client contract cannot drift.
- **Mobile provider UI (Jest + RNTL)** — as Track C screens land (ADR-17), their
  `mobile/` unit/hook tests join the suite via `npm run test:mobile` and must stay
  green. Web ↔ mobile parity is enforced here: a UI item is not `Done` until both its
  web Vitest/Playwright and its mobile Jest tests are green. **Mobile UI E2E is deferred**
  (Q-8) and is the one acknowledged gap below the web E2E bar until a runner is decided.

## 2. The single gate command

```bash
npm run test:all        # == npm run test && npm run test:mobile && npm run test:e2e
```

`test:all` is the **pre-close gate**: a feature work item is not `Done` until
`test:all` is green (alongside `npm run format:check`, `npm run lint`,
`npm run typecheck`, and `npm run build`). See the Definition of Done in
[`CLAUDE.md`](../../../CLAUDE.md). **MP-C-000 (ADR-17) adds the `test:mobile` step** to
`test:all`; until MP-C-000 merges, `test:all` is `test && test:e2e` as before — and
MP-C-000 must wire `test:mobile` in **green** (never point the gate at a missing
script).

### 2.1 CI wiring

`.github/workflows/ci.yml` runs `lint`, `format:check`, `typecheck`, `test`
(Vitest), and `build` as the **blocking** gate on every push/PR. A separate,
**non-blocking** `e2e` job runs `npm run test:e2e` against **cloud dev**; it is
guarded on the `SUPABASE_SERVICE_ROLE_KEY` secret and skips cleanly when that
secret is absent (so forks and secret-less runs stay green). The e2e job is
non-blocking by design — cloud-dev E2E is shared-environment and occasionally
network-flaky — but it must be **green before a feature item is moved to `Done`**,
verified locally or from the job, per the DoD.

> No Docker on this machine → no local Supabase stack. Integration/RLS coverage runs
> against **cloud dev** (Supabase MCP) and through Playwright, never a local container.

## 3. How the suite grows (grow-only rule)

- Every feature item **adds** its functional (web Vitest) + E2E (Playwright) tests to
  this suite as part of its Definition of Done, and — for UI-bearing items — its
  **mobile Jest + RNTL** unit/hook tests (ADR-17), and the PR names what it added on
  both platforms.
- The suite **only ever grows**. A test is never skipped or removed without a
  `decision`-tagged ADO work item approving it. (The deferral of mobile UI E2E is
  itself tracked as that `decision`-tagged item — Q-8 — not a silent gap.)
- New provider E2E flows use the **provider fixtures scaffold** and the
  **deterministic clock** below, so they stay isolated and time-deterministic.

## 4. Provider test infrastructure (scaffolded by #34, filled in CP2+)

So feature items don't re-derive the harness, #34 ships the scaffolding the provider
specs will consume:

- **`e2e/fixtures/provider.ts`** — a `providerTeam` factory mirroring the household
  `team` factory. It mints ephemeral users today; the provider-row methods
  (`createProvider`/`addCustomer`/`addSubscription`) throw a `providerSchemaPending`
  guard pointing at **MP-A-010** (the provider tenancy schema, Checkpoint 2) until
  those tables exist. No spec consumes the unbuilt methods, so the gate stays green.
  Target named fixtures (`07_test_strategy.md` §3): `providerOwner`, `providerOwnerB`,
  `awaitingCustomer`, `approvedCustomer`, `subscriptionCustomer`,
  `multiProviderCustomer`.
- **Provider spec-user emails** — `e2e/fixtures/constants.ts`
  (`PROVIDER_OWNER`, `PROVIDER_OWNER_B`, `AWAITING_CUSTOMER`, `APPROVED_CUSTOMER`,
  `SUBSCRIPTION_CUSTOMER`, `MULTI_PROVIDER_CUSTOMER`), named distinctly from the
  household spec users to avoid collisions on shared cloud dev.
- **Deterministic clock:**
  - **`lib/time/clock.ts`** — the injectable `Clock` (`systemClock` / `fixedClock` /
    `offsetClock`) the cutoff **domain** layer (MP-A-130/141) injects instead of
    calling `Date.now()`, so pure cutoff/validators are deterministic
    (`07_test_strategy.md` §4). Unit-tested in `lib/time/clock.test.ts`.
  - **`e2e/fixtures/clock.ts`** — the E2E-side seeding counterpart
    (`cutoffOpen` / `cutoffImminent` / `cutoffPassed`) that produces the relative
    `cutoff_at` timestamps a provider spec seeds, so cutoff is exercised via the lock
    RPC rather than by waiting on the 5-minute cron.

## 5. Checkpoint coverage gates (from `07_test_strategy.md` §6)

CP1: contract/type tests + **mobile harness green (`test:mobile`, MP-C-000)**. CP2:
resolver + read RLS + **household regression green** + mobile routing/shell/Today
unit+hook. CP3: catalog/menu/member service + RLS + onboarding E2E + mobile onboarding/
members/builder unit+hook. CP4: response + cutoff + concurrency + idempotency + mobile
response unit+hook. CP5: aggregation + CSV + print + email + **full web E2E + mobile
regression green** + mobile preparation/dashboard unit+hook. `test:mobile` is green at
every checkpoint from CP1; mobile UI E2E (MP-C-070) is deferred (Q-8). The constant
regression suite is the floor under every one of these.
