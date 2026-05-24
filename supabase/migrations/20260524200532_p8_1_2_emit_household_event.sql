-- P8-1 + P8-2 · emit_household_event() — the atomic audit + notification fan-out.
--
-- The canonical write path for lib/events (design/09 § 3, § 4). One domain change
-- becomes EXACTLY ONE household_activity_events row (the audit log) plus 0..N
-- notifications rows (one per recipient), in a single transaction so the in-app
-- inbox is durable the moment the function returns (design/09 § 4 step 6, § 9).
--
-- WHY A SECURITY DEFINER RPC. notifications and household_activity_events have NO
-- authenticated INSERT policy (P0-12: "insert via the server/service-role path
-- only") — a member can only read their own notifications and the household audit
-- log, never write either. Rather than reach for the service-role client (banned
-- from user-request paths, lib/db/service-role.ts), domain services call this
-- function on the per-request RLS client, exactly like create_household /
-- replace_grocery_list / accept_invite. As SECURITY DEFINER it writes past RLS;
-- the explicit is_active_member() guard keeps the RLS bypass tenancy-safe so an
-- authenticated user cannot fan notifications into a household they don't belong
-- to (mirrors replace_grocery_list).
--
-- FAN-OUT RULES (design/09 § 4, docs/09 "Notification creation rules"):
--   1. Write the one audit row (always — even when nobody is notified).
--   2. Identify active members (status='active', not expired — matches
--      is_active_member / ix_members_household_active).
--   3. Exclude the actor (auth.uid()); a member never gets told about their own
--      action (roadmap P8 acceptance: "Actor does not receive duplicate").
--   4. (V2) notification_preferences gating — SKIPPED in MVP (everything on).
--   5. Add special recipients (p_extra_recipient_ids): the AFFECTED member who is
--      not the actor — e.g. the removed member, or whose role/permissions changed
--      (design/09 § 2 recipient note). Still actor-excluded.
--   6. Insert one notifications row per recipient in a single batch.
-- System-actor events (prep_task_due / guest_expired) are written by their own
-- cron jobs (prep_reminders, P7-6) with actor=null, not through this path.
--
-- Title/message are rendered once in TS (lib/events/templates, design/09 § 6) and
-- passed in, so every recipient row is self-contained (no display-time joins).
--
-- Hardening (mirrors the other SECURITY DEFINER fns): search_path = '' with
-- fully-qualified names; auth.uid()/built-ins schema-qualified; EXECUTE revoked
-- from public/anon and granted to authenticated (called on the RLS client). It is
-- by-design self-scoped (the is_active_member guard) so it joins the expected
-- 0029 advisor WARNs.

create or replace function public.emit_household_event(
  p_household_id        uuid,
  p_event_type          text,
  p_entity_type         text,
  p_entity_id           uuid,
  p_old_value           jsonb,
  p_new_value           jsonb,
  p_title               text,
  p_message             text,
  p_extra_recipient_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor           uuid := (select auth.uid());
  v_audit_id        uuid;
  v_recipient_count int;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- Tenancy guard: the caller must be an active member of the household whose
  -- event they are emitting (RLS-bypass safety; mirrors replace_grocery_list).
  if not public.is_active_member(p_household_id) then
    raise exception 'not an active member of this household'
      using errcode = '42501';
  end if;

  -- (1) The audit row — always written, even when fan-out yields no recipients.
  insert into public.household_activity_events
    (household_id, actor_user_id, event_type, entity_type,
     entity_id, old_value, new_value)
  values
    (p_household_id, v_actor, p_event_type, p_entity_type,
     p_entity_id, p_old_value, p_new_value)
  returning id into v_audit_id;

  -- (2-6) Fan out: active members (minus actor) ∪ explicit extra recipients
  -- (minus actor), deduped via UNION, one notifications row each.
  with recipients as (
    select hm.user_id
    from public.household_members hm
    where hm.household_id = p_household_id
      and hm.status = 'active'
      and (hm.expires_at is null or hm.expires_at > now())
      and hm.user_id <> v_actor
    union
    select rid
    from unnest(coalesce(p_extra_recipient_ids, array[]::uuid[])) as rid
    where rid <> v_actor
  ),
  ins as (
    insert into public.notifications
      (household_id, recipient_user_id, actor_user_id, event_type, title, message)
    select p_household_id, r.user_id, v_actor, p_event_type, p_title, p_message
    from recipients r
    returning 1
  )
  select count(*)::int into v_recipient_count from ins;

  return jsonb_build_object(
    'auditId', v_audit_id,
    'recipientCount', v_recipient_count
  );
end;
$$;

revoke execute on function public.emit_household_event(
  uuid, text, text, uuid, jsonb, jsonb, text, text, uuid[]
) from public, anon;

grant execute on function public.emit_household_event(
  uuid, text, text, uuid, jsonb, jsonb, text, text, uuid[]
) to authenticated;
