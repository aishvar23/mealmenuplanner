-- PMP-13 (MP-A-160 read foundation) · get_provider_batch(batch) — owner-gated
-- batch-detail read + the shared per-member breakdown the persist and read paths
-- both derive from.
--
-- The owner-facing read behind the preparation CSV exports (and, later, the print
-- page MP-B-051, the summary email MP-A-161, and the preparation UI MP-B-050). One
-- SECURITY DEFINER function returns a single jsonb the route serves / the CSV
-- renderer formats:
--   • batch header + the cutoff census totals (read from the persisted batch row);
--   • aggregateLines — read STRAIGHT FROM the immutable persisted
--     provider_preparation_batch_lines (the revision as cooked), each catalog item
--     named from the owner's catalog;
--   • individualLines — the per-member breakdown. These are NOT persisted per
--     member (only the aggregate is), so they are rebuilt here from the menu day's
--     locked eligible responses using the IDENTICAL included/extra rules — AND the
--     identical active-customer eligibility — the persist path applies, so the
--     per-member rows reconcile with the aggregate. Member identity is projected
--     across `users` (self-only RLS) the same way list_provider_members (pmp_9) does.
--
-- Single source of the included/extra rule (review PR #47, finding #3):
-- provider_member_breakdown_lines(menu_day) below is the ONE definition of "which
-- responses count and how a response splits into included/extra portions per member".
-- BOTH the persist-side aggregator insert_provider_batch_lines (recreated here to
-- aggregate over it) AND this read derive from it, so the aggregate the provider
-- cooks from and the per-member breakdown reconcile BY CONSTRUCTION rather than by
-- two hand-kept SQL copies. The cutoff (pmp_11) still carries its own inline copy —
-- it must run inside the pg_cron SQL tx — so consolidating THAT copy remains tracked
-- as ADO #38; the uq_provider_preparation_batch_lines_key index stays the drift
-- backstop between the cutoff copy and this helper.
--
-- Source of truth: design/planning/meal-provider/03_contracts.md § 10/§ 11
-- (BatchDto + CSV columns), 04_database_and_rls_plan.md § 6/§ 9.
--
-- Field-control posture (design/04 § 9): batches/lines are owner-private (a customer
-- can never read the aggregate roster). This read is gated on is_provider_owner; a
-- non-owner gets PROWN → 403, a missing/foreign batch is existence-hidden as 404
-- (P0002), exactly like the override/regenerate RPCs (pmp_12).
--
-- Revision posture (review PR #47, finding #2): only the CURRENT revision is
-- readable. The per-member breakdown is reconstructed from the day's LIVE responses,
-- which only match a revision's persisted aggregate while that revision is current
-- (an override marks the current batch 'stale' and rewrites responses, so a stale
-- revision's persisted aggregate and the live responses no longer agree, and the
-- historical per-member state is not recoverable — nothing persists it). A stale /
-- superseded revision therefore raises PRSTL → 409 batch_stale rather than serve two
-- CSVs that disagree. (Re-exporting historical revisions would need per-member
-- persistence — a future decision, not in MP-A-160 scope.)
--
-- Hardening (mirrors pmp_9/11/12): search_path pinned to '' with fully-qualified
-- names; SECURITY DEFINER so the `users` projection bypasses RLS (auth.uid() still
-- resolves to the caller, so is_provider_owner gates correctly); EXECUTE revoked
-- from public/anon, granted to authenticated (the owner gate is inside) + service_role.
--
-- Rollback: drop function public.get_provider_batch(uuid),
-- public.provider_member_breakdown_lines(uuid); restore insert_provider_batch_lines
-- from pmp_12.

-- ═════════════════ provider_member_breakdown_lines (shared helper) ═════════════════
-- The single source of the per-member included/extra rule (see header). For a menu
-- day, return one row per (member, catalog item, unit, spice, salt) with the
-- included and extra quantities, over the day's PREPARED responses of ACTIVE
-- customers only:
--   • eligibility — confirmed / auto_accepted / provider_overridden responses whose
--     member is an active customer membership (a since-removed member's order is
--     excluded — the same MVP posture the cutoff census + persisted aggregate take,
--     design/04 census note). This is the join finding #1 of review PR #47 caught
--     missing from the per-member read.
--   • included = the response line quantity;
--   • extra    = a quantity_increment customization's count × quantity_delta, in the
--     OPTION's unit, attributed to the line's catalog item and inheriting its
--     spice/salt — so it folds into the line on a unit match and stays a separate
--     line otherwise (units are never mixed).
-- A member/key with zero net quantity is dropped (having > 0).
create or replace function public.provider_member_breakdown_lines(p_menu_day_id uuid)
returns table (
  member_user_id    uuid,
  catalog_item_id   uuid,
  canonical_unit    text,
  spice_level       public.provider_spice_level,
  salt_level        public.provider_salt_level,
  included_quantity numeric,
  extra_quantity    numeric,
  total_quantity    numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with included as (
    select r.member_user_id,
           i.selected_catalog_item_id as catalog_item_id,
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
      and r.status in ('confirmed', 'auto_accepted', 'provider_overridden')
  ),
  extra as (
    select r.member_user_id,
           i.selected_catalog_item_id as catalog_item_id,
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
      and r.status in ('confirmed', 'auto_accepted', 'provider_overridden')
      and g.customization_type = 'quantity_increment'
      and rc.quantity is not null
      and o.quantity_delta is not null
  ),
  unioned as (
    select * from included
    union all
    select * from extra
  )
  select member_user_id,
         catalog_item_id,
         canonical_unit,
         spice_level,
         salt_level,
         sum(included_qty)                  as included_quantity,
         sum(extra_qty)                     as extra_quantity,
         sum(included_qty) + sum(extra_qty) as total_quantity
  from unioned
  group by member_user_id, catalog_item_id, canonical_unit, spice_level, salt_level
  having sum(included_qty) + sum(extra_qty) > 0;
$$;

revoke execute on function public.provider_member_breakdown_lines(uuid) from public, anon, authenticated;
grant  execute on function public.provider_member_breakdown_lines(uuid) to service_role;

-- ═══════════════ insert_provider_batch_lines (recreated over the helper) ═══════════
-- The regenerate-side aggregate writer (originally pmp_12). Now a thin sum over the
-- shared per-member breakdown: the persisted aggregate is, by construction, the
-- per-member breakdown summed across members on the SAME (catalog_item, unit, spice,
-- salt) key — the exact key the cutoff dedups on (uq_provider_preparation_batch_lines_
-- key is the drift backstop vs the cutoff's inline copy). Behaviour is unchanged from
-- pmp_12 (member-grouped sums re-summed = the original direct sums); only the
-- definition is now single-sourced so it can never drift from the per-member read.
create or replace function public.insert_provider_batch_lines(
  p_batch_id uuid,
  p_menu_day_id uuid
) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.provider_preparation_batch_lines (
    batch_id, catalog_item_id, spice_level, salt_level,
    included_quantity, extra_quantity, total_quantity, canonical_unit
  )
  select p_batch_id,
         catalog_item_id,
         spice_level,
         salt_level,
         sum(included_quantity),
         sum(extra_quantity),
         sum(total_quantity),
         canonical_unit
  from public.provider_member_breakdown_lines(p_menu_day_id)
  group by catalog_item_id, canonical_unit, spice_level, salt_level;
$$;

revoke execute on function public.insert_provider_batch_lines(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.insert_provider_batch_lines(uuid, uuid) to service_role;

-- ═══════════════════════════════ get_provider_batch ════════════════════════════════
create or replace function public.get_provider_batch(p_batch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_batch  record;
  v_result jsonb;
begin
  -- Resolve the batch + its header (tenant, menu day, org) in ONE read (review PR #47,
  -- finding #5 — the resolver and the header were two selects on the same row). FKs
  -- guarantee the menu-day + org rows exist, so the joins never drop an existing batch;
  -- a missing/foreign batch is still existence-hidden as 404.
  select pb.id, pb.provider_id, pb.menu_day_id, pb.revision, pb.status,
         pb.generated_at, pb.email_status,
         pb.total_confirmed, pb.total_auto_accepted,
         pb.total_cancelled, pb.total_no_response,
         md.menu_date, md.cutoff_at, org.name as provider_name
    into v_batch
  from public.provider_preparation_batches pb
  join public.provider_menu_days md on md.id = pb.menu_day_id
  join public.provider_organizations org on org.id = pb.provider_id
  where pb.id = p_batch_id;
  if not found then
    raise exception 'batch not found' using errcode = 'P0002';
  end if;

  -- Owner-only (UC-BATCH-001): batches are owner-private — no customer access. Gated
  -- BEFORE the revision check so a non-owner can never distinguish current vs stale.
  if not public.is_provider_owner(v_batch.provider_id) then
    raise exception 'provider owner required' using errcode = 'PROWN';
  end if;

  -- Only the current revision is readable (review PR #47, finding #2): a stale revision's
  -- persisted aggregate and the live responses the per-member breakdown rebuilds from no
  -- longer agree, and the historical per-member state is not recoverable. Refuse with
  -- PRSTL → 409 batch_stale rather than serve two CSVs that disagree.
  if v_batch.status <> 'current' then
    raise exception 'batch superseded' using errcode = 'PRSTL';
  end if;

  with
  -- Aggregate roster: the PERSISTED, immutable batch lines, named from the catalog.
  agg as (
    select bl.catalog_item_id, ci.name as item_name, ci.component_group,
           bl.spice_level, bl.salt_level,
           bl.included_quantity, bl.extra_quantity, bl.total_quantity,
           bl.canonical_unit
    from public.provider_preparation_batch_lines bl
    join public.provider_catalog_items ci on ci.id = bl.catalog_item_id
    where bl.batch_id = p_batch_id
  ),
  -- Per-member roster: the shared breakdown (same eligibility + included/extra rule the
  -- aggregate was persisted from), named from the catalog.
  member_lines as (
    select b.member_user_id, b.catalog_item_id,
           ci.name as item_name, ci.component_group,
           b.spice_level, b.salt_level, b.canonical_unit,
           b.included_quantity, b.extra_quantity, b.total_quantity
    from public.provider_member_breakdown_lines(v_batch.menu_day_id) b
    join public.provider_catalog_items ci on ci.id = b.catalog_item_id
  ),
  member_objs as (
    select ml.member_user_id,
           coalesce(mem.member_display_name, u.display_name) as display_name,
           jsonb_agg(jsonb_build_object(
             'catalogItemId', ml.catalog_item_id,
             'itemName', ml.item_name,
             'componentGroup', ml.component_group,
             'spiceLevel', ml.spice_level,
             'saltLevel', ml.salt_level,
             'includedQuantity', ml.included_quantity,
             'extraQuantity', ml.extra_quantity,
             'totalQuantity', ml.total_quantity,
             'canonicalUnit', ml.canonical_unit
           )) as lines
    from member_lines ml
    left join public.provider_memberships mem
      on mem.provider_id = v_batch.provider_id and mem.user_id = ml.member_user_id
    left join public.users u on u.id = ml.member_user_id
    group by ml.member_user_id, coalesce(mem.member_display_name, u.display_name)
  )
  select jsonb_build_object(
    'batchId', v_batch.id,
    'menuDayId', v_batch.menu_day_id,
    'revision', v_batch.revision,
    'status', v_batch.status,
    'generatedAt', v_batch.generated_at,
    'emailStatus', v_batch.email_status,
    'providerName', v_batch.provider_name,
    'menuDate', v_batch.menu_date,
    'cutoffAt', v_batch.cutoff_at,
    'totals', jsonb_build_object(
      'confirmed', v_batch.total_confirmed,
      'autoAccepted', v_batch.total_auto_accepted,
      'cancelled', v_batch.total_cancelled,
      'noResponse', v_batch.total_no_response
    ),
    'aggregateLines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'catalogItemId', a.catalog_item_id,
        'itemName', a.item_name,
        'componentGroup', a.component_group,
        'spiceLevel', a.spice_level,
        'saltLevel', a.salt_level,
        'includedQuantity', a.included_quantity,
        'extraQuantity', a.extra_quantity,
        'totalQuantity', a.total_quantity,
        'canonicalUnit', a.canonical_unit
      ))
      from agg a
    ), '[]'::jsonb),
    'individualLines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'memberUserId', mo.member_user_id,
        'displayName', mo.display_name,
        'lines', mo.lines
      ))
      from member_objs mo
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke execute on function public.get_provider_batch(uuid) from public, anon;
grant  execute on function public.get_provider_batch(uuid) to authenticated, service_role;
