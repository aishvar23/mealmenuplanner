-- P10-2 · Per-dish popularity counter.
--
-- Mode 2 of the redesigned preferred-dishes step ("Build your own combination")
-- ranks main dishes by how often households pick them, and the recommendation
-- engine rewards popular dishes (P10-4). dishes had no such counter; add one.
-- Incremented by increment_dish_popularity() (P10-3) and the completion RPC
-- (P10-5). The partial index serves the active-dish popularity ordering the
-- onboarding catalog and engine use.
alter table dishes
  add column if not exists popularity_count int not null default 0
    check (popularity_count >= 0);

create index if not exists ix_dishes_popularity
  on dishes (popularity_count desc) where status = 'active';

comment on column dishes.popularity_count is
  'How often households have picked this dish (onboarding/build-your-own + daily approval). Drives popularity ordering in the picker and the engine''s popularDish bonus (P10).';
