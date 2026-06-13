-- PMP-6 (MP-A-014) · Preparation batches (+ lines) + provider activity events +
-- provider notifications: table shape, RLS, indexes. **Schema only.** The rows in
-- these tables are produced by server-role flows that are NOT in this migration:
--   • batches + lines are written by process_provider_cutoff (MP-A-141) and
--     regenerate_provider_batch (MP-A-150), inside the cutoff/regenerate tx;
--   • activity events + notifications are written by emit_provider_event (MP-A-170).
-- The pure aggregation that computes the lines is MP-A-140 (lib/services/provider/
-- aggregation.ts). Nothing here is ADR-7-dependent.
--
-- Source of truth: design/meal-provider/01_design_spec.md § 8.16–8.18 (table
-- shapes) reconciled to repo conventions in
-- design/planning/meal-provider/04_database_and_rls_plan.md § 2.16–2.19 + § 4.
--
-- Conventions (pmp_4/pmp_5): gen_random_uuid() PKs; timestamptz columns; the shared
-- set_updated_at() BEFORE UPDATE trigger on mutable tables (batches carry a mutable
-- status/email_status; lines/events/notifications are append-only and carry only
-- created_at, except notifications' read_at which a recipient flips); native enums
-- from pmp_1; numeric quantities. The ensure_rls event trigger auto-enables RLS on
-- every new table; the explicit enables + policies below ship in this same migration
-- so each table is never a window of open access.
--
-- ── Field-control posture (design/04 § 9) — why writes are NOT granted by RLS ──
-- Every batch/line quantity, total, status and email_status is CLIENT-NEVER-
-- CONTROLLED (system/owner-generated, § 9). Batches/lines are immutable per revision
-- and built only by the cutoff/regenerate RPCs (service-role, RLS-bypassing), so the
-- batch tables grant **SELECT only**, owner-scoped — a customer can never read the
-- aggregate roster (UC-SECURITY: "Customer cannot read aggregate batch"). Activity
-- events are an append-only owner audit written by emit_provider_event (server role),
-- so they grant **owner SELECT only** (mirroring household_activity_events' member
-- read, but provider events are owner-private). Notifications are recipient-scoped:
-- the recipient reads + marks their own read (mirroring household notifications);
-- inserts are server-role fan-out only.

-- ════════════════════════════ tables ════════════════════════════

-- ── provider_preparation_batches ─────────────────────────────────────────────────
-- UC-BATCH-001 / ADR-11. One immutable revision of the preparation roster for a menu
-- day, built at cutoff (rev 1) and on each provider regenerate (rev N+1); the old
-- revision is kept. revision is unique per day; status is 'current' for the latest
-- and 'stale' once a newer revision (or a provider override) supersedes it. The
-- total_* counts are the cutoff census; source_response_watermark records the
-- latest response timestamp folded into this revision (so a later override can be
-- detected as making the batch stale). email_status tracks the summary-email
-- lifecycle (NULL = not yet attempted).
create table provider_preparation_batches (
  id                        uuid primary key default gen_random_uuid(),
  provider_id               uuid not null references provider_organizations (id) on delete cascade,
  menu_day_id               uuid not null references provider_menu_days (id) on delete cascade,
  revision                  integer not null,
  generated_at              timestamptz not null default now(),
  status                    text not null,
  total_confirmed           integer not null default 0,
  total_auto_accepted       integer not null default 0,
  total_cancelled           integer not null default 0,
  total_no_response         integer not null default 0,
  source_response_watermark timestamptz,
  email_status              text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint provider_preparation_batch_revision_positive check (revision >= 1),
  constraint provider_preparation_batch_status_valid check (status in ('current', 'stale')),
  constraint provider_preparation_batch_email_status_valid
    check (email_status is null or email_status in ('queued', 'sent', 'failed')),
  constraint provider_preparation_batch_totals_nonneg
    check (
      total_confirmed >= 0
      and total_auto_accepted >= 0
      and total_cancelled >= 0
      and total_no_response >= 0
    ),
  unique (menu_day_id, revision)
);

create trigger trg_set_updated_at before update on provider_preparation_batches
  for each row execute function set_updated_at();

-- Owner reads a day's revisions newest-first; the unique (menu_day_id, revision)
-- index also serves a specific-revision lookup.
create index ix_provider_preparation_batches_day
  on provider_preparation_batches (menu_day_id, revision desc);

-- "Exactly one current revision per menu day" is the core ADR-11 invariant
-- (a stale revision is kept for history; only the latest is 'current'). The
-- cutoff/regenerate RPCs flip the prior revision to 'stale' in the same tx, but
-- a partial-failure or future bug must NOT be able to leave two 'current' rows —
-- a reader selecting the current batch would then get an ambiguous/duplicate
-- roster. Enforce it in the schema, not just in every writer.
create unique index uq_provider_preparation_batches_one_current
  on provider_preparation_batches (menu_day_id) where status = 'current';

-- ── provider_preparation_batch_lines ─────────────────────────────────────────────
-- UC-BATCH-002. The aggregated preparation lines of one batch revision, keyed
-- (catalog_item, canonical_unit, spice_level, salt_level) by the MP-A-140 aggregator:
-- different spice / salt / unit stay separate rows; included_quantity (default
-- package) and extra_quantity (paid extras) are reported separately and total =
-- included + extra. Append-only / immutable per revision (no updated_at, spec § 8.17)
-- — a new revision writes a fresh set of lines under a new batch row.
create table provider_preparation_batch_lines (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid not null references provider_preparation_batches (id) on delete cascade,
  catalog_item_id   uuid not null references provider_catalog_items (id),
  spice_level       provider_spice_level,
  salt_level        provider_salt_level,
  included_quantity numeric(10, 3) not null default 0,
  extra_quantity    numeric(10, 3) not null default 0,
  total_quantity    numeric(10, 3) not null,
  canonical_unit    text not null,
  created_at        timestamptz not null default now(),
  constraint provider_preparation_batch_line_included_nonneg check (included_quantity >= 0),
  constraint provider_preparation_batch_line_extra_nonneg check (extra_quantity >= 0),
  constraint provider_preparation_batch_line_total_nonneg check (total_quantity >= 0),
  constraint provider_preparation_batch_line_unit_not_blank check (length(btrim(canonical_unit)) > 0)
);

-- Read a revision's lines in one indexed lookup.
create index ix_provider_preparation_batch_lines_batch
  on provider_preparation_batch_lines (batch_id);

-- One aggregated line per (catalog item, unit, spice, salt) within a batch
-- revision — the exact key the MP-A-140 aggregator dedups on. The aggregator
-- already guarantees this, but a bug in the cutoff/regenerate persistence (a
-- key mismatch between TS and SQL, or a double-insert on retry) must not be able
-- to write duplicate aggregate rows and silently double the roster. NULLS NOT
-- DISTINCT (PG15+) is required so the "no spice / no salt selected" variant
-- (spice_level / salt_level NULL) collapses to a single line instead of NULLs
-- being treated as all-distinct.
create unique index uq_provider_preparation_batch_lines_key
  on provider_preparation_batch_lines (
    batch_id, catalog_item_id, canonical_unit, spice_level, salt_level
  ) nulls not distinct;

-- ── provider_activity_events ─────────────────────────────────────────────────────
-- ADR-3 / spec § 8.18 (option 2: the household event-envelope pattern WITHOUT
-- household_id). Append-only owner audit; one row per domain change, written
-- in-transaction by emit_provider_event (server/service-role, MP-A-170). Tenant root:
-- provider_id. actor_user_id is set null on user deletion so the audit survives.
create table provider_activity_events (
  id            uuid primary key default gen_random_uuid(),
  provider_id   uuid not null references provider_organizations (id) on delete cascade,
  actor_user_id uuid references users (id) on delete set null,
  event_type    text not null,
  entity_type   text not null,
  entity_id     uuid,
  old_value     jsonb,
  new_value     jsonb,
  created_at    timestamptz not null default now()
);

-- Owner reads a provider's audit newest-first.
create index ix_provider_activity_events_provider
  on provider_activity_events (provider_id, created_at desc);

-- ── provider_notifications ───────────────────────────────────────────────────────
-- ADR-15 / spec § 8.18. Recipient-scoped in-app inbox for provider events (mirrors
-- the household `notifications` table minus household scope). recipient_user_id
-- cascades on user deletion; actor_user_id is set null to preserve the notification
-- if the actor is deleted. Inserted by emit_provider_event fan-out (server role);
-- the recipient flips read_at.
create table provider_notifications (
  id                uuid primary key default gen_random_uuid(),
  provider_id       uuid not null references provider_organizations (id) on delete cascade,
  recipient_user_id uuid not null references users (id) on delete cascade,
  actor_user_id     uuid references users (id) on delete set null,
  event_type        text not null,
  title             text not null,
  message           text not null,
  read_at           timestamptz,
  created_at        timestamptz not null default now()
);

-- Recipient reads their unread provider notifications newest-first (partial index
-- mirrors the household notifications index).
create index ix_provider_notifications_recipient
  on provider_notifications (recipient_user_id, created_at desc) where read_at is null;

-- ════════════════════════════ RLS helper functions ════════════════════════════
-- provider_preparation_batches carries provider_id directly, so its policy needs no
-- helper. batch_lines carries only batch_id; a policy must reach the owning batch's
-- provider via the FK chain. As in pmp_4/pmp_5, that lookup MUST run in a SECURITY
-- DEFINER helper (search_path='') so the child policy does NOT recurse into
-- provider_preparation_batches' own RLS — the helper runs as table owner and reads
-- it directly.

-- Current user may READ batch line of batch b: owner of the batch's provider. Returns
-- NULL (→ not visible) when the batch is gone.
create or replace function can_read_provider_batch(b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_provider_owner(pb.provider_id)
  from public.provider_preparation_batches pb
  where pb.id = b;
$$;

-- Lock the SECURITY DEFINER surface (advisor 0028/0029): not callable by anon (no
-- session → auth.uid() null → owner check false); kept for authenticated (so the
-- policy can invoke it) + service_role. Owner-scoped, so any residual 0029 is benign.
revoke execute on function public.can_read_provider_batch(uuid) from public, anon;
grant execute on function public.can_read_provider_batch(uuid) to authenticated, service_role;

-- ════════════════════════════ policies ════════════════════════════
-- Batches/lines/events are owner-read-only (no customer access at all): every write
-- is a server-role RPC (cutoff/regenerate/emit). Notifications are recipient-scoped
-- read + mark-read; inserts are server-role fan-out only.

-- provider_preparation_batches — owner reads all revisions of their provider; NO
-- client write (cutoff/regenerate RPCs run as service role).
alter table provider_preparation_batches enable row level security;
create policy ppb_select on provider_preparation_batches
  for select to authenticated using (is_provider_owner(provider_id));

-- provider_preparation_batch_lines — read via the batch rule; no direct write.
alter table provider_preparation_batch_lines enable row level security;
create policy ppbl_select on provider_preparation_batch_lines
  for select to authenticated using (can_read_provider_batch(batch_id));

-- provider_activity_events — owner read; NO client write (emit_provider_event runs as
-- service role). Provider events are owner-private (unlike household events, which are
-- member-readable): customers must not see the audit trail.
alter table provider_activity_events enable row level security;
create policy pae_select on provider_activity_events
  for select to authenticated using (is_provider_owner(provider_id));

-- provider_notifications — recipient read + mark-read; insert via service-role only.
alter table provider_notifications enable row level security;
create policy pn_select on provider_notifications
  for select to authenticated using (recipient_user_id = (select auth.uid()));
create policy pn_update on provider_notifications
  for update to authenticated using (recipient_user_id = (select auth.uid()))
  with check (recipient_user_id = (select auth.uid()));
