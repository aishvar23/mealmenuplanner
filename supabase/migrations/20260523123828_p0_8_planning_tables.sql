-- P0-8 · Planning tables.
--
-- The weekly/daily plan, its items, per-item feedback, and the derived grocery
-- list. FK order: meal_plans → meal_plan_items → meal_feedback → grocery_lists
-- → grocery_list_items. Source of truth: design/01_database_design.md § Tables.
--
-- Scope split (per IMPLEMENTATION_TRACKER): tables + intrinsic constraints here;
-- standalone indexes (ix_meal_plans_household, uq_active_plan_per_start,
-- ix_items_household_date, ix_items_dish_recent, ix_feedback_item,
-- ix_feedback_household, ix_grocery_items_list) are DEFERRED to P0-10. Note
-- uq_active_plan_per_start (one active plan per household+start_date) is among
-- those deferred invariants.
--
-- updated_at triggers: attached to the four tables that have updated_at.
-- meal_feedback is append-only (created_at only) — NO updated_at, NO trigger.
--
-- RLS: the `ensure_rls` event trigger auto-enables RLS; policies are P0-12.

-- ── meal_plans ───────────────────────────────────────────────────────────────
create table meal_plans (
  id                   uuid primary key default gen_random_uuid(),
  household_id         uuid not null references households (id) on delete cascade,
  start_date           date not null,
  end_date             date not null,
  status               meal_plan_status not null default 'draft',
  generated_by_user_id uuid references users (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint plan_dates_ordered check (end_date >= start_date)
);

create trigger trg_set_updated_at before update on meal_plans
  for each row execute function set_updated_at();

-- ── meal_plan_items ──────────────────────────────────────────────────────────
-- household_id is denormalized for RLS + query locality. dish_id is nullable and
-- ON DELETE SET NULL (e.g. an eating_out slot has no dish; a deleted dish leaves
-- the slot intact). One item per (plan, date, slot).
create table meal_plan_items (
  id                 uuid primary key default gen_random_uuid(),
  meal_plan_id       uuid not null references meal_plans (id) on delete cascade,
  household_id       uuid not null references households (id) on delete cascade,
  date               date not null,
  meal_slot          meal_slot not null,
  dish_id            uuid references dishes (id) on delete set null,
  status             meal_item_status not null default 'suggested',
  locked             boolean not null default false,
  reason             text, -- recommendation explanation
  changed_by_user_id uuid references users (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (meal_plan_id, date, meal_slot)
);

create trigger trg_set_updated_at before update on meal_plan_items
  for each row execute function set_updated_at();

-- ── meal_feedback ────────────────────────────────────────────────────────────
-- Append-only: created_at only, no updated_at / no set_updated_at trigger.
create table meal_feedback (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references households (id) on delete cascade,
  meal_plan_item_id uuid not null references meal_plan_items (id) on delete cascade,
  user_id           uuid not null references users (id) on delete cascade,
  feedback_type     feedback_type not null,
  reason            text,
  created_at        timestamptz not null default now()
);

-- ── grocery_lists ────────────────────────────────────────────────────────────
-- One list per meal plan (unique meal_plan_id).
create table grocery_lists (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  meal_plan_id uuid not null references meal_plans (id) on delete cascade,
  status       grocery_list_status not null default 'active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (meal_plan_id)
);

create trigger trg_set_updated_at before update on grocery_lists
  for each row execute function set_updated_at();

-- ── grocery_list_items ───────────────────────────────────────────────────────
-- ingredient_id is nullable (ON DELETE SET NULL) so ad-hoc/manual items are
-- allowed; name/category/unit are snapshotted at generation time (design/01).
create table grocery_list_items (
  id              uuid primary key default gen_random_uuid(),
  grocery_list_id uuid not null references grocery_lists (id) on delete cascade,
  ingredient_id   uuid references ingredients (id) on delete set null,
  name            text not null,
  category        text not null,
  quantity        numeric(10, 3) not null check (quantity >= 0),
  unit            text not null,
  checked         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger trg_set_updated_at before update on grocery_list_items
  for each row execute function set_updated_at();
