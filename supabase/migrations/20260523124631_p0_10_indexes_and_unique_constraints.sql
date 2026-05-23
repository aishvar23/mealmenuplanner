-- P0-10 · All standalone indexes + the partial-unique invariants.
--
-- Source of truth: design/01_database_design.md (the `create index` /
-- `create unique index` statements listed under each table). All inline CHECK
-- and inline `unique (...)` table constraints were already created with their
-- tables in P0-6..P0-9, so this migration is purely the standalone indexes.
--
-- This is where the deferred uniqueness INVARIANTS finally land:
--   • uq_one_active_draft_per_user — one in-progress draft per user
--   • uq_one_live_membership       — one live membership per user+household
--   • uq_active_plan_per_start     — one active plan per household+start_date
--
-- Note: ix_dishes_name_trgm uses gin_trgm_ops, which lives in the `extensions`
-- schema on this project (pg_trgm was installed there in P0-5). It is therefore
-- schema-qualified as `extensions.gin_trgm_ops` so it resolves regardless of the
-- migration's search_path (design/01 wrote the bare name assuming public).

-- ── household_profile_drafts ─────────────────────────────────────────────────
create unique index uq_one_active_draft_per_user
  on household_profile_drafts (user_id)
  where status = 'in_progress';

-- ── household_members ────────────────────────────────────────────────────────
create unique index uq_one_live_membership
  on household_members (household_id, user_id)
  where status in ('invited', 'active');

create index ix_members_household_active
  on household_members (household_id) where status = 'active';
create index ix_members_user on household_members (user_id);
create index ix_members_guest_expiry
  on household_members (expires_at)
  where membership_type = 'temporary_guest' and status = 'active';

-- ── household_invites ────────────────────────────────────────────────────────
create index ix_invites_token
  on household_invites (invite_token) where status = 'pending';
create index ix_invites_pending_expiry
  on household_invites (expires_at) where status = 'pending';

-- ── dishes ───────────────────────────────────────────────────────────────────
create index ix_dishes_active on dishes (status) where status = 'active';
create index ix_dishes_meal_slots_gin on dishes using gin (meal_slots);
create index ix_dishes_diet on dishes (diet_type);
create index ix_dishes_name_trgm on dishes using gin (name extensions.gin_trgm_ops);

-- ── dish_ingredients ─────────────────────────────────────────────────────────
create index ix_dish_ingredients_dish on dish_ingredients (dish_id);

-- ── dish_prep_tasks ──────────────────────────────────────────────────────────
create index ix_prep_tasks_dish on dish_prep_tasks (dish_id);

-- ── meal_plans ───────────────────────────────────────────────────────────────
create index ix_meal_plans_household on meal_plans (household_id, start_date desc);
create unique index uq_active_plan_per_start
  on meal_plans (household_id, start_date) where status = 'active';

-- ── meal_plan_items ──────────────────────────────────────────────────────────
create index ix_items_household_date on meal_plan_items (household_id, date);
create index ix_items_dish_recent
  on meal_plan_items (household_id, dish_id, date desc)
  where dish_id is not null; -- powers variety/rotation lookups

-- ── meal_feedback ────────────────────────────────────────────────────────────
create index ix_feedback_item on meal_feedback (meal_plan_item_id);
create index ix_feedback_household on meal_feedback (household_id, created_at desc);

-- ── grocery_list_items ───────────────────────────────────────────────────────
create index ix_grocery_items_list on grocery_list_items (grocery_list_id);

-- ── household_activity_events ────────────────────────────────────────────────
create index ix_activity_household
  on household_activity_events (household_id, created_at desc);

-- ── notifications ────────────────────────────────────────────────────────────
create index ix_notifications_recipient_unread
  on notifications (recipient_user_id, created_at desc) where read_at is null;
