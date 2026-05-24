-- P1-5 · create_household() — atomic household + owner-membership bootstrap.
--
-- Creating a household means writing TWO rows that must succeed or fail
-- together (design/06 § 7): the `households` row and the creator's `owner`
-- `household_members` row with every `can_*` flag set. supabase-js issues one
-- HTTP statement per call, so the only way to get a real transaction — and to
-- get past the chicken-and-egg RLS problem below — is a single Postgres
-- function. The `household` service (P1-5) calls this via `supabase.rpc`.
--
-- RLS bootstrap: the `hm_insert` policy (design/03 § 5) gates inserts on
-- `has_permission(household_id, 'can_invite_members')`, but the creator is not a
-- member yet, so under their own JWT that check is false and the owner row would
-- be rejected. SECURITY DEFINER runs the body as the function owner (postgres),
-- bypassing RLS for the bootstrap. This is safe because the function only ever
-- writes a household owned by `auth.uid()` and that same user's owner row — a
-- caller cannot fabricate membership in someone else's household.
--
-- Hardening (mirrors P0-11/P0-13): `search_path = ''` with fully-qualified
-- names; `auth.uid()` is schema-qualified; now()/btrim resolve from pg_catalog.
-- EXECUTE revoked from public/anon and granted only to `authenticated` (anon has
-- no session → auth.uid() is null → the function raises). Like the RLS helpers,
-- it remains a self-scoped SECURITY DEFINER function callable by `authenticated`,
-- so the advisor's 0029 lint applies by design (exposure is self-scoped).
--
-- Validation (empty/oversized name, authentication) is enforced here as a
-- backstop; the service layer validates first and returns typed domain errors.

create or replace function public.create_household(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name    text := btrim(coalesce(p_name, ''));
  v_household_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required'
      using errcode = '28000'; -- invalid_authorization_specification
  end if;

  if v_name = '' then
    raise exception 'household name is required'
      using errcode = '23514'; -- check_violation
  end if;

  if length(v_name) > 100 then
    raise exception 'household name is too long'
      using errcode = '23514';
  end if;

  insert into public.households (name, created_by_user_id)
  values (v_name, v_user_id)
  returning id into v_household_id;

  -- Owner: permanent, active immediately, every permission. invited_by is null
  -- (the owner was not invited). joined_at = now() since they join on creation.
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

  return v_household_id;
end;
$$;

revoke execute on function public.create_household(text) from public, anon;
grant execute on function public.create_household(text) to authenticated;
