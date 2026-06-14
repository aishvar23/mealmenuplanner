-- PMP-13 (MP-A-160 read foundation) · get_provider_batch(batch) — owner-gated
-- batch-detail read.
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
--     locked eligible responses using the IDENTICAL included/extra rules the cutoff
--     aggregator (pmp_11) persisted, so the per-member rows reconcile with the
--     aggregate. Member identity is projected across `users` (self-only RLS) the
--     same way list_provider_members (pmp_9) does.
--
-- Source of truth: design/planning/meal-provider/03_contracts.md § 10/§ 11
-- (BatchDto + CSV columns), 04_database_and_rls_plan.md § 6/§ 9.
--
-- Field-control posture (design/04 § 9): batches/lines are owner-private (a customer
-- can never read the aggregate roster). This read is gated on is_provider_owner; a
-- non-owner gets PROWN → 403, a missing/foreign batch is existence-hidden as 404
-- (P0002), exactly like the override/regenerate RPCs (pmp_12).
--
-- Hardening (mirrors pmp_9/11/12): search_path pinned to '' with fully-qualified
-- names; SECURITY DEFINER so the `users` projection bypasses RLS (auth.uid() still
-- resolves to the caller, so is_provider_owner gates correctly); EXECUTE revoked
-- from public/anon, granted to authenticated (the owner gate is inside) + service_role.
--
-- Rollback: drop function public.get_provider_batch(uuid).

create or replace function public.get_provider_batch(p_batch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_provider_id uuid;
  v_menu_day_id uuid;
  v_result      jsonb;
begin
  -- Resolve the batch + its tenant; existence-hide a missing/foreign batch as 404.
  select pb.provider_id, pb.menu_day_id
    into v_provider_id, v_menu_day_id
  from public.provider_preparation_batches pb
  where pb.id = p_batch_id;
  if not found then
    raise exception 'batch not found' using errcode = 'P0002';
  end if;

  -- Owner-only (UC-BATCH-001): batches are owner-private — no customer access.
  if not public.is_provider_owner(v_provider_id) then
    raise exception 'provider owner required' using errcode = 'PROWN';
  end if;

  with batch as (
    select pb.id, pb.menu_day_id, pb.revision, pb.status, pb.generated_at,
           pb.email_status, pb.total_confirmed, pb.total_auto_accepted,
           pb.total_cancelled, pb.total_no_response,
           md.menu_date, md.cutoff_at, org.name as provider_name
    from public.provider_preparation_batches pb
    join public.provider_menu_days md on md.id = pb.menu_day_id
    join public.provider_organizations org on org.id = pb.provider_id
    where pb.id = p_batch_id
  ),
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
  -- Per-member roster: the day's locked eligible responses, same included/extra
  -- math the cutoff persisted (pmp_11). included = the response line quantity;
  -- extra = a quantity_increment customization's count × delta, in the option's
  -- unit, inheriting the line's spice/salt (so it folds into the line when units
  -- match and stays separate otherwise — units are never mixed).
  elig as (
    select r.id as response_id, r.member_user_id
    from public.provider_member_responses r
    where r.menu_day_id = v_menu_day_id
      and r.status in ('confirmed', 'auto_accepted', 'provider_overridden')
  ),
  member_raw as (
    select e.member_user_id,
           i.selected_catalog_item_id as catalog_item_id,
           i.canonical_unit, i.spice_level, i.salt_level,
           i.quantity   as included_qty,
           0::numeric    as extra_qty
    from elig e
    join public.provider_member_response_items i on i.response_id = e.response_id
    union all
    select e.member_user_id,
           i.selected_catalog_item_id,
           coalesce(o.canonical_unit, i.canonical_unit),
           i.spice_level, i.salt_level,
           0::numeric,
           rc.quantity * o.quantity_delta
    from elig e
    join public.provider_member_response_items i on i.response_id = e.response_id
    join public.provider_member_response_customizations rc on rc.response_item_id = i.id
    join public.provider_customization_options o on o.id = rc.customization_option_id
    join public.provider_customization_groups g on g.id = o.customization_group_id
    where g.customization_type = 'quantity_increment'
      and rc.quantity is not null
      and o.quantity_delta is not null
  ),
  member_lines as (
    select mr.member_user_id, mr.catalog_item_id,
           ci.name as item_name, ci.component_group,
           mr.spice_level, mr.salt_level, mr.canonical_unit,
           sum(mr.included_qty) as included_quantity,
           sum(mr.extra_qty)    as extra_quantity,
           sum(mr.included_qty) + sum(mr.extra_qty) as total_quantity
    from member_raw mr
    join public.provider_catalog_items ci on ci.id = mr.catalog_item_id
    group by mr.member_user_id, mr.catalog_item_id, ci.name, ci.component_group,
             mr.spice_level, mr.salt_level, mr.canonical_unit
    having sum(mr.included_qty) + sum(mr.extra_qty) > 0
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
      on mem.provider_id = v_provider_id and mem.user_id = ml.member_user_id
    left join public.users u on u.id = ml.member_user_id
    group by ml.member_user_id, coalesce(mem.member_display_name, u.display_name)
  )
  select jsonb_build_object(
    'batchId', b.id,
    'menuDayId', b.menu_day_id,
    'revision', b.revision,
    'status', b.status,
    'generatedAt', b.generated_at,
    'emailStatus', b.email_status,
    'providerName', b.provider_name,
    'menuDate', b.menu_date,
    'cutoffAt', b.cutoff_at,
    'totals', jsonb_build_object(
      'confirmed', b.total_confirmed,
      'autoAccepted', b.total_auto_accepted,
      'cancelled', b.total_cancelled,
      'noResponse', b.total_no_response
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
  into v_result
  from batch b;

  return v_result;
end;
$$;

revoke execute on function public.get_provider_batch(uuid) from public, anon;
grant  execute on function public.get_provider_batch(uuid) to authenticated, service_role;
