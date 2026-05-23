-- P0-12 (perf cleanup) · Clear the multiple_permissive_policies advisor warnings.
--
-- Two changes, no access-semantics change:
--   1. Scope every policy `to authenticated`. The expressions already excluded
--      anon (auth.uid() is null → is_active_member/has_permission false; content
--      reads require auth.uid()), so this is the Supabase-recommended end state
--      and stops anon being evaluated at all.
--   2. Split the `for all` write policies (which also cover SELECT) into explicit
--      per-command insert/update/delete policies, so SELECT no longer has two
--      overlapping permissive policies on those 9 tables.
--
-- After this, each (table, role, command) has at most one permissive policy →
-- 0 multiple_permissive_policies warnings. (The remaining INFO advisors —
-- unindexed_foreign_keys, unused_index — are expected on an empty DB and left
-- as-is by design.)

-- ── 1. Scope retained policies to authenticated ──────────────────────────────
alter policy users_select_self on users to authenticated;
alter policy users_update_self on users to authenticated;
alter policy households_select on households to authenticated;
alter policy households_insert on households to authenticated;
alter policy households_update on households to authenticated;
alter policy hp_select on household_preferences to authenticated;
alter policy hm_select on household_members to authenticated;
alter policy hm_insert on household_members to authenticated;
alter policy hm_update on household_members to authenticated;
alter policy hpd_all on household_profile_drafts to authenticated;
alter policy hi_select on household_invites to authenticated;
alter policy hi_insert on household_invites to authenticated;
alter policy hi_update on household_invites to authenticated;
alter policy ufp_select on user_food_preferences to authenticated;
alter policy ufp_insert on user_food_preferences to authenticated;
alter policy ufp_update on user_food_preferences to authenticated;
alter policy ufp_delete on user_food_preferences to authenticated;
alter policy mp_select on meal_plans to authenticated;
alter policy mpi_select on meal_plan_items to authenticated;
alter policy mpi_insert on meal_plan_items to authenticated;
alter policy mpi_update on meal_plan_items to authenticated;
alter policy mpi_delete on meal_plan_items to authenticated;
alter policy mf_select on meal_feedback to authenticated;
alter policy mf_insert on meal_feedback to authenticated;
alter policy gl_select on grocery_lists to authenticated;
alter policy gli_select on grocery_list_items to authenticated;
alter policy hae_select on household_activity_events to authenticated;
alter policy notif_select on notifications to authenticated;
alter policy notif_update on notifications to authenticated;
alter policy dishes_select_active on dishes to authenticated;
alter policy ingredients_select on ingredients to authenticated;
alter policy di_select on dish_ingredients to authenticated;
alter policy dpt_select on dish_prep_tasks to authenticated;
alter policy dp_select on dish_pairings to authenticated;

-- ── 2. Split `for all` write policies into per-command (to authenticated) ─────

-- household_preferences
drop policy hp_write on household_preferences;
create policy hp_insert on household_preferences for insert to authenticated
  with check (has_permission(household_id, 'can_edit_household_preferences'));
create policy hp_update on household_preferences for update to authenticated
  using (has_permission(household_id, 'can_edit_household_preferences'))
  with check (has_permission(household_id, 'can_edit_household_preferences'));
create policy hp_delete on household_preferences for delete to authenticated
  using (has_permission(household_id, 'can_edit_household_preferences'));

-- meal_plans
drop policy mp_write on meal_plans;
create policy mp_insert on meal_plans for insert to authenticated
  with check (
        has_permission(household_id, 'can_change_weekly_schedule')
     or has_permission(household_id, 'can_change_today_menu')
  );
create policy mp_update on meal_plans for update to authenticated
  using (
        has_permission(household_id, 'can_change_weekly_schedule')
     or has_permission(household_id, 'can_change_today_menu')
  )
  with check (
        has_permission(household_id, 'can_change_weekly_schedule')
     or has_permission(household_id, 'can_change_today_menu')
  );
create policy mp_delete on meal_plans for delete to authenticated
  using (
        has_permission(household_id, 'can_change_weekly_schedule')
     or has_permission(household_id, 'can_change_today_menu')
  );

-- grocery_lists
drop policy gl_write on grocery_lists;
create policy gl_insert on grocery_lists for insert to authenticated
  with check (has_permission(household_id, 'can_manage_grocery_list'));
create policy gl_update on grocery_lists for update to authenticated
  using (has_permission(household_id, 'can_manage_grocery_list'))
  with check (has_permission(household_id, 'can_manage_grocery_list'));
create policy gl_delete on grocery_lists for delete to authenticated
  using (has_permission(household_id, 'can_manage_grocery_list'));

-- grocery_list_items (join through the parent list)
drop policy gli_write on grocery_list_items;
create policy gli_insert on grocery_list_items for insert to authenticated
  with check (
    exists (
      select 1 from grocery_lists gl
      where gl.id = grocery_list_id
        and has_permission(gl.household_id, 'can_manage_grocery_list')
    )
  );
create policy gli_update on grocery_list_items for update to authenticated
  using (
    exists (
      select 1 from grocery_lists gl
      where gl.id = grocery_list_id
        and has_permission(gl.household_id, 'can_manage_grocery_list')
    )
  )
  with check (
    exists (
      select 1 from grocery_lists gl
      where gl.id = grocery_list_id
        and has_permission(gl.household_id, 'can_manage_grocery_list')
    )
  );
create policy gli_delete on grocery_list_items for delete to authenticated
  using (
    exists (
      select 1 from grocery_lists gl
      where gl.id = grocery_list_id
        and has_permission(gl.household_id, 'can_manage_grocery_list')
    )
  );

-- dishes (admin write via app_role JWT claim)
drop policy dishes_admin_write on dishes;
create policy dishes_admin_insert on dishes for insert to authenticated
  with check (((select auth.jwt()) ->> 'app_role') = 'admin');
create policy dishes_admin_update on dishes for update to authenticated
  using (((select auth.jwt()) ->> 'app_role') = 'admin')
  with check (((select auth.jwt()) ->> 'app_role') = 'admin');
create policy dishes_admin_delete on dishes for delete to authenticated
  using (((select auth.jwt()) ->> 'app_role') = 'admin');

-- ingredients (admin write)
drop policy ingredients_admin_write on ingredients;
create policy ingredients_admin_insert on ingredients for insert to authenticated
  with check (((select auth.jwt()) ->> 'app_role') = 'admin');
create policy ingredients_admin_update on ingredients for update to authenticated
  using (((select auth.jwt()) ->> 'app_role') = 'admin')
  with check (((select auth.jwt()) ->> 'app_role') = 'admin');
create policy ingredients_admin_delete on ingredients for delete to authenticated
  using (((select auth.jwt()) ->> 'app_role') = 'admin');

-- dish_ingredients (admin write)
drop policy di_admin_write on dish_ingredients;
create policy di_admin_insert on dish_ingredients for insert to authenticated
  with check (((select auth.jwt()) ->> 'app_role') = 'admin');
create policy di_admin_update on dish_ingredients for update to authenticated
  using (((select auth.jwt()) ->> 'app_role') = 'admin')
  with check (((select auth.jwt()) ->> 'app_role') = 'admin');
create policy di_admin_delete on dish_ingredients for delete to authenticated
  using (((select auth.jwt()) ->> 'app_role') = 'admin');

-- dish_prep_tasks (admin write)
drop policy dpt_admin_write on dish_prep_tasks;
create policy dpt_admin_insert on dish_prep_tasks for insert to authenticated
  with check (((select auth.jwt()) ->> 'app_role') = 'admin');
create policy dpt_admin_update on dish_prep_tasks for update to authenticated
  using (((select auth.jwt()) ->> 'app_role') = 'admin')
  with check (((select auth.jwt()) ->> 'app_role') = 'admin');
create policy dpt_admin_delete on dish_prep_tasks for delete to authenticated
  using (((select auth.jwt()) ->> 'app_role') = 'admin');

-- dish_pairings (admin write)
drop policy dp_admin_write on dish_pairings;
create policy dp_admin_insert on dish_pairings for insert to authenticated
  with check (((select auth.jwt()) ->> 'app_role') = 'admin');
create policy dp_admin_update on dish_pairings for update to authenticated
  using (((select auth.jwt()) ->> 'app_role') = 'admin')
  with check (((select auth.jwt()) ->> 'app_role') = 'admin');
create policy dp_admin_delete on dish_pairings for delete to authenticated
  using (((select auth.jwt()) ->> 'app_role') = 'admin');
