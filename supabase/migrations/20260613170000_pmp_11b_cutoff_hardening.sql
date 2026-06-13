-- PMP-11b · Cutoff processor hardening (forward-fix of pmp_11, code-review PR #42).
--
-- pmp_11 (already applied to cloud dev) shipped the cutoff processor; this migration
-- forward-fixes four review findings WITHOUT a destructive rollback (design/04 § 8
-- "prefer forward-fix"). It uses `create or replace` for both functions, so a fresh
-- DB applies pmp_11 then this and lands on the corrected definitions; an existing DB
-- just re-points the functions and gains the schema guards below.
--
-- Findings fixed here:
--   1) Removed-member orders. The aggregate line CTEs and the census numerators now
--      JOIN active membership, so a customer who confirmed and was then REMOVED before
--      cutoff is excluded from the prepared roster AND the counts — matching the census
--      denominator, which has always been active-customers only. See the MVP-choice
--      note at the census/aggregate below.
--   2) Negative extra quantity / infinite silent retry.
--      a) CHECK on provider_customization_options.quantity_delta (>= 0) makes a negative
--         delta unrepresentable at the source, so extra_qty = count × delta can never go
--         negative and trip the batch-line `extra_quantity >= 0` CHECK (which would abort
--         the whole cutoff tx).
--      b) provider_menu_days gains cutoff_failure_count + cutoff_last_error; the sweep
--         increments the count + records the error in the OUTER tx on a per-day failure
--         and SKIPS a day once it has failed CUTOFF_MAX_FAILURES (5) times — so a
--         permanently-broken day escalates (visible via the columns) instead of failing
--         the identical way every 5 minutes forever. Ops finalises a skipped day via the
--         single-day seam (lib/services/provider/cutoff.ts) once the data is fixed.
--   3) Auto-accept is now SET-BASED (4 statements) instead of a per-member row-by-row
--      loop holding the day lock for O(members) round-trips.
--
-- Findings #4 (shared RpcError + mapPgError) and #5 (drop `?? null`) are TS-only and
-- ship in the same PR (lib/db/rpc-error.ts + the provider service seams).
--
-- Hardening posture is unchanged from pmp_11: SECURITY DEFINER, search_path pinned to
-- '' with fully-qualified names, now() from pg_catalog, EXECUTE granted to service_role
-- only. Rollback: drop the constraint + columns; the functions revert by re-running
-- pmp_11 (or `create or replace` back to its bodies).

-- ════════════════════ #2a · guard quantity_delta at the source ════════════════════
-- A quantity_increment option's delta is an amount ADDED per increment; it is never
-- negative. The save path multiplies count (> 0) × delta, and the batch line enforces
-- extra_quantity >= 0, so a negative delta here would abort the cutoff. Forbid it at
-- the table (NULL still allowed — a non-increment option carries no delta).
alter table public.provider_customization_options
  add constraint provider_customization_option_quantity_delta_nonneg
  check (quantity_delta is null or quantity_delta >= 0);

-- ════════════════════ #2b · per-day cutoff failure escalation ═════════════════════
alter table public.provider_menu_days
  add column if not exists cutoff_failure_count integer not null default 0,
  add column if not exists cutoff_last_error text;

alter table public.provider_menu_days
  add constraint provider_menu_day_cutoff_failure_count_nonneg
  check (cutoff_failure_count >= 0);

-- ═══════════════════════ process_provider_cutoff (corrected) ═══════════════════════
-- Returns the menu day's CURRENT batch id (rev 1 on first run; the existing current
-- batch on an idempotent replay), or NULL when the day is not a cutoff candidate
-- (not published, or its cutoff has not arrived) so a stray/early call is a safe no-op.
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
  if v_locked_at is not null then
    select pb.id into v_batch_id
    from public.provider_preparation_batches pb
    where pb.menu_day_id = p_menu_day_id and pb.status = 'current';
    return v_batch_id;
  end if;

  -- Not a cutoff candidate: only a PUBLISHED day whose cutoff has ARRIVED is finalised.
  if v_status <> 'published' or v_cutoff_at > pg_catalog.now() then
    return null;
  end if;

  select count(*) into v_component_count
  from public.provider_menu_components c
  where c.menu_day_id = p_menu_day_id;

  -- ── 1) Auto-accept (BR-002/003, UC-SUBSCRIPTION-002) — SET-BASED ──
  -- Every ACTIVE customer with a consented auto-accept subscription who has NOT
  -- confirmed or cancelled gets the PUBLISHED DEFAULT PACKAGE filled in on their
  -- behalf: the default catalog item + default quantity for each component — NO
  -- alternatives, extras, spice/salt, or note (BR-003). The whole day is already
  -- locked FOR UPDATE above, so concurrent save/confirm/cancel are blocked and we do
  -- not need a per-row FOR UPDATE; four set statements replace the old O(members) loop.
  -- Skipped when the day has no components (nothing valid to auto-accept).
  if v_component_count > 0 then
    -- (a) Replace each eligible member's un-confirmed DRAFT (BR-001: a draft is no
    --     order) with the default package — consented auto-accept stands in for it.
    --     Already-decided rows (confirmed/cancelled/auto_accepted/locked/overridden)
    --     are NOT 'draft', so they are left untouched.
    update public.provider_member_responses r
    set status        = 'auto_accepted',
        auto_accepted  = true,
        locked_at      = pg_catalog.now(),
        confirmed_at   = null,
        cancelled_at   = null,
        member_note    = null,
        version        = r.version + 1
    where r.menu_day_id = p_menu_day_id
      and r.status = 'draft'
      and exists (
        select 1
        from public.provider_subscriptions s
        join public.provider_memberships m
          on m.provider_id = s.provider_id and m.user_id = s.customer_user_id
        where s.provider_id = v_provider_id
          and s.customer_user_id = r.member_user_id
          and s.auto_accept_enabled = true
          and m.role = 'customer'
          and m.status = 'active'
      );

    -- (b) Create an auto_accepted response for every eligible member with NO row yet.
    insert into public.provider_member_responses (
      provider_id, menu_day_id, member_user_id, status, auto_accepted, locked_at, version
    )
    select v_provider_id, p_menu_day_id, m.user_id, 'auto_accepted', true, pg_catalog.now(), 1
    from public.provider_memberships m
    join public.provider_subscriptions s
      on s.provider_id = m.provider_id and s.customer_user_id = m.user_id
    where m.provider_id = v_provider_id
      and m.role = 'customer'
      and m.status = 'active'
      and s.auto_accept_enabled = true
      and not exists (
        select 1 from public.provider_member_responses r2
        where r2.menu_day_id = p_menu_day_id and r2.member_user_id = m.user_id
      );

    -- (c) Rebuild the item tree for every auto_accepted response of this day (the rows
    --     just converted in (a) — whose draft items must go — and the rows inserted in
    --     (b)), then fan the default package across them. Only this run produces
    --     auto_accepted rows (auto-accept happens once, at cutoff), so this is exactly
    --     the freshly-minted set.
    delete from public.provider_member_response_items i
    using public.provider_member_responses r
    where i.response_id = r.id
      and r.menu_day_id = p_menu_day_id
      and r.status = 'auto_accepted';

    insert into public.provider_member_response_items (
      response_id, menu_component_id, selected_catalog_item_id, quantity, canonical_unit, spice_level, salt_level
    )
    select r.id, c.id, c.default_catalog_item_id, c.default_quantity, c.canonical_unit, null, null
    from public.provider_member_responses r
    join public.provider_menu_components c on c.menu_day_id = r.menu_day_id
    where r.menu_day_id = p_menu_day_id
      and r.status = 'auto_accepted';
  end if;

  -- ── 2) Lock confirmed responses ──
  -- Auto-accepted rows already carry locked_at (set above). Confirmed responses keep
  -- their 'confirmed' status (so the census can count them) and gain locked_at.
  -- Drafts that were NOT auto-accepted stay drafts (no order, BR-001) — excluded from
  -- the batch by status.
  update public.provider_member_responses
  set locked_at = pg_catalog.now()
  where menu_day_id = p_menu_day_id and status = 'confirmed' and locked_at is null;

  -- ── 3) Census (contract 03 § 10 totals) ──
  -- The denominator is the provider's ACTIVE customers; each falls into exactly one of
  -- confirmed / auto_accepted / cancelled / no-response. The numerator query JOINS
  -- active membership so a response from a SINCE-REMOVED member is excluded from the
  -- buckets too — keeping numerators ⊆ denominator (so no_response can never be the
  -- greatest(0,…)-clamped negative the old all-responses count could produce).
  --
  -- MVP choice (code-review PR #42, ADO decision note): removing a customer does NOT
  -- cancel their pending confirmed response; instead the cutoff simply ignores
  -- non-active members when building the roster and counts. The alternative —
  -- removal cancels pending responses up front — is deferred (it touches the member-
  -- removal RPC and the activity-event trail); see the ADO `decision`/`backlog` issue.
  select count(*) into v_active_customers
  from public.provider_memberships m
  where m.provider_id = v_provider_id and m.role = 'customer' and m.status = 'active';

  select
    count(*) filter (where r.status = 'confirmed'),
    count(*) filter (where r.status = 'auto_accepted'),
    count(*) filter (where r.status = 'cancelled')
  into v_confirmed, v_auto_accepted, v_cancelled
  from public.provider_member_responses r
  join public.provider_memberships m
    on m.provider_id = r.provider_id
   and m.user_id = r.member_user_id
   and m.role = 'customer'
   and m.status = 'active'
  where r.menu_day_id = p_menu_day_id;

  v_no_response := greatest(0, v_active_customers - v_confirmed - v_auto_accepted - v_cancelled);

  -- ── 4) Lock the day ──
  update public.provider_menu_days
  set status = 'locked', locked_at = pg_catalog.now()
  where id = p_menu_day_id;

  -- ── 5) Batch revision 1 + aggregate lines (MP-A-140 persistence) ──
  insert into public.provider_preparation_batches (
    provider_id, menu_day_id, revision, status,
    total_confirmed, total_auto_accepted, total_cancelled, total_no_response,
    source_response_watermark, email_status
  ) values (
    v_provider_id, p_menu_day_id, 1, 'current',
    v_confirmed, v_auto_accepted, v_cancelled, v_no_response,
    pg_catalog.now(), null
  ) returning id into v_batch_id;

  -- Aggregate the locked confirmed + auto-accepted responses OF ACTIVE MEMBERS into the
  -- roster, keyed (catalog_item, canonical_unit, spice, salt) — the SAME key the TS
  -- aggregator dedups on. included_quantity is the default-package portion (the response
  -- line quantity); extra_quantity is the paid-extra portion: a quantity_increment
  -- customization contributes count × quantity_delta in the OPTION's unit, attributed to
  -- the line's catalog item and inheriting its spice/salt (so it folds into the same
  -- line when units match, and stays separate when they differ — units never mixed). A
  -- line with zero net quantity is not written. The active-membership join (see the
  -- census MVP note above) keeps a removed member's order out of the prepared roster.
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
    join public.provider_memberships m
      on m.provider_id = r.provider_id and m.user_id = r.member_user_id
     and m.role = 'customer' and m.status = 'active'
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
    join public.provider_memberships m
      on m.provider_id = r.provider_id and m.user_id = r.member_user_id
     and m.role = 'customer' and m.status = 'active'
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

-- ═══════════════════════════ run_provider_cutoffs (corrected) ═══════════════════════
-- The 5-minute sweep body. Processes every published, not-yet-locked day whose cutoff
-- has arrived AND that has not already failed CUTOFF_MAX_FAILURES (5) times. Each day
-- runs in its own savepoint; on failure the day's work rolls back, the failure is
-- recorded in the OUTER tx (so it persists), and the day re-qualifies next run UNTIL it
-- hits the cap — at which point the sweep skips it (escalation: a permanently-broken
-- day stops retrying the identical failure forever and is visible via
-- cutoff_failure_count / cutoff_last_error). Returns the count of days processed OK.
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
      and md.cutoff_failure_count < 5
    order by md.cutoff_at
  loop
    begin
      perform public.process_provider_cutoff(v_day.id);
      v_count := v_count + 1;
    exception
      when others then
        -- The failed day's work rolled back to the savepoint; record the failure in the
        -- OUTER tx so it persists and the day escalates (skipped above) instead of
        -- retrying the identical failure every 5 min forever.
        update public.provider_menu_days
        set cutoff_failure_count = cutoff_failure_count + 1,
            cutoff_last_error = left(sqlstate || ': ' || sqlerrm, 500)
        where id = v_day.id;
        raise warning 'process_provider_cutoff failed for menu day %: % (%)',
          v_day.id, sqlerrm, sqlstate;
    end;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.run_provider_cutoffs() from public, anon, authenticated;
grant  execute on function public.run_provider_cutoffs() to service_role;

-- The cron job body (`select public.run_provider_cutoffs();`) is unchanged from pmp_11,
-- so the existing schedule still calls the corrected function — no re-schedule needed.
