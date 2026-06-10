# 04 — Database & RLS Plan (Meal Provider Workspace)

> **Source specs:** design spec → [`design/meal-provider/01_design_spec.md`](../../meal-provider/01_design_spec.md)
> (table proposals in §8); use-case spec → [`design/meal-provider/02_use_case_spec.md`](../../meal-provider/02_use_case_spec.md).

A **migration plan, not migration code.** Tables/columns/constraints follow the
spec's §8 proposals but are reconciled to repo conventions
(`00_repository_findings.md`, `02_architecture_decisions.md`). No SQL is written
here. All tables are **additive**; no existing table is altered except the
workspace-pointer object (ADR-1). (Provider error semantics reuse the existing 7
`ERROR_CODES` via `details.reason` — no enum or DB change; see `03`§3.)

**Conventions inherited (repo-verified):** native Postgres enums; `gen_random_uuid()`
PKs; `timestamptz` + `set_updated_at()` trigger on mutable tables; `search_path=''`
SECURITY DEFINER helpers with `REVOKE … FROM public, anon`; partial-unique
"one-live" indexes; cloud-dev `apply_migration` via Supabase MCP; **the new-table
auto-enable-RLS trigger means every provider table is RLS-deny-by-default until
explicit policies are added in the same migration set.**

**Migration ordering:** all new files sort **after** `20260602140000_m3_2_*`.
Suggested grouping (one logical concern per file, matching repo style):
`pmp_1_enums`, `pmp_2_org_membership_invites`, `pmp_3_catalog`, `pmp_4_menu`,
`pmp_5_responses`, `pmp_6_batches_events`, `pmp_7_rls_helpers_policies`,
`pmp_8_rpcs`, `pmp_9_cron`, `pmp_0_workspace_pointer` (ADR-1).
**Generated types** (`lib/db/database.types.ts`) are regenerated **once** after
the schema files merge — never co-edited by both tracks.

---

## 1. Enums (`pmp_1_enums`)

`provider_membership_role`, `provider_membership_status`, `provider_menu_status`,
`provider_response_status`, `provider_suggestion_status`, `provider_component_group`,
`provider_spice_level`, `provider_salt_level`, `provider_customization_type` —
values exactly as `03`§1. **Do not reuse household `spice_level`.**

---

## 2. Tables

For each: purpose · use case · key columns/constraints · indexes ·
**client-never-controls** · **server-derived** · **immutable** · tenant boundary.

### 2.1 `provider_organizations` — UC-PROVIDER-001

Columns per spec §8.1 (`owner_user_id`, `name`, contact, `timezone NOT NULL`,
`status`, `default_cutoff_local_time`, `summary_email_recipients text[]`, audit).

- Checks: non-empty trimmed `name`; IANA timezone validated in service.
- Index: `(owner_user_id)`. Trigger: `set_updated_at`.
- Client-never: `owner_user_id`, `status`. Server-derived: `status` transitions.
- Tenant boundary: `id` is the provider tenant root.

### 2.2 `provider_memberships` — UC-MEMBER-_, UC-WORKSPACE-_

Per spec §8.2 (`provider_id`, `user_id`, `role`, `status`, `invited_by`,
`approved_by`, `approved_at`, `joined_at`, `removed_at`, audit).

- Indexes: `(provider_id, status)`, `(user_id, status)`.
- **Partial unique** one-live membership per `(provider_id, user_id)` WHERE
  `status IN ('invited','awaiting_approval','active')` (mirrors `uq_one_live_membership`).
- Client-never: `role`, `status`, `approved_by_user_id`, `approved_at`. Server-derived:
  status lifecycle (`invited→awaiting_approval→active|rejected→removed`).
- FK delete: `provider_id`/`user_id` cascade. Tenant boundary: `provider_id`.

### 2.3 `provider_invites` — UC-MEMBER-001/002 (ADR-5)

Per spec §8.3; `token_hash text UNIQUE` (sha256 at rest), `status`, `expires_at`,
`accepted_by`/`accepted_at`.

- Indexes: unique `(token_hash)`; partial `(expires_at) WHERE status='pending'`.
- Client-never: `token_hash` (server-generated), `status`. Immutable: token once issued.
- Tenant boundary: `provider_id`.

### 2.4 `provider_subscriptions` — UC-SUBSCRIPTION-\*, BR-002

Per spec §8.4; **eligibility/consent only, no price/payment.**

- Check: `auto_accept_enabled = false OR auto_accept_consented_at IS NOT NULL`.
- Client-never: provider-side `status`. Server-derived: consent timestamp set on enable.
- Tenant boundary: `(provider_id, customer_user_id)`.

### 2.5 `provider_catalog_items` — UC-CATALOG-\* (ADR-4)

Per spec §8.5; `source_dish_id uuid null references dishes(id) on delete set null`;
`component_group`, `canonical_unit`, `default_quantity > 0`, `supports_spice_level`,
`supports_salt_level`, `allergy_warning`, `is_active`.

- Archive = `is_active=false` (UC-CATALOG-002 — never hard delete; history preserved).
- Client-never: `provider_id`. Tenant boundary: `provider_id`.

### 2.6 `provider_weekly_menus` — UC-MENU-001

Per spec §8.6; `week_start_date`/`week_end_date` (check end≥start), `status`,
`published_at`, `created_by_user_id`.

- **No unique active-week index** in MVP (ADR/E3 — publishing UX unconfirmed).
- Tenant boundary: `provider_id`.

### 2.7 `provider_menu_days` — UC-MENU-001/003

Per spec §8.7; `menu_date`, `cutoff_at timestamptz NOT NULL`, `status`, `note`,
`published_at`, `locked_at`.

- Index: `(provider_id, menu_date, status)`, **`(cutoff_at, status) WHERE status='published' AND locked_at IS NULL`** (cutoff sweep, §19.3).
- Partial unique `(provider_id, menu_date) WHERE status <> 'archived'` — _conditional on E3_.
- Client-never: `status`, `published_at`, `locked_at`. Server-derived: lock at cutoff. Immutable after `locked`.
- Tenant boundary: `provider_id`.

### 2.8 `provider_menu_components` — UC-MENU-002

Per spec §8.8; `menu_day_id`, `component_group`, `default_catalog_item_id`,
`default_quantity > 0`, `canonical_unit`, `is_required`, `sort_order`.

- Tenant boundary: via `menu_day → provider`.

### 2.9 `provider_menu_alternatives` — UC-RESPONSE-002

Per spec §8.9; unique `(menu_component_id, catalog_item_id)`; `quantity > 0`, `is_active`.

### 2.10 `provider_customization_groups` / 2.11 `provider_customization_options` — UC-RESPONSE-004/005

Per spec §8.10/8.11. Options: `code` unique per group, `external_price_label`
(informational only), `minimum_quantity`/`maximum_quantity`.

- **Checks (BR-010):** `quantity_increment` groups must have a finite max; spice/salt
  groups `included_in_price=true`. No payment columns anywhere.
- Client-never: everything (provider-authored).

### 2.12 `provider_member_responses` — UC-RESPONSE-001/007 (ADR-8, D4)

Per spec §8.12; unique `(menu_day_id, member_user_id)`; `status`, timestamps,
`auto_accepted`, `provider_overridden`, `provider_override_reason`, `member_note`,
**`version int NOT NULL DEFAULT 1`** (optimistic concurrency).

- Index: `(menu_day_id, status)` (batch reads, §19.3).
- Client-never: `status`, `locked_at`, `auto_accepted`, `provider_overridden`,
  `provider_override_reason`, `version` (server increments). Immutable once `locked`
  (except provider override path). Tenant boundary: `provider_id` + `menu_day`.

### 2.13 `provider_member_response_items` / 2.14 `_customizations` — UC-RESPONSE-002/003/004

Per spec §8.13/8.14. Item unique `(response_id, menu_component_id)`; customization
unique `(response_item_id, customization_option_id)`. `spice_level`/`salt_level`
stored structurally (no free text).

- **Server-derived:** `quantity`, `canonical_unit` derived from menu config — never
  trusted from client (§11.6).

### 2.15 `provider_meal_suggestions` — UC-SUGGEST-\* (BR-012)

Per spec §8.15; `suggestion_text`, `status`, `provider_response`. Non-binding —
never alters responses/batch. Rate-limited at the endpoint (§19.1).

### 2.16 `provider_preparation_batches` — UC-BATCH-001 (ADR-11)

Per spec §8.16; **unique `(menu_day_id, revision)`**; totals columns,
`source_response_watermark`, `email_status`, `status` (`current`/`stale`).

- **Immutable** per revision. Client-never: all (system/owner-generated).
- Index: `(menu_day_id, revision DESC)`.

### 2.17 `provider_preparation_batch_lines` — UC-BATCH-002

Per spec §8.17; append-only; `included_quantity`/`extra_quantity`/`total_quantity`,
`spice_level`/`salt_level`, `canonical_unit`. **Immutable.**

### 2.18 `provider_activity_events` — ADR-3

Envelope mirroring `household_activity_events` **without `household_id`**:
`provider_id NOT NULL`, `actor_user_id NULL`, `event_type`, `entity_type`,
`entity_id NULL`, `old_value`/`new_value jsonb`, `created_at`. Append-only.

- Index: `(provider_id, created_at DESC)`.

### 2.19 `provider_notifications` — ADR-15 (PROVISIONAL)

Recipient-scoped in-app inbox for provider events (mirrors `notifications` minus
household scope): `provider_id`, `recipient_user_id`, `actor_user_id NULL`,
`event_type`, `title`, `message`, `read_at`, `created_at`. Append-only.

- Index: `(recipient_user_id, created_at DESC) WHERE read_at IS NULL`.

### 2.20 `provider_onboarding_drafts` — ADR-6 (PROVISIONAL)

Own draft store (do not reuse household draft JSON): `owner_user_id`, `data jsonb`,
`status draft_status`(reuse enum), `last_saved_at`, audit. Abandon via new cron job.

### 2.21 Workspace pointer (`pmp_0_workspace_pointer`) — ADR-1 (PROVISIONAL)

`user_active_workspace(user_id uuid pk references users(id) on delete cascade,
workspace_type text, workspace_id uuid, updated_at)`. Written by SECURITY DEFINER
RPCs verifying membership. **Fallback:** skip this table and keep active workspace
client-side (no migration).

### 2.22 Idempotency scope (ADR-10)

Provider generation endpoints (batch regenerate/resend) need provider-scoped
idempotency. Either generalize `idempotency_keys` scope columns (add nullable
`provider_id`, relax PK to a scope tuple) **or** a separate
`provider_idempotency_keys`. Safe default: separate table to avoid touching the
household-scoped PK. _Decide at implementation; low risk either way._

---

## 3. RLS helper functions (`pmp_7_rls_helpers_policies`)

SECURITY DEFINER, `search_path=''`, `REVOKE … FROM public, anon`, grant to
`authenticated`(+`service_role` where needed):

- `is_active_provider_member(p uuid) → bool` — active membership, real-time (no expiry on providers, but future-proof the check).
- `is_provider_owner(p uuid) → bool`.
- `can_view_provider_menu(p uuid) → bool` — active **approved** customer or owner.
- `can_manage_provider(p uuid) → bool` — owner only.

## 4. RLS policies (per table)

- **Owner** (`is_provider_owner`): full read/write on org, catalog, menus, components,
  alternatives, customizations, invites, memberships (approve/reject/remove),
  all responses (read + override), batches/lines, suggestions, events, notifications.
- **Approved customer** (`can_view_provider_menu`): read **published** menus for
  their provider; read/write **own** response before cutoff; read own suggestions +
  create; read own provider notifications. **Cannot** read other responses, batch
  lines, member list, or edit menus.
- **Awaiting-approval customer**: read provider identity + own membership only; **no**
  menu/response access (UC-VIEW-002).
- **Cross-provider**: every policy scoped by `provider_id` via helpers → Provider A
  ≠ Provider B (UC-SECURITY-003). Cross-tenant existence not leaked (404 over 403 per
  repo convention where applicable).
- **Cutoff** is enforced in the response RPC/service (RLS can't express timestamp
  mutation rules — §9.4), with RLS as tenant backstop.

## 5. Transactional RPCs (`pmp_8_rpcs`)

All SECURITY DEFINER, `FOR UPDATE` locks where multi-step, idempotent:

- `complete_provider_onboarding(...)` — org + owner membership + settings atomically (ADR-6).
- `accept_provider_invite(token_hash)` — → `awaiting_approval` (ADR-5).
- `approve_provider_member` / `reject_provider_member` / `remove_provider_member`.
- `save_provider_response(...)` — validate alternatives/customizations/limits,
  derive quantities, enforce `cutoff_at > now()` + `version` check, upsert items/customizations.
- `provider_override_response(...)` — post-lock, reason required, preserve original,
  emit event, mark batch stale.
- `process_provider_cutoff(menu_day_id)` — lock day, auto-accept eligible, lock
  responses, count, create batch rev 1, mark locked (ADR-9/10); idempotent.
- `regenerate_provider_batch(batch_id)` — new revision N+1, recompute, keep old.
- `emit_provider_event(...)` — audit + fan-out to provider notifications (ADR-3/15).
- `set_active_workspace(...)` — verify membership before pointer write (ADR-1).

## 6. Aggregation (pure + persistence)

Pure `aggregatePreparation(input) → PreparationLine[]` (no DB) keyed
`catalogItemId+canonicalUnit+spiceLevel+saltLevel`; included vs extra separate;
never mix units. Persistence adapter writes batch lines inside the cutoff/regenerate
transaction.

## 7. Cron (`pmp_9_cron`)

- `process-provider-cutoff` every 5 min → sweeps `published` menu days with
  `cutoff_at <= now()` and `locked_at IS NULL`; calls `process_provider_cutoff` per day.
- `expire-provider-invites` hourly (mirror `expire_invites`).
- `abandon-stale-provider-drafts` daily (mirror `abandon_stale_drafts`) — only if ADR-6 draft table exists.

## 8. Backfill, generated types, rollback

- **Backfill:** none required (all additive; no existing rows to migrate). Existing
  households unaffected.
- **Generated types:** regenerate `lib/db/database.types.ts` once after schema files
  merge (Supabase MCP on cloud dev); commit with the migration.
- **Rollback limitations:** dropping enums/tables requires reverse-order drops; once
  customer responses exist in cloud dev, a destructive rollback loses data — prefer
  forward-fix migrations. Cron unschedule + table drops are otherwise clean. The
  workspace pointer (2.21) is the only change touching a shared path; its fallback is
  zero-migration.

## 9. Field-control summary (required by the prompt)

- **Client must never control:** any `status`/lifecycle column; `version`; `token_hash`;
  `locked_at`/`published_at`/`approved_at`/`joined_at`; `auto_accepted`/`provider_overridden`;
  all batch/line quantities; response item `quantity`/`canonical_unit` (derived);
  `provider_id`/`owner_user_id` ownership.
- **Server-derived:** response quantities/units/limits/eligibility; batch totals/lines;
  membership/menu/response/batch state transitions; consent timestamps; event rows.
- **Immutable historical:** `provider_activity_events`, batches + lines per revision,
  locked responses (except override), accepted invites.
- **Tenant-isolation boundary:** `provider_id` on every provider table (directly or via
  parent), enforced by RLS helpers; customer self-scope on responses/suggestions/notifications.
