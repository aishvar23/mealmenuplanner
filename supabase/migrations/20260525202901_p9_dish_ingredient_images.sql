-- P9 - Dish and ingredient image metadata (BUG-014).
--
-- Adds neutral, nullable image metadata to the global catalog. Defaults keep
-- existing rows safe until real, licensed images are sourced and verified.

create type image_status as enum ('verified', 'missing', 'broken', 'placeholder');

alter table dishes
  add column image_url text,
  add column image_alt_text text,
  add column image_status image_status not null default 'placeholder',
  add column image_verified boolean not null default false;

alter table ingredients
  add column image_url text,
  add column image_alt_text text,
  add column image_status image_status not null default 'placeholder',
  add column image_verified boolean not null default false;
