-- PMP-21 (ADO #85, decision #37/ADR amendment) · Proactive response cancellation on
-- member removal. Re-creates remove_provider_member VERBATIM from pmp_14
-- (20260614130000) with one added block: after flipping the customer's membership to
-- 'removed', proactively CANCEL their still-pending responses, audit the cancellation,
-- and notify the removed member.
--
-- Source of truth: decision #37 (decided 2026-06-17): "On member removal: proactively
-- cancel/transition the removed member's pending draft + confirmed menu responses for
-- all not-yet-locked days (days past cutoff are immutable — leave them). Emit a
-- provider_activity_event recording the removal-driven cancellation and fire the member
-- notification. Keep the cutoff-side active-membership filter as defence-in-depth."
-- This supersedes the MVP posture where removal was a pure membership flip and the
-- removed member's open-day orders lingered until the cutoff filter (#24) dropped them.
--
-- ── What "not-yet-locked" means here (mirrors the response-RPC open-menu gate) ──
-- A response is cancellable iff its day is still OPEN for member mutation: the day is
-- NOT locked (status <> 'locked' AND locked_at is null) AND its cutoff is in the future.
-- A day past its cutoff (or already locked) is immutable — its responses have either
-- been folded into a preparation batch or transitioned to a post-cutoff status
-- (locked / auto_accepted / provider_overridden); we leave them exactly as the cutoff
-- left them. We therefore only ever transition rows whose status is 'draft' or
-- 'confirmed' (the two member-mutable states); locked/auto_accepted/provider_overridden
-- rows live only on closed days and are skipped by the day gate anyway.
--
-- ── Defence-in-depth, not a replacement ──
-- The cutoff processor's active-membership filter (pmp_11, process_provider_cutoff:
-- `m.status = 'active'`) is INTENTIONALLY LEFT IN PLACE and unchanged. confirm/cancel
-- do not re-check membership, so a just-removed member could in theory confirm a draft
-- on an open day in the microsecond after this RPC commits; the cutoff filter still
-- excludes any non-active member's response when the batch is built. This proactive
-- cancel handles the common case eagerly (so the owner roster + the member's own view
-- reflect reality immediately) while the cutoff filter remains the backstop.
--
-- ── Notification posture (why a SEPARATE event, conditional on >=1 cancellation) ──
-- The existing audit-only `provider_member_removed` event is kept verbatim: UC-NOTIFY
-- says a removed customer is NOT notified about the removal itself. Decision #37 adds a
-- DISTINCT obligation — when the removal actually cancels live orders, tell the member
-- those orders were cancelled. We model that as a separate `provider_member_responses_
-- cancelled` event so the removal audit semantics are untouched, and we fan a member
-- notification out ONLY when >=1 response was cancelled (nothing cancelled → nothing to
-- tell them → stays silent, honouring UC-NOTIFY for the no-open-orders case). The
-- notification body carries NO PII — only the provider's display name + a count.
-- (provider_notifications.pn_select is recipient-scoped, independent of membership, so a
-- removed member can still read the notification we leave for them.)
--
-- Lock order: this RPC only ever locks the membership row + the response rows it
-- updates; it never locks provider_menu_days FOR UPDATE (the day is read, not locked, in
-- the cancellation UPDATE's FROM). The member's save/confirm/cancel RPCs lock day → then
-- response. Because remove never acquires the day lock, no AB/BA deadlock can form
-- between remove and a concurrent member mutation on the same rows.
--
-- Hardening unchanged from pmp_9/pmp_14: SECURITY DEFINER, search_path='' with
-- fully-qualified names, auth.uid() schema-qualified, now() from pg_catalog, owner-gated.
--
-- Rollback: re-create the pmp_14 version of remove_provider_member (drop the cancellation
-- block + the second emit). Already-cancelled response rows stay cancelled (auditable).

create or replace function public.remove_provider_member(
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
  v_cancelled_count int := 0;
  v_cancelled_days  jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.is_provider_owner(p_provider_id) then
    raise exception 'owner required' using errcode = '42501';
  end if;

  -- Customer-only target: an owner cannot remove themselves here (ownership
  -- transfer is a separate flow). A removable member is active or awaiting.
  select status, user_id into v_status, v_member_user_id
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

  -- ── Proactively cancel the removed member's still-pending responses (#37) ──
  -- Only draft/confirmed rows on a day that is still open (not locked, cutoff in the
  -- future). Past-cutoff / locked days are immutable — left exactly as the cutoff left
  -- them. version++ keeps optimistic concurrency honest if the member had the row open.
  with cancelled as (
    update public.provider_member_responses r
    set status       = 'cancelled',
        cancelled_at  = pg_catalog.now(),
        version       = r.version + 1
    from public.provider_menu_days md
    where r.provider_id    = p_provider_id
      and r.member_user_id = v_member_user_id
      and r.menu_day_id    = md.id
      and r.status in ('draft', 'confirmed')
      and md.status <> 'locked'
      and md.locked_at is null
      and md.cutoff_at > pg_catalog.now()
    returning r.menu_day_id
  )
  select count(*)::int, coalesce(jsonb_agg(distinct menu_day_id), '[]'::jsonb)
    into v_cancelled_count, v_cancelled_days
  from cancelled;

  -- Audit only — a removed customer is NOT notified about the removal itself (UC-NOTIFY).
  perform public.emit_provider_event(
    p_provider_id, 'provider_member_removed', 'provider_membership', p_member_id,
    jsonb_build_object('status', v_status),
    jsonb_build_object('status', 'removed', 'cancelledResponseCount', v_cancelled_count),
    null, null, null
  );

  -- When the removal actually cancelled live orders, record that as a distinct event AND
  -- notify the removed member (decision #37). Skipped entirely when nothing was cancelled.
  if v_cancelled_count > 0 then
    select name into v_provider_name
    from public.provider_organizations where id = p_provider_id;

    perform public.emit_provider_event(
      p_provider_id, 'provider_member_responses_cancelled', 'provider_membership',
      p_member_id,
      null,
      jsonb_build_object(
        'cancelledResponseCount', v_cancelled_count,
        'menuDayIds', v_cancelled_days
      ),
      'Orders cancelled',
      'Your membership with ' || coalesce(v_provider_name, 'your provider')
        || ' has ended, so '
        || v_cancelled_count
        || case when v_cancelled_count = 1 then ' pending order on an open menu day was cancelled.'
                else ' pending orders on open menu days were cancelled.' end,
      array[v_member_user_id]
    );
  end if;
end;
$$;

revoke execute on function public.remove_provider_member(uuid, uuid) from public, anon;
grant  execute on function public.remove_provider_member(uuid, uuid) to authenticated;
