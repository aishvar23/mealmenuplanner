-- P6-9 · expire_guests() + expire_invites() scheduled jobs.
--
-- Guest and invite expiry are enforced TWO ways (design/03 § 7, § 8): the
-- authoritative real-time check (`expires_at > now()` inside is_active_member /
-- has_permission and the invite RPCs, P6-2/3, plus isMembershipActive in the TS
-- guards), and these housekeeping jobs that make the terminal status DURABLE for
-- the roster UI, activity feed, and reporting. The jobs are NEVER relied upon for
-- access control — they run only periodically; correctness comes from the
-- real-time path.
--
--   • expire_guests   — temporary_guest members past expires_at → 'expired'.
--                       Uses the ix_members_guest_expiry partial index (P0-10).
--                       Hourly (design/11 / system architecture).
--   • expire_invites  — pending invites past expires_at → 'expired'.
--                       Uses ix_invites_pending_expiry (P0-10). Daily.
--
-- Both are idempotent (only ever advance an eligible row to a terminal status)
-- and safe no-ops on an empty table; each returns the swept count for logging.
--
-- Hardening (mirrors abandon_stale_drafts, P2-7): search_path = '' with
-- fully-qualified names; now() resolves from pg_catalog. SECURITY DEFINER so the
-- scheduled run has the privilege regardless of the invoking role; EXECUTE
-- revoked from public/anon/authenticated — system jobs, never user-callable
-- (which is why they don't appear in the SECURITY DEFINER advisor).

create or replace function public.expire_guests()
returns integer
language sql
security definer
set search_path = ''
as $$
  with swept as (
    update public.household_members
    set status = 'expired'
    where membership_type = 'temporary_guest'
      and status = 'active'
      and expires_at is not null
      and expires_at <= now()
    returning 1
  )
  select count(*)::int from swept;
$$;

revoke execute on function public.expire_guests() from public, anon, authenticated;

create or replace function public.expire_invites()
returns integer
language sql
security definer
set search_path = ''
as $$
  with swept as (
    update public.household_invites
    set status = 'expired'
    where status = 'pending'
      and expires_at <= now()
    returning 1
  )
  select count(*)::int from swept;
$$;

revoke execute on function public.expire_invites() from public, anon, authenticated;

-- Schedule the sweeps. cron.schedule(name, ...) upserts by name, so this is safe
-- to (re)apply and on a fresh `supabase db reset`. Offset minutes so they don't
-- bunch with abandon-stale-onboarding-drafts (03:17 UTC, P2-7).
select cron.schedule(
  'expire-temporary-guests',
  '7 * * * *', -- hourly at :07
  $job$select public.expire_guests();$job$
);

select cron.schedule(
  'expire-pending-invites',
  '23 3 * * *', -- daily 03:23 UTC
  $job$select public.expire_invites();$job$
);
