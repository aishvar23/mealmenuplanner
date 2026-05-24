-- P6-5/P6-8 · transfer_ownership() — atomic owner handoff.
--
-- A household must always have EXACTLY ONE active owner (design/07 § 11). An
-- owner therefore cannot simply leave or be demoted; ownership is transferred to
-- another active member, which in ONE transaction promotes the target to owner
-- (full permission set) and demotes the outgoing owner to admin. Doing both in
-- one statement is impossible over supabase-js (one HTTP statement per call), so
-- this is a single SECURITY DEFINER function — the same pattern as create_household
-- (P1-5) and complete_onboarding (P2-6).
--
-- It is exposed through PATCH /api/households/{id}/members/{memberId} with
-- role = 'owner' (design/07 § 11), and is the prerequisite the leave endpoint
-- (P6-7) checks before letting an owner leave.
--
-- Authorization: the function re-verifies the caller is THIS household's active
-- owner (42501 → ForbiddenError otherwise), independent of the service-layer
-- guard, so SECURITY DEFINER cannot be abused to seize a household the caller
-- doesn't own.
--
-- Hardening (mirrors the other helpers): search_path = '' with fully-qualified
-- names; auth.uid() schema-qualified; now() resolves from pg_catalog. EXECUTE
-- revoked from public/anon, granted to authenticated.

create or replace function public.transfer_ownership(
  p_household_id uuid,
  p_target_member_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner   public.household_members%rowtype;
  v_target  public.household_members%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- The caller must be the active owner of this household.
  select * into v_owner
  from public.household_members
  where household_id = p_household_id
    and user_id = v_user_id
    and status = 'active'
    and role = 'owner'
  for update;

  if not found then
    raise exception 'only the household owner may transfer ownership'
      using errcode = '42501'; -- insufficient_privilege → 403
  end if;

  -- The promotion target must be a different active member of the same household.
  select * into v_target
  from public.household_members
  where id = p_target_member_id
    and household_id = p_household_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'target member not found' using errcode = 'P0002'; -- → 404
  end if;

  if v_target.id = v_owner.id or v_target.role = 'owner' then
    raise exception 'target is already the owner' using errcode = '23514'; -- → 409
  end if;

  -- Promote the target to owner (every flag), demote the outgoing owner to admin
  -- (admin defaults: every flag except can_remove_members). Exactly one owner is
  -- preserved at all times.
  update public.household_members
  set role = 'owner',
      can_view_plan = true,
      can_suggest_meals = true,
      can_change_today_menu = true,
      can_change_weekly_schedule = true,
      can_manage_grocery_list = true,
      can_invite_members = true,
      can_remove_members = true,
      can_edit_household_preferences = true
  where id = v_target.id;

  update public.household_members
  set role = 'admin',
      can_view_plan = true,
      can_suggest_meals = true,
      can_change_today_menu = true,
      can_change_weekly_schedule = true,
      can_manage_grocery_list = true,
      can_invite_members = true,
      can_remove_members = false,
      can_edit_household_preferences = true
  where id = v_owner.id;

  -- P8 hook: permissions_changed activity events + notification fan-out.

  return jsonb_build_object(
    'householdId', p_household_id,
    'newOwnerMemberId', v_target.id,
    'previousOwnerMemberId', v_owner.id
  );
end;
$$;

revoke execute on function public.transfer_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;
