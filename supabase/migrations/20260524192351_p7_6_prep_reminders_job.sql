-- P7-6 · prep_reminders() + hourly pg_cron sweep.
--
-- Advance-prep reminders are the one notification NOT triggered by a user action
-- (design/09 § 8, design/08 § 11): an hourly job finds upcoming planned dishes
-- whose dish_prep_tasks deadline is entering its window this hour and tells the
-- household to start prepping ("Soak chickpeas by 9 PM for tomorrow's Chole Rice").
--
-- SCOPE NOTE. The canonical notification fan-out (lib/events: one audit row +
-- per-recipient rows + channel routing + the dedup schema) is owned by Phase 8
-- and does not exist yet — P5/P6 likewise left their notification fan-out as P8
-- hooks. So this job delivers the MVP path directly: it inserts the in-app
-- `prep_task_due` rows the dashboard/inbox reads (design/09 § 8 step 5), with a
-- self-contained dedup. When P8 ships lib/events, prep reminders can move onto the
-- unified path; the detection + scheduling built here is the durable part. The
-- separate, always-available delivery is the dashboard's on-read derivation
-- (lib/services/prep, P7-4/P7-5), which needs neither this job nor P8.
--
-- TIMEZONE NOTE. The schema stores no household timezone, so meal times use the
-- fixed UTC slot clock the recommendation engine already documents as its MVP
-- simplification (lib/recommendation/config.ts mealtimes: breakfast 08:00,
-- lunch 12:30, dinner 19:00, snack 16:00). Per-household tz is a V2 concern.
--
-- IDEMPOTENCY (design/09 § 9). A task's deadline falls in exactly one hourly
-- bucket, so the window filter fires each task once per day. The 2-hour
-- duplicate guard (same recipient + event_type + rendered message) absorbs an
-- overlapping/retried run — the message encodes dish + due time, a natural key
-- (the notifications table has no entity_id column to key on; that is a P8
-- schema decision). There is no prep-completion table in MVP, so "not already
-- complete" is not filtered (noted for P8).
--
-- Hardening (mirrors abandon_stale_drafts / expire_guests): search_path = '' with
-- fully-qualified names; built-ins resolve from pg_catalog. SECURITY DEFINER so
-- the scheduled run has privileges regardless of the invoking role; EXECUTE
-- revoked from public/anon/authenticated — a system job, never user-callable
-- (which is why it does not appear in the SECURITY DEFINER advisor).

create or replace function public.prep_reminders()
returns integer
language sql
security definer
set search_path = ''
as $$
  with due as (
    select
      mpi.household_id,
      d.name        as dish_name,
      mpi.meal_slot,
      mpi.date      as meal_date,
      pt.task_name,
      (
        ((mpi.date + (case mpi.meal_slot
            when 'breakfast' then time '08:00'
            when 'lunch'     then time '12:30'
            when 'dinner'    then time '19:00'
            when 'snack'     then time '16:00'
          end)) at time zone 'UTC')
        - make_interval(mins => pt.required_before_minutes)
      )             as prep_deadline
    from public.meal_plan_items mpi
    join public.meal_plans mp     on mp.id = mpi.meal_plan_id and mp.status = 'active'
    join public.dishes d          on d.id = mpi.dish_id
    join public.dish_prep_tasks pt on pt.dish_id = mpi.dish_id
    where mpi.dish_id is not null
      and mpi.status not in ('eating_out', 'skipped')
      and mpi.date >= current_date
  ),
  windowed as (
    select
      due.household_id,
      due.dish_name,
      due.meal_date,
      due.meal_slot,
      due.task_name,
      due.prep_deadline,
      format(
        '%s by %s UTC for %s %s.',
        due.task_name,
        to_char(due.prep_deadline at time zone 'UTC', 'HH24:MI'),
        case
          when due.meal_date = current_date     then 'today''s ' || due.meal_slot::text
          when due.meal_date = current_date + 1 then 'tomorrow''s ' || due.meal_slot::text
          else to_char(due.meal_date, 'Dy DD Mon') || ' ' || due.meal_slot::text
        end,
        due.dish_name
      ) as message
    from due
    where due.prep_deadline >= date_trunc('hour', now())
      and due.prep_deadline <  date_trunc('hour', now()) + interval '1 hour'
  ),
  recipients as (
    select distinct w.household_id, w.message, hm.user_id
    from windowed w
    join public.household_members hm
      on hm.household_id = w.household_id
     and hm.status = 'active'
     and (hm.expires_at is null or hm.expires_at > now())
  ),
  inserted as (
    insert into public.notifications
      (household_id, recipient_user_id, actor_user_id, event_type, title, message)
    select r.household_id, r.user_id, null, 'prep_task_due', 'Prep needed', r.message
    from recipients r
    where not exists (
      select 1 from public.notifications n
      where n.recipient_user_id = r.user_id
        and n.event_type = 'prep_task_due'
        and n.message = r.message
        and n.created_at > now() - interval '2 hours'
    )
    returning 1
  )
  select count(*)::int from inserted;
$$;

revoke execute on function public.prep_reminders() from public, anon, authenticated;

-- cron.schedule(name, ...) upserts by name, so this is safe to (re)apply and on a
-- fresh `supabase db reset`. :13 past the hour — offset from the other jobs
-- (drafts 03:17, guests :07, invites 03:23).
select cron.schedule(
  'prep-reminders',
  '13 * * * *',
  $job$select public.prep_reminders();$job$
);
