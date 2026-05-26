-- P10 · Replace the admin-seeded onboarding meal-combination catalog.
--
-- The "Select meal combinations" onboarding step is re-curated as a list of
-- single-main lunch/dinner dishes: the accompaniments a dish "goes with" now live
-- as dish pairings + the combo description, not as bundled member dishes (see
-- supabase/seed/combinations.mjs). seed.sql inserts the new admin combos
-- idempotently, but it is insert-only (`on conflict do nothing`) and cannot REMOVE
-- the original eight bundled thali combos. This data migration drops them so the
-- picker surfaces only the new catalog.
--
-- Safe to run before or after the seed: it targets the original eight admin combos
-- by name, never the new ones, so it is order-independent and idempotent. No
-- household row references meal_combinations by FK (complete_onboarding only bumps
-- popularity_count), and meal_combination_items cascade on delete — so this removes
-- both the combos and their items cleanly.
delete from public.meal_combinations
where source = 'admin'
  and name in (
    'Rajma Chawal Thali',
    'Dal Roti Sabzi',
    'Chole Bhature',
    'Paneer Butter Masala Meal',
    'Idli Sambar Chutney',
    'Masala Dosa Plate',
    'Jain Dal Pulao Thali',
    'Chicken Curry Meal'
  );
