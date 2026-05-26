-- P10-4 · Household-level per-dish frequency + "goes with" accompaniments.
--
-- The "Build your own combination" mode lets a household tag each main dish with
-- a cadence tier (daily / once_a_week / once_in_a_while) and the accompaniments
-- it pairs with ("goes with"). These describe how the HOUSEHOLD wants meals
-- planned — they parallel household_preferences.variety_gap_days, not a single
-- member's taste — so they are household-scoped (member-level liked_dishes stays
-- as the per-user signal). Storing per-user would force the engine to resolve
-- conflicting frequency tiers across members with no product rule for the tie.
--
-- Written by the completion RPC (P10-5), so the client never inserts directly;
-- the RLS write policy is the backstop and supports a future edit-preferences UI.
-- RLS mirrors household_preferences (hp_*): member read; can_edit_household_
-- preferences write.

-- ── household_dish_preferences ─────────────────────────────────────────────────
create table household_dish_preferences (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  dish_id      uuid not null references dishes (id) on delete cascade,
  frequency    meal_frequency not null default 'once_in_a_while',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (household_id, dish_id)
);

create trigger trg_set_updated_at before update on household_dish_preferences
  for each row execute function set_updated_at();

create index ix_hdp_household on household_dish_preferences (household_id);

-- ── household_dish_accompaniments ──────────────────────────────────────────────
-- The normalized "goes with" multi-select: which accompaniment dishes a given
-- main is paired with for this household. accompaniment_dish_id uses ON DELETE
-- RESTRICT (a referenced dish can't be silently deleted); a dish never pairs
-- with itself.
create table household_dish_accompaniments (
  id                    uuid primary key default gen_random_uuid(),
  household_id          uuid not null references households (id) on delete cascade,
  dish_id               uuid not null references dishes (id) on delete cascade,
  accompaniment_dish_id uuid not null references dishes (id) on delete restrict,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (household_id, dish_id, accompaniment_dish_id),
  constraint no_self_accompaniment check (dish_id <> accompaniment_dish_id)
);

create trigger trg_set_updated_at before update on household_dish_accompaniments
  for each row execute function set_updated_at();

create index ix_hda_household_dish
  on household_dish_accompaniments (household_id, dish_id);

-- ── RLS ────────────────────────────────────────────────────────────────────────
alter table household_dish_preferences enable row level security;
create policy hdp_select on household_dish_preferences
  for select using (is_active_member(household_id));
create policy hdp_write on household_dish_preferences
  for all using (has_permission(household_id, 'can_edit_household_preferences'))
  with check (has_permission(household_id, 'can_edit_household_preferences'));

alter table household_dish_accompaniments enable row level security;
create policy hda_select on household_dish_accompaniments
  for select using (is_active_member(household_id));
create policy hda_write on household_dish_accompaniments
  for all using (has_permission(household_id, 'can_edit_household_preferences'))
  with check (has_permission(household_id, 'can_edit_household_preferences'));
