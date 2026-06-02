-- P12: add a first-class `weight_loss` descriptor flag to dishes, so the catalog
-- can carry a dietician-curated weight-loss collection that is filterable and
-- expressible as an onboarding health preference. It is a sibling of the other
-- health flags (diabetic_friendly, low_sodium, high_protein, low_carb): a boolean
-- descriptor, display/preference-capture only — it does not affect recommendation
-- scoring (health flags are not a scoring signal today). The per-dish value is
-- data and lives in supabase/seed.sql; this migration only adds the column.
alter table dishes
  add column if not exists weight_loss boolean not null default false;

comment on column dishes.weight_loss is
  'Dietician-curated weight-loss dish (light, portion-controlled). Descriptive flag mirroring the other health flags; surfaced as a filter/preference, not a scoring signal.';
