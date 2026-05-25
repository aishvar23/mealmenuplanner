-- P9 (BUG-008/009/010): a dish's role in a meal, so the recommendation engine
-- never offers a side / condiment / lone component as a standalone main meal.
-- Only complete_meal and main_component are standalone-eligible; the rest appear
-- only as pairings of a main (global acceptance criteria 9 & 10).
--
-- The per-dish role values are data, so they live in supabase/seed.sql (every
-- dish row carries meal_role on insert). This migration only adds the column;
-- existing rows take the safe default (main_component) until the seed runs.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'meal_role') then
    create type meal_role as enum (
      'complete_meal',
      'main_component',
      'rice_component',
      'bread_component',
      'side',
      'condiment',
      'beverage'
    );
  end if;
end
$$;

alter table dishes
  add column if not exists meal_role meal_role not null default 'main_component';

comment on column dishes.meal_role is
  'Role in a meal. Only complete_meal/main_component may be a standalone primary recommendation; rice/bread components, sides, condiments, and beverages appear only as pairings (BUG-008/009/010).';
