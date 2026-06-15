-- PMP-16 (ADO #38) · Consolidate response-derivation + batch-census into shared SQL.
--
-- Tech-debt forward-fix of code-review finding 2 on PR #43 (MP-A-150). Two blocks of
-- logic were copied across the shipped response/batch RPCs and flagged with
-- "DUPLICATED LOGIC … ADO #38" sync comments:
--
--   1) Response item derivation — the per-item derive+validate+insert loop in
--      save_provider_response (pmp_10) was copied near-verbatim into
--      provider_override_response (pmp_12). Both derive quantity/unit/spice/salt from
--      the published menu config (§11.6 — never client-trusted), validate the
--      alternative + customization choices, and rebuild the item/customization tree.
--   2) Batch census — the active-customer census in process_provider_cutoff (pmp_11/11b)
--      was copied into regenerate_provider_batch (pmp_12), the latter extended with a
--      provider_overridden bucket folded into confirmed.
--
-- This migration extracts each into ONE shared SECURITY DEFINER routine and rewires all
-- callers via `create or replace` (forward-fix, design/04 § 8 — no destructive drop; a
-- fresh DB applies pmp_10…pmp_12 then this and lands on the consolidated definitions; an
-- existing DB just re-points the four functions and gains the two helpers):
--
--   • derive_provider_response_items(response, menu_day, items) — the shared §11.6
--     derivation loop. The caller is responsible for the surrounding transaction state
--     it always owned (day lock, membership/owner gate, response-shell upsert, and
--     DELETE of the existing item tree); this routine only (re)builds the items +
--     customizations and raises the same PRALT/PRCUS/PRLIM the inline loops did.
--   • census_provider_responses(provider, menu_day) — the shared census. Numerators JOIN
--     active 'customer' membership (so a since-removed member is excluded, matching the
--     active-customer denominator); a provider_overridden response folds into the
--     confirmed bucket. At CUTOFF there are zero overridden rows (override is a post-lock
--     action), so the fold is a no-op there and the cutoff census is byte-for-byte
--     unchanged — regenerate keeps the fold it always had. no_response is the clamped
--     remainder, identical to both inline copies.
--
-- BEHAVIOUR IS PRESERVED. This is a pure structural consolidation: the derivation and
-- census produce the same rows/counts/errors as before; only the duplicate source is
-- removed. Proven by the e2e RLS/integration suite (save gating, cutoff idempotency,
-- override→stale→regenerate revision N+1) plus rolled-back MCP probes.
--
-- Hardening (mirrors pmp_8…pmp_12): SECURITY DEFINER, search_path pinned to '' with
-- fully-qualified names, auth.uid() schema-qualified, now() from pg_catalog. The two
-- helpers are internal seams called only from the already-owner/member-gated RPCs, so
-- EXECUTE is revoked from public/anon/authenticated and granted to service_role only —
-- the SECURITY DEFINER callers run as the function owner and reach them regardless (the
-- same posture as insert_provider_batch_lines ← regenerate_provider_batch, pmp_12). The
-- four rewired RPCs keep their existing grants (re-emitted below for clarity).
--
-- Rollback: re-run pmp_10/pmp_11b/pmp_12 to restore the inline bodies, then drop the two
-- helpers. No table/row changes here.

-- ═══════════════════ derive_provider_response_items (shared §11.6 loop) ═══════════════
-- Rebuild ONE response's item + customization tree from the published menu config. The
-- caller has already cleared the prior item tree (DELETE … where response_id = …) and
-- holds the menu-day lock. Quantity + unit are SERVER-DERIVED from the component default
-- or an ACTIVE alternative (anything else → PRALT, blocking a cross-provider item);
-- customizations must belong to a group on the same component and stay within the
-- provider's limits (PRCUS / PRLIM, BR-010). Spice/salt are honoured only where the
-- component supports them (an unsupported value is dropped, never an error).
create or replace function public.derive_provider_response_items(
  p_response_id uuid,
  p_menu_day_id uuid,
  p_items       jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
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
  for v_item in
    select e from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
  loop
    v_component_id := (v_item->>'menuComponentId')::uuid;
    v_selected     := (v_item->>'selectedCatalogItemId')::uuid;

    -- The component must be on THIS menu day (blocks a cross-provider component).
    select c.default_catalog_item_id, c.default_quantity, c.canonical_unit,
           c.supports_spice_level, c.supports_salt_level
      into v_comp
    from public.provider_menu_components c
    where c.id = v_component_id and c.menu_day_id = p_menu_day_id;
    if not found then
      raise exception 'invalid menu alternative' using errcode = 'PRALT';
    end if;

    -- Quantity + unit are SERVER-DERIVED (client values ignored, § 11.6): the component
    -- default, or an ACTIVE alternative on that component. Anything else (incl. a
    -- cross-provider catalog item) is invalid_menu_alternative.
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

    -- Spice / salt honoured only where the component supports them (server-derived
    -- eligibility): an unsupported value is dropped, never an error.
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

    -- ── Customizations on this line ──
    for v_cust in
      select e from jsonb_array_elements(coalesce(v_item->'customizations', '[]'::jsonb)) e
    loop
      v_option_id := (v_cust->>'customizationOptionId')::uuid;

      -- The option must be active and belong to a group on THIS component.
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
        -- The increment count is the member's choice but is bounded (BR-010).
        v_cust_qty := coalesce((v_cust->>'quantity')::numeric, 0);
        if v_cust_qty <= 0 then
          raise exception 'invalid customization' using errcode = 'PRCUS';
        end if;
        if (v_opt.maximum_selections is not null and v_cust_qty > v_opt.maximum_selections)
           or (v_opt.maximum_quantity is not null and v_cust_qty > v_opt.maximum_quantity) then
          raise exception 'customization limit exceeded' using errcode = 'PRLIM';
        end if;
      else
        -- single_select / multi_select / boolean / text_note carry no increment.
        v_cust_qty := null;
      end if;

      insert into public.provider_member_response_customizations (
        response_item_id, customization_option_id, quantity
      ) values (v_item_id, v_option_id, v_cust_qty);
    end loop;

    -- Per-group selection-count cap (e.g. single_select / boolean ≤ 1, multi_select ≤ N):
    -- more options chosen in a group than its maximum is over the limit. One aggregate
    -- pass over this line's just-inserted customizations (group → count) instead of a
    -- COUNT(*) per group, so the menu-day FOR UPDATE lock is held for a single query.
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
end;
$$;

revoke execute on function public.derive_provider_response_items(uuid, uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.derive_provider_response_items(uuid, uuid, jsonb) to service_role;

-- ═══════════════════════ census_provider_responses (shared census) ═══════════════════
-- The contract 03 § 10 totals for a menu day: the denominator is the provider's ACTIVE
-- customers; each falls into exactly one of confirmed / auto_accepted / cancelled /
-- no_response. The numerator query JOINS active 'customer' membership so a response from
-- a SINCE-REMOVED member is excluded from the buckets too (numerators ⊆ denominator, so
-- no_response can never be the greatest(0,…)-clamped negative an all-responses count
-- could produce — pmp_11b finding #1). A provider_overridden response is a corrected
-- order that IS prepared, so it folds into confirmed; the DTO has no separate overridden
-- count. At cutoff there are no overridden rows yet → identical to the old inline census.
create or replace function public.census_provider_responses(
  p_provider_id uuid,
  p_menu_day_id uuid
) returns table (
  active_customers integer,
  confirmed        integer,
  auto_accepted    integer,
  cancelled        integer,
  no_response      integer
)
language sql
security definer
set search_path = ''
as $$
  with active as (
    select count(*)::integer as n
    from public.provider_memberships m
    where m.provider_id = p_provider_id
      and m.role = 'customer'
      and m.status = 'active'
  ),
  buckets as (
    select
      count(*) filter (where r.status in ('confirmed', 'provider_overridden'))::integer as confirmed,
      count(*) filter (where r.status = 'auto_accepted')::integer                       as auto_accepted,
      count(*) filter (where r.status = 'cancelled')::integer                           as cancelled
    from public.provider_member_responses r
    join public.provider_memberships m
      on m.provider_id = r.provider_id
     and m.user_id = r.member_user_id
     and m.role = 'customer'
     and m.status = 'active'
    where r.menu_day_id = p_menu_day_id
  )
  select a.n,
         b.confirmed,
         b.auto_accepted,
         b.cancelled,
         greatest(0, a.n - b.confirmed - b.auto_accepted - b.cancelled)::integer
  from active a cross join buckets b;
$$;

revoke execute on function public.census_provider_responses(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.census_provider_responses(uuid, uuid) to service_role;

-- ════════════════════════ save_provider_response (rewired) ═══════════════════════════
-- Unchanged from pmp_10 except the inline §11.6 derivation loop is now the shared
-- derive_provider_response_items call. Header semantics, lock discipline, error codes,
-- and grants are identical.
create or replace function public.save_provider_response(
  p_menu_day_id      uuid,
  p_expected_version integer,
  p_member_note      text,
  p_items            jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id      uuid := auth.uid();
  v_provider_id  uuid;
  v_day_status   public.provider_menu_status;
  v_cutoff_at    timestamptz;
  v_locked_at    timestamptz;
  v_mstatus      public.provider_membership_status;
  v_response_id  uuid;
  v_cur_version  integer;
  v_cur_status   public.provider_response_status;
  v_new_status   public.provider_response_status;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- Lock the menu day: serializes a save against the cutoff processor (which also
  -- locks the day) so a change can never slip in mid-cutoff.
  select md.provider_id, md.status, md.cutoff_at, md.locked_at
    into v_provider_id, v_day_status, v_cutoff_at, v_locked_at
  from public.provider_menu_days md
  where md.id = p_menu_day_id
  for update;
  if not found then
    raise exception 'menu day not found' using errcode = 'P0002';
  end if;

  -- Active (approved) membership required (contract 03 § 3: 403 reasons). 'invited'
  -- is the pre-acceptance state: NOT in the IN-list, so v_mstatus stays null →
  -- membership_required (PRMEM). 'awaiting_approval' → approval_required (PRAPP).
  select m.status into v_mstatus
  from public.provider_memberships m
  where m.provider_id = v_provider_id
    and m.user_id = v_user_id
    and m.status in ('awaiting_approval', 'active')
  limit 1;
  if v_mstatus is null then
    raise exception 'membership required' using errcode = 'PRMEM';
  elsif v_mstatus <> 'active' then
    raise exception 'approval required' using errcode = 'PRAPP';
  end if;

  -- Menu must be open for responses: published + not locked + cutoff in the future.
  if v_day_status = 'locked' or v_locked_at is not null then
    raise exception 'menu locked' using errcode = 'PRLCK';
  elsif v_day_status <> 'published' then
    raise exception 'menu not published' using errcode = 'PRPUB';
  end if;
  if v_cutoff_at <= pg_catalog.now() then
    raise exception 'cutoff passed' using errcode = 'PRCUT';
  end if;

  -- Optimistic concurrency + upsert the response shell (lock the row if present).
  select r.id, r.version, r.status
    into v_response_id, v_cur_version, v_cur_status
  from public.provider_member_responses r
  where r.menu_day_id = p_menu_day_id
    and r.member_user_id = v_user_id
  for update;

  if found then
    -- A locked / auto-accepted / overridden response is immutable to the member.
    if v_cur_status in ('locked', 'auto_accepted', 'provider_overridden') then
      raise exception 'response locked' using errcode = 'PRRLK';
    end if;
    if p_expected_version is null or p_expected_version <> v_cur_version then
      raise exception 'stale version' using errcode = 'PRVER',
        hint = v_cur_version::text;
    end if;
    -- Editing a confirmed response keeps it confirmed; otherwise (draft / revived
    -- cancelled) it is a draft until the member confirms (UC-RESPONSE-006/007).
    v_new_status := case when v_cur_status = 'confirmed' then 'confirmed'::public.provider_response_status
                         else 'draft'::public.provider_response_status end;
    update public.provider_member_responses
    set member_note  = p_member_note,
        status       = v_new_status,
        cancelled_at = null,
        version      = v_cur_version + 1
    where id = v_response_id;
    -- Rebuild the tree from scratch (child rows cascade on the item delete).
    delete from public.provider_member_response_items where response_id = v_response_id;
  else
    -- No response yet: the client must not claim a PRIOR version. The empty
    -- "no response yet" DTO carries version 0, so a client that echoes it back sends
    -- expectedVersion 0 on its FIRST save — treat 0 (like null) as "no prior version".
    if p_expected_version is not null and p_expected_version <> 0 then
      raise exception 'stale version' using errcode = 'PRVER', hint = '0';
    end if;
    insert into public.provider_member_responses (
      provider_id, menu_day_id, member_user_id, status, member_note, version
    ) values (
      v_provider_id, p_menu_day_id, v_user_id, 'draft', p_member_note, 1
    ) returning id into v_response_id;
  end if;

  -- ── Derive + validate each response line from the menu config (shared §11.6 loop). ──
  perform public.derive_provider_response_items(v_response_id, p_menu_day_id, p_items);

  return v_response_id;
end;
$$;

revoke execute on function public.save_provider_response(uuid, integer, text, jsonb) from public, anon;
grant  execute on function public.save_provider_response(uuid, integer, text, jsonb) to authenticated;

-- ════════════════════════ provider_override_response (rewired) ═══════════════════════
-- Unchanged from pmp_12 except the inline §11.6 derivation loop is now the shared
-- derive_provider_response_items call. Owner gate, lock order, override semantics
-- (status flip, reason, audit old_value, batch-stale), error codes, and grants identical.
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

  -- Owner-only (BR-007).
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

  -- Derive + validate each corrected line from the menu config (shared §11.6 loop —
  -- quantity/unit are SERVER-DERIVED, never trusted from the owner's payload; only the
  -- catalog/customization SELECTION is the owner's choice, constrained to the menu).
  perform public.derive_provider_response_items(p_response_id, v_menu_day_id, p_items);

  -- An override must leave a NON-EMPTY order (mirrors confirm's PREMP, pmp_10): a
  -- provider_overridden response folds into the 'confirmed' census bucket, so an empty
  -- override would inflate the confirmed count yet contribute no roster lines. To clear
  -- a member's order the owner cancels it, not override-to-empty. Checked after the
  -- rebuild; raising here rolls back the status flip + item deletes.
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

  -- Audit event (UC-OVERRIDE-001 step 7, contract 03 § 9). old_value preserves the prior
  -- order, new_value records the reason + new status.
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

-- ════════════════════════ process_provider_cutoff (rewired) ══════════════════════════
-- Unchanged from pmp_11b except the inline census is now the shared
-- census_provider_responses call (byte-for-byte equal here — no overridden rows exist at
-- cutoff). Auto-accept, day lock, batch rev 1 + inline aggregate lines, and the
-- service_role-only grant are identical.
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
  v_confirmed        integer;
  v_auto_accepted    integer;
  v_cancelled        integer;
  v_no_response      integer;
begin
  -- Lock the day FIRST — the same day→response lock order as save/confirm/cancel
  -- (pmp_10), so a member mutation in flight serializes against the cutoff.
  select md.provider_id, md.status, md.cutoff_at, md.locked_at
    into v_provider_id, v_status, v_cutoff_at, v_locked_at
  from public.provider_menu_days md
  where md.id = p_menu_day_id
  for update;
  if not found then
    raise exception 'menu day not found' using errcode = 'P0002';
  end if;

  -- Idempotent replay (UC-CUTOFF-002 / ADR-10): an already-locked day was already
  -- processed — return its current batch revision and do NO new work.
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
  -- Every ACTIVE customer with a consented auto-accept subscription who has NOT confirmed
  -- or cancelled gets the PUBLISHED DEFAULT PACKAGE filled in on their behalf. The whole
  -- day is locked FOR UPDATE above, so four set statements replace a per-row loop.
  if v_component_count > 0 then
    -- (a) Replace each eligible member's un-confirmed DRAFT (BR-001) with the default
    --     package. Already-decided rows are not 'draft', so they are left untouched.
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

    -- (c) Rebuild the item tree for every auto_accepted response of this day, then fan
    --     the default package across them.
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
  update public.provider_member_responses
  set locked_at = pg_catalog.now()
  where menu_day_id = p_menu_day_id and status = 'confirmed' and locked_at is null;

  -- ── 3) Census (contract 03 § 10 totals) — shared census routine. ──
  -- At cutoff there are no provider_overridden rows yet, so this is identical to the
  -- former inline census (the overridden bucket the shared routine folds in is empty).
  select c.confirmed, c.auto_accepted, c.cancelled, c.no_response
    into v_confirmed, v_auto_accepted, v_cancelled, v_no_response
  from public.census_provider_responses(v_provider_id, p_menu_day_id) c;

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
  -- roster, keyed (catalog_item, canonical_unit, spice, salt). The cutoff keeps this
  -- aggregate inline (it runs in the pg_cron tx); regenerate uses the shared
  -- insert_provider_batch_lines helper, which targets the identical key.
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

-- ════════════════════════ regenerate_provider_batch (rewired) ════════════════════════
-- Unchanged from pmp_12 except the inline census (+ the overridden fold) is now the
-- shared census_provider_responses call, which folds provider_overridden into confirmed
-- itself. Revision N+1 supersession (ADR-11), email_status NULL (no auto-resend), shared
-- insert_provider_batch_lines, and grants are identical.
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
  v_confirmed        integer;
  v_auto_accepted    integer;
  v_cancelled        integer;
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
  -- regenerate serializes — the revision number stays gap-free and exactly one 'current'
  -- revision exists (uq_provider_preparation_batches_one_current is the backstop).
  perform 1 from public.provider_menu_days md where md.id = v_menu_day_id for update;

  -- Next revision = max existing + 1 (a day always has ≥ revision 1 from the cutoff).
  select max(pb.revision) + 1 into v_next_revision
  from public.provider_preparation_batches pb
  where pb.menu_day_id = v_menu_day_id;

  -- Supersede the current revision (ADR-11: kept, immutable — only its status flips).
  update public.provider_preparation_batches
  set status = 'stale'
  where menu_day_id = v_menu_day_id and status = 'current';

  -- Recompute the census over ACTIVE-member responses by current status — shared census
  -- routine. A provider_overridden response is a corrected order that IS prepared, so it
  -- folds into the confirmed bucket (done inside the routine); the DTO totals have no
  -- separate "overridden" count. At revision 1 there are no overridden rows, so this
  -- matches the cutoff census — consistent across revisions.
  select c.confirmed, c.auto_accepted, c.cancelled, c.no_response
    into v_confirmed, v_auto_accepted, v_cancelled, v_no_response
  from public.census_provider_responses(v_provider_id, v_menu_day_id) c;

  -- New current revision. email_status NULL — regenerate does NOT auto-resend the summary
  -- email (UC-OVERRIDE-002 important rule); a resend is the explicit MP-A-161 path.
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
