-- P0-7 · Content tables (global, NOT household-scoped).
--
-- Dish catalog and its composition: dishes, ingredients, dish_ingredients,
-- dish_prep_tasks, dish_pairings. Created in FK order (dishes + ingredients are
-- independent; the join/child tables reference them).
-- Source of truth: design/01_database_design.md § Tables.
--
-- Scope split (per IMPLEMENTATION_TRACKER): tables + intrinsic constraints here;
-- standalone indexes (ix_dishes_active, ix_dishes_meal_slots_gin, ix_dishes_diet,
-- ix_dishes_name_trgm, ix_dish_ingredients_dish, ix_prep_tasks_dish) are DEFERRED
-- to P0-10. Each table gets the shared set_updated_at() BEFORE UPDATE trigger.
--
-- RLS: the project's `ensure_rls` event trigger auto-enables RLS on these tables.
-- Content read/write policies (authenticated read of active rows; admin writes)
-- are added in P0-12.

-- ── dishes ───────────────────────────────────────────────────────────────────
-- Readable by all authenticated users when status='active'; admin-writable
-- (P0-12). total_time_minutes is a stored generated column.
create table dishes (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  description         text,
  cuisine             text,
  region              text,
  meal_slots          text[] not null default '{}', -- values from meal_slot
  diet_type           diet_type not null,
  prep_time_minutes   int not null default 0 check (prep_time_minutes >= 0),
  cook_time_minutes   int not null default 0 check (cook_time_minutes >= 0),
  total_time_minutes  int generated always as (prep_time_minutes + cook_time_minutes) stored,
  difficulty          difficulty_level not null default 'easy',
  spice_level         spice_level not null default 'medium',
  kid_friendly        boolean not null default false,
  lunchbox_friendly   boolean not null default false,
  leftover_friendly   boolean not null default false,
  batch_cook_friendly boolean not null default false,
  diabetic_friendly   boolean not null default false,
  low_sodium          boolean not null default false,
  high_protein        boolean not null default false,
  low_carb            boolean not null default false,
  status              dish_status not null default 'draft',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger trg_set_updated_at before update on dishes
  for each row execute function set_updated_at();

-- ── ingredients ──────────────────────────────────────────────────────────────
-- category is free text (vegetables, fruits, dairy, grains, lentils, spices,
-- eggs_meat, pantry); intentionally not an enum (design/01 principle 2).
create table ingredients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  category      text not null,
  default_unit  text not null,
  common_names  text[] not null default '{}',
  allergen_type text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_set_updated_at before update on ingredients
  for each row execute function set_updated_at();

-- ── dish_ingredients ─────────────────────────────────────────────────────────
-- ingredient_id uses ON DELETE RESTRICT: an ingredient in use can't be deleted.
create table dish_ingredients (
  id                   uuid primary key default gen_random_uuid(),
  dish_id              uuid not null references dishes (id) on delete cascade,
  ingredient_id        uuid not null references ingredients (id) on delete restrict,
  quantity_per_serving numeric(10, 3) not null check (quantity_per_serving > 0),
  unit                 text not null,
  is_required          boolean not null default true,
  is_optional          boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (dish_id, ingredient_id)
);

create trigger trg_set_updated_at before update on dish_ingredients
  for each row execute function set_updated_at();

-- ── dish_prep_tasks ──────────────────────────────────────────────────────────
-- Advance-prep steps (e.g. soak rajma 8h). required_before_minutes drives
-- prep-feasibility scoring (design/05) and prep reminders (P7).
create table dish_prep_tasks (
  id                      uuid primary key default gen_random_uuid(),
  dish_id                 uuid not null references dishes (id) on delete cascade,
  task_name               text not null,
  required_before_minutes int not null check (required_before_minutes >= 0),
  description             text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create trigger trg_set_updated_at before update on dish_prep_tasks
  for each row execute function set_updated_at();

-- ── dish_pairings ────────────────────────────────────────────────────────────
-- Directional pairing (primary → paired) of one type. A dish never pairs with
-- itself (no_self_pair); each (primary, paired, type) triple is unique.
create table dish_pairings (
  id              uuid primary key default gen_random_uuid(),
  primary_dish_id uuid not null references dishes (id) on delete cascade,
  paired_dish_id  uuid not null references dishes (id) on delete cascade,
  pairing_type    pairing_type not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint no_self_pair check (primary_dish_id <> paired_dish_id),
  unique (primary_dish_id, paired_dish_id, pairing_type)
);

create trigger trg_set_updated_at before update on dish_pairings
  for each row execute function set_updated_at();
