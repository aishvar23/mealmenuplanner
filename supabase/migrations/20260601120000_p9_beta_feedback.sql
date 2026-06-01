-- P9 · Beta-feedback features (households switcher, multi-diet, eating-out note).
--
-- Three independent changes from beta testers, grouped in one migration:
--
--   1. Household switcher — a user can be an active member of several households
--      (`household_members` is per user+household). Persist which one they're
--      viewing (`active_household_id`) and a login default (`preferred_household_id`)
--      on `users`, plus two SECURITY DEFINER RPCs that only let a caller point at a
--      household they actively belong to. `resolveCurrentHousehold` reads these
--      (active → preferred → earliest-joined fallback).
--   2. Multiple diet preferences — `household_preferences.diet_type` becomes a SET
--      (`diet_types diet_type[]`) so a household that eats both vegetarian and
--      non-vegetarian can say so; the recommender unions the allowed dishes. The
--      legacy scalar `diet_type` is kept as a kept-in-sync mirror (= diet_types[1])
--      so any unmigrated reader stays valid; it is made nullable.
--   3. Eating-out note — `meal_plan_items.eating_out_note` holds an optional place
--      the household has in mind, shown on the slot tile.
--
-- Hardening mirrors P0-11/P1-5: SECURITY DEFINER functions pin `search_path = ''`
-- with fully-qualified names; EXECUTE is revoked from public/anon and granted to
-- `authenticated`. `users` already has self-select/self-update RLS (P0-12), so the
-- new columns are readable by their owner without further policy work.

-- ── 1. Household switcher ─────────────────────────────────────────────────────

alter table users
  add column active_household_id    uuid references households (id) on delete set null,
  add column preferred_household_id uuid references households (id) on delete set null;

-- Set the caller's *active* (currently-viewed) household. Guarded so a user can
-- only select a household they are an active, non-expired member of; an invalid
-- target simply raises and the resolver keeps its previous pick.
create or replace function public.set_active_household(h uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.is_active_member(h) then
    raise exception 'not an active member of this household'
      using errcode = '42501'; -- insufficient_privilege
  end if;
  update public.users set active_household_id = h where id = v_user_id;
end;
$$;

-- Set the caller's *preferred* (default-on-login) household. Same membership guard.
create or replace function public.set_preferred_household(h uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.is_active_member(h) then
    raise exception 'not an active member of this household'
      using errcode = '42501';
  end if;
  update public.users set preferred_household_id = h where id = v_user_id;
end;
$$;

revoke execute on function public.set_active_household(uuid) from public, anon;
grant  execute on function public.set_active_household(uuid) to authenticated;
revoke execute on function public.set_preferred_household(uuid) from public, anon;
grant  execute on function public.set_preferred_household(uuid) to authenticated;

-- ── 2. Multiple diet preferences ──────────────────────────────────────────────

-- Add the set column (filled with '{}' for existing rows), backfill from the
-- scalar, then enforce non-empty. `cardinality` returns 0 for '{}' (unlike
-- array_length, which returns NULL and would let the CHECK pass on empty).
alter table household_preferences
  add column diet_types diet_type[] not null default array[]::diet_type[];

update household_preferences
  set diet_types = array[diet_type]
  where cardinality(diet_types) = 0;

alter table household_preferences
  add constraint chk_diet_types_nonempty check (cardinality(diet_types) >= 1);

-- The scalar stays as a mirror (= diet_types[1]) for any unmigrated reader; the
-- app now treats `diet_types` as authoritative, so the scalar need not be required.
alter table household_preferences
  alter column diet_type drop not null;

-- ── 3. Eating-out note ────────────────────────────────────────────────────────

alter table meal_plan_items
  add column eating_out_note text
    check (eating_out_note is null or char_length(eating_out_note) <= 200);

-- ── complete_onboarding: write diet_types (+ mirror) ──────────────────────────
--
-- Same 5-arg signature as P10-9 (20260526140000) — `create or replace` swaps the
-- body and preserves grants. Only the `household_preferences` insert changes: it
-- now reads `p_preferences.dietTypes` (a JSON array), writes `diet_types`, and
-- mirrors the first element into the legacy scalar. Falls back to the old scalar
-- `dietType` if a pre-update client omits the array. Everything else is verbatim.
create or replace function public.complete_onboarding(
  p_draft_id         uuid,
  p_household        jsonb,
  p_preferences      jsonb,
  p_food_preferences jsonb default null,
  p_combination_prefs jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id      uuid := auth.uid();
  v_draft        public.household_profile_drafts%rowtype;
  v_household_id uuid;
  v_diet_types   public.diet_type[];
  v_built        jsonb;
  v_dish_id      uuid;
  v_acc_name     text;
  v_acc_id       uuid;
  v_combo        jsonb;
  v_combo_id     uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required'
      using errcode = '28000';
  end if;

  select * into v_draft
  from public.household_profile_drafts
  where id = p_draft_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'onboarding draft not found'
      using errcode = 'P0002';
  end if;

  if v_draft.status = 'completed' then
    return jsonb_build_object(
      'householdId', v_draft.household_id,
      'status', v_draft.status
    );
  end if;

  if v_draft.status <> 'in_progress' then
    raise exception 'onboarding draft is not in progress'
      using errcode = '23514';
  end if;

  if v_draft.household_id is not null then
    v_household_id := v_draft.household_id;
  else
    insert into public.households (
      name, created_by_user_id, default_location_country, default_location_city
    )
    values (
      p_household->>'name',
      v_user_id,
      p_household->>'locationCountry',
      p_household->>'locationCity'
    )
    returning id into v_household_id;
  end if;

  -- Diet set: prefer the new `dietTypes` array; fall back to the scalar `dietType`.
  if p_preferences ? 'dietTypes'
     and jsonb_array_length(p_preferences->'dietTypes') > 0 then
    v_diet_types :=
      (array(select jsonb_array_elements_text(p_preferences->'dietTypes')))::public.diet_type[];
  else
    v_diet_types := array[(p_preferences->>'dietType')::public.diet_type];
  end if;

  insert into public.household_preferences (
    household_id, family_size, adults_count, kids_count, diet_type, diet_types,
    preferred_cuisines, spice_level, weekday_cooking_time_minutes,
    weekend_cooking_time_minutes, meals_to_plan, variety_gap_days,
    allow_leftovers, budget_preference
  )
  values (
    v_household_id,
    (p_preferences->>'familySize')::int,
    (p_preferences->>'adultsCount')::int,
    (p_preferences->>'kidsCount')::int,
    v_diet_types[1],
    v_diet_types,
    array(select jsonb_array_elements_text(p_preferences->'preferredCuisines')),
    (p_preferences->>'spiceLevel')::public.spice_level,
    (p_preferences->>'weekdayCookingTimeMinutes')::int,
    (p_preferences->>'weekendCookingTimeMinutes')::int,
    array(select jsonb_array_elements_text(p_preferences->'mealsToPlan')),
    (p_preferences->>'varietyGapDays')::int,
    (p_preferences->>'allowLeftovers')::boolean,
    (p_preferences->>'budgetPreference')::public.budget_preference
  );

  -- Owner's member-level food prefs (allergies/health/preferred dishes) — only
  -- when provided. liked_dishes carries the preferred-dish picks (BUG-006).
  if p_food_preferences is not null then
    insert into public.user_food_preferences (
      user_id, household_id, allergies, disliked_ingredients,
      health_preference_tags, liked_dishes, spice_preference
    )
    values (
      v_user_id,
      v_household_id,
      array(select jsonb_array_elements_text(p_food_preferences->'allergies')),
      array(select jsonb_array_elements_text(p_food_preferences->'dislikedIngredients')),
      array(select jsonb_array_elements_text(p_food_preferences->'healthPreferenceTags')),
      array(select jsonb_array_elements_text(p_food_preferences->'likedDishes')),
      (p_food_preferences->>'spicePreference')::public.spice_level
    );
  end if;

  -- P10: combination/build preferences.
  if p_combination_prefs is not null then
    -- `combinations` mode (P10-9): per selected combo, bump its popularity AND
    -- apply the household's plate-level frequency + suitable slots to every dish
    -- in it. The combo already fixes which dishes "go with" each other, so there's
    -- no per-dish accompaniment step (this is the build-mode upsert minus goes-with).
    for v_combo in
      select value
      from jsonb_array_elements(
        coalesce(p_combination_prefs->'selectedCombinations', '[]'::jsonb)
      ) as t(value)
    loop
      v_combo_id := (v_combo->>'combinationId')::uuid;

      -- Only active combos count (matches the picker's RLS-exposed set). FOUND is
      -- true iff the UPDATE hit an active row, gating the member-dish writes.
      update public.meal_combinations
      set popularity_count = popularity_count + 1
      where id = v_combo_id and status = 'active';

      if found then
        insert into public.household_dish_preferences (
          household_id, dish_id, frequency, suitable_meal_slots
        )
        select
          v_household_id,
          mci.dish_id,
          coalesce(
            (v_combo->>'frequency')::public.meal_frequency,
            'once_in_a_while'
          ),
          array(
            select jsonb_array_elements_text(
              coalesce(v_combo->'suitableFor', '[]'::jsonb)
            )
          )
        from public.meal_combination_items mci
        where mci.combination_id = v_combo_id
        on conflict (household_id, dish_id)
        do update set
          frequency = excluded.frequency,
          suitable_meal_slots = excluded.suitable_meal_slots;
      end if;
    end loop;

    -- `build` mode: per main dish, record frequency + suitable slots +
    -- accompaniments + popularity.
    for v_built in
      select value
      from jsonb_array_elements(
        coalesce(p_combination_prefs->'builtDishes', '[]'::jsonb)
      ) as t(value)
    loop
      select id into v_dish_id
      from public.dishes
      where name = v_built->>'dishName' and status = 'active'
      limit 1;

      if v_dish_id is not null then
        insert into public.household_dish_preferences (
          household_id, dish_id, frequency, suitable_meal_slots
        )
        values (
          v_household_id,
          v_dish_id,
          coalesce(
            (v_built->>'frequency')::public.meal_frequency,
            'once_in_a_while'
          ),
          array(
            select jsonb_array_elements_text(
              coalesce(v_built->'suitableFor', '[]'::jsonb)
            )
          )
        )
        on conflict (household_id, dish_id)
        do update set
          frequency = excluded.frequency,
          suitable_meal_slots = excluded.suitable_meal_slots;

        update public.dishes
        set popularity_count = popularity_count + 1
        where id = v_dish_id;

        for v_acc_name in
          select value
          from jsonb_array_elements_text(
            coalesce(v_built->'goesWith', '[]'::jsonb)
          ) as t(value)
        loop
          select id into v_acc_id
          from public.dishes
          where name = v_acc_name and status = 'active'
          limit 1;

          if v_acc_id is not null and v_acc_id <> v_dish_id then
            insert into public.household_dish_accompaniments (
              household_id, dish_id, accompaniment_dish_id
            )
            values (v_household_id, v_dish_id, v_acc_id)
            on conflict (household_id, dish_id, accompaniment_dish_id)
            do nothing;
          end if;
        end loop;
      end if;
    end loop;
  end if;

  insert into public.household_members (
    household_id, user_id, role, membership_type, status, joined_at,
    can_view_plan, can_suggest_meals, can_change_today_menu,
    can_change_weekly_schedule, can_manage_grocery_list, can_invite_members,
    can_remove_members, can_edit_household_preferences
  )
  values (
    v_household_id, v_user_id, 'owner', 'permanent', 'active', now(),
    true, true, true, true, true, true, true, true
  );

  update public.household_profile_drafts
  set status = 'completed', household_id = v_household_id
  where id = p_draft_id;

  return jsonb_build_object('householdId', v_household_id, 'status', 'completed');
end;
$$;

revoke execute on function
  public.complete_onboarding(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function
  public.complete_onboarding(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;
