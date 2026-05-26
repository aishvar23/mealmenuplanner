-- P10-8 · Per-dish "suitable for" meal-slot restriction (household-scoped).
--
-- The "Build your own combination" mode (Mode 2) lets a household say WHEN each
-- dish it picks should be offered — e.g. a heavy rajma chawal plate is dinner-only,
-- a poha is breakfast-only. This is a household preference (it parallels frequency,
-- not the dish's intrinsic, global `dishes.meal_slots`), so it lives next to the
-- frequency tier on household_dish_preferences. The recommendation engine adds a
-- hard filter: when this list is non-empty, the dish is excluded from any slot it
-- doesn't contain (design/05 § 4). An empty list (the default) means "no extra
-- restriction" — the dish keeps its global `dishes.meal_slots` behavior.
--
-- text[] (values from the meal_slot enum), mirroring dishes.meal_slots — a plain
-- array by the doc-01 convention, not an enum array, so the engine reads it as-is.
-- Written by the completion RPC below; the hdp_write RLS policy is the backstop.

alter table household_dish_preferences
  add column if not exists suitable_meal_slots text[] not null default '{}';

comment on column household_dish_preferences.suitable_meal_slots is
  'Household-chosen meal slots this dish may be suggested in (values from meal_slot, e.g. {breakfast,dinner}). Empty = no restriction beyond the dish''s global meal_slots. Hard-filters the recommendation engine (P10-8).';

-- ── complete_onboarding: persist builtDishes[].suitableFor ──────────────────────
-- Same 5-arg signature as P10-5 (20260525210400) — a `create or replace` cleanly
-- swaps the body, preserving grants. The only change is the build-mode upsert now
-- also writes suitable_meal_slots from each built dish's `suitableFor` array
-- (camelCase in the JSON payload). Absent/empty → '{}' (no restriction), matching
-- the column default and the validate-completion normalizer.
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
  v_built        jsonb;
  v_dish_id      uuid;
  v_acc_name     text;
  v_acc_id       uuid;
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

  insert into public.household_preferences (
    household_id, family_size, adults_count, kids_count, diet_type,
    preferred_cuisines, spice_level, weekday_cooking_time_minutes,
    weekend_cooking_time_minutes, meals_to_plan, variety_gap_days,
    allow_leftovers, budget_preference
  )
  values (
    v_household_id,
    (p_preferences->>'familySize')::int,
    (p_preferences->>'adultsCount')::int,
    (p_preferences->>'kidsCount')::int,
    (p_preferences->>'dietType')::public.diet_type,
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
    -- `combinations` mode: bump each selected active combo's popularity.
    update public.meal_combinations
    set popularity_count = popularity_count + 1
    where status = 'active'
      and id in (
        select t.value::uuid
        from jsonb_array_elements_text(
          coalesce(p_combination_prefs->'selectedCombinationIds', '[]'::jsonb)
        ) as t(value)
      );

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
