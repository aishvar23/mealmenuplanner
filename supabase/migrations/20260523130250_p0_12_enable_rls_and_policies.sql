-- P0-12 · Enable RLS + the full policy catalog on every table.
--
-- Source of truth: design/03 § 5 (RLS policy catalog) and design/01 § RLS.
-- RLS is already on via the project's `ensure_rls` event trigger; the explicit
-- `enable row level security` below is idempotent and states intent in-migration.
-- (We do NOT force RLS, so the table owner / service-role client still bypasses
-- it for jobs/admin and system writes, per design/02.)
--
-- Helper functions (P0-11): is_active_member(h), has_permission(h, perm).
-- Direct auth.uid()/auth.jwt() calls are wrapped as (select auth.uid()) so they
-- evaluate once per query (initplan) — pre-empts the auth_rls_initplan
-- performance advisor; semantically identical to the bare calls in the doc.
--
-- Interpretation decisions where the design gives a pattern, not literal SQL
-- (flagged so they can be revised in a follow-up migration):
--   • users — SELECT/UPDATE self-only. The design is silent on `users`; a broad
--     co-member SELECT would over-expose email/phone (design/03 § 9 least
--     exposure). Co-member display-name visibility will be added via a safe
--     projection when the members API is built (P1-8/P6).
--   • meal_plans / meal_plan_items writes — gated by (today OR weekly) change
--     permission as the row-level BACKSTOP; the service layer enforces the
--     precise per-slot gate (design/03 § 5 note). meal_plan_items DELETE is
--     weekly-only (regeneration).
--   • meal_feedback — member SELECT + self INSERT; append-only (no update/delete).
--   • household_profile_drafts — self-only (a user's own onboarding progress).
--   • household_invites — member SELECT + can_invite_members write. The
--     unauthenticated token preview and invitee accept/decline run via a
--     SECURITY DEFINER RPC (P6), not these policies.
--   • content tables — authenticated read of ACTIVE rows (joined to the active
--     parent dish where applicable); writes gated by the app_role='admin' JWT
--     claim. In practice admin authoring runs on the service-role client; the
--     claim policy is the in-band backstop (design/03 § 5).

-- ════════════════════════════ identity / household ════════════════════════════

-- users — self-only (see note above).
alter table users enable row level security;
create policy users_select_self on users
  for select using (id = (select auth.uid()));
create policy users_update_self on users
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- households (design/03 § 5).
alter table households enable row level security;
create policy households_select on households
  for select using (is_active_member(id));
create policy households_insert on households
  for insert with check (created_by_user_id = (select auth.uid()));
create policy households_update on households
  for update using (has_permission(id, 'can_edit_household_preferences'))
  with check (has_permission(id, 'can_edit_household_preferences'));

-- household_preferences (design/03 § 5 note).
alter table household_preferences enable row level security;
create policy hp_select on household_preferences
  for select using (is_active_member(household_id));
create policy hp_write on household_preferences
  for all using (has_permission(household_id, 'can_edit_household_preferences'))
  with check (has_permission(household_id, 'can_edit_household_preferences'));

-- household_members (design/03 § 5). Owner-bootstrap of the first membership is
-- handled by the create-household service path (P1-5), not by hm_insert.
alter table household_members enable row level security;
create policy hm_select on household_members
  for select using (is_active_member(household_id));
create policy hm_insert on household_members
  for insert with check (has_permission(household_id, 'can_invite_members'));
create policy hm_update on household_members
  for update using (
        has_permission(household_id, 'can_remove_members')
     or has_permission(household_id, 'can_invite_members')
     or user_id = (select auth.uid())
  )
  with check (
        has_permission(household_id, 'can_remove_members')
     or has_permission(household_id, 'can_invite_members')
     or user_id = (select auth.uid())
  );

-- household_profile_drafts — self-only.
alter table household_profile_drafts enable row level security;
create policy hpd_all on household_profile_drafts
  for all using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- household_invites — member read; can_invite_members write (accept/decline via RPC, P6).
alter table household_invites enable row level security;
create policy hi_select on household_invites
  for select using (is_active_member(household_id));
create policy hi_insert on household_invites
  for insert with check (has_permission(household_id, 'can_invite_members'));
create policy hi_update on household_invites
  for update using (has_permission(household_id, 'can_invite_members'))
  with check (has_permission(household_id, 'can_invite_members'));

-- user_food_preferences (design/03 § 5) — self write; self + household admins read.
alter table user_food_preferences enable row level security;
create policy ufp_select on user_food_preferences
  for select using (
        user_id = (select auth.uid())
     or has_permission(household_id, 'can_edit_household_preferences')
  );
create policy ufp_insert on user_food_preferences
  for insert with check (user_id = (select auth.uid()) and is_active_member(household_id));
create policy ufp_update on user_food_preferences
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy ufp_delete on user_food_preferences
  for delete using (user_id = (select auth.uid()));

-- ════════════════════════════════ planning ════════════════════════════════

-- meal_plans — member read; (today OR weekly) write backstop.
alter table meal_plans enable row level security;
create policy mp_select on meal_plans
  for select using (is_active_member(household_id));
create policy mp_write on meal_plans
  for all using (
        has_permission(household_id, 'can_change_weekly_schedule')
     or has_permission(household_id, 'can_change_today_menu')
  )
  with check (
        has_permission(household_id, 'can_change_weekly_schedule')
     or has_permission(household_id, 'can_change_today_menu')
  );

-- meal_plan_items (design/03 § 5 + note). Insert/update allow today OR weekly;
-- delete is weekly-only (regeneration). Service layer enforces the precise gate.
alter table meal_plan_items enable row level security;
create policy mpi_select on meal_plan_items
  for select using (is_active_member(household_id));
create policy mpi_insert on meal_plan_items
  for insert with check (
        has_permission(household_id, 'can_change_today_menu')
     or has_permission(household_id, 'can_change_weekly_schedule')
  );
create policy mpi_update on meal_plan_items
  for update using (
        has_permission(household_id, 'can_change_today_menu')
     or has_permission(household_id, 'can_change_weekly_schedule')
  )
  with check (
        has_permission(household_id, 'can_change_today_menu')
     or has_permission(household_id, 'can_change_weekly_schedule')
  );
create policy mpi_delete on meal_plan_items
  for delete using (has_permission(household_id, 'can_change_weekly_schedule'));

-- meal_feedback — member read; self insert; append-only.
alter table meal_feedback enable row level security;
create policy mf_select on meal_feedback
  for select using (is_active_member(household_id));
create policy mf_insert on meal_feedback
  for insert with check (user_id = (select auth.uid()) and is_active_member(household_id));

-- grocery_lists (design/03 § 5).
alter table grocery_lists enable row level security;
create policy gl_select on grocery_lists
  for select using (is_active_member(household_id));
create policy gl_write on grocery_lists
  for all using (has_permission(household_id, 'can_manage_grocery_list'))
  with check (has_permission(household_id, 'can_manage_grocery_list'));

-- grocery_list_items (design/03 § 5 note) — join through the parent list.
alter table grocery_list_items enable row level security;
create policy gli_select on grocery_list_items
  for select using (
    exists (
      select 1 from grocery_lists gl
      where gl.id = grocery_list_id and is_active_member(gl.household_id)
    )
  );
create policy gli_write on grocery_list_items
  for all using (
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

-- ════════════════════════════ audit / notifications ════════════════════════════

-- household_activity_events — member read; NO client write (server/service-role only).
alter table household_activity_events enable row level security;
create policy hae_select on household_activity_events
  for select using (is_active_member(household_id));

-- notifications (design/03 § 5) — recipient read + mark-read; insert via service-role only.
alter table notifications enable row level security;
create policy notif_select on notifications
  for select using (recipient_user_id = (select auth.uid()));
create policy notif_update on notifications
  for update using (recipient_user_id = (select auth.uid()))
  with check (recipient_user_id = (select auth.uid()));

-- ═══════════════════ global content (auth read of active rows; admin write) ═══════════════════

-- dishes (design/03 § 5).
alter table dishes enable row level security;
create policy dishes_select_active on dishes
  for select using ((select auth.uid()) is not null and status = 'active');
create policy dishes_admin_write on dishes
  for all using (((select auth.jwt()) ->> 'app_role') = 'admin')
  with check (((select auth.jwt()) ->> 'app_role') = 'admin');

-- ingredients — authenticated read (no status column); admin write.
alter table ingredients enable row level security;
create policy ingredients_select on ingredients
  for select using ((select auth.uid()) is not null);
create policy ingredients_admin_write on ingredients
  for all using (((select auth.jwt()) ->> 'app_role') = 'admin')
  with check (((select auth.jwt()) ->> 'app_role') = 'admin');

-- dish_ingredients — authenticated read joined to an active dish; admin write.
alter table dish_ingredients enable row level security;
create policy di_select on dish_ingredients
  for select using (
    (select auth.uid()) is not null
    and exists (select 1 from dishes d where d.id = dish_id and d.status = 'active')
  );
create policy di_admin_write on dish_ingredients
  for all using (((select auth.jwt()) ->> 'app_role') = 'admin')
  with check (((select auth.jwt()) ->> 'app_role') = 'admin');

-- dish_prep_tasks — authenticated read joined to an active dish; admin write.
alter table dish_prep_tasks enable row level security;
create policy dpt_select on dish_prep_tasks
  for select using (
    (select auth.uid()) is not null
    and exists (select 1 from dishes d where d.id = dish_id and d.status = 'active')
  );
create policy dpt_admin_write on dish_prep_tasks
  for all using (((select auth.jwt()) ->> 'app_role') = 'admin')
  with check (((select auth.jwt()) ->> 'app_role') = 'admin');

-- dish_pairings — authenticated read joined to the active primary dish; admin write.
alter table dish_pairings enable row level security;
create policy dp_select on dish_pairings
  for select using (
    (select auth.uid()) is not null
    and exists (select 1 from dishes d where d.id = primary_dish_id and d.status = 'active')
  );
create policy dp_admin_write on dish_pairings
  for all using (((select auth.jwt()) ->> 'app_role') = 'admin')
  with check (((select auth.jwt()) ->> 'app_role') = 'admin');
