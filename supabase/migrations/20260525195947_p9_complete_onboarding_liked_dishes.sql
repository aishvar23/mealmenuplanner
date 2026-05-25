-- P9 (BUG-006): persist the owner's preferred dishes chosen during onboarding
-- into user_food_preferences.liked_dishes, so they feed the engine's "+10 dish
-- your household likes" bonus (lib/recommendation/scoring.ts). CREATE OR REPLACE
-- keeps the same signature, grants, and security model as P2-6
-- (20260524150953_p2_6_complete_onboarding_fn.sql); the only change is the added
-- liked_dishes column in the user_food_preferences insert.
create or replace function public.complete_onboarding(
  p_draft_id         uuid,
  p_household        jsonb,
  p_preferences      jsonb,
  p_food_preferences jsonb default null
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
  public.complete_onboarding(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function
  public.complete_onboarding(uuid, jsonb, jsonb, jsonb) to authenticated;
