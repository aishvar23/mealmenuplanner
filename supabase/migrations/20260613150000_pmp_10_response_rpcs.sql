-- PMP-10 (MP-A-130) · Member response mutation RPCs: save / confirm / cancel.
--
-- The write half of MP-A-130 (the read half — getMyResponse — shipped with the
-- pmp_5 schema). pmp_5 grants the response tables SELECT only (member self / owner
-- all); EVERY mutation must flow through a SECURITY DEFINER RPC so the server owns
-- the client-never-controlled columns (quantity / canonical_unit / status / version
-- / *_at) and DERIVES quantities from the menu config (design/04 § 9, § 11.6).
--
-- Source of truth: design/planning/meal-provider/04_database_and_rls_plan.md § 5
-- (transactional RPCs), § 9 (field-control); contract 03 § 6 (optimistic
-- concurrency), § 7 (cutoff/lock semantics), § 8 (routes). UC-RESPONSE-001..009.
--
--   • save_provider_response(menu_day, expected_version, member_note, items) —
--     UC-RESPONSE-001..007. Validates the caller is an active (approved) member,
--     the menu day is published + not locked + cutoff_at > now(); checks the
--     optimistic version; then REBUILDS the item/customization tree, deriving
--     quantity + unit from the component default / an active alternative (a
--     selection that is neither is invalid_menu_alternative — UC-RESPONSE-002, and
--     blocks an arbitrary/cross-provider catalog item). Customizations must belong
--     to a group on the same component and stay within the provider's limits
--     (UC-RESPONSE-004/005, BR-010). Editing a confirmed response keeps it
--     confirmed; any other save lands 'draft' until the member confirms
--     (UC-RESPONSE-006). Atomic — any failure rolls back the whole tree (no partial
--     write, UC-RESPONSE-005).
--   • confirm_provider_response(response_id) — UC-RESPONSE-001/007: draft → confirmed
--     (idempotent on an already-confirmed response — returns cleanly even after the
--     cutoff, so a retry never 409s), version++. Requires ≥ 1 line. A CANCELLED
--     response is rejected (PRCAN): the member must revive it through save (which
--     re-derives quantities) so a stale item tree can't re-enter the batch.
--   • cancel_provider_response(response_id) — UC-RESPONSE-008: → cancelled, version++.
--     A cancelled response is excluded from the batch but stays auditable. Idempotent
--     on an already-cancelled response (returns cleanly even after the cutoff).
--
-- Lock discipline: all three RPCs take row locks in ONE order — menu day, then the
-- member response — so concurrent save/confirm/cancel on the same rows can't deadlock
-- (AB/BA). confirm/cancel resolve the response's menu_day_id with an unlocked read
-- first so the day lock can be taken before the response lock.
--
-- Error semantics (contract 03 § 3): each provider failure is raised with a custom
-- 5-char SQLSTATE in the 'PR' class which the response-write.ts service maps to the
-- existing ERROR_CODES + a details.reason discriminator — no new top-level code.
-- stale_version carries the authoritative current version via RAISE … USING HINT.
--   PRMEM provider_membership_required   PRAPP provider_approval_required (403)
--   PRPUB menu_not_published   PRLCK menu_already_locked   PRCUT cutoff_passed
--   PRRLK response_already_locked   PRVER stale_version (hint=currentVersion) (409)
--   PRCAN response_cancelled (confirm of a cancelled response) (409)
--   PRALT invalid_menu_alternative   PRCUS invalid_customization
--   PRLIM customization_limit_exceeded   PREMP empty-response (confirm) (400)
--
-- Hardening (mirrors pmp_8/pmp_9): search_path pinned to '' with fully-qualified
-- names; auth.uid() schema-qualified; now() from pg_catalog; EXECUTE revoked from
-- public/anon and granted only to authenticated (anon has no session → auth.uid()
-- null → the membership check fails closed). Each RPC acts only on the caller's own
-- response, gated by an explicit member_user_id / membership check.
--
-- Rollback: drop the three functions (response rows stay; they were authored only
-- through these RPCs and remain readable under pmp_5 RLS).

-- ════════════════════════ save_provider_response ════════════════════════════
-- Returns the (created or updated) response id. The route re-reads the full DTO
-- via getMyResponse (RLS self-scoped), so the return is only an existence signal.
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
  -- is the pre-acceptance state (the user has not accepted the invite, so is not yet
  -- a member): it is NOT in the IN-list, so v_mstatus stays null → membership_required
  -- (PRMEM), not approval_required. Only an accepted-but-not-approved member
  -- ('awaiting_approval') gets approval_required (PRAPP).
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
    -- expectedVersion 0 on its FIRST save — treat 0 (like null) as "no prior version"
    -- rather than a stale conflict (a real response always starts at version 1).
    if p_expected_version is not null and p_expected_version <> 0 then
      raise exception 'stale version' using errcode = 'PRVER', hint = '0';
    end if;
    insert into public.provider_member_responses (
      provider_id, menu_day_id, member_user_id, status, member_note, version
    ) values (
      v_provider_id, p_menu_day_id, v_user_id, 'draft', p_member_note, 1
    ) returning id into v_response_id;
  end if;

  -- ── Derive + validate each response line from the menu config ──
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

    -- Quantity + unit are SERVER-DERIVED (client values ignored, § 11.6): the
    -- component default, or an ACTIVE alternative on that component. Anything else
    -- (incl. a cross-provider catalog item) is invalid_menu_alternative.
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
      v_response_id, v_component_id, v_selected,
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

    -- Per-group selection-count cap (e.g. single_select / boolean ≤ 1, multi_select
    -- ≤ N): more options chosen in a group than its maximum is over the limit. One
    -- aggregate pass over this line's just-inserted customizations (group → count)
    -- instead of a COUNT(*) per group, so the menu-day FOR UPDATE lock is held for
    -- a single query rather than N.
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

  return v_response_id;
end;
$$;

revoke execute on function public.save_provider_response(uuid, integer, text, jsonb) from public, anon;
grant  execute on function public.save_provider_response(uuid, integer, text, jsonb) to authenticated;

-- ═══════════════════════ confirm_provider_response ══════════════════════════
-- draft → confirmed (idempotent replay on an already-confirmed response). Returns
-- the response's menu_day_id so the route can re-read the full DTO via getMyResponse.
create or replace function public.confirm_provider_response(p_response_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id     uuid := auth.uid();
  v_menu_day_id uuid;
  v_status      public.provider_response_status;
  v_version     integer;
  v_day_status  public.provider_menu_status;
  v_cutoff_at   timestamptz;
  v_locked_at   timestamptz;
  v_item_count  integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- Resolve the caller's OWN response to its menu day WITHOUT locking, so we can take
  -- the day lock FIRST and keep ONE consistent lock order (day → response) across
  -- save/confirm/cancel. (save locks day-then-response; if confirm locked
  -- response-then-day, two concurrent ops on the same rows could deadlock AB/BA.)
  select r.menu_day_id into v_menu_day_id
  from public.provider_member_responses r
  where r.id = p_response_id and r.member_user_id = v_user_id;
  if not found then
    raise exception 'response not found' using errcode = 'P0002';
  end if;

  -- 1) Lock the day (same first lock as save).
  select md.status, md.cutoff_at, md.locked_at
    into v_day_status, v_cutoff_at, v_locked_at
  from public.provider_menu_days md
  where md.id = v_menu_day_id
  for update;
  if not found then
    raise exception 'response not found' using errcode = 'P0002';
  end if;

  -- 2) Lock + re-read the response (second lock; caller-scoped).
  select r.status, r.version
    into v_status, v_version
  from public.provider_member_responses r
  where r.id = p_response_id and r.member_user_id = v_user_id
  for update;
  if not found then
    raise exception 'response not found' using errcode = 'P0002';
  end if;

  -- A locked / auto-accepted / overridden response is immutable to the member.
  if v_status in ('locked', 'auto_accepted', 'provider_overridden') then
    raise exception 'response locked' using errcode = 'PRRLK';
  end if;

  -- Idempotent replay BEFORE the cutoff/lock gate: an already-confirmed response is a
  -- no-op and returns cleanly even after the menu closed, so a client retry around
  -- the cutoff never surfaces a spurious cutoff_passed for work already done.
  if v_status = 'confirmed' then
    return v_menu_day_id;
  end if;

  -- A cancelled response can't be confirmed directly — the member must revive it via
  -- save, which re-derives quantities, so a stale (pre-cancel) item tree can never
  -- re-enter the batch. Raised regardless of the cutoff window (clearer than cutoff).
  if v_status = 'cancelled' then
    raise exception 'response cancelled' using errcode = 'PRCAN';
  end if;

  -- The response is a draft → a REAL state change, gated by the open-menu window
  -- (cutoff + lock, contract 03 § 7).
  if v_day_status = 'locked' or v_locked_at is not null then
    raise exception 'menu locked' using errcode = 'PRLCK';
  end if;
  if v_cutoff_at <= pg_catalog.now() then
    raise exception 'cutoff passed' using errcode = 'PRCUT';
  end if;

  -- Can't confirm an empty response (nothing to prepare).
  select count(*) into v_item_count
  from public.provider_member_response_items
  where response_id = p_response_id;
  if v_item_count = 0 then
    raise exception 'nothing to confirm' using errcode = 'PREMP';
  end if;

  update public.provider_member_responses
  set status       = 'confirmed',
      confirmed_at  = pg_catalog.now(),
      cancelled_at  = null,
      version       = v_version + 1
  where id = p_response_id;

  return v_menu_day_id;
end;
$$;

revoke execute on function public.confirm_provider_response(uuid) from public, anon;
grant  execute on function public.confirm_provider_response(uuid) to authenticated;

-- ═══════════════════════ cancel_provider_response ═══════════════════════════
-- → cancelled (excluded from the batch, still auditable; UC-RESPONSE-008). Returns
-- the menu_day_id for the route's re-read. Idempotent on an already-cancelled row.
create or replace function public.cancel_provider_response(p_response_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id     uuid := auth.uid();
  v_menu_day_id uuid;
  v_status      public.provider_response_status;
  v_version     integer;
  v_day_status  public.provider_menu_status;
  v_cutoff_at   timestamptz;
  v_locked_at   timestamptz;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- Same lock discipline as confirm: resolve the menu day unlocked, then lock
  -- day → response (one consistent order with save, so no AB/BA deadlock).
  select r.menu_day_id into v_menu_day_id
  from public.provider_member_responses r
  where r.id = p_response_id and r.member_user_id = v_user_id;
  if not found then
    raise exception 'response not found' using errcode = 'P0002';
  end if;

  -- 1) Lock the day.
  select md.status, md.cutoff_at, md.locked_at
    into v_day_status, v_cutoff_at, v_locked_at
  from public.provider_menu_days md
  where md.id = v_menu_day_id
  for update;
  if not found then
    raise exception 'response not found' using errcode = 'P0002';
  end if;

  -- 2) Lock + re-read the response (caller-scoped).
  select r.status, r.version
    into v_status, v_version
  from public.provider_member_responses r
  where r.id = p_response_id and r.member_user_id = v_user_id
  for update;
  if not found then
    raise exception 'response not found' using errcode = 'P0002';
  end if;

  if v_status in ('locked', 'auto_accepted', 'provider_overridden') then
    raise exception 'response locked' using errcode = 'PRRLK';
  end if;

  -- Idempotent replay BEFORE the cutoff/lock gate: an already-cancelled response is a
  -- no-op and returns cleanly even after the menu closed (a retry must not 409).
  if v_status = 'cancelled' then
    return v_menu_day_id;
  end if;

  -- Cancelling a draft/confirmed response is a REAL state change, gated by the
  -- open-menu window (cutoff + lock, contract 03 § 7).
  if v_day_status = 'locked' or v_locked_at is not null then
    raise exception 'menu locked' using errcode = 'PRLCK';
  end if;
  if v_cutoff_at <= pg_catalog.now() then
    raise exception 'cutoff passed' using errcode = 'PRCUT';
  end if;

  update public.provider_member_responses
  set status       = 'cancelled',
      cancelled_at  = pg_catalog.now(),
      version       = v_version + 1
  where id = p_response_id;

  return v_menu_day_id;
end;
$$;

revoke execute on function public.cancel_provider_response(uuid) from public, anon;
grant  execute on function public.cancel_provider_response(uuid) to authenticated;
