-- PMP-9 (MP-A-102 + member onboarding) · Provider membership lifecycle RPCs +
-- the minimal member-onboarding columns.
--
-- Source of truth: design/planning/meal-provider/04_database_and_rls_plan.md §5
-- (transactional RPCs), §3-4 (RLS model), §9 (field-control); contract 03 §8
-- (routes) / §3 (error reasons). UC-MEMBER-001..005 + UC-MEMBER-ONBOARD-001.
--
-- Why every function here is SECURITY DEFINER (mirrors pmp_8 + the household
-- invite RPCs in p6_2_3):
--   • pmp_7b dropped pmem_insert / pmem_update, so EVERY membership write is
--     RPC-only — a customer cannot self-promote/self-approve and an owner cannot
--     mint arbitrary rows. accept/approve/reject/remove run as the function owner,
--     past RLS, each acting only on the row their arguments address and gated by
--     an explicit owner/identity check.
--   • get_provider_invite_preview is called BEFORE the invitee accepts (often
--     unauthenticated), so it can't run under pinv_select (owner-only). It is the
--     narrow anon-callable projection (mirrors get_invite_preview): only provider
--     name + inviter name + role + expiry, keyed by the unguessable token hash,
--     only for a pending unexpired invite — never the org id, recipients, or hash.
--   • list_provider_members must project member identity (display name, email,
--     phone) across `users`, whose RLS is self-only — the owner cannot join it
--     directly (the co-member projection pattern). A DEFINER RPC gated on
--     is_provider_owner is the authoritative read.
--   • complete_member_onboarding writes the caller's own membership onboarding
--     columns (RPC-only since pmem_update is gone) + their subscription consent,
--     atomically.
--
-- Hardening (mirrors pmp_7/pmp_8): search_path pinned to '' with fully-qualified
-- names; auth.uid() schema-qualified; now() from pg_catalog; EXECUTE revoked from
-- public/anon and granted to authenticated (preview additionally to anon).

-- ════════════════ member-onboarding columns (UC-MEMBER-ONBOARD-001) ═════════════
-- The minimal member profile lives on the membership, NOT on the shared `users`
-- row: a provider-facing display name / phone may differ from the household
-- profile, and keeping it here means member onboarding never mutates `users`
-- (no cross-feature coupling). `onboarding_completed_at` is the gate the member
-- shell uses to route an approved-but-not-onboarded customer into onboarding.
-- All client-never except via complete_member_onboarding (RPC-only writes).
alter table provider_memberships
  add column member_display_name    text,
  add column member_phone           text,
  add column default_spice_level    provider_spice_level,
  add column allergy_ack_at         timestamptz,
  add column terms_ack_at           timestamptz,
  add column onboarding_completed_at timestamptz;

-- ══════════════ get_provider_invite_preview(token_hash) — anon-safe ═════════════
create or replace function public.get_provider_invite_preview(p_token_hash text)
returns table (
  provider_name text,
  invited_by    text,
  role          public.provider_membership_role,
  expires_at    timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.name,
    u.display_name,
    'customer'::public.provider_membership_role,
    i.expires_at
  from public.provider_invites i
  join public.provider_organizations o on o.id = i.provider_id
  left join public.users u on u.id = i.invited_by_user_id
  where i.token_hash = p_token_hash
    and i.status = 'pending'
    and i.expires_at > pg_catalog.now()
  limit 1;
$$;

revoke execute on function public.get_provider_invite_preview(text) from public;
grant execute on function public.get_provider_invite_preview(text) to anon, authenticated;

-- ════════════ accept_provider_invite(token_hash) — pending → awaiting ═══════════
-- Unlike the household accept (which lands `active`), a provider invite lands the
-- customer in `awaiting_approval` (ADR-5): the owner must explicitly approve them
-- before any menu access. The membership is created role='customer'.
create or replace function public.accept_provider_invite(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite  public.provider_invites%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- Lock the invite so concurrent accepts serialize (single-use guarantee).
  select * into v_invite
  from public.provider_invites
  where token_hash = p_token_hash
  for update;

  if not found then
    raise exception 'invite not found' using errcode = 'P0002'; -- → 404
  end if;

  if v_invite.status <> 'pending' or v_invite.expires_at <= pg_catalog.now() then
    raise exception 'invite is no longer valid' using errcode = '23514'; -- → 409
  end if;

  -- uq_one_live_provider_membership rejects a duplicate live membership for this
  -- (provider, user) → 23505 → ConflictError, rolling the whole function back so
  -- the invite stays pending.
  insert into public.provider_memberships (
    provider_id, user_id, role, status, invited_by_user_id
  )
  values (
    v_invite.provider_id, v_user_id, 'customer', 'awaiting_approval',
    v_invite.invited_by_user_id
  );

  update public.provider_invites
  set status = 'accepted',
      accepted_by_user_id = v_user_id,
      accepted_at = pg_catalog.now()
  where id = v_invite.id;

  return jsonb_build_object(
    'providerId', v_invite.provider_id,
    'membershipStatus', 'awaiting_approval'
  );
end;
$$;

revoke execute on function public.accept_provider_invite(text) from public, anon;
grant execute on function public.accept_provider_invite(text) to authenticated;

-- ════════════ approve / reject / remove member (owner-only) ═════════════════════
-- Each is gated on the caller being the active owner of the provider. The member
-- is addressed by membership id; the owner row itself can never be the target of
-- reject/remove (a customer-only guard). auth.uid() persists across the DEFINER
-- boundary, so is_provider_owner reads the real caller.

create or replace function public.approve_provider_member(
  p_provider_id uuid, p_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status  public.provider_membership_status;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.is_provider_owner(p_provider_id) then
    raise exception 'owner required' using errcode = '42501'; -- → 403
  end if;

  select status into v_status
  from public.provider_memberships
  where id = p_member_id and provider_id = p_provider_id and role = 'customer'
  for update;

  if not found then
    raise exception 'member not found' using errcode = 'P0002'; -- → 404
  end if;
  if v_status <> 'awaiting_approval' then
    raise exception 'member is not awaiting approval' using errcode = '23514'; -- → 409
  end if;

  update public.provider_memberships
  set status = 'active',
      approved_by_user_id = v_user_id,
      approved_at = pg_catalog.now(),
      joined_at = pg_catalog.now()
  where id = p_member_id;
end;
$$;

create or replace function public.reject_provider_member(
  p_provider_id uuid, p_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status  public.provider_membership_status;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.is_provider_owner(p_provider_id) then
    raise exception 'owner required' using errcode = '42501';
  end if;

  select status into v_status
  from public.provider_memberships
  where id = p_member_id and provider_id = p_provider_id and role = 'customer'
  for update;

  if not found then
    raise exception 'member not found' using errcode = 'P0002';
  end if;
  if v_status <> 'awaiting_approval' then
    raise exception 'member is not awaiting approval' using errcode = '23514';
  end if;

  update public.provider_memberships
  set status = 'rejected'
  where id = p_member_id;
end;
$$;

create or replace function public.remove_provider_member(
  p_provider_id uuid, p_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status  public.provider_membership_status;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.is_provider_owner(p_provider_id) then
    raise exception 'owner required' using errcode = '42501';
  end if;

  -- Customer-only target: an owner cannot remove themselves here (ownership
  -- transfer is a separate flow). A removable member is active or awaiting.
  select status into v_status
  from public.provider_memberships
  where id = p_member_id and provider_id = p_provider_id and role = 'customer'
  for update;

  if not found then
    raise exception 'member not found' using errcode = 'P0002';
  end if;
  if v_status not in ('active', 'awaiting_approval') then
    raise exception 'member is not removable' using errcode = '23514';
  end if;

  update public.provider_memberships
  set status = 'removed',
      removed_at = pg_catalog.now()
  where id = p_member_id;
end;
$$;

revoke execute on function public.approve_provider_member(uuid, uuid) from public, anon;
grant  execute on function public.approve_provider_member(uuid, uuid) to authenticated;
revoke execute on function public.reject_provider_member(uuid, uuid) from public, anon;
grant  execute on function public.reject_provider_member(uuid, uuid) to authenticated;
revoke execute on function public.remove_provider_member(uuid, uuid) from public, anon;
grant  execute on function public.remove_provider_member(uuid, uuid) to authenticated;

-- ════════════════ list_provider_members(provider_id) — owner roster ═════════════
-- Projects member identity across `users` (self-only RLS), so the owner cannot
-- join it directly. Gated on is_provider_owner. Provider-facing name/phone (set
-- at onboarding) override the user profile; email comes from the user row, falling
-- back to the invite target is intentionally NOT done here (members are users).
create or replace function public.list_provider_members(p_provider_id uuid)
returns table (
  member_id    uuid,
  user_id      uuid,
  display_name text,
  email        text,
  phone        text,
  role         public.provider_membership_role,
  status       public.provider_membership_status,
  approved_at  timestamptz,
  joined_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_provider_owner(p_provider_id) then
    raise exception 'owner required' using errcode = '42501';
  end if;

  return query
  select
    m.id,
    m.user_id,
    coalesce(m.member_display_name, u.display_name),
    u.email,
    coalesce(m.member_phone, u.phone),
    m.role,
    m.status,
    m.approved_at,
    m.joined_at
  from public.provider_memberships m
  left join public.users u on u.id = m.user_id
  where m.provider_id = p_provider_id
  order by m.created_at asc;
end;
$$;

revoke execute on function public.list_provider_members(uuid) from public, anon;
grant  execute on function public.list_provider_members(uuid) to authenticated;

-- ════════════ complete_member_onboarding(...) — UC-MEMBER-ONBOARD-001 ═══════════
-- The approved customer's minimal onboarding write: provider-facing name/phone,
-- optional default spice, allergy + terms acknowledgments, and (only if a
-- subscription row already exists — eligibility) auto-accept consent. Gated on
-- the caller being an ACTIVE member of the provider. RPC-only (pmem_update gone).
create or replace function public.complete_member_onboarding(
  p_provider_id          uuid,
  p_display_name         text,
  p_phone                text,
  p_default_spice_level  text,
  p_allergy_ack          boolean,
  p_terms_ack            boolean,
  p_auto_accept_consent  boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_member  public.provider_memberships%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_member
  from public.provider_memberships
  where provider_id = p_provider_id
    and user_id = v_user_id
    and status = 'active'
  for update;

  if not found then
    -- Not an active member (awaiting / removed / not a member) → cannot onboard.
    raise exception 'active membership required' using errcode = '42501'; -- → 403
  end if;

  if not coalesce(p_allergy_ack, false) or not coalesce(p_terms_ack, false) then
    raise exception 'acknowledgments required' using errcode = '23514'; -- → 400
  end if;

  update public.provider_memberships
  set member_display_name = nullif(btrim(coalesce(p_display_name, '')), ''),
      member_phone = nullif(btrim(coalesce(p_phone, '')), ''),
      default_spice_level = case
        when p_default_spice_level is null then null
        else p_default_spice_level::public.provider_spice_level
      end,
      allergy_ack_at = pg_catalog.now(),
      terms_ack_at = pg_catalog.now(),
      onboarding_completed_at = pg_catalog.now()
  where id = v_member.id;

  -- Auto-accept consent is captured ONLY when the customer already has a
  -- subscription row (provider-provisioned eligibility, BR-002). With no row we
  -- silently ignore consent rather than manufacture a subscription — the UI only
  -- offers the toggle when eligible. Consent timestamp is server-set here.
  if coalesce(p_auto_accept_consent, false) then
    update public.provider_subscriptions
    set auto_accept_enabled = true,
        auto_accept_consented_at = coalesce(auto_accept_consented_at, pg_catalog.now())
    where provider_id = p_provider_id
      and customer_user_id = v_user_id;
  end if;
end;
$$;

revoke execute on function public.complete_member_onboarding(uuid, text, text, text, boolean, boolean, boolean) from public, anon;
grant  execute on function public.complete_member_onboarding(uuid, text, text, text, boolean, boolean, boolean) to authenticated;
