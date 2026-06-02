-- M3-2 · get_event_push_tokens() — the device tokens to push one event to.
--
-- The push fan-out (lib/events/push-fanout.ts) runs on the caller's per-request
-- RLS client and needs each recipient's device tokens — which a regular member
-- cannot read off another member's device_tokens rows under RLS (self-only).
-- Same safe-projection pattern as get_event_email_recipients (P9): SECURITY
-- DEFINER reads past RLS but returns only (user_id, token, platform), and ONLY
-- when the caller is an active member of the household (is_active_member).
--
-- Unlike email, push is NOT gated by notification_email_preferences: registering
-- a device token (which requires OS-level push permission) IS the opt-in. The
-- recipient set mirrors emit_household_event's in-app fan-out so "who is pushed"
-- == "who got an in-app row": active members (status 'active', not past
-- expires_at) UNION the explicit extra recipients (the affected/removed member),
-- MINUS the actor (auth.uid()), each joined to their device_tokens.
--
-- Hardening (mirrors get_event_email_recipients): search_path = '' with
-- fully-qualified names; EXECUTE revoked from public/anon, granted to authenticated.
create or replace function public.get_event_push_tokens(
  p_household_id        uuid,
  p_extra_recipient_ids uuid[]
)
returns table (user_id uuid, token text, platform text)
language sql
stable
security definer
set search_path = ''
as $$
  with recipients as (
    select hm.user_id
    from public.household_members hm
    where hm.household_id = p_household_id
      and hm.status = 'active'
      and (hm.expires_at is null or hm.expires_at > now())
      and hm.user_id <> (select auth.uid())
    union
    select rid
    from unnest(coalesce(p_extra_recipient_ids, array[]::uuid[])) as rid
    where rid <> (select auth.uid())
  )
  select dt.user_id, dt.token, dt.platform
  from recipients r
  join public.device_tokens dt on dt.user_id = r.user_id
  where public.is_active_member(p_household_id);
$$;

revoke execute on function public.get_event_push_tokens(uuid, uuid[])
  from public, anon;
grant execute on function public.get_event_push_tokens(uuid, uuid[])
  to authenticated;
