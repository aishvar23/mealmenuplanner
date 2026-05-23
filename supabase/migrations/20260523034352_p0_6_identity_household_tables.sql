-- P0-6 · Identity & household tables.
--
-- Creates the seven core tenancy tables, in FK dependency order
-- (users → households → preferences → drafts → members → invites → food prefs).
-- Source of truth: design/01_database_design.md § Tables.
--
-- Scope split (per IMPLEMENTATION_TRACKER):
--   • Tables here include their INTRINSIC constraints — PKs, FKs (+ delete
--     behavior), inline column CHECKs, and inline `unique (...)` table
--     constraints — because those are part of the table's definition.
--   • Standalone performance/lookup indexes and the partial UNIQUE indexes
--     (uq_one_active_draft_per_user, uq_one_live_membership, ix_*) are DEFERRED
--     to P0-10 ("all indexes + unique/check constraints").
--
-- updated_at: each table gets the shared set_updated_at() BEFORE UPDATE trigger
-- (function from P0-5) so updated_at is maintained server-side and never trusted
-- from the client (design/01 principle 3).
--
-- Note: this project has a custom `ensure_rls` event trigger that auto-enables
-- RLS on every new public table. These tables therefore have RLS ON but no
-- policies yet (deny-all for anon/authenticated until P0-12 adds policies).

-- ── users ────────────────────────────────────────────────────────────────────
-- Public profile mirroring Supabase auth.users. id == auth.users.id. The app
-- never writes credentials — only profile data. The auth.users → users
-- provisioning trigger is P0-13.
create table users (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text unique not null,
  phone         text unique,
  display_name  text,
  avatar_url    text,
  auth_provider auth_provider not null default 'email',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_set_updated_at before update on users
  for each row execute function set_updated_at();

-- ── households ───────────────────────────────────────────────────────────────
create table households (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  created_by_user_id       uuid not null references users (id),
  default_location_country text,
  default_location_city    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create trigger trg_set_updated_at before update on households
  for each row execute function set_updated_at();

-- ── household_preferences ────────────────────────────────────────────────────
-- One row per household (1:1, enforced by the unique household_id).
create table household_preferences (
  id                           uuid primary key default gen_random_uuid(),
  household_id                 uuid not null unique references households (id) on delete cascade,
  family_size                  int not null check (family_size between 1 and 50),
  adults_count                 int not null default 0 check (adults_count >= 0),
  kids_count                   int not null default 0 check (kids_count >= 0),
  diet_type                    diet_type not null,
  preferred_cuisines           text[] not null default '{}',
  spice_level                  spice_level not null default 'medium',
  weekday_cooking_time_minutes int check (weekday_cooking_time_minutes > 0),
  weekend_cooking_time_minutes int check (weekend_cooking_time_minutes > 0),
  meals_to_plan                text[] not null default '{}', -- values from meal_slot
  variety_gap_days             int not null default 7 check (variety_gap_days between 0 and 60),
  allow_leftovers              boolean not null default true,
  budget_preference            budget_preference not null default 'medium',
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

create trigger trg_set_updated_at before update on household_preferences
  for each row execute function set_updated_at();

-- ── household_profile_drafts ─────────────────────────────────────────────────
-- Autosaved onboarding progress. The "one in-progress draft per user" partial
-- unique index (uq_one_active_draft_per_user) is added in P0-10.
create table household_profile_drafts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references users (id) on delete cascade,
  household_id          uuid references households (id) on delete cascade,
  current_step          text not null,
  completion_percentage int not null default 0 check (completion_percentage between 0 and 100),
  status                draft_status not null default 'in_progress',
  draft_data            jsonb not null default '{}',
  last_saved_at         timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger trg_set_updated_at before update on household_profile_drafts
  for each row execute function set_updated_at();

-- ── household_members ────────────────────────────────────────────────────────
-- Membership + per-member permission flags (denormalized for single-read access
-- checks). The "one live membership per user+household" partial unique index
-- (uq_one_live_membership) and the lookup indexes are added in P0-10.
create table household_members (
  id                             uuid primary key default gen_random_uuid(),
  household_id                   uuid not null references households (id) on delete cascade,
  user_id                        uuid not null references users (id) on delete cascade,
  role                           member_role not null default 'member',
  membership_type                membership_type not null default 'permanent',
  status                         member_status not null default 'invited',
  invited_by_user_id             uuid references users (id),
  starts_at                      timestamptz not null default now(),
  expires_at                     timestamptz, -- non-null for temporary_guest
  joined_at                      timestamptz,
  can_view_plan                  boolean not null default true,
  can_suggest_meals              boolean not null default true,
  can_change_today_menu          boolean not null default false,
  can_change_weekly_schedule     boolean not null default false,
  can_manage_grocery_list        boolean not null default false,
  can_invite_members             boolean not null default false,
  can_remove_members             boolean not null default false,
  can_edit_household_preferences boolean not null default false,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now(),
  constraint guest_has_expiry
    check (membership_type <> 'temporary_guest' or expires_at is not null)
);

create trigger trg_set_updated_at before update on household_members
  for each row execute function set_updated_at();

-- ── household_invites ────────────────────────────────────────────────────────
-- invite_token is hashed-at-rest, opaque (design/03 § 7). The inline UNIQUE on
-- invite_token stays here; the partial pending-lookup/expiry indexes are P0-10.
create table household_invites (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references households (id) on delete cascade,
  invited_by_user_id  uuid not null references users (id),
  invited_email       text,
  invited_phone       text,
  invite_token        text not null unique, -- random, opaque; see design/03
  role                member_role not null default 'member',
  membership_type     membership_type not null default 'permanent',
  permissions         jsonb not null default '{}',
  starts_at           timestamptz not null default now(),
  expires_at          timestamptz not null,
  status              invite_status not null default 'pending',
  accepted_by_user_id uuid references users (id),
  accepted_at         timestamptz,
  declined_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint invite_has_target
    check (invited_email is not null or invited_phone is not null)
);

create trigger trg_set_updated_at before update on household_invites
  for each row execute function set_updated_at();

-- ── user_food_preferences ────────────────────────────────────────────────────
-- Member-level food preferences, one row per user per household. Sensitive data
-- (allergies, health tags) — RLS in P0-12 restricts writes to the owner.
create table user_food_preferences (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references users (id) on delete cascade,
  household_id           uuid not null references households (id) on delete cascade,
  diet_type              diet_type,
  allergies              text[] not null default '{}',
  disliked_ingredients   text[] not null default '{}',
  liked_dishes           text[] not null default '{}',
  disliked_dishes        text[] not null default '{}',
  spice_preference       spice_level,
  health_preference_tags text[] not null default '{}',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (user_id, household_id)
);

create trigger trg_set_updated_at before update on user_food_preferences
  for each row execute function set_updated_at();
