# 02 — Architecture Decisions (Meal Provider Workspace)

> **Source specs:** design spec → [`design/meal-provider/01_design_spec.md`](../../meal-provider/01_design_spec.md);
> use-case spec → [`design/meal-provider/02_use_case_spec.md`](../../meal-provider/02_use_case_spec.md).

ADR-style decisions. Each: **Context · Verified current state · Options · Decision
· Reasons · Rejected options · Consequences · Migration/rollback · Open
questions**. Where repository inspection is insufficient to finalize, the
decision is marked **PROVISIONAL (blocked)** and the exact blocker is named.

---

## ADR-1 — Workspace routing & persistence

**Context.** A user may simultaneously be a household member, a provider owner,
and a customer of multiple providers (design spec §4.2). Post-login must land
each in the right place.

**Verified current state.** `app/(app)/layout.tsx` calls `resolveCurrentHousehold()`
and `redirect("/onboarding")` when there is no active household (`00`§C1).
`proxy.ts` redirects authenticated users on `/sign-in` → `/today`.
`users.active_household_id`/`preferred_household_id` are FK→`households` written by
`set_active_household`/`set_preferred_household` (`00`§B8/C3).

**Options.**

1. Move `(app)` → `(household-app)` and rebuild routing (spec's suggested tree).
2. Keep `(app)` as the household shell; add `(provider-owner-app)` +
   `(provider-member-app)` route groups; introduce a workspace resolver that
   post-login routing and a new top-level entry consult.
3. Client-only active-workspace (no persistence).

**Persistence sub-options.** (a) generalized `user_active_workspace(user_id pk, workspace_type, workspace_id)`;
(b) add `active_provider_id` + `active_workspace_type` to `users`; (c) client-only.

**Decision.** **Option 2** for routing. For persistence, **(a) generalized
`user_active_workspace` table** — _PROVISIONAL_, with (c) client-only as the
zero-migration fallback if the owner prefers to defer persistence.

**Reasons.** Keeping `(app)` avoids renaming public household URLs (no redirect
plan needed — `00`§C1, spec §4.3 "CLAUDE CODE VERIFY"). A generalized pointer
doesn't overload the household-typed `active_household_id` (which physically
can't store a provider id) and extends cleanly to future workspace types.

**Rejected.** Option 1 = avoidable churn + URL-migration risk. Sub-option (b)
leaves two parallel pointer systems on `users`; (c) loses the choice across
devices.

**Consequences.** New `lib/services/workspace/` resolver returning `WorkspaceRef[]`
(see `03`). `proxy.ts` post-auth target + `app/auth/callback` default become
workspace-aware (serialized shared edits). A workspace chooser is shown when
multiple workspaces and no valid stored choice.

**Migration/rollback.** Additive table + two SECURITY DEFINER pointer RPCs that
verify membership before write (mirroring `set_active_household`). Rollback =
drop table + fall back to client-only; routing change is code-only and revertible.

**Open questions.** E2 (pointer shape). Does the chooser need its own route or a
modal? (safe default: a `/workspace` chooser page.)

---

## ADR-2 — Provider tenancy boundary

**Context.** Providers are a second tenancy type.

**Verified state.** Household tenancy = `households` + `household_members` + 8
`can_*` flags + RLS helpers (`00`§B4).

**Options.** (1) add provider columns to `households`/`household_members`;
(2) separate `provider_*` tables mirroring the membership shape.

**Decision.** **Option 2** — separate `provider_organizations` +
`provider_memberships`. Never add provider fields to household tables (spec §4.1).

**Reasons.** Provider customers are explicitly **not** household members (rule
19). Overloading would pollute household RLS and risk cross-tenant leakage.

**Rejected.** Option 1 — breaks the household model's invariants and RLS.

**Consequences.** New RLS helpers `is_active_provider_member`/`is_provider_owner`;
parallel membership lifecycle.

**Migration/rollback.** Additive tables; drop to roll back. **Open questions.** None.

---

## ADR-3 — Provider activity/events: generalized vs. separate

**Context.** State-changing flows must audit + fan out (repo convention).

**Verified state.** `household_activity_events` + `notifications` both have
`household_id NOT NULL` (`00`§C2); fan-out via `emit_household_event()`.

**Options.** (1) generalize the event table with a `scope_type` discriminator +
nullable FKs; (2) new `provider_activity_events` (no `household_id`) +
`emit_provider_event()`; (3) force provider events into the household table.

**Decision.** **Option 2.**

**Reasons.** Least disruptive to the heavily-used household audit path; avoids
making `household_id` nullable on a table every household flow writes (spec §8.18
preferred-order #2/#3). Same envelope columns (actor, event_type, entity_type/id,
old/new, created_at).

**Rejected.** (1) churns a hot shared table + every existing policy/insert;
(3) impossible (NOT NULL) and semantically wrong.

**Consequences.** New table + `emit_provider_event()` RPC with `is_active_provider_member`
guard. **Migration/rollback.** Additive. **Open questions.** None (notifications handled in ADR-15).

---

## ADR-4 — Provider catalog references to existing dishes

**Context.** Providers may reuse existing dishes but need their own metadata.

**Verified state.** Global `dishes` catalog (admin-authored, household-planning
oriented).

**Options.** (1) reuse `dishes` directly; (2) `provider_catalog_items` with
nullable `source_dish_id`.

**Decision.** **Option 2** (spec §8.5).

**Reasons.** Provider name/unit/portion/availability differ from dish metadata;
`source_dish_id` allows reuse without coupling provider menus to household
planning assumptions. Household dish metadata must never silently override
provider quantity rules (UC-CATALOG-001).

**Rejected.** (1) couples domains; archive/availability semantics clash.

**Consequences.** `source_dish_id uuid null references dishes(id) on delete set null`.
**Migration/rollback.** Additive. **Open questions.** None.

---

## ADR-5 — Invite reuse vs. provider-specific invites

**Context.** Providers invite customers.

**Verified state.** `household_invites` + hashed token + preview/accept/decline
RPCs, accept→**active** (`00`§B5).

**Options.** (1) reuse `household_invites`; (2) `provider_invites` reusing the
token/hash/preview security pattern but accept→**awaiting_approval**.

**Decision.** **Option 2.**

**Reasons.** Household invites grant immediate active membership; providers
require approval (BR-004). Tenant column differs. Security primitives (sha256
hash at rest, hash-only RPCs, real-time expiry + backstop job) are reused, not
re-invented (spec §8.3 "CLAUDE CODE VERIFY").

**Rejected.** (1) wrong tenant + wrong post-accept state.

**Consequences.** `provider_invites` + `accept_provider_invite()` → membership
`awaiting_approval`. **Migration/rollback.** Additive. **Open questions.** E5
(email-mismatch rule — mirror household behavior).

---

## ADR-6 — Provider onboarding draft storage

**Context.** Onboarding must be resumable (UC-PROVIDER-002).

**Verified state.** Household uses `household_profile_drafts` + `complete_onboarding`
RPC; `abandon_stale_drafts` job.

**Options.** (1) reuse household draft table/JSON; (2) provider-specific draft
store.

**Decision.** **Option 2** (spec §UC-PROVIDER-001 "CLAUDE CODE VERIFY").

**Reasons.** Draft JSON schema differs; reusing risks overwriting a household
draft (UC-PROVIDER-002 acceptance: drafts must coexist).

**Rejected.** (1) schema incompatibility + coexistence hazard.

**Consequences.** `provider_onboarding_drafts` (or equivalent) + its own
abandon job. **Migration/rollback.** Additive. **Open questions.** Whether
provider onboarding even needs server draft vs. client-stage state — safe default:
mirror household (server draft), but this can be deferred to a fast-follow.

---

## ADR-7 — Menu versioning after member responses exist — ACCEPTED (revision)

**Context.** Provider edits a published menu (UC-MENU-004/005).

**Verified state.** No menu-revalidation/versioning infrastructure exists in the
repo to copy.

**Options (spec-allowed only).** (1) block structural edits once any response
exists; (2) explicit menu revision that invalidates affected responses; (3)
cancel/recreate menu.

**Decision (signed off — ADO #30, 2026-06-15).** **(2) explicit menu revision.**
An owner edit on a menu that already has member responses (before cutoff) creates
a **new menu revision (rev N+1)** rather than mutating in place or blocking.
Existing responses are **carried forward and re-validated** against the new
structure; a response referencing a removed/changed component or a now-invalid
customization is **selectively invalidated** (only the affected component) and the
member is notified to re-confirm. Revisions are allowed **before cutoff only**;
census/prep always read the **latest** revision; the revision is recorded in the
event fan-out (`household_activity_events` / provider events). Non-structural
edits (e.g. note text) still apply in place.

**Reasons.** Honours "must not silently invalidate member responses"
(UC-MENU-005) without trapping the owner behind a hard block: a structural change
is preserved as a new revision and only the genuinely-affected responses are asked
to re-confirm. Block-only (option 1) over-restricts a legitimate same-day edit;
cancel/recreate (option 3) discards all standing responses unnecessarily.

**Rejected.** (1)/(3) — see above; kept only as the degenerate "no responses yet"
case, where a structural edit needs no revision (the fresh-publish path).

**Consequences.** Adds a revision dimension to the menu day + a response carry-
forward / selective-invalidation routine + a re-confirm notification. The
**fresh-publish path (draft → published, no responses)** is ADR-7-independent and
ships first as the MP-A-121 writer (`publish_provider_menu_day`, pmp_18); the
revision-on-edit path is MP-A-012E + the revision rebuild. **Migration/rollback.**
Additive (revision column + routine). **Open questions.** Resolved — see Q-1 in
`09_open_questions.md`.

---

## ADR-8 — No-response representation

**Context.** No confirmed response ⇒ no order (BR-001, UC-RESPONSE-010).

**Verified state.** Repo prefers computed state over redundant rows (e.g. guest
expiry computed in `is_active_member`).

**Options.** (1) absence + computed count; (2) explicit `no_response` row.

**Decision.** **Option 1** (spec UC-RESPONSE-010 "CLAUDE CODE VERIFY").

**Reasons.** No redundant rows; count derived from active membership minus
responded. The `provider_response_status` enum still includes `no_response` for
DTO/typing, but no row is written.

**Rejected.** (2) creates rows with no business payload.

**Consequences.** Batch counts compute no-response = active members − (confirmed
∪ auto_accepted ∪ cancelled). **Migration/rollback.** N/A. **Open questions.** None.

---

## ADR-9 — Cutoff scheduler

**Context.** Cutoff must be processed automatically (§15.1).

**Verified state.** All jobs = pg_cron, SECURITY DEFINER, idempotent; no Edge
Functions (`00`§B11/D3).

**Options.** (1) pg_cron; (2) Supabase Edge Function; (3) Vercel cron.

**Decision.** **pg_cron**, every 5 minutes (spec §15.1 cadence).

**Reasons.** Matches the only scheduler in the repo; no second mechanism (spec
§15.3). **Rejected.** Edge/Vercel — not used here. **Consequences.** New
`cron.schedule('process-provider-cutoff', ...)` → `process_provider_cutoff()`.
**Migration/rollback.** `cron.unschedule` to roll back. **Open questions.** Cron
granularity vs. per-provider timezones — cutoff is stored as absolute `timestamptz`,
so the 5-min sweep is timezone-agnostic.

---

## ADR-10 — Cutoff transaction & idempotency

**Context.** Re-running cutoff must not duplicate orders/totals (UC-CUTOFF-002).

**Verified state.** Repo idempotency via `FOR UPDATE` locks + unique keys
(`complete_onboarding`, `accept_invite`); `idempotency_keys` PK is household-scoped
(`00`§C4).

**Options.** (1) advisory lock; (2) menu-day state transition + unique batch
revision; (3) request idempotency keys.

**Decision.** **Option 2** — lock the menu-day row `FOR UPDATE`, transition
`published → locked` once, create batch `revision=1` under
`unique(menu_day_id, revision)`. Re-runs short-circuit on `locked_at` / existing
revision.

**Reasons.** Matches existing transactional-RPC idiom; the unique index is the
hard guarantee; email send happens **after** commit so failure can't duplicate.

**Rejected.** (1) advisory locks are easy to misuse across connections; (3)
overkill for a job (no client key).

**Consequences.** `process_provider_cutoff()` is a single transaction +
post-commit email. **Migration/rollback.** Function + unique index. **Open
questions.** None.

---

## ADR-11 — Batch revision model

**Context.** Override must not mutate history (UC-OVERRIDE-002, §20.5).

**Verified state.** Append-only audit precedent (`household_activity_events`).

**Decision.** `provider_preparation_batches` immutable per `(menu_day_id, revision)`;
override marks current batch `status='stale'`; regenerate inserts `revision N+1`;
old revisions retained; lines append-only.

**Reasons.** Immutable revisions = reproducible CSV/print/email. **Rejected.**
In-place update (loses history). **Consequences.** Email/CSV/print always
reference a specific revision. **Migration/rollback.** Additive. **Open
questions.** None.

---

## ADR-12 — Email reuse

**Context.** Summary email on cutoff/override/resend (§16).

**Verified state.** `EmailTransport`/`ResendEmailTransport` + pure renderers; no-op
if unconfigured (`00`§A9/A10).

**Decision.** Reuse the transport; add a pure `renderProviderSummaryEmail()`; build
the DTO from a **persisted batch revision** (never recompute in render); record
`email_status` on the batch; explicit resend.

**Reasons.** One email abstraction (spec §16, "do not add a second email
abstraction"). Email failure must not roll back batch (post-commit send).
**Rejected.** New mailer. **Consequences.** `providerSummaryEmailService`.
**Migration/rollback.** `email_status` column. **Open questions.** None.

---

## ADR-13 — CSV generation

**Context.** Aggregate + individual CSV (§10.9, UC-BATCH-003/004).

**Verified state.** **No CSV utility exists** (`00`§D1).

**Decision.** Net-new `lib/services/provider/export/csv.ts`: UTF-8, deterministic
column order, RFC-4180 escaping (quote fields containing `, " \n`), and
**formula-injection defense** (prefix cells starting with `= + - @` with a
leading apostrophe). Owner-only routes serve `text/csv` with
`Content-Disposition: attachment`. Generated from a persisted batch revision.

**Reasons.** Security requirement (§19.1); no serializer present to reuse.
**Rejected.** Pulling a heavy CSV dependency — a small pure function is testable
and sufficient. **Consequences.** New util + unit tests for escaping/injection.
**Migration/rollback.** None (code only). **Open questions.** None.

---

## ADR-14 — Print rendering

**Context.** Owner-only printable preparation summary (§17, UC-BATCH-005).

**Verified state.** No print page / `@media print` exists (`00`§D2).

**Decision.** Server-rendered route in the provider-owner group
(`/provider/preparation/{batchId}/print`), owner-only, consuming a print-view
DTO from a specific revision; `@media print` CSS; A4 + letter; repeated table
headers; aggregate then individual; no interactive controls; revision + timestamp
shown.

**Reasons.** Reproducible, server-authorized output. **Rejected.** Client-side
window.print of an interactive page (leaks controls, not server-authorized).
**Consequences.** New page + print CSS. **Migration/rollback.** Code only.
**Open questions.** None.

---

## ADR-15 — Notification reuse

**Context.** Notify customers on publish/approval; cutoff reminders (UC-NOTIFY-\*).

**Verified state.** `notifications.household_id NOT NULL` (`00`§C2); fan-out RPC.

**Options.** (1) make `notifications` scope generic (nullable household + scope);
(2) new `provider_notifications` table reusing the fan-out shape.

**Decision.** **Option 2 (new `provider_notifications`)** — _PROVISIONAL safe
default_; revisit generalization (1) only if duplication proves costly.

**Reasons.** Avoids relaxing a NOT NULL on a hot, household-coupled table and
re-touching every household notification policy/insert.

**Rejected (for MVP).** (1) churns shared household infra.

**Consequences.** Provider in-app inbox is separate; member UI reads provider
notifications per provider. **Migration/rollback.** Additive. **Open questions.**
E4 — confirm separate table is acceptable vs. a unified inbox.

---

## ADR-16 — Mobile API exposure

**Context.** Mobile uses the same backend (spec §1.2/1.6).

**Verified state.** Bearer auth via `createServerSupabaseClient`'s identity guard;
`mobile/src/api/*` mirrors DTO contracts; `@mmp/shared` subpath exports.

**Decision.** Provider APIs are the same `/api/*` routes (no second transport);
provider enums/DTOs/validators that mobile needs are published under a new
`@mmp/shared/provider` subpath export.

**~~Original decision (SUPERSEDED 2026-06-11):~~** _Mobile provider screens out of
MVP scope; API + shared contracts mobile-ready only._ This is **no longer the
policy** — see **ADR-17**, which puts mobile provider **screens** in scope at full
parity. The API/transport/contract part of ADR-16 stands unchanged; only the
"screens out of scope" carve-out is reversed.

**Reasons.** One auth model (rule: no second auth), contract parity prevents drift
(spec §1.6, §7). **Rejected.** Provider-only auth/transport. **Consequences.**
Add a subpath export to `packages/shared` (serialized shared-file edit; verify
existing export convention before adding). **Migration/rollback.** Package export
addition. **Open questions.** Confirm `@mmp/shared` export-map convention before
adding the subpath (don't create a second shared package).

---

## ADR-17 — Mobile provider screens at full parity (supersedes ADR-16's scope carve-out)

**Context.** The mobile app (`mobile/`, React Native + Expo) is feature-complete for
the household app (MOBILE_IMPLEMENTATION_TRACKER M0–M2 done) and the project rule is
**web ↔ mobile feature parity, non-negotiable**. ADR-16 had deferred provider
**screens** off mobile. That carve-out is reversed.

**Decision.**

1. **Mobile provider screens are in scope at full parity** with the web provider
   workspace (owner + member). They consume the same bearer `/api/*` routes and the
   same `@mmp/shared/provider` contracts via a new `mobile/src/api/provider.ts`
   client mirroring `mobile/src/api/*` — **no second auth, no second transport**
   (ADR-16's API decision is unchanged and is the foundation this builds on).
2. **One PR, both platforms (lockstep).** Each UI-bearing provider item ships its web
   (Track B) and mobile (Track C) screens in the **same PR**; the item is not `Done`
   web-only. Tracked as **Track C** in `05_two_developer_implementation_tracker.md`.
3. **Mobile test bar.** Jest + React Native Testing Library unit/hook tests are
   **required** and join the constant regression suite via a new `test:mobile` gate
   folded into `test:all`. Each item is additionally proven by a **manual Expo
   smoke**. The harness + API-client scaffold is stood up once in **MP-C-000**
   (analogous to #34) before any mobile provider feature closes.
4. **Mobile UI E2E (Detox/Maestro) is deferred** behind a `decision`-tagged backlog
   item. This machine is **Windows + no Docker**: an iOS simulator is impossible and
   no Android emulator / cloud-device runner exists, so automated device E2E cannot
   run here today. Until that runner decision is resolved, mobile UI correctness is
   carried by unit/hook tests + manual Expo smoke, and the constant suite's mobile
   coverage stays at unit/hook + the existing mobile **API** contract.

**Reasons.** Parity is a standing project rule; the backend and `@mmp/shared`
contracts are already shared, so the only net-new work is the RN screens + a mobile
client + a mobile unit-test harness. Lockstep prevents the web-ahead drift that a
"fast-follow" model invites. **Rejected.** (a) Web-first, mobile fast-follow — allows
a real parity-breaking window. (b) Requiring automated mobile E2E now — unrunnable on
this OS/host without standing up an emulator/cloud-device farm first; would block
every provider item. **Consequences.** Track C added; `mobile/package.json` gains a
`test` script and the root gate gains `test:mobile` (MP-C-000); each web UI checkpoint
grows a paired mobile deliverable. **Migration/rollback.** Additive (new `mobile/app`
route groups + `mobile/src/provider/*`); revert the PR to roll back a screen.
**Open questions.** The deferred mobile-E2E runner (Detox vs Maestro; Android emulator
vs EAS/cloud-device) — `decision`-tagged, see `09_open_questions.md` Q-8.

---

## Decision status summary

- **Finalized:** ADR-2, 3, 4, 5, 8, 9, 10, 11, 12, 13, 14, 16 (API/transport part),
  17 (mobile provider screens at full parity, one-PR lockstep).
- **Superseded:** ADR-16's "mobile provider screens out of MVP scope" carve-out →
  reversed by ADR-17 (2026-06-11). ADR-16's API/transport/contract decision stands.
- **Provisional (safe default, owner sign-off requested):** ADR-1 (pointer shape),
  ADR-6 (draft store necessity), ADR-15 (separate notif table).
- **Blocked (must resolve before dependent tasks):** ADR-7 (menu-edit-after-response
  policy) — blocks the menu-edit tasks only; everything else can proceed.
- **Deferred (decision-tagged, non-blocking):** the mobile UI E2E runner (ADR-17 §4 /
  `09` Q-8) — mobile provider screens ship now under unit/hook + Expo-smoke coverage.
