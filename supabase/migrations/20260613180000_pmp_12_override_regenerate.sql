-- PMP-12 (MP-A-150) · Provider override + batch regenerate.
--
-- The post-cutoff owner correction path (UC-OVERRIDE-001/002, BR-007, ADR-11). Two
-- SECURITY DEFINER owner RPCs + one shared aggregation helper:
--   • provider_override_response(response, reason, items) — UC-OVERRIDE-001. After a
--     menu day is LOCKED the member can no longer change their order, but the OWNER
--     may correct an individual locked response: re-derive the corrected order from
--     the published menu config (the SAME server-derivation as save_provider_response,
--     §11.6 — quantities/units are never client-trusted), record the mandatory reason,
--     preserve the prior order in the activity-event audit (old_value), flip the
--     response to 'provider_overridden', and mark the day's CURRENT preparation batch
--     'stale' so the owner knows the roster no longer matches the responses.
--   • regenerate_provider_batch(batch) — UC-OVERRIDE-002. The owner explicitly rebuilds
--     the roster: the current revision is marked 'stale' (kept, immutable — ADR-11) and
--     a fresh revision N+1 becomes 'current', recomputing the census + aggregate lines
--     from the day's confirmed / auto_accepted / provider_overridden responses. The
--     summary email is NOT auto-resent (UC-OVERRIDE-002 important rule) — email_status
--     resets to NULL ("not yet attempted") and a resend is the explicit MP-A-161 path.
--
-- Source of truth: design/planning/meal-provider/04_database_and_rls_plan.md § 5
-- (transactional RPCs), § 6 (aggregation), § 9 (field-control); 02_architecture_
-- decisions.md ADR-11 (immutable revisions); contract 03 § 7 (override/lock), § 9
-- (event names), § 10 (batch shape). UC-OVERRIDE-001/002, BR-007. Nothing here is
-- ADR-7-dependent — ADR-7 (#30) gates only the MENU-edit path (MP-A-012E/121/B-030),
-- not the post-lock RESPONSE override or the batch regenerate.
--
-- ── Field-control posture (design/04 § 9) ──
-- Every column these RPCs write — response status/provider_overridden/
-- provider_override_reason/locked_at/version, batch status/totals/lines/email_status —
-- is CLIENT-NEVER-CONTROLLED. The owner picks WHICH catalog item / customizations
-- (constrained to the published menu), but the authoritative quantity/unit is derived
-- here, exactly as save does. pmp_5/pmp_6 grant the underlying tables SELECT only, so
-- these RPCs are the sole writer of an override / regenerated batch.
--
-- Error semantics (contract 03 § 3): custom 5-char SQLSTATEs in the 'PR' class, mapped
-- by lib/services/provider/override.ts onto the existing ERROR_CODES + a details.reason
-- discriminator (no new top-level code):
--   PROWN provider_owner_required (403)   PRRSN reason required (400, field=reason)
--   PRNLK menu_not_locked — override before the day is locked (409)
--   PREMP empty-order — override left zero items (400; cancel to clear instead)
--   PRALT invalid_menu_alternative   PRCUS invalid_customization
--   PRLIM customization_limit_exceeded   (shared with save, §11.6 derivation)
-- P0002 (unknown response / batch) → existence-hiding 404.
--
-- Lock discipline: both RPCs take the menu-day lock FIRST, then the response — the
-- SAME order as save/confirm/cancel/cutoff (pmp_10/pmp_11), so an in-flight member
-- mutation or a concurrent cutoff serializes and never deadlocks AB/BA.
--
-- Hardening (mirrors pmp_8/9/10/11): SECURITY DEFINER, search_path pinned to '' with
-- fully-qualified names, auth.uid() schema-qualified, now() from pg_catalog. EXECUTE
-- revoked from public/anon; granted to authenticated (the owner gate is is_provider_
-- owner inside, which is false for anon → fail-closed) + service_role (ops seam).
--
-- Rollback: drop the two functions + the helper (override/batch rows already written
-- stay — they are the audit of a real correction, readable under pmp_5/pmp_6 RLS).

-- ═══════════════════ insert_provider_batch_lines (shared helper) ═══════════════════
-- Persist the aggregate preparation lines of ONE batch revision from the day's prepared
-- responses, keyed (catalog_item, canonical_unit, spice, salt) — the SAME key the pure
-- TS aggregator (lib/services/provider/aggregation.ts) and the cutoff (pmp_11/11b)
-- dedup on; the unique uq_provider_preparation_batch_lines_key index (pmp_6) is the
-- drift backstop. included_quantity is the default-package portion (the response line
-- quantity); extra_quantity is the paid-extra portion (a quantity_increment
-- customization contributes count × quantity_delta in the OPTION's unit, attributed to
-- the line's catalog item, inheriting its spice/salt so it folds into the same line on
-- a unit match and stays separate otherwise — units are never mixed). Only ACTIVE-member
-- responses count (a since-removed member's order is excluded — the same MVP posture the
-- cutoff census takes, design/04 census note).
--
-- The status filter is the regenerate roster: confirmed + auto_accepted +
-- provider_overridden. At cutoff there are zero provider_overridden rows (override is a
-- post-lock action), so this filter is identical to the cutoff's {confirmed,
-- auto_accepted} for revision 1 — the cutoff keeps its own inline copy (it must run
-- inside the pg_cron SQL tx), and this helper is the regenerate-side writer; both target
-- the identical key. A line with zero net quantity is not written.
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
      and r.status in ('confirmed', 'auto_accepted', 'provider_overridden')
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
  select p_batch_id,
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
$$;

revoke execute on function public.insert_provider_batch_lines(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.insert_provider_batch_lines(uuid, uuid) to service_role;

-- ═══════════════════════════ provider_override_response ════════════════════════════
-- Returns a jsonb result the route serves directly:
--   { responseId, menuDayId, status: "provider_overridden", staleBatchId: uuid|null }
-- staleBatchId is the revision this override marked stale (NULL when no batch existed
-- yet — e.g. an emergency lock with no cutoff batch); the UI prompts Regenerate from it.
create or replace function public.provider_override_response(
  p_response_id uuid,
  p_reason      text,
  p_items       jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id      uuid := auth.uid();
  v_provider_id  uuid;
  v_menu_day_id  uuid;
  v_day_status   public.provider_menu_status;
  v_day_locked   timestamptz;
  v_status       public.provider_response_status;
  v_version      integer;
  v_locked_at    timestamptz;
  v_reason       text := btrim(coalesce(p_reason, ''));
  v_old_value    jsonb;
  v_stale_batch  uuid;
  v_item         jsonb;
  v_component_id uuid;
  v_selected     uuid;
  v_comp         record;
  v_qty          numeric(10, 3);
  v_unit         text;
  v_spice        public.provider_spice_level;
  v_salt         public.provider_salt_level;
  v_item_id      uuid;
  v_cust         jsonb;
  v_option_id    uuid;
  v_cust_qty     numeric(10, 3);
  v_opt          record;
  v_count        integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- Reason is mandatory (BR-007). Checked before any lock so a missing reason is a
  -- cheap 400, never a partial write.
  if v_reason = '' then
    raise exception 'override reason required' using errcode = 'PRRSN';
  end if;

  -- Resolve the response → its provider + menu day WITHOUT locking, so the day lock can
  -- be taken FIRST (one consistent day→response order with save/confirm/cancel/cutoff).
  select r.provider_id, r.menu_day_id
    into v_provider_id, v_menu_day_id
  from public.provider_member_responses r
  where r.id = p_response_id;
  if not found then
    raise exception 'response not found' using errcode = 'P0002';
  end if;

  -- Owner-only (BR-007). is_provider_owner uses auth.uid() internally; false for a
  -- non-owner / anon → existence-hiding handled by the service (PROWN → 403).
  if not public.is_provider_owner(v_provider_id) then
    raise exception 'provider owner required' using errcode = 'PROWN';
  end if;

  -- 1) Lock the day.
  select md.status, md.locked_at
    into v_day_status, v_day_locked
  from public.provider_menu_days md
  where md.id = v_menu_day_id
  for update;
  if not found then
    raise exception 'response not found' using errcode = 'P0002';
  end if;

  -- Override is a POST-lock correction (UC-OVERRIDE-001 precondition: response locked,
  -- cutoff passed). Before the day is locked the member can still edit, so an override
  -- is premature — reject it rather than racing the member.
  if v_day_status <> 'locked' or v_day_locked is null then
    raise exception 'menu not locked' using errcode = 'PRNLK';
  end if;

  -- 2) Lock + re-read the response.
  select r.status, r.version, r.locked_at
    into v_status, v_version, v_locked_at
  from public.provider_member_responses r
  where r.id = p_response_id
  for update;
  if not found then
    raise exception 'response not found' using errcode = 'P0002';
  end if;

  -- Snapshot the prior order for the audit (old_value) BEFORE rebuilding the tree —
  -- "original preserved" (UC-OVERRIDE-001 step 5). Item-level detail; member_note kept
  -- out (sensitive, §19.4 — the audit records WHAT changed, not the member's free text).
  select jsonb_build_object(
           'status', v_status,
           'version', v_version,
           'items', coalesce(
             (select jsonb_agg(jsonb_build_object(
                       'menuComponentId', i.menu_component_id,
                       'selectedCatalogItemId', i.selected_catalog_item_id,
                       'quantity', i.quantity,
                       'canonicalUnit', i.canonical_unit,
                       'spiceLevel', i.spice_level,
                       'saltLevel', i.salt_level)
                     order by i.menu_component_id)
              from public.provider_member_response_items i
              where i.response_id = p_response_id),
             '[]'::jsonb))
    into v_old_value;

  -- Flip to provider_overridden + record the reason; preserve locked_at (set at cutoff;
  -- coalesce for the emergency-lock-with-no-prior-lock edge). cancelled_at cleared (the
  -- override re-establishes an order). version++ for optimistic-concurrency continuity.
  update public.provider_member_responses
  set status                   = 'provider_overridden',
      provider_overridden      = true,
      provider_override_reason = v_reason,
      locked_at                = coalesce(v_locked_at, pg_catalog.now()),
      cancelled_at             = null,
      version                  = v_version + 1
  where id = p_response_id;

  -- Rebuild the corrected item tree (child customizations cascade on the item delete).
  delete from public.provider_member_response_items where response_id = p_response_id;

  -- ── Derive + validate each corrected line from the menu config (mirrors
  --    save_provider_response, §11.6 — quantity/unit are SERVER-DERIVED, never trusted
  --    from the owner's payload; only the catalog/customization SELECTION is the owner's
  --    choice, constrained to the published menu). ──
  -- DUPLICATED LOGIC: this loop is a near-verbatim copy of save_provider_response's
  -- derivation (pmp_10). Both must stay in sync until extracted into one shared
  -- derivation routine the save + override paths call — a refactor that re-touches the
  -- shipped save RPC, so it is deferred and tracked as tech debt in ADO #38. Any
  -- §11.6 rule change here must be mirrored in pmp_10.
  for v_item in
    select e from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
  loop
    v_component_id := (v_item->>'menuComponentId')::uuid;
    v_selected     := (v_item->>'selectedCatalogItemId')::uuid;

    select c.default_catalog_item_id, c.default_quantity, c.canonical_unit,
           c.supports_spice_level, c.supports_salt_level
      into v_comp
    from public.provider_menu_components c
    where c.id = v_component_id and c.menu_day_id = v_menu_day_id;
    if not found then
      raise exception 'invalid menu alternative' using errcode = 'PRALT';
    end if;

    if v_selected = v_comp.default_catalog_item_id then
      v_qty  := v_comp.default_quantity;
      v_unit := v_comp.canonical_unit;
    else
      select a.quantity, a.canonical_unit
        into v_qty, v_unit
      from public.provider_menu_alternatives a
      where a.menu_component_id = v_component_id
        and a.catalog_item_id = v_selected
        and a.is_active = true;
      if not found then
        raise exception 'invalid menu alternative' using errcode = 'PRALT';
      end if;
    end if;

    v_spice := case when v_comp.supports_spice_level
                    then nullif(v_item->>'spiceLevel', '')::public.provider_spice_level end;
    v_salt  := case when v_comp.supports_salt_level
                    then nullif(v_item->>'saltLevel', '')::public.provider_salt_level end;

    insert into public.provider_member_response_items (
      response_id, menu_component_id, selected_catalog_item_id,
      quantity, canonical_unit, spice_level, salt_level
    ) values (
      p_response_id, v_component_id, v_selected,
      v_qty, v_unit, v_spice, v_salt
    ) returning id into v_item_id;

    for v_cust in
      select e from jsonb_array_elements(coalesce(v_item->'customizations', '[]'::jsonb)) e
    loop
      v_option_id := (v_cust->>'customizationOptionId')::uuid;

      select o.maximum_quantity, g.customization_type, g.maximum_selections
        into v_opt
      from public.provider_customization_options o
      join public.provider_customization_groups g on g.id = o.customization_group_id
      where o.id = v_option_id
        and o.is_active = true
        and g.menu_component_id = v_component_id;
      if not found then
        raise exception 'invalid customization' using errcode = 'PRCUS';
      end if;

      if v_opt.customization_type = 'quantity_increment' then
        v_cust_qty := coalesce((v_cust->>'quantity')::numeric, 0);
        if v_cust_qty <= 0 then
          raise exception 'invalid customization' using errcode = 'PRCUS';
        end if;
        if (v_opt.maximum_selections is not null and v_cust_qty > v_opt.maximum_selections)
           or (v_opt.maximum_quantity is not null and v_cust_qty > v_opt.maximum_quantity) then
          raise exception 'customization limit exceeded' using errcode = 'PRLIM';
        end if;
      else
        v_cust_qty := null;
      end if;

      insert into public.provider_member_response_customizations (
        response_item_id, customization_option_id, quantity
      ) values (v_item_id, v_option_id, v_cust_qty);
    end loop;

    select 1 into v_count
    from public.provider_member_response_customizations rc
    join public.provider_customization_options o on o.id = rc.customization_option_id
    join public.provider_customization_groups g on g.id = o.customization_group_id
    where rc.response_item_id = v_item_id
      and g.menu_component_id = v_component_id
      and g.maximum_selections is not null
    group by g.id, g.maximum_selections
    having count(*) > g.maximum_selections
    limit 1;
    if found then
      raise exception 'customization limit exceeded' using errcode = 'PRLIM';
    end if;
  end loop;

  -- An override must leave a NON-EMPTY order (mirrors confirm_provider_response's
  -- PREMP, pmp_10): a provider_overridden response folds into the 'confirmed' census
  -- bucket, so an empty override would inflate the confirmed count yet contribute no
  -- roster lines. To clear a member's order the owner cancels it, not override-to-empty.
  -- Checked after the rebuild as a defense-in-depth backstop to the service-layer
  -- non-empty validation; raising here rolls back the status flip + item deletes.
  perform 1 from public.provider_member_response_items
  where response_id = p_response_id limit 1;
  if not found then
    raise exception 'override leaves an empty order' using errcode = 'PREMP';
  end if;

  -- Mark the day's CURRENT batch stale (ADR-11): the roster no longer matches the
  -- responses; the owner regenerates explicitly. The revision row is kept (immutable).
  update public.provider_preparation_batches
  set status = 'stale'
  where menu_day_id = v_menu_day_id and status = 'current'
  returning id into v_stale_batch;

  -- Audit event (UC-OVERRIDE-001 step 7, contract 03 § 9). Written directly here (the
  -- emit_provider_event helper + notification fan-out is MP-A-170); old_value preserves
  -- the prior order, new_value records the reason + new status.
  insert into public.provider_activity_events (
    provider_id, actor_user_id, event_type, entity_type, entity_id, old_value, new_value
  ) values (
    v_provider_id, v_user_id, 'provider_override_applied', 'provider_member_response',
    p_response_id, v_old_value,
    jsonb_build_object('reason', v_reason, 'status', 'provider_overridden',
                       'staleBatchId', v_stale_batch)
  );

  return jsonb_build_object(
    'responseId', p_response_id,
    'menuDayId', v_menu_day_id,
    'status', 'provider_overridden',
    'staleBatchId', v_stale_batch
  );
end;
$$;

revoke execute on function public.provider_override_response(uuid, text, jsonb) from public, anon;
grant  execute on function public.provider_override_response(uuid, text, jsonb) to authenticated, service_role;

-- ═══════════════════════════ regenerate_provider_batch ═════════════════════════════
-- Returns a jsonb batch summary the route serves directly:
--   { batchId, menuDayId, revision, status: "current", generatedAt, emailStatus,
--     totals: { confirmed, autoAccepted, cancelled, noResponse } }
create or replace function public.regenerate_provider_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id          uuid := auth.uid();
  v_provider_id      uuid;
  v_menu_day_id      uuid;
  v_next_revision    integer;
  v_new_batch_id     uuid;
  v_generated_at     timestamptz;
  v_active_customers integer;
  v_confirmed        integer;
  v_auto_accepted    integer;
  v_cancelled        integer;
  v_overridden       integer;
  v_no_response      integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- Resolve the batch → its provider + menu day (unlocked), so the day lock comes first.
  select pb.provider_id, pb.menu_day_id
    into v_provider_id, v_menu_day_id
  from public.provider_preparation_batches pb
  where pb.id = p_batch_id;
  if not found then
    raise exception 'batch not found' using errcode = 'P0002';
  end if;

  if not public.is_provider_owner(v_provider_id) then
    raise exception 'provider owner required' using errcode = 'PROWN';
  end if;

  -- Lock the day so a concurrent override (which also marks batches stale) or a second
  -- regenerate serializes — guaranteeing the revision number stays gap-free and exactly
  -- one 'current' revision exists (the uq_provider_preparation_batches_one_current index
  -- is the backstop).
  perform 1 from public.provider_menu_days md where md.id = v_menu_day_id for update;

  -- Next revision = max existing + 1 (a day always has ≥ revision 1 from the cutoff).
  select max(pb.revision) + 1 into v_next_revision
  from public.provider_preparation_batches pb
  where pb.menu_day_id = v_menu_day_id;

  -- Supersede the current revision (ADR-11: kept, immutable — only its status flips).
  update public.provider_preparation_batches
  set status = 'stale'
  where menu_day_id = v_menu_day_id and status = 'current';

  -- Recompute the census over ACTIVE-member responses by current status. A
  -- provider_overridden response is a corrected order that IS prepared, so it folds into
  -- the confirmed bucket (the DTO totals have no separate "overridden" count); this keeps
  -- numerators ⊆ the active-customer denominator. At revision 1 there are no overridden
  -- rows, so this matches the cutoff census — consistent across revisions.
  -- DUPLICATED LOGIC: this census mirrors the cutoff's (pmp_11) inline census, extended
  -- with the provider_overridden bucket. Consolidating both into one shared census helper
  -- re-touches the shipped cutoff RPC, so it is deferred and tracked as tech debt in
  -- ADO #38. Keep this and pmp_11's census in sync.
  select count(*) into v_active_customers
  from public.provider_memberships m
  where m.provider_id = v_provider_id and m.role = 'customer' and m.status = 'active';

  select
    count(*) filter (where r.status = 'confirmed'),
    count(*) filter (where r.status = 'auto_accepted'),
    count(*) filter (where r.status = 'cancelled'),
    count(*) filter (where r.status = 'provider_overridden')
  into v_confirmed, v_auto_accepted, v_cancelled, v_overridden
  from public.provider_member_responses r
  join public.provider_memberships m
    on m.provider_id = r.provider_id
   and m.user_id = r.member_user_id
   and m.role = 'customer'
   and m.status = 'active'
  where r.menu_day_id = v_menu_day_id;

  v_confirmed   := v_confirmed + v_overridden;
  v_no_response := greatest(0, v_active_customers - v_confirmed - v_auto_accepted - v_cancelled);

  -- New current revision. email_status NULL — regenerate does NOT auto-resend the
  -- summary email (UC-OVERRIDE-002 important rule); a resend is the explicit MP-A-161
  -- path. source_response_watermark = now(): every response folded in is at-or-before
  -- now, so a later override re-stamping updated_at is detectable as making this stale.
  insert into public.provider_preparation_batches (
    provider_id, menu_day_id, revision, status,
    total_confirmed, total_auto_accepted, total_cancelled, total_no_response,
    source_response_watermark, email_status
  ) values (
    v_provider_id, v_menu_day_id, v_next_revision, 'current',
    v_confirmed, v_auto_accepted, v_cancelled, v_no_response,
    pg_catalog.now(), null
  ) returning id, generated_at into v_new_batch_id, v_generated_at;

  perform public.insert_provider_batch_lines(v_new_batch_id, v_menu_day_id);

  insert into public.provider_activity_events (
    provider_id, actor_user_id, event_type, entity_type, entity_id, old_value, new_value
  ) values (
    v_provider_id, v_user_id, 'provider_batch_generated', 'provider_preparation_batch',
    v_new_batch_id, null,
    jsonb_build_object('revision', v_next_revision, 'menuDayId', v_menu_day_id)
  );

  return jsonb_build_object(
    'batchId', v_new_batch_id,
    'menuDayId', v_menu_day_id,
    'revision', v_next_revision,
    'status', 'current',
    'generatedAt', v_generated_at,
    'emailStatus', null,
    'totals', jsonb_build_object(
      'confirmed', v_confirmed,
      'autoAccepted', v_auto_accepted,
      'cancelled', v_cancelled,
      'noResponse', v_no_response
    )
  );
end;
$$;

revoke execute on function public.regenerate_provider_batch(uuid) from public, anon;
grant  execute on function public.regenerate_provider_batch(uuid) to authenticated, service_role;
