-- P0-9 · Audit & notification tables.
--
-- household_activity_events (append-only audit log) and notifications
-- (recipient-scoped). Source of truth: design/01_database_design.md § Tables.
--
-- Both tables are append-only (no updated_at column) so NEITHER gets a
-- set_updated_at trigger. notifications.read_at is the only mutable field
-- (marking read) and is tracked explicitly, not via updated_at.
--
-- actor_user_id uses ON DELETE SET NULL on both so audit/notification history
-- survives account deletion without re-identifying the deleted user (design/01
-- principle 6, design/03 § 9). The V2 notification_preferences table is deferred
-- (design/01) and intentionally NOT created here.
--
-- Scope split (per IMPLEMENTATION_TRACKER): standalone indexes
-- (ix_activity_household, ix_notifications_recipient_unread) are DEFERRED to
-- P0-10. RLS is auto-enabled by the `ensure_rls` trigger; these tables get
-- read-only-for-members / recipient policies and NO user-role write policy in
-- P0-12 (writes come only via the server/service-role path — design/03 § 5, 10).

-- ── household_activity_events ────────────────────────────────────────────────
-- Append-only audit log; one row per domain change, written in-transaction by
-- the server/service-role path (design/03 § 10).
create table household_activity_events (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households (id) on delete cascade,
  actor_user_id uuid references users (id) on delete set null,
  event_type    text not null,
  entity_type   text not null,
  entity_id     uuid,
  old_value     jsonb,
  new_value     jsonb,
  created_at    timestamptz not null default now()
);

-- ── notifications ────────────────────────────────────────────────────────────
-- Recipient-scoped. recipient_user_id cascades on user deletion; actor_user_id
-- is set null to preserve the notification if the actor is deleted.
create table notifications (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references households (id) on delete cascade,
  recipient_user_id uuid not null references users (id) on delete cascade,
  actor_user_id     uuid references users (id) on delete set null,
  event_type        text not null,
  title             text not null,
  message           text not null,
  read_at           timestamptz,
  created_at        timestamptz not null default now()
);
