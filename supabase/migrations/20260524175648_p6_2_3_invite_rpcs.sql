-- P6-2/P6-3 · Invite token RPCs: preview (unauthenticated), accept, decline.
--
-- Invites gate household access, so the token is a bearer secret stored HASHED
-- at rest (design/03 § 7): the plaintext lives only in the emailed link; the
-- DB column household_invites.invite_token holds sha256(plaintext), computed in
-- the `invite` service (TS, lib/services/invite/token.ts). Every function here
-- takes the HASH, never plaintext.
--
-- Why SECURITY DEFINER for all three:
--   • get_invite_preview is called BEFORE the invitee authenticates, so it can't
--     run under the member-scoped RLS on household_invites (hi_select requires
--     active membership). It is the narrow, anon-callable projection design/03
--     § 7 mandates: it returns ONLY non-sensitive preview fields (household name,
--     inviter display name, membership type, role, expiry) — never the
--     household_id, roster, email/phone, or the stored hash — and only for a
--     pending, unexpired invite. Lookup is keyed by the unguessable 256-bit token
--     hash, so anon access exposes nothing without possession of the link.
--   • accept_invite / decline_invite run as the invitee, who is NOT yet a member,
--     so hi_update (can_invite_members) and hm_insert would reject under their
--     JWT. SECURITY DEFINER bootstraps past that — safe because each only ever
--     acts on the row addressed by the caller-supplied token and writes a
--     membership for auth.uid() alone (the token is the capability).
--
-- Real-time expiry: every lookup re-checks `expires_at > now()`, so a lapsed
-- invite is rejected immediately, independent of the expire_invites job (P6-9).
--
-- Hardening (mirrors P1-5/P1-8/P2-6): search_path = '' with fully-qualified
-- names; auth.uid() schema-qualified; now()/jsonb_* resolve from pg_catalog.
-- accept/decline EXECUTE revoked from public/anon, granted to authenticated;
-- preview is additionally granted to anon (it must serve the unauthenticated
-- landing page) but exposes only the safe projection above.

-- ── get_invite_preview(token_hash) — unauthenticated, safe projection ──────────
create or replace function public.get_invite_preview(p_token_hash text)
returns table (
  household_name text,
  invited_by text,
  membership_type public.membership_type,
  role public.member_role,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    h.name,
    u.display_name,
    i.membership_type,
    i.role,
    i.expires_at
  from public.household_invites i
  join public.households h on h.id = i.household_id
  left join public.users u on u.id = i.invited_by_user_id
  where i.invite_token = p_token_hash
    and i.status = 'pending'
    and i.expires_at > now()
  limit 1;
$$;

revoke execute on function public.get_invite_preview(text) from public;
grant execute on function public.get_invite_preview(text) to anon, authenticated;

-- ── accept_invite(token_hash) — pending → accepted + active membership ─────────
create or replace function public.accept_invite(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite  public.household_invites%rowtype;
  v_member_expires_at timestamptz;
  v_perms jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- Lock the invite so concurrent accepts serialize (single-use guarantee).
  select * into v_invite
  from public.household_invites
  where invite_token = p_token_hash
  for update;

  if not found then
    raise exception 'invite not found' using errcode = 'P0002'; -- → 404
  end if;

  if v_invite.status <> 'pending' or v_invite.expires_at <= now() then
    raise exception 'invite is no longer valid' using errcode = '23514'; -- → 409
  end if;

  v_perms := v_invite.permissions;

  -- Temporary guests carry the invite's expiry onto the membership; permanent
  -- members have no expiry (guest_has_expiry constraint, design/07 § 5).
  if v_invite.membership_type = 'temporary_guest' then
    v_member_expires_at := v_invite.expires_at;
  else
    v_member_expires_at := null;
  end if;

  -- Create the active membership. uq_one_live_membership rejects a duplicate live
  -- membership for this (household, user) → 23505 → ConflictError, and the whole
  -- function rolls back so the invite stays pending. Flags come from the invite's
  -- resolved permission set (the full 8-flag set the service writes at create
  -- time), coalesced to the member baseline if a key is ever missing.
  insert into public.household_members (
    household_id, user_id, role, membership_type, status,
    invited_by_user_id, starts_at, expires_at, joined_at,
    can_view_plan, can_suggest_meals, can_change_today_menu,
    can_change_weekly_schedule, can_manage_grocery_list, can_invite_members,
    can_remove_members, can_edit_household_preferences
  )
  values (
    v_invite.household_id, v_user_id, v_invite.role, v_invite.membership_type, 'active',
    v_invite.invited_by_user_id, v_invite.starts_at, v_member_expires_at, now(),
    coalesce((v_perms->>'can_view_plan')::boolean, true),
    coalesce((v_perms->>'can_suggest_meals')::boolean, true),
    coalesce((v_perms->>'can_change_today_menu')::boolean, false),
    coalesce((v_perms->>'can_change_weekly_schedule')::boolean, false),
    coalesce((v_perms->>'can_manage_grocery_list')::boolean, false),
    coalesce((v_perms->>'can_invite_members')::boolean, false),
    coalesce((v_perms->>'can_remove_members')::boolean, false),
    coalesce((v_perms->>'can_edit_household_preferences')::boolean, false)
  );

  update public.household_invites
  set status = 'accepted',
      accepted_by_user_id = v_user_id,
      accepted_at = now()
  where id = v_invite.id;

  -- P8 hook: member_joined activity event + notification fan-out (design/07 § 6).

  return jsonb_build_object(
    'householdId', v_invite.household_id,
    'membershipStatus', 'active'
  );
end;
$$;

revoke execute on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;

-- ── decline_invite(token_hash) — pending → declined ───────────────────────────
create or replace function public.decline_invite(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite  public.household_invites%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_invite
  from public.household_invites
  where invite_token = p_token_hash
  for update;

  if not found then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;

  if v_invite.status <> 'pending' or v_invite.expires_at <= now() then
    raise exception 'invite is no longer valid' using errcode = '23514';
  end if;

  update public.household_invites
  set status = 'declined', declined_at = now()
  where id = v_invite.id;

  return jsonb_build_object('status', 'declined');
end;
$$;

revoke execute on function public.decline_invite(text) from public, anon;
grant execute on function public.decline_invite(text) to authenticated;
