-- P2-7 · abandon_stale_drafts() + daily pg_cron sweep.
--
-- Stale onboarding drafts are reclaimed after 30 idle days (design/06 § 8,
-- spec docs/07). The platform already enables pg_cron (P0-5), and this is a pure
-- in-database UPDATE with no external calls, so it runs as a Supabase-managed
-- cron job invoking a SQL function directly — no Edge Function needed (the
-- service-role/Edge path in design/02 is for jobs that call out, e.g. notify).
--
-- The job keys off last_saved_at (re-stamped on every autosave, P2-2), so any
-- activity inside the window keeps the draft alive. Moving a draft to
-- 'abandoned' frees the uq_one_active_draft_per_user slot so a returning user
-- starts clean rather than seeing a stale resume prompt (design/06 § 6).
-- Abandoned rows are RETAINED (not deleted) as product/history signal and to
-- preserve the partial-index semantics (design/06 § 8).
--
-- Idempotent: it only ever moves in_progress → abandoned past the threshold, so
-- re-running (or running on an empty table) is a safe no-op. Returns the count
-- swept for observability/logging.
--
-- Hardening (mirrors the other helpers): search_path = '' with fully-qualified
-- names; now() resolves from pg_catalog. SECURITY DEFINER so the scheduled run
-- has the privileges regardless of the invoking role; EXECUTE revoked from
-- public/anon/authenticated — this is a system job, never user-callable.

create or replace function public.abandon_stale_drafts()
returns integer
language sql
security definer
set search_path = ''
as $$
  with swept as (
    update public.household_profile_drafts
    set status = 'abandoned'
    where status = 'in_progress'
      and last_saved_at < now() - interval '30 days'
    returning 1
  )
  select count(*)::int from swept;
$$;

revoke execute on function public.abandon_stale_drafts()
  from public, anon, authenticated;

-- Schedule the daily sweep. cron.schedule(name, ...) upserts by name, so this is
-- safe to (re)apply and on a fresh `supabase db reset`. 03:17 UTC — off the hour
-- to avoid bunching with other platform jobs.
select cron.schedule(
  'abandon-stale-onboarding-drafts',
  '17 3 * * *',
  $job$select public.abandon_stale_drafts();$job$
);
