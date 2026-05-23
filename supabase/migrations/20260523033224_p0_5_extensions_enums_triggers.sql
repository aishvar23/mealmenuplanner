-- P0-5 · Extensions, enum types, and the shared updated_at trigger function.
--
-- First migration. Everything in P0-6..P0-12 builds on the enum types and the
-- set_updated_at() function defined here.
--
-- Source of truth: design/01_database_design.md § Extensions / Enum types /
-- Shared updated_at trigger. Ordering follows design/01 § Migrations & seeding:
-- extensions → enums → set_updated_at() → (tables/indexes/RLS in later files).

-- ── Extensions ───────────────────────────────────────────────────────────────
-- Installed into the dedicated `extensions` schema per Supabase convention so
-- they don't clutter `public`. pgcrypto is typically pre-installed on Supabase;
-- `if not exists` makes this a no-op there. pg_cron is platform-managed and
-- keeps its own schema, so it takes no schema clause.
create extension if not exists pgcrypto with schema extensions; -- gen_random_uuid()
create extension if not exists pg_trgm with schema extensions; -- trigram dish-name search (P0-7)
create extension if not exists pg_cron; -- scheduled jobs: guest/invite expiry, prep reminders (P6-P8)

-- ── Enum types ───────────────────────────────────────────────────────────────
-- Fixed value sets validated at the DB layer (design/01 principle 2). Sets
-- expected to grow with content (cuisines, regions, ingredient categories) stay
-- as text/text[] and are intentionally NOT enums.

create type auth_provider as enum ('google', 'email', 'magic_link');

create type diet_type as enum (
  'vegetarian', 'vegan', 'eggetarian', 'non_vegetarian', 'jain', 'pescatarian'
);
create type spice_level as enum ('mild', 'medium', 'spicy');
create type difficulty_level as enum ('easy', 'medium', 'hard');
create type budget_preference as enum ('low', 'medium', 'high');

create type draft_status as enum ('in_progress', 'completed', 'abandoned');

create type member_role as enum ('owner', 'admin', 'member', 'viewer');
create type membership_type as enum ('permanent', 'temporary_guest');
create type member_status as enum (
  'invited', 'active', 'declined', 'expired', 'removed', 'left'
);
create type invite_status as enum (
  'pending', 'accepted', 'declined', 'expired', 'cancelled'
);

create type meal_slot as enum ('breakfast', 'lunch', 'dinner', 'snack');
create type dish_status as enum ('draft', 'active', 'archived');
create type pairing_type as enum (
  'main_side', 'rice_pairing', 'bread_pairing', 'condiment', 'beverage'
);

create type meal_plan_status as enum ('draft', 'active', 'archived');
create type meal_item_status as enum (
  'suggested', 'accepted', 'rejected', 'replaced', 'cooked', 'skipped', 'eating_out'
);
create type feedback_type as enum (
  'liked', 'disliked', 'too_much_effort', 'ingredients_unavailable',
  'kids_disliked', 'do_not_suggest_again', 'suggest_more_often'
);

create type grocery_list_status as enum ('draft', 'active', 'archived');

-- ── Shared updated_at trigger function ───────────────────────────────────────
-- Attached to every table that has updated_at in later migrations:
--   create trigger trg_set_updated_at before update on <table>
--   for each row execute function set_updated_at();
-- `updated_at` is maintained here and never trusted from the client (design/01
-- principle 3). `search_path` is pinned empty to satisfy the Supabase security
-- advisor (function_search_path_mutable); now() resolves from pg_catalog, which
-- is always implicitly searched.
create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
