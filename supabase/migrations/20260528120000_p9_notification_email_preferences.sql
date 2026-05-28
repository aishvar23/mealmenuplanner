-- P9 · notification_email_preferences — per-user, per-household EMAIL opt-ins.
--
-- Lets a member choose which household events they want an EMAIL for. In-app
-- notifications are unaffected (the inbox always shows everything, written by
-- emit_household_event, P8-1/P8-2). Email is strictly OPT-IN: the ABSENCE of a
-- row means OFF, so a brand-new member receives no email until they tick a box.
--
-- NOTE on the design/01 V2 sketch: design/01_database_design.md sketches a wide
-- `notification_preferences` row whose category flags default TRUE (opt-OUT). We
-- deliberately diverge — the product requirement here is opt-IN, all-off by
-- default — and use a long-format (one row per category) table so the category
-- set can grow without DDL and "absence = off" falls out for free. The category
-- vocabulary lives in TS (lib/events/categories.ts), matching how event_type is
-- free text on notifications / household_activity_events.

create table notification_email_preferences (
  user_id        uuid not null references users (id) on delete cascade,
  household_id   uuid not null references households (id) on delete cascade,
  event_category text not null,
  enabled        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (user_id, household_id, event_category)
);

create trigger trg_set_updated_at before update on notification_email_preferences
  for each row execute function set_updated_at();

-- Self-only CRUD: a user reads and writes ONLY their own preference rows. Mirrors
-- the ufp_* policy style (P0-12) including the (select auth.uid()) wrapping for
-- the init-plan caching perf pattern. Insert also requires active membership so a
-- user can't seed prefs for a household they don't belong to.
alter table notification_email_preferences enable row level security;
create policy nep_select on notification_email_preferences
  for select using (user_id = (select auth.uid()));
create policy nep_insert on notification_email_preferences
  for insert with check (
    user_id = (select auth.uid()) and is_active_member(household_id)
  );
create policy nep_update on notification_email_preferences
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy nep_delete on notification_email_preferences
  for delete using (user_id = (select auth.uid()));

-- get_event_email_recipients() — the opted-in email recipients for one event.
--
-- The email fan-out (lib/events/email-fanout.ts) runs on the caller's per-request
-- RLS client and needs each recipient's EMAIL — which a regular member cannot read
-- off another member's users row under RLS. Same safe-projection pattern as
-- list_household_food_preferences (P4-1): SECURITY DEFINER reads past RLS but
-- returns only (user_id, email, display_name), and ONLY when the caller is an
-- active member of the household (is_active_member) — so it can't enumerate
-- another household's emails even if invoked directly.
--
-- Recipient set mirrors emit_household_event's in-app fan-out so "who is emailed"
-- == "who got an in-app row", minus those not opted in: active members (status
-- 'active', not past expires_at) UNION the explicit extra recipients (the affected
-- / removed member), MINUS the actor (auth.uid()), each joined to an enabled
-- preference row for p_event_category. The extra-recipients arm covers a member
-- who just lost active status (e.g. member_removed / member_left) yet should still
-- be emailed about it if they opted in.
--
-- Hardening (mirrors emit_household_event / list_household_food_preferences):
-- search_path = '' with fully-qualified names; auth.uid()/now() schema-resolved;
-- EXECUTE revoked from public/anon, granted to authenticated. The advisor's 0029
-- self-scoped SECURITY DEFINER lint applies by design.
create or replace function public.get_event_email_recipients(
  p_household_id        uuid,
  p_event_category      text,
  p_extra_recipient_ids uuid[]
)
returns table (user_id uuid, email text, display_name text)
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
  select u.id, u.email, u.display_name
  from recipients r
  join public.users u on u.id = r.user_id
  join public.notification_email_preferences nep
    on nep.user_id = r.user_id
   and nep.household_id = p_household_id
   and nep.event_category = p_event_category
   and nep.enabled = true
  where public.is_active_member(p_household_id)
    and u.email is not null;
$$;

revoke execute on function public.get_event_email_recipients(uuid, text, uuid[])
  from public, anon;
grant execute on function public.get_event_email_recipients(uuid, text, uuid[])
  to authenticated;
