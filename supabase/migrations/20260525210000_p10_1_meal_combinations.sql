-- P10-1 · Meal combinations catalog (global content, NOT household-scoped).
--
-- A "meal combination" is a fixed set of specific catalog dishes that form a
-- South-Asian plate (e.g. Rajma Masala + Jeera Rice + Roti). Admins curate them;
-- users may propose their own from the daily-selection flow, which land here as
-- `proposed` for admin review (P10-5). Popularity (incremented on selection,
-- P10-3) ranks the onboarding picker and feeds the recommendation engine.
-- Source of truth: design/01_database_design.md § Tables (extension).
--
-- Two new enums (idempotent create, mirroring 20260525195035_p9_dish_meal_role):
--   • combination_status — lifecycle: proposed → active | rejected | archived
--   • meal_frequency     — per-dish cadence tier (P10-4): daily | weekly | rare
--
-- RLS: the project's `ensure_rls` event trigger auto-enables RLS on new tables;
-- the explicit `enable row level security` states intent and is idempotent. The
-- catalog follows the content-table pattern (20260523130250): authenticated read
-- of `active` rows + admin (app_role JWT) write backstop. A proposer additionally
-- reads their own pending submission. User proposals are inserted via a SECURITY
-- DEFINER RPC (P10-3), never a direct client write.

-- ── enums ──────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'combination_status') then
    create type combination_status as enum (
      'proposed', 'active', 'archived', 'rejected'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'meal_frequency') then
    create type meal_frequency as enum (
      'daily', 'once_a_week', 'once_in_a_while'
    );
  end if;
end
$$;

-- ── meal_combinations ────────────────────────────────────────────────────────
-- diet_type is stored (not derived) so the picker can filter cheaply; the seed
-- generator and propose RPC both enforce it is coherent with the member dishes.
-- cuisine/region are informational only (combos may mix regions) — never filters.
-- source: 'admin' (seeded/admin-authored) | 'user_proposed' (promoted from a
-- household's daily approval). proposed_by_* are null for admin combos.
create table meal_combinations (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  description              text,
  cuisine                  text,
  region                   text,
  diet_type                diet_type not null,
  status                   combination_status not null default 'proposed',
  popularity_count         int not null default 0 check (popularity_count >= 0),
  source                   text not null default 'admin',
  proposed_by_user_id      uuid references users (id) on delete set null,
  proposed_by_household_id uuid references households (id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create trigger trg_set_updated_at before update on meal_combinations
  for each row execute function set_updated_at();

-- ── meal_combination_items ─────────────────────────────────────────────────────
-- The fixed dish set. dish_id uses ON DELETE RESTRICT: a dish referenced by a
-- combo can't be silently deleted. role_in_combo is a free-text display label
-- (dal/veg/bread/rice), intentionally not an enum (design/01 principle 2).
create table meal_combination_items (
  id             uuid primary key default gen_random_uuid(),
  combination_id uuid not null references meal_combinations (id) on delete cascade,
  dish_id        uuid not null references dishes (id) on delete restrict,
  role_in_combo  text,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (combination_id, dish_id)
);

create trigger trg_set_updated_at before update on meal_combination_items
  for each row execute function set_updated_at();

-- ── indexes ──────────────────────────────────────────────────────────────────
-- Picker/engine read combos by popularity within a status; diet filters the
-- picker; the item indexes serve the catalog join and the engine's reverse
-- lookup (which combos a dish belongs to).
create index ix_meal_combinations_status_popularity
  on meal_combinations (status, popularity_count desc);
create index ix_meal_combinations_diet on meal_combinations (diet_type);
create index ix_mci_combination on meal_combination_items (combination_id);
create index ix_mci_dish on meal_combination_items (dish_id);

-- ── RLS ────────────────────────────────────────────────────────────────────────
alter table meal_combinations enable row level security;
create policy combos_select_active on meal_combinations
  for select using ((select auth.uid()) is not null and status = 'active');
create policy combos_select_own_proposed on meal_combinations
  for select using (proposed_by_user_id = (select auth.uid()));
create policy combos_admin_write on meal_combinations
  for all using (((select auth.jwt()) ->> 'app_role') = 'admin')
  with check (((select auth.jwt()) ->> 'app_role') = 'admin');

alter table meal_combination_items enable row level security;
create policy mci_select on meal_combination_items
  for select using (
    (select auth.uid()) is not null
    and exists (
      select 1 from meal_combinations c
      where c.id = combination_id
        and (
          c.status = 'active'
          or c.proposed_by_user_id = (select auth.uid())
        )
    )
  );
create policy mci_admin_write on meal_combination_items
  for all using (((select auth.jwt()) ->> 'app_role') = 'admin')
  with check (((select auth.jwt()) ->> 'app_role') = 'admin');
