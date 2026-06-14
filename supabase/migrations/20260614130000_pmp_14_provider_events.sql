-- PMP-14 (MP-A-170) · emit_provider_event — the provider analogue of
-- emit_household_event (P8-1/2). One domain change becomes EXACTLY ONE
-- provider_activity_events audit row plus 0..N provider_notifications rows (one per
-- explicit recipient), in a single transaction, so the owner audit + the recipient
-- in-app inbox are durable the moment the function returns.
--
-- Differences from emit_household_event (design/planning/meal-provider/02 ADR-15,
-- 03 § 9, 01 § 19.4):
--   • Recipients are passed in EXPLICITLY (p_recipient_user_ids), not derived from
--     membership. Provider fan-out is per-event (UC-NOTIFY-001 → active customers;
--     UC-NOTIFY-003 → the one approved customer; confirm/cancel/override → owner
--     audit only, no fan-out). The caller is the single place that knows the
--     recipient set for its event, and — critically for the redaction rule — the
--     single place that has already redacted title/message. This function NEVER
--     reads allergy notes, member notes, or any invite/auth token (§ 19.4): it only
--     persists the audit envelope + the pre-rendered, caller-redacted title/message.
--   • A system/cron path is allowed (auth.uid() null, e.g. a future publish-cron or
--     the cutoff sweep): the tenancy guard runs only on the request path. Service
--     role is granted EXECUTE for that path.
--
-- Tenancy: on the request path the caller must hold a live (owner or active)
-- membership of p_provider_id, mirroring emit_household_event's is_active_member
-- guard — so an authenticated user cannot fan notifications into a provider they
-- don't belong to. Hardening matches the other SECURITY DEFINER fns: search_path=''
-- with fully-qualified names; EXECUTE revoked from public/anon.

create or replace function public.emit_provider_event(
  p_provider_id        uuid,
  p_event_type         text,
  p_entity_type        text,
  p_entity_id          uuid,
  p_old_value          jsonb,
  p_new_value          jsonb,
  p_title              text,
  p_message            text,
  p_recipient_user_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor           uuid := (select auth.uid());
  v_audit_id        uuid;
  v_recipient_count int := 0;
begin
  -- Request path only: an authenticated caller must belong to the provider whose
  -- event they emit (RLS-bypass safety). The system path (v_actor null — cutoff /
  -- future publish-cron, reachable only via service_role or an internal SECURITY
  -- DEFINER caller) skips the guard, exactly like the household cron actors.
  if v_actor is not null
     and not (public.is_provider_owner(p_provider_id)
              or public.is_active_provider_member(p_provider_id)) then
    raise exception 'not a member of this provider' using errcode = '42501';
  end if;

  -- (1) The audit row — ALWAYS written, even when fan-out yields no recipients
  -- (every § 19.4 event is auditable; most carry no customer notification).
  insert into public.provider_activity_events
    (provider_id, actor_user_id, event_type, entity_type,
     entity_id, old_value, new_value)
  values
    (p_provider_id, v_actor, p_event_type, p_entity_type,
     p_entity_id, p_old_value, p_new_value)
  returning id into v_audit_id;

  -- (2) Optional fan-out: one provider_notifications row per DISTINCT recipient,
  -- excluding the actor (a member never gets told about their own action). Skipped
  -- entirely unless the caller supplied both a title and a message — an audit-only
  -- event (confirm/cancel/cutoff/override) passes NULL title/message and never
  -- notifies. "Do not notify removed/rejected customers" (UC-NOTIFY-002) is honoured
  -- by the CALLER simply not listing them as recipients.
  if p_title is not null and p_message is not null then
    with recipients as (
      select distinct rid
      from unnest(coalesce(p_recipient_user_ids, array[]::uuid[])) as rid
      where rid is not null
        and (v_actor is null or rid <> v_actor)
    ),
    ins as (
      insert into public.provider_notifications
        (provider_id, recipient_user_id, actor_user_id, event_type, title, message)
      select p_provider_id, r.rid, v_actor, p_event_type, p_title, p_message
      from recipients r
      returning 1
    )
    select count(*)::int into v_recipient_count from ins;
  end if;

  return jsonb_build_object(
    'auditId', v_audit_id,
    'recipientCount', v_recipient_count
  );
end;
$$;

-- EXECUTE is granted to service_role ONLY (NOT authenticated) — PR #48 review
-- finding #1. emit_provider_event takes the recipient set EXPLICITLY and only guards
-- the ACTOR's membership, not that the recipients belong to the provider; if it were
-- directly callable by `authenticated` an active member could fan arbitrary in-app
-- notifications (any recipient_user_id, attacker-chosen title/message — pn_select is
-- recipient-scoped, so the victim would see them) into provider_notifications. There
-- is no request-path caller on the RLS client: every caller (approve/reject/remove,
-- confirm/cancel, set_provider_batch_email_status, the cutoff sweep) is a SECURITY
-- DEFINER function OWNED BY postgres, which owns this function and therefore retains
-- EXECUTE regardless of role grants. So dropping the authenticated grant closes the
-- abuse surface without touching any live path. (Diverges intentionally from
-- emit_household_event, which IS called on the RLS client and derives most recipients
-- from membership.)
revoke execute on function public.emit_provider_event(
  uuid, text, text, uuid, jsonb, jsonb, text, text, uuid[]
) from public, anon, authenticated;
grant execute on function public.emit_provider_event(
  uuid, text, text, uuid, jsonb, jsonb, text, text, uuid[]
) to service_role;

-- ════════════════════════ wire into member lifecycle ════════════════════════
-- WHY VERBATIM, NOT A TRIGGER (PR #48 review finding #9): approve/reject/remove and
-- confirm/cancel are re-created in full from pmp_9 / pmp_10 to append one
-- emit_provider_event call each, rather than moving emission into an AFTER UPDATE OF
-- status trigger. A trigger sees only the row; it does NOT have the per-event
-- recipient set or the pre-redacted title/message, which are exactly what § 19.4
-- requires the CALLER to supply (approve notifies the one approved customer with a
-- PII-free body; reject/remove/confirm/cancel are audit-only with no fan-out). A
-- status trigger would also fire for the cutoff/override system paths that already
-- emit their own events, double-counting. Keeping emission caller-side is the
-- deliberate altitude here; the cost is that a future edit to a base RPC's locking or
-- cutoff gate must be mirrored from pmp_9 / pmp_10.
--
-- approve/reject/remove are re-created verbatim from pmp_9 (20260612160000) with a
-- single added emit_provider_event call after the status flip:
--   • approve  → provider_member_approved + NOTIFY the approved customer (UC-NOTIFY-003).
--   • reject   → provider_member_rejected, audit ONLY (do NOT notify — § UC-NOTIFY).
--   • remove   → provider_member_removed,  audit ONLY (do NOT notify — § UC-NOTIFY).
-- The notification body carries no PII (no member note / allergy / token), only the
-- provider's display name.

create or replace function public.approve_provider_member(
  p_provider_id uuid, p_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id        uuid := auth.uid();
  v_status         public.provider_membership_status;
  v_member_user_id uuid;
  v_provider_name  text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.is_provider_owner(p_provider_id) then
    raise exception 'owner required' using errcode = '42501'; -- → 403
  end if;

  select status, user_id into v_status, v_member_user_id
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

  select name into v_provider_name
  from public.provider_organizations where id = p_provider_id;

  perform public.emit_provider_event(
    p_provider_id, 'provider_member_approved', 'provider_membership', p_member_id,
    jsonb_build_object('status', 'awaiting_approval'),
    jsonb_build_object('status', 'active'),
    'Membership approved',
    'Your membership with ' || coalesce(v_provider_name, 'your provider')
      || ' is now active — today''s menu is available.',
    array[v_member_user_id]
  );
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

  -- Audit only — a rejected customer is NOT notified in-app (UC-NOTIFY).
  perform public.emit_provider_event(
    p_provider_id, 'provider_member_rejected', 'provider_membership', p_member_id,
    jsonb_build_object('status', 'awaiting_approval'),
    jsonb_build_object('status', 'rejected'),
    null, null, null
  );
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

  -- Audit only — a removed customer is NOT notified in-app (UC-NOTIFY).
  perform public.emit_provider_event(
    p_provider_id, 'provider_member_removed', 'provider_membership', p_member_id,
    jsonb_build_object('status', v_status),
    jsonb_build_object('status', 'removed'),
    null, null, null
  );
end;
$$;

-- ═════════════════════ wire into response confirm / cancel ═══════════════════
-- confirm/cancel are re-created verbatim from pmp_10 (20260613150000) with a single
-- added emit_provider_event call after the status flip — provider_response_confirmed
-- / provider_response_cancelled (§ 19.4 observability). Audit ONLY: the owner sees
-- aggregate counts on the dashboard, so per-response in-app notifications would be
-- noise — no recipients, no PII in the envelope (member id only).

create or replace function public.confirm_provider_response(p_response_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id     uuid := auth.uid();
  v_menu_day_id uuid;
  v_provider_id uuid;
  v_status      public.provider_response_status;
  v_version     integer;
  v_day_status  public.provider_menu_status;
  v_cutoff_at   timestamptz;
  v_locked_at   timestamptz;
  v_item_count  integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- Resolve the caller's OWN response to its menu day WITHOUT locking, so we can take
  -- the day lock FIRST and keep ONE consistent lock order (day → response) across
  -- save/confirm/cancel. (save locks day-then-response; if confirm locked
  -- response-then-day, two concurrent ops on the same rows could deadlock AB/BA.)
  select r.menu_day_id, r.provider_id into v_menu_day_id, v_provider_id
  from public.provider_member_responses r
  where r.id = p_response_id and r.member_user_id = v_user_id;
  if not found then
    raise exception 'response not found' using errcode = 'P0002';
  end if;

  -- 1) Lock the day (same first lock as save).
  select md.status, md.cutoff_at, md.locked_at
    into v_day_status, v_cutoff_at, v_locked_at
  from public.provider_menu_days md
  where md.id = v_menu_day_id
  for update;
  if not found then
    raise exception 'response not found' using errcode = 'P0002';
  end if;

  -- 2) Lock + re-read the response (second lock; caller-scoped).
  select r.status, r.version
    into v_status, v_version
  from public.provider_member_responses r
  where r.id = p_response_id and r.member_user_id = v_user_id
  for update;
  if not found then
    raise exception 'response not found' using errcode = 'P0002';
  end if;

  -- A locked / auto-accepted / overridden response is immutable to the member.
  if v_status in ('locked', 'auto_accepted', 'provider_overridden') then
    raise exception 'response locked' using errcode = 'PRRLK';
  end if;

  -- Idempotent replay BEFORE the cutoff/lock gate: an already-confirmed response is a
  -- no-op and returns cleanly even after the menu closed, so a client retry around
  -- the cutoff never surfaces a spurious cutoff_passed for work already done.
  if v_status = 'confirmed' then
    return v_menu_day_id;
  end if;

  -- A cancelled response can't be confirmed directly — the member must revive it via
  -- save, which re-derives quantities, so a stale (pre-cancel) item tree can never
  -- re-enter the batch. Raised regardless of the cutoff window (clearer than cutoff).
  if v_status = 'cancelled' then
    raise exception 'response cancelled' using errcode = 'PRCAN';
  end if;

  -- The response is a draft → a REAL state change, gated by the open-menu window
  -- (cutoff + lock, contract 03 § 7).
  if v_day_status = 'locked' or v_locked_at is not null then
    raise exception 'menu locked' using errcode = 'PRLCK';
  end if;
  if v_cutoff_at <= pg_catalog.now() then
    raise exception 'cutoff passed' using errcode = 'PRCUT';
  end if;

  -- Can't confirm an empty response (nothing to prepare).
  select count(*) into v_item_count
  from public.provider_member_response_items
  where response_id = p_response_id;
  if v_item_count = 0 then
    raise exception 'nothing to confirm' using errcode = 'PREMP';
  end if;

  update public.provider_member_responses
  set status       = 'confirmed',
      confirmed_at  = pg_catalog.now(),
      cancelled_at  = null,
      version       = v_version + 1
  where id = p_response_id;

  perform public.emit_provider_event(
    v_provider_id, 'provider_response_confirmed', 'provider_member_response',
    p_response_id, jsonb_build_object('status', 'draft'),
    jsonb_build_object('status', 'confirmed'), null, null, null
  );

  return v_menu_day_id;
end;
$$;

create or replace function public.cancel_provider_response(p_response_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id     uuid := auth.uid();
  v_menu_day_id uuid;
  v_provider_id uuid;
  v_status      public.provider_response_status;
  v_version     integer;
  v_day_status  public.provider_menu_status;
  v_cutoff_at   timestamptz;
  v_locked_at   timestamptz;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- Same lock discipline as confirm: resolve the menu day unlocked, then lock
  -- day → response (one consistent order with save, so no AB/BA deadlock).
  select r.menu_day_id, r.provider_id into v_menu_day_id, v_provider_id
  from public.provider_member_responses r
  where r.id = p_response_id and r.member_user_id = v_user_id;
  if not found then
    raise exception 'response not found' using errcode = 'P0002';
  end if;

  -- 1) Lock the day.
  select md.status, md.cutoff_at, md.locked_at
    into v_day_status, v_cutoff_at, v_locked_at
  from public.provider_menu_days md
  where md.id = v_menu_day_id
  for update;
  if not found then
    raise exception 'response not found' using errcode = 'P0002';
  end if;

  -- 2) Lock + re-read the response (caller-scoped).
  select r.status, r.version
    into v_status, v_version
  from public.provider_member_responses r
  where r.id = p_response_id and r.member_user_id = v_user_id
  for update;
  if not found then
    raise exception 'response not found' using errcode = 'P0002';
  end if;

  if v_status in ('locked', 'auto_accepted', 'provider_overridden') then
    raise exception 'response locked' using errcode = 'PRRLK';
  end if;

  -- Idempotent replay BEFORE the cutoff/lock gate: an already-cancelled response is a
  -- no-op and returns cleanly even after the menu closed (a retry must not 409).
  if v_status = 'cancelled' then
    return v_menu_day_id;
  end if;

  -- Cancelling a draft/confirmed response is a REAL state change, gated by the
  -- open-menu window (cutoff + lock, contract 03 § 7).
  if v_day_status = 'locked' or v_locked_at is not null then
    raise exception 'menu locked' using errcode = 'PRLCK';
  end if;
  if v_cutoff_at <= pg_catalog.now() then
    raise exception 'cutoff passed' using errcode = 'PRCUT';
  end if;

  update public.provider_member_responses
  set status       = 'cancelled',
      cancelled_at  = pg_catalog.now(),
      version       = v_version + 1
  where id = p_response_id;

  perform public.emit_provider_event(
    v_provider_id, 'provider_response_cancelled', 'provider_member_response',
    p_response_id, jsonb_build_object('status', v_status),
    jsonb_build_object('status', 'cancelled'), null, null, null
  );

  return v_menu_day_id;
end;
$$;
