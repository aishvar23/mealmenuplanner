# 01 — Gap Analysis (Meal Provider Workspace)

> **Source specs:** design spec → [`design/meal-provider/01_design_spec.md`](../../meal-provider/01_design_spec.md);
> use-case spec → [`design/meal-provider/02_use_case_spec.md`](../../meal-provider/02_use_case_spec.md).

Compares **current repository** against the supplied **design spec** and
**use-case spec**, for every required capability in the planning prompt.

**Status legend:** ✅ already supported · 🟡 partially supported · 🔴 not
supported · ⚠️ conflicts with current architecture · ⛔ blocked pending product
decision.

Columns per row: _Current implementation · Required behavior · Gap · Proposed
resolution · Affected files/modules · Migration impact · Regression risk · Track_.
Track = **A** (domain/platform) · **B** (product experience) · **A+B** (both,
contract-mediated).

---

### G-01 · Authentication & post-login routing — ⚠️

- **Current:** `proxy.ts` redirects auth users to `/today`; `app/(app)/layout.tsx` redirects no-household users to `/onboarding` (`current-household.ts`).
- **Required:** Provider-only users (no household) must NOT be sent to household onboarding; post-login routes to the correct workspace (UC-WORKSPACE-001).
- **Gap:** Routing is hard-wired to household tenancy.
- **Resolution:** Workspace resolver returns `WorkspaceRef[]`; post-auth target derived from it; provider route groups added alongside `(app)`. ADR-1.
- **Affected:** `proxy.ts`, `lib/auth/route-access.ts`, `app/auth/callback/route.ts`, new `lib/services/workspace/*`, new route groups.
- **Migration impact:** new workspace-pointer object (ADR-1). **Regression risk:** High (touches every login). **Track:** B (consumes A's membership reads).

### G-02 · Workspace discovery & switching — 🔴

- **Current:** household switcher only (`components/household/household-switcher.tsx`).
- **Required:** discover all workspaces; switch household⇄provider; never leak Provider A into Provider B (UC-WORKSPACE-002, E2E-006).
- **Gap:** No cross-type discovery/switch.
- **Resolution:** `GET /api/workspaces` (or `/api/providers` + existing household list) + `components/workspace/` switcher; persistence via ADR-1.
- **Affected:** new `lib/services/workspace/`, `app/api/providers/route.ts`, `components/workspace/`, `account-menu.tsx` (serialized).
- **Migration:** workspace pointer. **Regression risk:** Medium. **Track:** A+B.

### G-03 · Provider-owner onboarding — 🔴

- **Current:** household onboarding wizard + draft autosave (`complete_onboarding` RPC).
- **Required:** atomic create of provider org + owner membership + settings; resumable draft (UC-PROVIDER-001/002).
- **Gap:** No provider org/onboarding.
- **Resolution:** `provider_organizations` + `provider_memberships` + `complete_provider_onboarding()` RPC (atomic); provider-specific draft store (ADR-6); provider onboarding UI.
- **Affected:** migrations, `lib/services/provider/onboarding/`, `app/api/providers/*`, `app/(provider-owner-app)/`.
- **Migration:** new tables + RPC. **Regression risk:** Low (additive). **Track:** A (service/RPC) + B (UI).

### G-04 · Minimal provider-member onboarding — 🔴

- **Current:** none; household onboarding is full-featured.
- **Required:** name, phone, allergy ack, optional spice default, optional auto-accept consent — and nothing household-related (UC-MEMBER-ONBOARD-001).
- **Gap:** No minimal flow.
- **Resolution:** member onboarding UI gated to approved status; writes to `provider_memberships`/`provider_subscriptions`.
- **Affected:** `app/(provider-member-app)/`, `lib/services/provider/membership/`.
- **Migration:** none beyond core provider tables. **Regression risk:** Low. **Track:** B (UI) + A (service).

### G-05 · Membership invitation & approval — 🟡

- **Current:** household invites (hashed token, preview RPC, accept→active).
- **Required:** invite → accept → **awaiting_approval** → provider approves → active (BR-004); approval/rejection/removal audited (UC-MEMBER-001..005).
- **Gap:** Approval gate (household invites go straight to active); provider scoping.
- **Resolution:** `provider_invites` + RPCs that set `awaiting_approval`; approve/reject/remove services; reuse hashing/preview pattern (ADR-5).
- **Affected:** migrations, `lib/services/provider/membership/`, `app/api/provider-invites/*`, `app/api/providers/{id}/members/*`, `components/provider-owner/`.
- **Migration:** new tables + RPCs. **Regression risk:** Low. **Track:** A + B.

### G-06 · Provider catalog — 🔴

- **Current:** global `dishes` catalog (admin-authored).
- **Required:** provider-owned items, optional `source_dish_id`, own name/unit/quantity/spice-salt support/allergy warning; archive preserves history (UC-CATALOG-001/002).
- **Gap:** No provider-scoped catalog.
- **Resolution:** `provider_catalog_items` w/ nullable `source_dish_id` (ADR-4); catalog service + UI.
- **Affected:** migrations, `lib/services/provider/catalog/`, `app/api/providers/{id}/catalog/*`, `components/provider-owner/`.
- **Migration:** new table. **Regression risk:** Low. **Track:** A + B.

### G-07 · Weekly & daily menu publication — 🔴

- **Current:** household meal plans (different domain; not publishable to external members).
- **Required:** weekly menu → menu days → components/alternatives/customizations; publish validation; immutable-after-publish except controlled edits (UC-MENU-001..004, BR-005).
- **Gap:** Entire provider menu model.
- **Resolution:** `provider_weekly_menus`, `provider_menu_days`, `provider_menu_components`, `provider_menu_alternatives`, `provider_customization_groups/options`; `providerMenuService` + builder UI; publish + completeness validator.
- **Affected:** migrations, `lib/services/provider/menu/`, `app/api/provider-menu-days/*`, `components/provider-owner/menu-builder/`.
- **Migration:** several tables. **Regression risk:** Low. **Track:** A + B.

### G-08 · Alternatives — 🔴

- **Current:** none.
- **Required:** per-component provider-published alternatives; member can only pick a published alternative; quantity/unit derived server-side (UC-RESPONSE-002).
- **Resolution:** `provider_menu_alternatives`; server-derived quantities in response RPC.
- **Affected:** as G-07 + response service. **Track:** A + B.

### G-09 · Structured spice & salt customizations — 🔴

- **Current:** household `spice_level` enum (`mild/medium/spicy`) — different value set.
- **Required:** spice `non_spicy/mild/regular/spicy`, salt `low/regular/high`; **included** (no price); kept **separate** in aggregation (BR-008, UC-RESPONSE-003, UC-BATCH-002).
- **Gap:** Different enums; aggregation separation.
- **Resolution:** new `provider_spice_level`/`provider_salt_level` enums (don't reuse household `spice_level`); aggregation key includes spice+salt (ADR Aggregation).
- **Affected:** migrations (enums), response items, aggregation. **Track:** A.

### G-10 · Provider-defined extras with limits — 🔴

- **Current:** none.
- **Required:** customization groups/options w/ finite max; `external_price_label` informational only; **no payment** (BR-009/010, UC-RESPONSE-004/005).
- **Resolution:** `provider_customization_groups/options` with `maximum_selections`/`maximum_quantity` checks; server-side max enforcement; no payment state.
- **Affected:** as G-07 + response validation. **Track:** A + B.

### G-11 · Member response create — 🔴

- **Current:** none.
- **Required:** create draft/confirm; server derives authoritative quantities/units; never trusts client price/limits (UC-RESPONSE-001, §11.6).
- **Resolution:** `provider_member_responses` + `_items` + `_customizations`; `PUT .../my-response` + `confirm`; server-derived fields.
- **Affected:** migrations, `lib/services/provider/response/`, `app/api/provider-menu-days/{id}/my-response`, `components/provider-member/`.
- **Track:** A + B.

### G-12 · Response update & cancellation before cutoff — 🔴

- **Current:** none.
- **Required:** update/cancel before cutoff with optimistic concurrency (`expectedVersion`); stale write → conflict (UC-RESPONSE-007/008).
- **Gap:** No `version` column anywhere (D4).
- **Resolution:** `version int` on responses; update RPC `WHERE version = expected`; `ConflictError` on mismatch.
- **Track:** A (RPC) + B (UI reload-on-conflict).

### G-13 · No-response behavior — 🔴

- **Current:** none.
- **Required:** no confirmed response + no valid auto-accept ⇒ no order, counted as no-response (BR-001, UC-RESPONSE-010).
- **Resolution:** absence + computed count (no synthetic rows) — ADR No-response.
- **Track:** A.

### G-14 · Subscription-only auto-accept w/ consent — 🔴

- **Current:** none.
- **Required:** auto-accept only w/ active subscription + provider support + explicit recorded consent; default package only; opt-out before cutoff (BR-002/003, UC-SUBSCRIPTION-001..003).
- **Resolution:** `provider_subscriptions` (consent timestamp + check constraint); cutoff job creates `auto_accepted` default responses for eligible members.
- **Affected:** migrations, cutoff service, member account UI. **Track:** A (logic) + B (consent UI).

### G-15 · Server-side cutoff enforcement — 🔴

- **Current:** none.
- **Required:** after cutoff member mutation rejected by backend (not just UI); enforced in service + DB function (BR-006, UC-RESPONSE-009, §9.4).
- **Resolution:** cutoff check `cutoff_at > now()` in response RPC + RLS tenant isolation; UI lock state.
- **Track:** A (enforcement) + B (lock UX).

### G-16 · Scheduled cutoff processing — 🔴

- **Current:** pg_cron jobs exist (template).
- **Required:** find due menu days; lock responses; auto-accept; count no-response/cancelled; generate batch rev 1; queue email; idempotent (UC-CUTOFF-001/002, §15.1).
- **Resolution:** new pg_cron job → `process_provider_cutoff()` SECURITY DEFINER, idempotent via menu-day state transition + unique batch revision.
- **Affected:** migration (job + RPC), `lib/services/provider/cutoff/`. **Track:** A.

### G-17 · Provider override after cutoff — 🔴

- **Current:** none.
- **Required:** owner overrides a locked response w/ mandatory reason; original preserved; audit record; batch marked stale (BR-007, UC-OVERRIDE-001).
- **Resolution:** `provider-override` endpoint + RPC; `provider_overridden`/reason columns; event; batch `status='stale'`.
- **Track:** A (logic) + B (UI).

### G-18 · Immutable preparation batch revisions — 🔴

- **Current:** none.
- **Required:** revisions immutable; override→stale→regenerate rev N+1; old revisions retained (UC-OVERRIDE-002, §20.5, BR-015).
- **Resolution:** `provider_preparation_batches` (`unique(menu_day_id, revision)`, append-only lines).
- **Track:** A.

### G-19 · Aggregate preparation totals — 🔴

- **Current:** none (D5).
- **Required:** sum by catalogItem+unit+spice+salt; included vs extra reported separately; never mix units (UC-BATCH-002, §10.8).
- **Resolution:** pure `aggregatePreparation()` domain fn + persistence to batch lines.
- **Track:** A.

### G-20 · Individual order breakdown — 🔴

- **Current:** none.
- **Required:** one row per item/variant/member; owner-only; totals reconcile with aggregate (UC-BATCH-004).
- **Resolution:** individual view derived from locked responses in the batch revision.
- **Track:** A (data) + B (table UI).

### G-21 · CSV export — 🔴

- **Current:** none (D1).
- **Required:** aggregate + individual CSV; UTF-8; deterministic; injection-safe; owner-only; from persisted batch (UC-BATCH-003/004, §10.9).
- **Resolution:** net-new CSV util + owner-only `*.csv` routes.
- **Track:** A (backend) + B (download UX/e2e).

### G-22 · Print output — 🔴

- **Current:** none (D2).
- **Required:** server-rendered owner-only print page; aggregate then individual; revision + timestamp; `@media print`, A4+letter (UC-BATCH-005, §17).
- **Resolution:** print route in provider owner group + print CSS; consumes print-view DTO.
- **Track:** B (page) consuming A's batch DTO.

### G-23 · Provider summary email — 🔴

- **Current:** Resend transport + pure renderers (A9/A10).
- **Required:** email from persisted batch revision; resend selected revision; failure doesn't roll back batch (UC-CUTOFF-003, UC-OVERRIDE-003, §16).
- **Resolution:** `providerSummaryEmailService` + pure renderer; `email_status` on batch; explicit resend endpoint.
- **Track:** A.

### G-24 · RLS & cross-provider isolation — 🔴

- **Current:** household RLS helpers (`is_active_member`, `has_permission`) + auto-enable-RLS trigger on new public tables.
- **Required:** RLS on every provider table; owner vs customer scopes; Provider A ≠ Provider B; customer can't read batch/other responses/member list (UC-SECURITY-001..006, §9).
- **Resolution:** provider RLS helpers (`is_active_provider_member`, `is_provider_owner`) + policies per table.
- **Migration:** policies + helpers. **Regression risk:** Low (new tables) but **High severity if wrong**. **Track:** A.

### G-25 · Notifications — 🟡

- **Current:** in-app `notifications` (household-scoped, NOT NULL) + fan-out RPC.
- **Required:** notify customers on publish/approval/cutoff-approaching; never notify removed/rejected (UC-NOTIFY-001..004).
- **Gap:** `notifications.household_id` NOT NULL (C2).
- **Resolution:** ADR-15 — new `provider_notifications` (safe default) or generalize scope; reuse fan-out shape.
- **Track:** A.

### G-26 · Observability — 🟡

- **Current:** structured server-side error logging; append-only audit/events.
- **Required:** log provider lifecycle events; never log tokens/full allergy/member notes (§19.4).
- **Resolution:** `provider_activity_events` + structured logs keyed `providerId/menuDayId/batchId`; redaction rules.
- **Track:** A.

### G-27 · Testing — 🟡

- **Current:** Vitest unit (mocked), Playwright e2e; no local-Supabase/RLS integration harness (D6).
- **Required:** unit/service/route/integration/RLS/job/idempotency/concurrency/CSV/print/email/E2E + household & mobile regression (§18).
- **Gap:** No integration/RLS harness; no Docker.
- **Resolution:** `07_test_strategy.md` — unit+route mocked; RLS/integration via cloud-dev + e2e; deterministic clock for cutoff.
- **Track:** A (domain/integration) + B (E2E).

### G-28 · Rollout & backward compatibility — 🟡

- **Current:** migration-driven; feature work is additive.
- **Required:** preserve all household flows + mobile auth; phased, flag-gated rollout (§20, DoD 23/24).
- **Resolution:** feature flag; additive migrations; household & mobile regression suites green at every checkpoint.
- **Track:** A+B.

---

## Out-of-scope confirmation (must appear nowhere as work)

Payments/payment tracking, pickup, delivery, capacity-management/bulk-reduction,
marketplace/discovery/ratings, post-cutoff customer communication, customer chat,
inventory, route planning, refunds. No table, column, screen, endpoint, or task
in this plan references these (BR-009/013/014, OOS-001..008, design spec §2).

## Summary by status

- ⚠️ conflicts: G-01.
- 🟡 partial: G-05, G-25, G-26, G-27, G-28.
- 🔴 not supported (net-new): G-02..G-04, G-06..G-24.
- ⛔ blocked-pending-decision: menu-edit-after-response (within G-07; see E1/ADR-7), workspace-pointer shape (within G-01/02; E2/ADR-1).
