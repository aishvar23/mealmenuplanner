-- P11: per-dish nutrition profile, so the planner can show calories/macros and a
-- glycemic-index band per suggested meal and a daily total across the household's
-- slots. Values are anchored to a human-scaled serving (a "plate" of biryani vs a
-- "bowl" of dal) rather than weight, since dishes aren't comparable by grams.
--
-- The per-dish values are data, so they live in supabase/seed.sql (the seed both
-- emits them on insert and re-syncs them onto existing rows). This migration only
-- adds the schema; every column is nullable so a dish with no data renders no
-- nutrition (the UI degrades gracefully). Nutrition is display-only — it does not
-- affect recommendation scoring.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'serving_unit') then
    create type serving_unit as enum (
      'cup',
      'bowl',
      'plate',
      'glass',
      'piece'
    );
  end if;
end
$$;

alter table dishes
  add column if not exists serving_qty numeric(6, 2)
    check (serving_qty is null or serving_qty > 0),
  add column if not exists serving_unit serving_unit,
  add column if not exists calories_kcal int
    check (calories_kcal is null or calories_kcal >= 0),
  add column if not exists protein_g numeric(6, 2)
    check (protein_g is null or protein_g >= 0),
  add column if not exists carbs_g numeric(6, 2)
    check (carbs_g is null or carbs_g >= 0),
  add column if not exists fat_g numeric(6, 2)
    check (fat_g is null or fat_g >= 0),
  add column if not exists glycemic_index int
    check (glycemic_index is null or glycemic_index between 0 and 110);

comment on column dishes.serving_qty is
  'Quantity of one standard serving in serving_unit terms (e.g. 1 plate, 2 pieces). Nutrition values below are for this single serving (per person).';
comment on column dishes.serving_unit is
  'Human-scaled serving unit (cup/bowl/plate/glass/piece) the nutrition values are anchored to.';
comment on column dishes.glycemic_index is
  'Estimated glycemic index (0-110); surfaced as a Low/Med/High band, not a medical claim.';
