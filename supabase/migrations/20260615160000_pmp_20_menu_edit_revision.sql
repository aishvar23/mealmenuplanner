-- PMP-20 (MP-A-012E + MP-A-121) · Menu structural-edit guard + revision rebuild writer.
--
-- ADR-7 (#30) is decided = REVISION. The fresh-publish (pmp_18) and create-tree
-- authoring (pmp_19) writers shipped the ADR-7-INDEPENDENT half of MP-A-121 (a
-- brand-new draft day never has responses). This migration ships the EDIT/REVISION
-- half — the MP-A-012E structural-edit guard realised in the writer plus the
-- revision rebuild — now fully unblocked. Source of truth:
-- design/planning/meal-provider/02_architecture_decisions.md ADR-7,
-- design/meal-provider/02_use_case_spec.md UC-MENU-004/005, 03_contracts.md § 5/§ 8.
--
-- ADR-7 policy enforced here. An owner edit on a published menu day, before cutoff:
--   • NON-STRUCTURAL (note only) → applies IN PLACE, regardless of responses
--     (`update_provider_menu_day_note`).
--   • STRUCTURAL (components / alternatives / customizations / cutoff):
--       – NO member response yet (incl. any DRAFT day) → rebuild the tree IN PLACE
--         on the same day (UC-MENU-004; the degenerate "no responses" case ADR-7
--         keeps as the fresh-edit path). Status/id unchanged.
--       – Member responses EXIST → create a NEW revision (rev N+1, UC-MENU-005): a
--         fresh published day for the same date carrying the new tree; every
--         existing response is CARRIED FORWARD and RE-VALIDATED against the new
--         structure (server-derived via the shared §11.6 routine). A response whose
--         line references a removed/changed component or a now-invalid catalog
--         selection is SELECTIVELY INVALIDATED — only the affected line is dropped,
--         and because its order is no longer the one it confirmed the response is
--         reset to `draft` and the member is notified to RE-CONFIRM before cutoff.
--         The prior revision is `archived` + `superseded_at` stamped (kept for
--         audit, invisible to customers); census/prep always read the LATEST
--         revision. The revision is recorded in the provider event fan-out.
--   Revisions are allowed BEFORE CUTOFF ONLY; a locked/archived/cancelled or
--   already-superseded day is not editable.
--
-- Carry-forward of customizations (deliberate, conservative). The base order (which
-- catalog item per component, spice/salt) carries forward; CUSTOMIZATIONS (extras
-- like "extra roti") are NOT silently re-attached across a structural revision — any
-- response that carried a customization is treated as touched, so its line carries
-- but the response resets to `draft` for the member to re-pick add-ons and re-confirm.
-- This keeps the rebuild robust (no chance a tightened limit aborts the owner's edit)
-- while honouring "never silently invalidate" — the member always re-confirms. A
-- finer-grained per-customization carry-forward is a follow-up on #22.
--
-- Schema: a revision dimension on provider_menu_days (additive, ADR-7 migration note):
--   revision (≥1), supersedes_menu_day_id (back-pointer, null on rev 1),
--   superseded_at (stamped on the OLD day when replaced — the read filter for "live").
--
-- DRY: the create-tree build loop (pmp_19) is extracted into the shared
-- `insert_provider_menu_component_tree` helper and `create_provider_menu_day` is
-- rewired to it (forward-fix, design/04 § 8 — like pmp_16's consolidation). The edit
-- + revision writers reuse the SAME helper, so the active+owned catalog check and the
-- name/quantity/unit/spice denormalization can never drift between create and edit.
--
-- Custom SQLSTATEs (mapped in lib/services/provider/menu-edit.ts):
--   MEOWN → provider_owner_required (403) · MESTA → menu_not_editable (409, new reason)
--   MECUT → cutoff_invalid (400) · MAINC → menu_incomplete (400, raised by the shared
--   tree helper, same axis as create/publish).
-- Hardening matches the sibling writers: SECURITY DEFINER, search_path='' with
-- fully-qualified names, auth.uid() schema-qualified, now() from pg_catalog.

-- ════════════════════════════ schema: revision dimension ════════════════════════════
alter table public.provider_menu_days
  add column if not exists revision integer not null default 1,
  add column if not exists supersedes_menu_day_id uuid references public.provider_menu_days (id),
  add column if not exists superseded_at timestamptz;

alter table public.provider_menu_days
  drop constraint if exists provider_menu_day_revision_positive;
alter table public.provider_menu_days
  add constraint provider_menu_day_revision_positive check (revision >= 1);

-- "Live" (not-yet-superseded) day lookup per (provider, date) — backs today/weekly
-- reads which now exclude superseded revisions.
create index if not exists ix_provider_menu_days_live
  on public.provider_menu_days (provider_id, menu_date)
  where superseded_at is null;

-- ════════════════════ shared: insert_provider_menu_component_tree ════════════════════
-- The create-tree build loop EXTRACTED from create_provider_menu_day (pmp_19) so the
-- create + edit + revision writers share one definition. Builds the full component
-- tree (components + alternatives + customization groups/options) for p_menu_day_id
-- from the camelCase builder payload, DENORMALIZING every display field
-- (name/quantity/unit/spice-salt) off the OWNER-PRIVATE catalog at authoring time and
-- enforcing that every default + alternative references an ACTIVE catalog item OWNED
-- by p_provider_id (a miss → MAINC, the same active+owned axis the publish writer's
-- PMINC enforces). The caller owns the surrounding transaction (day row, lock, dedup).
create or replace function public.insert_provider_menu_component_tree(
  p_menu_day_id uuid,
  p_provider_id uuid,
  p_components  jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp        record;
  v_alt         record;
  v_grp         record;
  v_opt         record;
  v_component_id uuid;
  v_group_id    uuid;
  v_ci_name     text;
  v_ci_qty      numeric(10, 3);
  v_ci_unit     text;
  v_ci_spice    boolean;
  v_ci_salt     boolean;
begin
  -- Components, in payload order (ordinality is the fallback sort_order).
  for v_comp in
    select elem, idx
    from pg_catalog.jsonb_array_elements(coalesce(p_components, '[]'::jsonb))
      with ordinality as t(elem, idx)
  loop
    -- Denormalize the default item's display fields off the OWNER-PRIVATE catalog.
    -- A miss = the item is archived, cross-provider, or dangling → MAINC.
    select ci.name, ci.default_quantity, ci.canonical_unit,
           ci.supports_spice_level, ci.supports_salt_level
      into v_ci_name, v_ci_qty, v_ci_unit, v_ci_spice, v_ci_salt
    from public.provider_catalog_items ci
    where ci.id = (v_comp.elem->>'defaultCatalogItemId')::uuid
      and ci.provider_id = p_provider_id
      and ci.is_active;
    if not found then
      raise exception 'menu incomplete' using
        errcode = 'MAINC',
        detail = jsonb_build_array(jsonb_build_object(
          'field', 'components',
          'rule', 'inactive_or_cross_provider_item',
          'componentGroup', v_comp.elem->>'componentGroup',
          'catalogItemId', v_comp.elem->>'defaultCatalogItemId',
          'ref', 'default'
        ))::text;
    end if;

    insert into public.provider_menu_components
      (menu_day_id, component_group, default_catalog_item_id, default_item_name,
       default_quantity, canonical_unit, is_required, supports_spice_level,
       supports_salt_level, sort_order)
    values (
      p_menu_day_id,
      (v_comp.elem->>'componentGroup')::public.provider_component_group,
      (v_comp.elem->>'defaultCatalogItemId')::uuid,
      v_ci_name, v_ci_qty, v_ci_unit,
      coalesce((v_comp.elem->>'isRequired')::boolean, true),
      v_ci_spice, v_ci_salt,
      coalesce((v_comp.elem->>'sortOrder')::int, (v_comp.idx - 1)::int)
    )
    returning id into v_component_id;

    -- Alternatives (each id denormalized off the catalog the same way).
    for v_alt in
      select value as item_id
      from pg_catalog.jsonb_array_elements_text(
        coalesce(v_comp.elem->'alternativeCatalogItemIds', '[]'::jsonb)
      )
    loop
      if v_alt.item_id::uuid = (v_comp.elem->>'defaultCatalogItemId')::uuid then
        raise exception 'alternative equals default' using errcode = '23505';
      end if;
      select ci.name, ci.default_quantity, ci.canonical_unit
        into v_ci_name, v_ci_qty, v_ci_unit
      from public.provider_catalog_items ci
      where ci.id = v_alt.item_id::uuid
        and ci.provider_id = p_provider_id
        and ci.is_active;
      if not found then
        raise exception 'menu incomplete' using
          errcode = 'MAINC',
          detail = jsonb_build_array(jsonb_build_object(
            'field', 'components',
            'rule', 'inactive_or_cross_provider_item',
            'componentGroup', v_comp.elem->>'componentGroup',
            'catalogItemId', v_alt.item_id,
            'ref', 'alternative'
          ))::text;
      end if;
      insert into public.provider_menu_alternatives
        (menu_component_id, catalog_item_id, item_name, quantity, canonical_unit)
      values (v_component_id, v_alt.item_id::uuid, v_ci_name, v_ci_qty, v_ci_unit);
    end loop;

    -- Customization groups + their options (the table CHECKs are the cross-field backstop).
    for v_grp in
      select elem, idx
      from pg_catalog.jsonb_array_elements(
        coalesce(v_comp.elem->'customizationGroups', '[]'::jsonb)
      ) with ordinality as t(elem, idx)
    loop
      insert into public.provider_customization_groups
        (menu_component_id, name, customization_type, included_in_price, is_required,
         minimum_selections, maximum_selections, sort_order)
      values (
        v_component_id,
        v_grp.elem->>'name',
        (v_grp.elem->>'customizationType')::public.provider_customization_type,
        coalesce((v_grp.elem->>'includedInPrice')::boolean, true),
        coalesce((v_grp.elem->>'isRequired')::boolean, false),
        coalesce((v_grp.elem->>'minimumSelections')::int, 0),
        nullif(v_grp.elem->>'maximumSelections', '')::int,
        coalesce((v_grp.elem->>'sortOrder')::int, (v_grp.idx - 1)::int)
      )
      returning id into v_group_id;

      for v_opt in
        select elem, idx
        from pg_catalog.jsonb_array_elements(
          coalesce(v_grp.elem->'options', '[]'::jsonb)
        ) with ordinality as t(elem, idx)
      loop
        insert into public.provider_customization_options
          (customization_group_id, code, label, quantity_delta, canonical_unit,
           external_price_label, minimum_quantity, maximum_quantity, sort_order)
        values (
          v_group_id,
          v_opt.elem->>'code',
          v_opt.elem->>'label',
          nullif(v_opt.elem->>'quantityDelta', '')::numeric(10, 3),
          nullif(pg_catalog.btrim(coalesce(v_opt.elem->>'canonicalUnit', '')), ''),
          nullif(pg_catalog.btrim(coalesce(v_opt.elem->>'externalPriceLabel', '')), ''),
          nullif(v_opt.elem->>'minimumQuantity', '')::numeric(10, 3),
          nullif(v_opt.elem->>'maximumQuantity', '')::numeric(10, 3),
          coalesce((v_opt.elem->>'sortOrder')::int, (v_opt.idx - 1)::int)
        );
      end loop;
    end loop;
  end loop;
end;
$$;

revoke execute on function public.insert_provider_menu_component_tree(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.insert_provider_menu_component_tree(uuid, uuid, jsonb)
  to service_role;

-- ════════════════════════ create_provider_menu_day (rewired) ═════════════════════════
-- Unchanged from pmp_19 except the inline component-tree build loop is now the shared
-- insert_provider_menu_component_tree call. Owner gate, advisory lock, duplicate-day
-- check, weekly container, day insert, error codes, and grants are identical.
create or replace function public.create_provider_menu_day(
  p_provider_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor       uuid := (select auth.uid());
  v_menu_date   date;
  v_cutoff_at   timestamptz;
  v_note        text;
  v_week_start  date;
  v_week_end    date;
  v_weekly_id   uuid;
  v_menu_day_id uuid;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if not public.is_provider_owner(p_provider_id) then
    raise exception 'owner required' using errcode = 'MAOWN';
  end if;

  v_menu_date := nullif(pg_catalog.btrim(coalesce(p_payload->>'menuDate', '')), '')::date;
  v_cutoff_at := nullif(pg_catalog.btrim(coalesce(p_payload->>'cutoffAt', '')), '')::timestamptz;
  v_note      := nullif(pg_catalog.btrim(coalesce(p_payload->>'note', '')), '');
  if v_menu_date is null or v_cutoff_at is null then
    raise exception 'menu date/cutoff required' using
      errcode = 'MAINC',
      detail = jsonb_build_array(
        jsonb_build_object(
          'field', case when v_menu_date is null then 'menuDate' else 'cutoffAt' end,
          'rule', 'required'
        )
      )::text;
  end if;

  if pg_catalog.jsonb_array_length(coalesce(p_payload->'components', '[]'::jsonb)) = 0 then
    raise exception 'menu empty' using
      errcode = 'MAINC',
      detail = jsonb_build_array(
        jsonb_build_object('field', 'components', 'rule', 'menu_empty')
      )::text;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_provider_id::text || ':' || v_menu_date::text)::bigint
  );

  if exists (
    select 1 from public.provider_menu_days md
    where md.provider_id = p_provider_id
      and md.menu_date = v_menu_date
      and md.status in ('draft', 'published', 'locked')
  ) then
    raise exception 'menu day already exists' using errcode = 'MADUP';
  end if;

  v_week_start := (pg_catalog.date_trunc('week', v_menu_date::timestamp))::date;
  v_week_end := v_week_start + 6;
  select wm.id into v_weekly_id
  from public.provider_weekly_menus wm
  where wm.provider_id = p_provider_id
    and wm.week_start_date = v_week_start
  order by wm.created_at desc, wm.id
  limit 1;
  if v_weekly_id is null then
    insert into public.provider_weekly_menus
      (provider_id, week_start_date, week_end_date, status, created_by_user_id)
    values (p_provider_id, v_week_start, v_week_end, 'draft', v_actor)
    returning id into v_weekly_id;
  end if;

  insert into public.provider_menu_days
    (weekly_menu_id, provider_id, menu_date, cutoff_at, status, note)
  values (v_weekly_id, p_provider_id, v_menu_date, v_cutoff_at, 'draft', v_note)
  returning id into v_menu_day_id;

  -- Build the full component tree (shared helper — denormalizes off the owner-private
  -- catalog, enforces the active+owned MAINC axis, raises 23505 on a dup alternative).
  perform public.insert_provider_menu_component_tree(
    v_menu_day_id, p_provider_id, p_payload->'components'
  );

  return v_menu_day_id;
end;
$$;

revoke execute on function public.create_provider_menu_day(uuid, jsonb) from public, anon;
grant execute on function public.create_provider_menu_day(uuid, jsonb) to authenticated, service_role;

-- ════════════════════════ update_provider_menu_day_note ══════════════════════════════
-- The NON-STRUCTURAL edit (ADR-7): a note change applies IN PLACE regardless of
-- responses (no revision). Owner-only; allowed while the day is draft/published/locked
-- (a note is harmless even after cutoff); archived/cancelled/superseded → MESTA.
create or replace function public.update_provider_menu_day_note(
  p_menu_day_id uuid,
  p_note        text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider_id uuid;
  v_status      public.provider_menu_status;
  v_superseded  timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select md.provider_id, md.status, md.superseded_at
    into v_provider_id, v_status, v_superseded
  from public.provider_menu_days md
  where md.id = p_menu_day_id
  for update;
  if not found then
    raise exception 'menu day not found' using errcode = 'P0002';
  end if;

  if not public.is_provider_owner(v_provider_id) then
    raise exception 'owner required' using errcode = 'MEOWN';
  end if;

  if v_superseded is not null or v_status in ('archived', 'cancelled') then
    raise exception 'menu not editable' using errcode = 'MESTA';
  end if;

  update public.provider_menu_days
  set note = nullif(pg_catalog.btrim(coalesce(p_note, '')), '')
  where id = p_menu_day_id;
end;
$$;

revoke execute on function public.update_provider_menu_day_note(uuid, text) from public, anon;
grant execute on function public.update_provider_menu_day_note(uuid, text) to authenticated, service_role;

-- ════════════════════════════ edit_provider_menu_day ═════════════════════════════════
-- The STRUCTURAL edit + revision writer (MP-A-012E guard realised + the rebuild). The
-- payload mirrors create (cutoffAt + note + components; menuDate is fixed by the day).
-- Returns the id of the resulting LIVE day — the same id for an in-place edit, the NEW
-- revision's id when a rev N+1 was created (the service reads it back as MenuDayDto).
create or replace function public.edit_provider_menu_day(
  p_menu_day_id uuid,
  p_payload     jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor        uuid := (select auth.uid());
  v_provider_id  uuid;
  v_status       public.provider_menu_status;
  v_menu_date    date;
  v_cutoff_at    timestamptz;
  v_locked_at    timestamptz;
  v_superseded   timestamptz;
  v_weekly_id    uuid;
  v_revision     integer;
  v_new_cutoff   timestamptz;
  v_note         text;
  v_has_responses boolean;
  v_new_day      uuid;
  v_new_rev      integer;
  v_resp         record;
  v_new_resp_id  uuid;
  v_notify       uuid[] := array[]::uuid[];
  v_title        text;
  v_message      text;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- Lock the day: serialize against a concurrent save/cutoff (same day→response order).
  select md.provider_id, md.status, md.menu_date, md.cutoff_at, md.locked_at,
         md.superseded_at, md.weekly_menu_id, md.revision
    into v_provider_id, v_status, v_menu_date, v_cutoff_at, v_locked_at,
         v_superseded, v_weekly_id, v_revision
  from public.provider_menu_days md
  where md.id = p_menu_day_id
  for update;
  if not found then
    raise exception 'menu day not found' using errcode = 'P0002';
  end if;

  -- Owner-only (editing a menu is an authoring action).
  if not public.is_provider_owner(v_provider_id) then
    raise exception 'owner required' using errcode = 'MEOWN';
  end if;

  -- Editable only while draft or published, and not already superseded. A locked /
  -- archived / cancelled / superseded day is terminal — revisions are before-cutoff only.
  if v_superseded is not null
     or v_locked_at is not null
     or v_status not in ('draft', 'published') then
    raise exception 'menu not editable' using errcode = 'MESTA';
  end if;

  -- Parse payload (mirror create's null guards so a direct RPC call surfaces a clean
  -- MAINC/MECUT rather than an opaque cast/NOT-NULL failure).
  v_new_cutoff := nullif(pg_catalog.btrim(coalesce(p_payload->>'cutoffAt', '')), '')::timestamptz;
  v_note       := nullif(pg_catalog.btrim(coalesce(p_payload->>'note', '')), '');
  if v_new_cutoff is null then
    raise exception 'cutoff required' using
      errcode = 'MAINC',
      detail = jsonb_build_array(jsonb_build_object('field', 'cutoffAt', 'rule', 'required'))::text;
  end if;
  if pg_catalog.jsonb_array_length(coalesce(p_payload->'components', '[]'::jsonb)) = 0 then
    raise exception 'menu empty' using
      errcode = 'MAINC',
      detail = jsonb_build_array(jsonb_build_object('field', 'components', 'rule', 'menu_empty'))::text;
  end if;

  -- Revisions/edits are allowed BEFORE CUTOFF ONLY: the NEW cutoff must be in the future,
  -- and a published day whose CURRENT cutoff already passed (awaiting the sweep) is no
  -- longer editable (it would notify customers about an order they can't change).
  if v_new_cutoff <= pg_catalog.now() then
    raise exception 'cutoff in the past' using
      errcode = 'MECUT',
      detail = jsonb_build_array(jsonb_build_object('field', 'cutoffAt', 'rule', 'cutoff_in_past'))::text;
  end if;
  if v_status = 'published' and v_cutoff_at <= pg_catalog.now() then
    raise exception 'menu not editable' using errcode = 'MESTA';
  end if;

  -- Detect whether any LIVE member response (draft/confirmed) exists — a day whose
  -- responses are all cancelled has no order to preserve, so it takes the in-place
  -- branch (UC-MENU-004), not a needless revision. Responses only ever exist on a
  -- published day; a draft never has one. This is the MP-A-012E routing decision.
  select exists (
    select 1 from public.provider_member_responses r
    where r.menu_day_id = p_menu_day_id and r.status in ('draft', 'confirmed')
  ) into v_has_responses;

  -- ── IN-PLACE rebuild (UC-MENU-004 / draft authoring edit / cancelled-only day) ──
  -- No LIVE order to preserve, so the structural change applies on the same day. Any
  -- cancelled responses on the day keep their rows (roster consistency) but their lines
  -- reference the old components via a RESTRICT FK (provider_member_response_items
  -- .menu_component_id), so clear those lines first; then the component tree is deleted
  -- and rebuilt from the payload.
  if not v_has_responses then
    delete from public.provider_member_response_items ri
    using public.provider_member_responses r
    where ri.response_id = r.id and r.menu_day_id = p_menu_day_id;
    delete from public.provider_menu_components where menu_day_id = p_menu_day_id;
    update public.provider_menu_days
    set cutoff_at = v_new_cutoff, note = v_note
    where id = p_menu_day_id;
    perform public.insert_provider_menu_component_tree(
      p_menu_day_id, v_provider_id, p_payload->'components'
    );

    -- Audit only (no customer fan-out — no live order existed).
    perform public.emit_provider_event(
      v_provider_id, 'provider_menu_revised', 'provider_menu_day', p_menu_day_id,
      jsonb_build_object('revision', v_revision, 'inPlace', true),
      jsonb_build_object('revision', v_revision, 'inPlace', true, 'menuDate', v_menu_date),
      null, null, null
    );
    return p_menu_day_id;
  end if;

  -- ── REVISION rebuild (UC-MENU-005 — responses exist) ──
  v_new_rev := v_revision + 1;
  insert into public.provider_menu_days
    (weekly_menu_id, provider_id, menu_date, cutoff_at, status, note, published_at,
     revision, supersedes_menu_day_id)
  values (v_weekly_id, v_provider_id, v_menu_date, v_new_cutoff, 'published', v_note,
          pg_catalog.now(), v_new_rev, p_menu_day_id)
  returning id into v_new_day;

  perform public.insert_provider_menu_component_tree(
    v_new_day, v_provider_id, p_payload->'components'
  );

  -- Carry forward each LIVE (draft/confirmed) response onto the new revision, re-validated
  -- against the new tree. Each prior line is paired to the new component sharing BOTH its
  -- component_group AND its ordinal-within-group (row_number over sort_order,id) — a STABLE
  -- pairing, so two distinct old lines in a repeated group never collapse onto one new
  -- component (which would violate unique(response_id, menu_component_id) and abort the
  -- whole edit). A line is KEPT only when its paired new component exists AND the prior
  -- catalog selection is still that component's new default or an ACTIVE alternative
  -- (quantity/unit are then server-re-derived by the shared §11.6 routine). A response is
  -- "touched" — reset to draft + member notified to re-confirm (ADR-7 "never silently
  -- invalidate") — when ANY of: a line was dropped; a KEPT line's carried spice/salt is no
  -- longer supported by its new component (re-derivation would silently drop it); it
  -- carried a customization (re-pick add-ons); or a now-required new component has no kept
  -- line covering it.
  for v_resp in
    select r.id            as old_resp_id,
           r.member_user_id as member_user_id,
           r.status         as old_status,
           r.member_note    as member_note,
           r.confirmed_at   as confirmed_at,
           r.version        as version,
           remap.items      as items,
           remap.touched    as touched
    from public.provider_member_responses r
    cross join lateral (
      -- Ordinal-within-group for the OLD and NEW component trees (deterministic order).
      with old_ord as (
        select c.id, c.component_group,
               row_number() over (
                 partition by c.component_group order by c.sort_order, c.id
               ) as ord
        from public.provider_menu_components c
        where c.menu_day_id = p_menu_day_id
      ),
      new_ord as (
        select c.id, c.component_group, c.default_catalog_item_id,
               c.supports_spice_level, c.supports_salt_level, c.is_required,
               row_number() over (
                 partition by c.component_group order by c.sort_order, c.id
               ) as ord
        from public.provider_menu_components c
        where c.menu_day_id = v_new_day
      )
      select
        coalesce(
          jsonb_agg(l.item_obj order by l.new_comp) filter (where l.keep),
          '[]'::jsonb
        ) as items,
        coalesce(bool_or(not l.keep), false)
          or coalesce(bool_or(l.drops_pref), false)
          or exists (
            select 1
            from public.provider_member_response_customizations rc
            join public.provider_member_response_items ri2 on ri2.id = rc.response_item_id
            where ri2.response_id = r.id
          )
          or exists (
            -- A now-required new component with no KEPT carried line (same group+ordinal
            -- pairing, selection still valid) is uncovered → the order is incomplete.
            select 1 from new_ord ncr
            where ncr.is_required
              and not exists (
                select 1
                from public.provider_member_response_items ri3
                join old_ord oo3 on oo3.id = ri3.menu_component_id
                where ri3.response_id = r.id
                  and oo3.component_group = ncr.component_group
                  and oo3.ord = ncr.ord
                  and (ri3.selected_catalog_item_id = ncr.default_catalog_item_id
                       or exists (
                         select 1 from public.provider_menu_alternatives a3
                         where a3.menu_component_id = ncr.id
                           and a3.catalog_item_id = ri3.selected_catalog_item_id
                           and a3.is_active
                       ))
              )
          ) as touched
      from (
        select
          nc.id as new_comp,
          (nc.id is not null
            and (ri.selected_catalog_item_id = nc.default_catalog_item_id
                 or exists (
                   select 1 from public.provider_menu_alternatives a
                   where a.menu_component_id = nc.id
                     and a.catalog_item_id = ri.selected_catalog_item_id
                     and a.is_active
                 ))) as keep,
          -- A kept line whose carried spice/salt the new component no longer supports
          -- would lose that choice on re-derivation → mark the response touched.
          (nc.id is not null
            and ((ri.spice_level is not null and not nc.supports_spice_level)
                 or (ri.salt_level is not null and not nc.supports_salt_level))) as drops_pref,
          jsonb_build_object(
            'menuComponentId', nc.id,
            'selectedCatalogItemId', ri.selected_catalog_item_id,
            'spiceLevel', ri.spice_level,
            'saltLevel', ri.salt_level
          ) as item_obj
        from public.provider_member_response_items ri
        join old_ord oo on oo.id = ri.menu_component_id
        -- STABLE pairing: same group AND same ordinal-within-group (never a collapse).
        left join new_ord nc
          on nc.component_group = oo.component_group and nc.ord = oo.ord
        where ri.response_id = r.id
      ) l
    ) remap
    where r.menu_day_id = p_menu_day_id
      and r.status in ('draft', 'confirmed')
  loop
    insert into public.provider_member_responses
      (provider_id, menu_day_id, member_user_id, status, member_note, confirmed_at, version)
    values (
      v_provider_id, v_new_day, v_resp.member_user_id,
      case when v_resp.touched then 'draft'::public.provider_response_status
           else v_resp.old_status end,
      v_resp.member_note,
      -- Untouched confirmed responses keep their ORIGINAL confirmation time (do not
      -- fabricate a new now()); a touched response resets to draft (no confirmed_at).
      case when (not v_resp.touched) and v_resp.old_status = 'confirmed'
           then v_resp.confirmed_at else null end,
      v_resp.version + 1
    )
    returning id into v_new_resp_id;

    -- Re-derive the carried lines server-side (the items only reference valid new-tree
    -- components + selections, so derivation never raises here).
    perform public.derive_provider_response_items(v_new_resp_id, v_new_day, v_resp.items);

    if v_resp.touched then
      v_notify := array_append(v_notify, v_resp.member_user_id);
    end if;
  end loop;

  -- Carry cancelled responses forward as cancelled (no order to rebuild) so the new
  -- revision's census denominator/roster is consistent with the prior one.
  insert into public.provider_member_responses
    (provider_id, menu_day_id, member_user_id, status, cancelled_at, version)
  select v_provider_id, v_new_day, r.member_user_id, 'cancelled', r.cancelled_at, r.version + 1
  from public.provider_member_responses r
  where r.menu_day_id = p_menu_day_id and r.status = 'cancelled';

  -- Archive + stamp the prior revision (kept for audit; customers read only the latest).
  update public.provider_menu_days
  set status = 'archived', superseded_at = pg_catalog.now()
  where id = p_menu_day_id;

  -- Notify ONLY the members whose responses were invalidated (re-confirm before cutoff);
  -- the audit row is always written even when no one needs re-confirmation.
  if array_length(v_notify, 1) > 0 then
    v_title := 'Menu updated — please reconfirm';
    v_message := 'The menu changed and your order needs to be reconfirmed before the cutoff.';
  end if;
  perform public.emit_provider_event(
    v_provider_id, 'provider_menu_revised', 'provider_menu_day', v_new_day,
    jsonb_build_object('previousMenuDayId', p_menu_day_id, 'revision', v_revision),
    jsonb_build_object('revision', v_new_rev, 'menuDate', v_menu_date,
                       'invalidatedCount', coalesce(array_length(v_notify, 1), 0)),
    v_title, v_message, v_notify
  );

  return v_new_day;
end;
$$;

revoke execute on function public.edit_provider_menu_day(uuid, jsonb) from public, anon;
grant execute on function public.edit_provider_menu_day(uuid, jsonb) to authenticated, service_role;
