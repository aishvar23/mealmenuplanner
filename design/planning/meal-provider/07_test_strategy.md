# 07 — Test Strategy (Meal Provider Workspace)

> **Source specs:** design spec → [`design/meal-provider/01_design_spec.md`](../../meal-provider/01_design_spec.md);
> use-case spec → [`design/meal-provider/02_use_case_spec.md`](../../meal-provider/02_use_case_spec.md).
> The use-case → test map references the use-case spec.

Mirrors the repo's existing split: **Vitest** colocated `*.test.ts` (pure +
service, Supabase mocked) and **Playwright** e2e (`e2e/specs/*`, fixtures in
`e2e/fixtures/auth.ts`), **plus** — for the mobile provider screens (ADR-17, Track C)
— **Jest + React Native Testing Library** unit/hook tests under `mobile/`, run via
`npm run test:mobile` (§1.13). **No Docker on this machine** → there is no
local-Supabase integration harness; RLS/integration coverage runs against **cloud
dev** (Supabase MCP) and through Playwright e2e. No real Google interaction in CI (use
seeded email/password spec users, as the existing harness does). **Mobile UI E2E
(Detox/Maestro) is deferred** (§1.13 / Q-8): no iOS simulator on this Windows host and
no Android emulator/cloud-device runner yet.

---

## 1. Test layers

### 1.1 Pure domain unit (Vitest)

- `validateMenuCompleteness` (required groups, active items, units, finite extras, cutoff future).
- Cutoff validator (`cutoff_at > now()` with injected clock).
- Customization validator (min/max selections; included spice/salt).
- Extra-maximum validator (reject > max; no partial).
- Auto-accept eligibility (subscription + provider support + consent + no confirmed/cancelled).
- `aggregatePreparation` key + totals (the UC-BATCH-002 worked example reconciles exactly;
  spice/salt/unit separation; included vs extra).
- CSV escaping (comma/quote/newline) + formula-injection prefixing (`= + - @`).
- Batch revision logic (rev increments; old immutable).
- Workspace resolver mapping (memberships → `WorkspaceRef[]`, default paths).

### 1.2 Service tests (Vitest, mocked Supabase — pattern A17)

Each provider service: happy path + each typed-error path (mock `server-only`,
`createServerSupabaseClient`, guards). Covers: onboarding atomic result, invite
accept→awaiting, approve/reject/remove, catalog CRUD + archive, menu read auth,
publish validation, `save_provider_response` derivation + cutoff + version,
override, regenerate, summary-email build-from-batch, CSV route auth.

### 1.3 Route-handler tests (Vitest)

For each route: `withErrorBoundary` envelope; auth/authorization rejection
(`PROVIDER_OWNER_REQUIRED`/`PROVIDER_APPROVAL_REQUIRED`/`CUTOFF_PASSED` etc.);
body validation; idempotency replay where applicable.

### 1.4 Integration (cloud dev) + RLS

- Provider RLS: owner full access; approved customer own-response only; awaiting customer
  no menu; cross-provider denial (A≠B); customer cannot read batch/lines/member-list/other
  responses (UC-SECURITY-001..006).
- Invite acceptance → awaiting → approval → active; expired invite rejected; removed member
  loses access (UC-SECURITY-004/005).
- Pre-cutoff response mutation succeeds; post-cutoff denial (UC-RESPONSE-009).
- Auto-accept transaction (consent required; default only).
- **Idempotent cutoff**: run `process_provider_cutoff` twice → no dup batch/auto-accept/quantities.
- Provider override → batch stale; regenerate → rev N+1, old immutable.
- One-live-membership partial unique enforced.

### 1.5 Scheduled-job tests

- Cutoff sweep selects only `published` + `cutoff_at<=now()` + `locked_at IS NULL`.
- Re-run safety (UC-CUTOFF-002); email queued post-commit; email failure records status,
  batch intact (UC-CUTOFF-003).
- Provider invite expiry job mirrors `expire_invites`.

### 1.6 Idempotency tests

- Batch regenerate / resend-email idempotency-key replay (provider-scoped); same key+diff body → 409.

### 1.7 Optimistic-concurrency tests

- `PUT my-response` with stale `expectedVersion` → `CONFLICT` + `currentVersion`; fresh → increment.

### 1.8 CSV-safety tests

- Aggregate/individual column order deterministic; UTF-8; escaping; injection prefix; totals
  reconcile aggregate↔individual; owner-only (customer → 403/404).

### 1.9 Print tests

- Print route owner-only; renders revision + timestamp; aggregate-then-individual; smoke layout
  (headers present); no interactive controls in markup.

### 1.10 Email tests

- Pure `renderProviderSummaryEmail` subject/body from fixture batch; resend uses exact revision;
  no token/allergy/full-note leakage in rendered output.

### 1.11 Playwright E2E

Provider onboarding → invite customer → customer accepts → provider approves → customer minimal
onboarding → lands on Today → confirm meal → update before cutoff → cancel before cutoff →
cannot edit after cutoff → provider sees aggregate → CSV downloads → print opens →
multi-provider isolation (E2E-001..006). Plus: provider-only user not sent to household onboarding.

### 1.12 Regression suites (must stay green at every checkpoint)

- **Existing household** unit + Playwright (login, today, plan, grocery, members, notifications).
- **Mobile API** contract: bearer auth + existing `/api/*` shapes unaffected (`mobile/src/api/*`).
- **Mobile provider unit/hook** (`test:mobile`): grows as Track C screens land (see §1.13).

### 1.13 Mobile provider unit/hook (Jest + React Native Testing Library) — ADR-17

Track C mobile screens are tested with **Jest + jest-expo + React Native Testing
Library**, run via `npm run test:mobile` (wired into `test:all` by **MP-C-000**). This
is the required mobile test bar; **mobile UI E2E (Detox/Maestro) is deferred** (ADR-17
§4 / Q-8) because this Windows / no-Docker host has no iOS simulator and no Android
emulator/cloud-device runner. Coverage per Track C task:

- **Provider API client** (`mobile/src/api/provider.ts`): each method maps request →
  `/api/*` and parses the envelope into the `@mmp/shared/provider` DTO; typed-error
  paths surface the right `ErrorCode`.
- **Hooks** (`mobile/src/provider/*`): React Query hooks resolve fixtures, expose
  loading/error/locked states, and (for responses) optimistic-concurrency reload-on-
  conflict — mirroring the web hook tests.
- **Screen render** (RNTL): each screen renders its key states from fixtures —
  e.g. awaiting-approval shows no menu; locked response is read-only; multi-provider
  isolation (Provider A data never under Provider B, MP-C-012).
- **Pure logic reused from `@mmp/shared`** is already covered by §1.1 and not retested.

Until the deferred E2E runner lands, each Track C task is additionally proven by a
**manual Expo smoke** recorded in its PR (the paired MP-B PR).

---

## 2. Use-case → test map (every in-scope UC ≥1 test)

| UC group                 | Tests                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| UC-WORKSPACE-001/002     | resolver unit; E2E provider-only-not-onboarding; multi-provider isolation                            |
| UC-PROVIDER-001/002      | onboarding service atomic + Playwright onboarding                                                    |
| UC-CATALOG-001/002       | catalog service + RLS; archive-preserves-history integration                                         |
| UC-MEMBER-001..005       | invite/approval service + RLS; Playwright invite→approve; expired/removed                            |
| UC-MEMBER-ONBOARD-001    | Playwright minimal onboarding (no household fields)                                                  |
| UC-SUBSCRIPTION-001..003 | auto-accept eligibility unit; consent UI; cutoff auto-accept integration                             |
| UC-MENU-001..005         | completeness validator; publish route; menu-edit policy (ADR-7) integration                          |
| UC-VIEW-001/002          | today-menu read RLS; awaiting no-data                                                                |
| UC-RESPONSE-001..010     | response service (derive/cutoff/version); Playwright confirm/update/cancel/locked; no-response count |
| UC-SUGGEST-001..003      | suggestion service (non-binding); rate-limit                                                         |
| UC-CUTOFF-001..003       | job idempotency; email-failure-batch-intact                                                          |
| UC-BATCH-001..005        | aggregation reconcile; CSV safety; print smoke; owner-only                                           |
| UC-OVERRIDE-001..003     | override audit + stale; regenerate immutable; resend revision                                        |
| UC-SECURITY-001..006     | RLS integration (cross-provider, own-only, expired invite, removed member, cross-provider item)      |
| UC-NOTIFY-001..004       | event fan-out; no-notify-removed/rejected; summary recipients                                        |

---

## 3. Test users & providers (extend `e2e/fixtures/auth.ts`)

- Reuse seeded spec users + `team` factory. Add provider fixtures:
  `providerOwner` (owns Provider A), `providerOwnerB` (Provider B), `awaitingCustomer`,
  `approvedCustomer`, `subscriptionCustomer` (consented), `multiProviderCustomer` (A+B).
- Provider/menu/response/batch fixtures import `03` DTO types so they cannot drift from contracts.

## 4. Deterministic clock for cutoff

- Domain cutoff/validators take an injected `now()` (no `Date.now()` inside pure code).
- DB functions use `now()`; integration tests set menu-day `cutoff_at` relative to server time
  (e.g. `now()+'2 minutes'` for "before", `now()-'1 minute'` for "after") and call the RPC
  directly, rather than waiting on the 5-min cron, so cutoff behavior is deterministic.
- E2E uses already-past / near-future cutoffs seeded per spec; the manual `lock` endpoint
  (owner-only, testing/emergency) drives lock deterministically without waiting for cron.

## 5. CI notes

- No real Google: email/password spec users only (existing harness).
- No Docker: integration/RLS run against cloud dev via Supabase MCP; document any check that
  can only run there. Unit + route + pure tests run in plain Vitest (Node).
- Email: `RESEND_API_KEY` unset in CI → transport no-ops; assert `email_status` transitions and
  rendered-output via the pure renderer, not real delivery.

## 6. Coverage gates per checkpoint

- CP1: contract/type tests + **mobile harness green (`test:mobile`, MP-C-000)**. CP2: resolver
  - read RLS + household regression + **mobile routing/shell/Today unit+hook**. CP3: catalog/
    menu/member service + RLS + onboarding E2E + **mobile onboarding/members/builder unit+hook**.
    CP4: response + cutoff + concurrency + idempotency + **mobile response unit+hook**. CP5:
    aggregation + CSV + print + email + full web E2E + mobile regression + **mobile preparation/
    dashboard unit+hook**. `test:mobile` is green at every checkpoint from CP1; mobile UI E2E
    (MP-C-070) is deferred past CP5 (Q-8).
