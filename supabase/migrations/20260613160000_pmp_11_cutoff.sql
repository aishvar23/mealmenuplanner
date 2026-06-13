-- PMP-11 (MP-A-141 + the MP-A-140 persistence half) · Cutoff processor + sweep.
--
-- The scheduled finalisation of a menu day at its cutoff. Two SECURITY DEFINER
-- functions + one pg_cron job:
--   • process_provider_cutoff(menu_day) — UC-CUTOFF-001/002, UC-SUBSCRIPTION-002,
--     BR-001/002/003. In ONE transaction: lock the day, auto-accept eligible+
--     consented customers onto the published default package, lock confirmed +
--     auto-accepted responses, lock the day, take the census, create preparation
--     batch revision 1, and persist its aggregate lines (the MP-A-140 persistence
--     half, computed in SQL to the SAME key the pure aggregator dedups on:
--     catalog_item + canonical_unit + spice + salt; included vs extra summed
--     separately). Idempotent (ADR-9/10): an already-locked day returns its current
--     batch and does NO new work — no duplicate batch, auto-accept, or quantities.
--   • run_provider_cutoffs() — the 5-minute sweep body: every published, not-yet-
--     locked day whose cutoff has arrived, each processed in its own savepoint so one
--     bad day can't abort the rest of the run.
--
-- Source of truth: design/planning/meal-provider/04_database_and_rls_plan.md § 5
-- (transactional RPCs), § 6 (aggregation persistence), § 7 (cron); contract 03 § 7
-- (cutoff/lock semantics), § 10 (batch shape). Nothing here is ADR-7-dependent.
--
-- Why SQL (not the TS aggregator) for persistence: the sweep runs inside pg_cron,
-- which can only invoke SQL, and the whole finalisation must be ONE atomic tx
-- (UC-CUTOFF-001 "no double quantities"). So the aggregate is computed in SQL here
-- to the identical key as lib/services/provider/aggregation.ts; the pure TS fn stays
-- the reference + the read-side rebuilder. The unique
-- (batch_id, catalog_item_id, canonical_unit, spice_level, salt_level) NULLS NOT
-- DISTINCT index on the lines table is the backstop against a TS/SQL key drift.
--
-- Field-control posture (design/04 § 9): every column written here — response
-- status/auto_accepted/locked_at/version, the day's status/locked_at, and all batch
-- totals/lines — is CLIENT-NEVER-CONTROLLED, system-generated at cutoff. These
-- functions are the only writer of batch rows; pmp_5/pmp_6 grant the underlying
-- tables SELECT-only, so this is the sole, server-owned path.
--
-- Hardening (mirrors pmp_8/9/10): search_path pinned to '' with fully-qualified
-- names; now() resolves from pg_catalog. SECURITY DEFINER so the scheduled run holds
-- the privileges regardless of the invoking role; EXECUTE revoked from
-- public/anon/authenticated — this is a system job, never user-callable. EXECUTE is
-- granted to service_role only (the TS lib/services/provider/cutoff.ts seam + ops);
-- pg_cron runs the job as its scheduling role (postgres), which owns the functions.
--
-- Rollback: cron.unschedule('process-provider-cutoffs'); drop both functions. Any
-- batches/locks already written stay (they are an audit of a real cutoff).

-- ═══════════════════════ process_provider_cutoff ═══════════════════════════
-- Returns the menu day's CURRENT batch id (rev 1 on first run; the existing current
-- batch on an idempotent replay), or NULL when the day is not a cutoff candidate
-- (not published, or its cutoff has not arrived) so a stray/early call is a safe
-- no-op.
create or replace function public.process_provider_cutoff(p_menu_day_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider_id      uuid;
  v_status           public.provider_menu_status;
  v_cutoff_at        timestamptz;
  v_locked_at        timestamptz;
  v_component_count  integer;
  v_batch_id         uuid;
  v_member           record;
  v_resp_id          uuid;
  v_rstatus          public.provider_response_status;
  v_active_customers integer;
  v_confirmed        integer;
  v_auto_accepted    integer;
  v_cancelled        integer;
  v_no_response      integer;
begin
  -- Lock the day FIRST — the same day→response lock order as save/confirm/cancel
  -- (pmp_10), so a member mutation in flight serializes against the cutoff and can
  -- never slip a change in mid-finalisation (and the two never deadlock AB/BA).
  select md.provider_id, md.status, md.cutoff_at, md.locked_at
    into v_provider_id, v_status, v_cutoff_at, v_locked_at
  from public.provider_menu_days md
  where md.id = p_menu_day_id
  for update;
  if not found then
    raise exception 'menu day not found' using errcode = 'P0002';
  end if;

  -- Idempotent replay (UC-CUTOFF-002 / ADR-10): an already-locked day was already
  -- processed in a prior run — return its current batch revision and do NO new work.
  -- The whole RPC is one tx, so a partial run is impossible; the only post-commit
  -- side effect (the summary email) has its own retry path (MP-A-161), not here.
  if v_locked_at is not null then
    select pb.id into v_batch_id
    from public.provider_preparation_batches pb
    where pb.menu_day_id = p_menu_day_id and pb.status = 'current';
    return v_batch_id;
  end if;

  -- Not a cutoff candidate: only a PUBLISHED day whose cutoff has ARRIVED is
  -- finalised. A draft/archived/cancelled day, or one whose cutoff is still in the
  -- future, is a safe no-op (the sweep only passes due published days; a direct or
  -- test call is guarded here too).
  if v_status <> 'published' or v_cutoff_at > pg_catalog.now() then
    return null;
  end if;

  select count(*) into v_component_count
  from public.provider_menu_components c
  where c.menu_day_id = p_menu_day_id;

  -- ── 1) Auto-accept (BR-002/003, UC-SUBSCRIPTION-002) ──
  -- Every ACTIVE customer with a consented auto-accept subscription who has NOT
  -- confirmed or cancelled gets the PUBLISHED DEFAULT PACKAGE filled in on their
  -- behalf: the default catalog item + default quantity for each component — NO
  -- alternatives, NO extras, NO spice/salt selection, NO note (BR-003). Skipped when
  -- the day has no components (nothing valid to auto-accept); those members then fall
  -- through to the no-response census. (auto_accept_enabled=true already implies
  -- consent — the pmp_2 check makes "enabled without consent" unrepresentable.)
  if v_component_count > 0 then
    for v_member in
      select m.user_id
      from public.provider_memberships m
      join public.provider_subscriptions s
        on s.provider_id = m.provider_id and s.customer_user_id = m.user_id
      where m.provider_id = v_provider_id
        and m.role = 'customer'
        and m.status = 'active'
        and s.auto_accept_enabled = true
    loop
      -- Lock the member's response (if any) in the day→response order.
      select r.id, r.status into v_resp_id, v_rstatus
      from public.provider_member_responses r
      where r.menu_day_id = p_menu_day_id and r.member_user_id = v_member.user_id
      for update;

      if found then
        -- A member who already decided (confirmed/cancelled) or was already processed
        -- (auto_accepted/locked/provider_overridden) is left untouched.
        if v_rstatus in ('confirmed', 'cancelled', 'auto_accepted', 'locked', 'provider_overridden') then
          continue;
        end if;
        -- A draft (started but never confirmed → no order, BR-001) is REPLACED by the
        -- default package: the member consented to auto-accept, so the default stands
        -- in for the un-confirmed draft. Rebuild the item tree from scratch.
        update public.provider_member_responses
        set status        = 'auto_accepted',
            auto_accepted  = true,
            locked_at      = pg_catalog.now(),
            confirmed_at   = null,
            cancelled_at   = null,
            member_note    = null,
            version        = version + 1
        where id = v_resp_id;
        delete from public.provider_member_response_items where response_id = v_resp_id;
      else
        insert into public.provider_member_responses (
          provider_id, menu_day_id, member_user_id, status, auto_accepted, locked_at, version
        ) values (
          v_provider_id, p_menu_day_id, v_member.user_id, 'auto_accepted', true, pg_catalog.now(), 1
        ) returning id into v_resp_id;
      end if;

      -- The default package: every component's default item at its default quantity.
      insert into public.provider_member_response_items (
        response_id, menu_component_id, selected_catalog_item_id, quantity, canonical_unit, spice_level, salt_level
      )
      select v_resp_id, c.id, c.default_catalog_item_id, c.default_quantity, c.canonical_unit, null, null
      from public.provider_menu_components c
      where c.menu_day_id = p_menu_day_id;
    end loop;
  end if;

  -- ── 2) Lock confirmed responses ──
  -- Auto-accepted rows already carry locked_at (set above). Confirmed responses keep
  -- their 'confirmed' status (so the census can count them) and gain locked_at; the
  -- day lock below freezes every response regardless, but stamping locked_at records
  -- exactly which responses entered the batch. Drafts that were NOT auto-accepted are
  -- left as drafts (no order, BR-001) — excluded from the batch by status.
  update public.provider_member_responses
  set locked_at = pg_catalog.now()
  where menu_day_id = p_menu_day_id and status = 'confirmed' and locked_at is null;

  -- ── 3) Census (contract 03 § 10 totals) ──
  -- The denominator is the provider's ACTIVE customers; each falls into exactly one
  -- of confirmed / auto_accepted / cancelled / no-response. no_response is the
  -- remainder (members with no row, or an un-confirmed draft). greatest(0, …) guards
  -- the rare case of a response from a since-removed member inflating the status
  -- counts past the active count.
  select count(*) into v_active_customers
  from public.provider_memberships m
  where m.provider_id = v_provider_id and m.role = 'customer' and m.status = 'active';

  select
    count(*) filter (where r.status = 'confirmed'),
    count(*) filter (where r.status = 'auto_accepted'),
    count(*) filter (where r.status = 'cancelled')
  into v_confirmed, v_auto_accepted, v_cancelled
  from public.provider_member_responses r
  where r.menu_day_id = p_menu_day_id;

  v_no_response := greatest(0, v_active_customers - v_confirmed - v_auto_accepted - v_cancelled);

  -- ── 4) Lock the day ──
  -- published → locked: the day lock (checked by save/confirm/cancel) freezes every
  -- response for this day from this point on.
  update public.provider_menu_days
  set status = 'locked', locked_at = pg_catalog.now()
  where id = p_menu_day_id;

  -- ── 5) Batch revision 1 + aggregate lines (MP-A-140 persistence) ──
  -- A non-locked day (guarded above) has no prior batch, so this is always revision 1;
  -- the unique (menu_day_id, revision) + one-current-per-day indexes (pmp_6) are the
  -- backstop. email_status stays NULL ("not yet attempted") — queuing the summary
  -- email is a post-commit step owned by MP-A-161, not this tx (UC-CUTOFF-001 step 9).
  -- source_response_watermark = now(): every response that entered the batch was just
  -- locked, so a LATER provider override (which re-stamps updated_at) is detectable as
  -- making this revision stale.
  insert into public.provider_preparation_batches (
    provider_id, menu_day_id, revision, status,
    total_confirmed, total_auto_accepted, total_cancelled, total_no_response,
    source_response_watermark, email_status
  ) values (
    v_provider_id, p_menu_day_id, 1, 'current',
    v_confirmed, v_auto_accepted, v_cancelled, v_no_response,
    pg_catalog.now(), null
  ) returning id into v_batch_id;

  -- Aggregate the locked confirmed + auto-accepted responses into the roster, keyed
  -- (catalog_item, canonical_unit, spice, salt) — the SAME key the TS aggregator
  -- dedups on. included_quantity is the default-package portion (the response line
  -- quantity); extra_quantity is the paid-extra portion: a quantity_increment
  -- customization contributes count × quantity_delta in the OPTION's unit, attributed
  -- to the line's catalog item and inheriting its spice/salt (so it folds into the
  -- same line when units match, and stays a separate line when they differ — units
  -- are never mixed). A line with zero net quantity is not written.
  insert into public.provider_preparation_batch_lines (
    batch_id, catalog_item_id, spice_level, salt_level,
    included_quantity, extra_quantity, total_quantity, canonical_unit
  )
  with included as (
    select i.selected_catalog_item_id as catalog_item_id,
           i.canonical_unit,
           i.spice_level,
           i.salt_level,
           i.quantity         as included_qty,
           0::numeric         as extra_qty
    from public.provider_member_response_items i
    join public.provider_member_responses r on r.id = i.response_id
    where r.menu_day_id = p_menu_day_id
      and r.status in ('confirmed', 'auto_accepted')
  ),
  extra as (
    select i.selected_catalog_item_id as catalog_item_id,
           coalesce(o.canonical_unit, i.canonical_unit) as canonical_unit,
           i.spice_level,
           i.salt_level,
           0::numeric                  as included_qty,
           rc.quantity * o.quantity_delta as extra_qty
    from public.provider_member_response_customizations rc
    join public.provider_member_response_items i on i.id = rc.response_item_id
    join public.provider_member_responses r on r.id = i.response_id
    join public.provider_customization_options o on o.id = rc.customization_option_id
    join public.provider_customization_groups g on g.id = o.customization_group_id
    where r.menu_day_id = p_menu_day_id
      and r.status in ('confirmed', 'auto_accepted')
      and g.customization_type = 'quantity_increment'
      and rc.quantity is not null
      and o.quantity_delta is not null
  ),
  unioned as (
    select * from included
    union all
    select * from extra
  )
  select v_batch_id,
         catalog_item_id,
         spice_level,
         salt_level,
         sum(included_qty),
         sum(extra_qty),
         sum(included_qty) + sum(extra_qty),
         canonical_unit
  from unioned
  group by catalog_item_id, canonical_unit, spice_level, salt_level
  having sum(included_qty) + sum(extra_qty) > 0;

  return v_batch_id;
end;
$$;

revoke execute on function public.process_provider_cutoff(uuid) from public, anon, authenticated;
grant  execute on function public.process_provider_cutoff(uuid) to service_role;

-- ═══════════════════════════ run_provider_cutoffs ═══════════════════════════
-- The 5-minute sweep body (design/04 § 7, § 19.3). Processes every published,
-- not-yet-locked day whose cutoff has arrived — driven by the partial cutoff-sweep
-- index ix_provider_menu_days_cutoff_sweep (pmp_4). Each day runs in its own
-- savepoint so a single failing day raises a WARNING and is retried next run rather
-- than aborting the whole sweep. Returns the count of days processed (observability).
create or replace function public.run_provider_cutoffs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day   record;
  v_count integer := 0;
begin
  for v_day in
    select md.id
    from public.provider_menu_days md
    where md.status = 'published'
      and md.locked_at is null
      and md.cutoff_at <= pg_catalog.now()
    order by md.cutoff_at
  loop
    begin
      perform public.process_provider_cutoff(v_day.id);
      v_count := v_count + 1;
    exception
      when others then
        raise warning 'process_provider_cutoff failed for menu day %: % (%)',
          v_day.id, sqlerrm, sqlstate;
    end;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.run_provider_cutoffs() from public, anon, authenticated;
grant  execute on function public.run_provider_cutoffs() to service_role;

-- Schedule the sweep every 5 minutes. cron.schedule(name, …) upserts by name, so this
-- is safe to (re)apply and on a fresh db reset (mirrors the household expiry sweeps).
select cron.schedule(
  'process-provider-cutoffs',
  '*/5 * * * *',
  $job$select public.run_provider_cutoffs();$job$
);
