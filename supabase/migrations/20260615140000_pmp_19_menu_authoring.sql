-- PMP-19 (MP-A-121) · Menu-day AUTHORING create-tree writer.
--
-- The fresh-publish writer landed in pmp_18; this is the OTHER ADR-7-independent
-- half of MP-A-121: the builder's authoring write path. It creates a brand-new
-- DRAFT menu day and its full component tree (components + alternatives +
-- customization groups/options) from one structured builder payload, atomically.
-- A brand-new day has no member responses, so it is orthogonal to the ADR-7 edit-
-- after-response revision machinery (MP-A-012E + the revision rebuild), which lands
-- separately. Source of truth: design/planning/meal-provider/03_contracts.md § 5/§ 8
-- and 04_database_and_rls_plan.md § 2.6–2.11; pmp_4 (schema) + pmp_17 (name denorm).
--
-- DENORMALIZATION (pmp_4 + pmp_17 header notes). A menu component / alternative
-- copies the catalog item's display fields INLINE at authoring time —
--   • component: default_item_name, default_quantity, canonical_unit,
--     supports_spice_level, supports_salt_level (off the default catalog item)
--   • alternative: item_name, quantity, canonical_unit (off its catalog item)
-- — so an approved customer reads a published menu (dish names + spice/salt
-- affordances included) WITHOUT any access to the OWNER-PRIVATE catalog
-- (pcat_select is owner-only). The builder payload therefore carries only the
-- catalog item IDS + structural settings; this writer is the authoring step pmp_4 /
-- pmp_17 reserved for "MP-A-121 authoring which populates these columns".
--
-- The RPC is SECURITY DEFINER (search_path='') because it must read the owner-private
-- catalog to denormalize. It owner-gates, takes a per-(provider, date) advisory lock so
-- two concurrent creates serialize (the partial-unique (provider_id, menu_date) index is
-- deferred on E3 — tracker 05 line 17 — so the lock is the dedup backstop), rejects a
-- second ACTIVE day for the same date (edits route to the future revision path), and
-- enforces that every default + alternative references an ACTIVE catalog item OWNED BY
-- THIS provider (no archived / cross-provider / dangling id) — the same axis the publish
-- writer's PMINC enforces, surfaced here as MAINC. The day + its component tree are built
-- in one function (one transaction): any RAISE rolls the whole tree back, never an orphan.
--
-- Custom SQLSTATEs (mapped in lib/services/provider/menu-authoring.ts):
--   MAOWN → provider_owner_required (403) · MADUP → menu_day_exists (409, new reason)
--   MAINC → menu_incomplete (400, + ValidationIssue[] on the error detail)
-- Returns the new menu day's id; the service reads it back via getMenuDay → MenuDayDto.

drop function if exists public.create_provider_menu_day(uuid, jsonb);
create function public.create_provider_menu_day(
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
  if v_actor is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- Owner-only. Authoring a menu is a write; only the provider owner may.
  if not public.is_provider_owner(p_provider_id) then
    raise exception 'owner required' using errcode = 'MAOWN';
  end if;

  -- menuDate/cutoffAt are required; the service validator gates this with a clean 400,
  -- but guard a null/missing value here so a DIRECT RPC call surfaces MAINC (400)
  -- rather than a NOT-NULL/cast failure that would map to an opaque 500. (A present-
  -- but-malformed string is a misuse the front-door validator already rejects.)
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

  -- A day must have at least one component (the service validator gates this with a
  -- clean 400; this is the defensive backstop — an empty menu is never authorable).
  if pg_catalog.jsonb_array_length(coalesce(p_payload->'components', '[]'::jsonb)) = 0 then
    raise exception 'menu empty' using
      errcode = 'MAINC',
      detail = jsonb_build_array(
        jsonb_build_object('field', 'components', 'rule', 'menu_empty')
      )::text;
  end if;

  -- Serialize concurrent creates for the SAME (provider, date) so the duplicate check
  -- below is race-free even without the (E3-deferred) partial-unique index.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_provider_id::text || ':' || v_menu_date::text)::bigint
  );

  -- One active day per date: a draft/published/locked day already exists → the owner
  -- should EDIT it (the future revision path), not create a duplicate. A cancelled /
  -- archived day does not block a fresh authoring.
  if exists (
    select 1 from public.provider_menu_days md
    where md.provider_id = p_provider_id
      and md.menu_date = v_menu_date
      and md.status in ('draft', 'published', 'locked')
  ) then
    raise exception 'menu day already exists' using errcode = 'MADUP';
  end if;

  -- Find or create the DRAFT weekly container for the ISO week (Mon–Sun) the date
  -- falls in, so sibling days of the same week group under one container. Reuse the
  -- newest matching week for this provider; else create one.
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

  -- The day itself (draft; published_at/locked_at stay null — publishing is pmp_18).
  insert into public.provider_menu_days
    (weekly_menu_id, provider_id, menu_date, cutoff_at, status, note)
  values (v_weekly_id, p_provider_id, v_menu_date, v_cutoff_at, 'draft', v_note)
  returning id into v_menu_day_id;

  -- Components, in payload order (ordinality is the fallback sort_order).
  for v_comp in
    select elem, idx
    from pg_catalog.jsonb_array_elements(p_payload->'components')
      with ordinality as t(elem, idx)
  loop
    -- Denormalize the default item's display fields off the OWNER-PRIVATE catalog.
    -- A miss = the item is archived, cross-provider, or dangling → MAINC (the same
    -- active+owned axis the publish writer's PMINC enforces, caught here at authoring).
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
      v_menu_day_id,
      (v_comp.elem->>'componentGroup')::public.provider_component_group,
      (v_comp.elem->>'defaultCatalogItemId')::uuid,
      v_ci_name, v_ci_qty, v_ci_unit,
      coalesce((v_comp.elem->>'isRequired')::boolean, true),
      v_ci_spice, v_ci_salt,
      coalesce((v_comp.elem->>'sortOrder')::int, (v_comp.idx - 1)::int)
    )
    returning id into v_component_id;

    -- Alternatives (each id denormalized off the catalog the same way). Duplicates
    -- among alternatives are caught by the (menu_component_id, catalog_item_id) unique
    -- index; an alternative equal to the DEFAULT (which lives in
    -- provider_menu_components, NOT this table, so the index can't see it) is rejected
    -- explicitly below. The service validator catches both up front with field-scoped
    -- paths; these are the DB backstop for a direct RPC call.
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

    -- Customization groups + their options. The table CHECKs (pmp_4) are the
    -- authoritative backstop for the cross-field bounds (single_choice max=1, bounded
    -- increment, required-has-min, qty order); a violation surfaces as 23514 → the
    -- service maps it to menu_incomplete.
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

  return v_menu_day_id;
end;
$$;

-- Not callable by anon (no session → auth.uid() null → 28000); authenticated (the
-- owner authors) + service_role. The owner gate lives in the body.
revoke execute on function public.create_provider_menu_day(uuid, jsonb) from public, anon;
grant execute on function public.create_provider_menu_day(uuid, jsonb) to authenticated, service_role;
