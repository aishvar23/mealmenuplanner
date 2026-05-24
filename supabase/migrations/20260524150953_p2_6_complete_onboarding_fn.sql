-- P2-6 · complete_onboarding() — atomic draft → live-rows promotion.
--
-- POST /api/onboarding/complete promotes an in-progress onboarding draft into
-- the real household + household_preferences + (optional) user_food_preferences
-- + owner household_members rows (design/06 § 7). All of that must be ONE
-- transaction (all-or-nothing) and idempotent (a retried call returns the same
-- householdId without creating duplicates). supabase-js issues one HTTP
-- statement per call, so — exactly like create_household (P1-5) — a single
-- SECURITY DEFINER function is the only way to get a real transaction AND get
-- past the chicken-and-egg RLS problem (the caller is not a member yet, so the
-- hm_insert policy would reject the owner row under their own JWT).
--
-- The `onboarding` service (P2-6) validates + normalizes draft_data first and
-- returns typed ValidationErrors; the JSONB payloads passed here are therefore
-- already complete (defaults applied, leaves type-checked). The DB CHECK/enum/
-- NOT NULL constraints remain the independent backstop.
--
-- Idempotency hinges on the draft's status + household_id under a FOR UPDATE
-- lock (design/06 § 7):
--   • status = 'completed'   → return the existing household_id, write nothing.
--   • household_id IS NOT NULL (early-created, Flow 1 step 5) → reuse it.
--   • household_preferences.household_id is UNIQUE (1:1) and
--     uq_one_live_membership guards the owner row — DB-level backstops against a
--     double insert if two completes ever raced past the status check.
--
-- Hardening (mirrors P0-11/P1-5/P1-8): search_path = '' with fully-qualified
-- names; auth.uid() schema-qualified; now()/jsonb_* resolve from pg_catalog
-- (always implicitly searched). EXECUTE revoked from public/anon, granted only to
-- `authenticated` (anon has no session → auth.uid() is null → the function
-- raises). Like the other self-scoped SECURITY DEFINER helpers it operates only
-- on the caller's own draft, so the advisor's self-scoped lint applies by design.

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
      using errcode = '28000'; -- invalid_authorization_specification
  end if;

  -- Lock the draft so concurrent completes serialize on it (idempotency).
  select * into v_draft
  from public.household_profile_drafts
  where id = p_draft_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'onboarding draft not found'
      using errcode = 'P0002'; -- no_data_found → NotFoundError (404)
  end if;

  -- Idempotent replay: an already-completed draft returns its household and
  -- writes nothing (design/06 § 7).
  if v_draft.status = 'completed' then
    return jsonb_build_object(
      'householdId', v_draft.household_id,
      'status', v_draft.status
    );
  end if;

  -- Only an in-progress draft can be completed; abandoned is terminal.
  if v_draft.status <> 'in_progress' then
    raise exception 'onboarding draft is not in progress'
      using errcode = '23514'; -- check_violation
  end if;

  -- Reuse an early-created household (draft.household_id) or create one now.
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

  -- 1:1 preferences (household_id UNIQUE → a second insert fails as a backstop).
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

  -- Owner's member-level food prefs (allergies/health) — only when provided.
  if p_food_preferences is not null then
    insert into public.user_food_preferences (
      user_id, household_id, allergies, disliked_ingredients,
      health_preference_tags, spice_preference
    )
    values (
      v_user_id,
      v_household_id,
      array(select jsonb_array_elements_text(p_food_preferences->'allergies')),
      array(select jsonb_array_elements_text(p_food_preferences->'dislikedIngredients')),
      array(select jsonb_array_elements_text(p_food_preferences->'healthPreferenceTags')),
      (p_food_preferences->>'spicePreference')::public.spice_level
    );
  end if;

  -- Owner: permanent, active immediately, every permission flag true
  -- (design/06 § 7). invited_by is null; joined_at = now().
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

  -- Mark the draft completed and pin the household it became (terminal state).
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
