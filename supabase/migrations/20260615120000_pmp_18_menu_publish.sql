-- PMP-18 (MP-A-121) · Menu publish writer — the FRESH-publish slice.
--
-- ADR-7 (#30) is decided = REVISION, unblocking the MP-A-121 writer. This migration
-- ships the first, self-contained half: publishing a DRAFT menu day (no member
-- responses exist yet, so the edit-after-response revision machinery is orthogonal
-- and lands separately as MP-A-012E + the revision rebuild). Source of truth:
-- design/planning/meal-provider/03_contracts.md § 5 (menu-completeness) and § 8
-- (authoring API), 04_database_and_rls_plan.md § 2.6–2.11.
--
-- Split of completeness checks (contract § 5):
--   • STRUCTURAL (every required component has a named default, positive
--     quantities, consistent units within a component, bounded quantity_increment
--     customizations, future cutoff) is the pure `validateMenuCompleteness`
--     (@mmp/shared/provider, ADO #84) run in the menu-publish SERVICE before this
--     RPC — verifiable on the MenuDayDto, no DB context.
--   • DB-CONTEXT (every default + active alternative references an ACTIVE catalog
--     item OWNED BY THIS provider — so no archived item, no cross-provider id, no
--     dangling reference) needs the owner-private catalog and is enforced HERE,
--     atomically with the draft→published transition. This is exactly the slice #84
--     left for the publish RPC.
--
-- The RPC is SECURITY DEFINER (search_path='') so it can read the owner-private
-- catalog + write the server-controlled lifecycle columns; it owner-gates, draft-
-- gates, and locks the day row FOR UPDATE so two concurrent publishes serialize.
-- On success it also publishes the parent weekly container (pwm_select needs the
-- week published/locked for an active customer to read the day under it) and fans
-- out a `provider_menu_published` event + in-app notification to active customers
-- (UC-NOTIFY-001) via the existing emit_provider_event (MP-A-170).
--
-- DEFENCE-IN-DEPTH: the RPC is callable by `authenticated`, so it does NOT trust the
-- service's structural gate. The cutoff-in-the-future rule — the one structural
-- invariant with post-publish consequences (a past-cutoff menu would notify
-- customers about an order they can never place) — is re-checked HERE under the day's
-- FOR UPDATE lock, mirroring save_provider_response's in-RPC `cutoff_at <= now()`
-- guard (pmp_10). It surfaces as PMINC (menu_incomplete), the same axis the service
-- validator uses, so the mapping in menu-publish.ts is unchanged.
--
-- Returns the day's `published_at` timestamp (the authoritative server value, set on
-- a fresh publish or the existing one on an idempotent replay) so the service can
-- patch its already-read DTO instead of issuing a second full menu-tree read.

drop function if exists public.publish_provider_menu_day(uuid);
create function public.publish_provider_menu_day(p_menu_day_id uuid)
returns timestamptz
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
  v_weekly_id    uuid;
  v_published_at timestamptz;
  v_issues       jsonb;
  v_recipients   uuid[];
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- Lock the day so concurrent publishes serialize: one flips draft→published, the
  -- loser re-reads 'published' below and short-circuits (idempotent, no re-fan-out).
  select md.provider_id, md.status, md.menu_date, md.cutoff_at, md.weekly_menu_id,
         md.published_at
    into v_provider_id, v_status, v_menu_date, v_cutoff_at, v_weekly_id,
         v_published_at
  from public.provider_menu_days md
  where md.id = p_menu_day_id
  for update;
  if not found then
    -- Existence-hiding 404 (design/04 § 2): never leak whether the day exists.
    raise exception 'menu day not found' using errcode = 'P0002';
  end if;

  -- Owner-only. Publishing is an authoring action; a customer who can READ a
  -- published day (RLS) still cannot publish one.
  if not public.is_provider_owner(v_provider_id) then
    raise exception 'owner required' using errcode = 'PMOWN';
  end if;

  -- Idempotent replay: an already-published day is a no-op (no second fan-out). Return
  -- its existing published_at, so a retried publish yields the same DTO the first did.
  if v_status = 'published' then
    return v_published_at;
  end if;
  -- Only a draft is publishable; locked/archived/cancelled are terminal here.
  if v_status <> 'draft' then
    raise exception 'menu not a draft' using errcode = 'PMNDR';
  end if;

  -- Defensive structural backstop (the service already gates emptiness): a menu with
  -- no components can never be published.
  if not exists (
    select 1 from public.provider_menu_components mc where mc.menu_day_id = p_menu_day_id
  ) then
    raise exception 'menu incomplete' using
      errcode = 'PMINC',
      detail = jsonb_build_array(
        jsonb_build_object('field', 'components', 'rule', 'menu_empty')
      )::text;
  end if;

  -- In-RPC cutoff guard (mirrors save_provider_response's `cutoff_at <= now()` check):
  -- the future-cutoff rule is re-enforced under the day's lock so a direct RPC call or
  -- a service-side TOCTOU window can never publish a menu past its own cutoff and then
  -- notify customers about an order they can no longer place. Surfaced on the same
  -- completeness axis the service validator uses (PMINC → menu_incomplete).
  if v_cutoff_at <= pg_catalog.now() then
    raise exception 'menu incomplete' using
      errcode = 'PMINC',
      detail = jsonb_build_array(
        jsonb_build_object('field', 'cutoffAt', 'rule', 'cutoff_in_past')
      )::text;
  end if;

  -- DB-context completeness (contract § 5): collect every default + active
  -- alternative reference whose catalog item is NOT active-and-owned-by-this-provider
  -- (archived, cross-provider, or dangling). LEFT JOIN → ci.id null is the failure.
  with refs as (
    select mc.id as component_id, mc.component_group,
           mc.default_catalog_item_id as item_id, 'default' as ref_kind
    from public.provider_menu_components mc
    where mc.menu_day_id = p_menu_day_id
    union all
    select mc.id, mc.component_group, pma.catalog_item_id, 'alternative'
    from public.provider_menu_components mc
    join public.provider_menu_alternatives pma on pma.menu_component_id = mc.id
    where mc.menu_day_id = p_menu_day_id and pma.is_active
  ),
  bad as (
    select r.component_id, r.component_group, r.item_id, r.ref_kind
    from refs r
    left join public.provider_catalog_items ci
      on ci.id = r.item_id
     and ci.provider_id = v_provider_id
     and ci.is_active
    where ci.id is null
  )
  select jsonb_agg(jsonb_build_object(
           'field', 'components',
           'rule', 'inactive_or_cross_provider_item',
           'menuComponentId', b.component_id,
           'componentGroup', b.component_group,
           'catalogItemId', b.item_id,
           'ref', b.ref_kind
         ) order by b.component_id, b.ref_kind)
    into v_issues
  from bad b;

  if v_issues is not null then
    raise exception 'menu incomplete' using errcode = 'PMINC', detail = v_issues::text;
  end if;

  -- Flip the day published; publish the parent weekly container too (only if still a
  -- draft — never reopen a locked/archived week) so an active customer can read the
  -- week the day hangs under (pwm_select gate).
  v_published_at := pg_catalog.now();
  update public.provider_menu_days
  set status = 'published', published_at = v_published_at
  where id = p_menu_day_id;

  update public.provider_weekly_menus
  set status = 'published', published_at = coalesce(published_at, pg_catalog.now())
  where id = v_weekly_id and status = 'draft';

  -- Fan out to the provider's ACTIVE customers only (UC-NOTIFY-001); awaiting/removed
  -- customers are not recipients, and emit_provider_event drops the owner-actor.
  select coalesce(array_agg(pm.user_id), array[]::uuid[])
    into v_recipients
  from public.provider_memberships pm
  where pm.provider_id = v_provider_id
    and pm.role = 'customer'
    and pm.status = 'active';

  perform public.emit_provider_event(
    v_provider_id,
    'provider_menu_published',
    'provider_menu_day',
    p_menu_day_id,
    jsonb_build_object('status', 'draft'),
    jsonb_build_object('status', 'published', 'menuDate', v_menu_date),
    'New menu published',
    'A new menu is available. Review it and confirm your order before the cutoff.',
    v_recipients
  );

  return v_published_at;
end;
$$;

-- Not callable by anon (no session → auth.uid() null → 28000 anyway); authenticated
-- (the owner publishes) + service_role. The owner gate lives in the body.
revoke execute on function public.publish_provider_menu_day(uuid) from public, anon;
grant execute on function public.publish_provider_menu_day(uuid) to authenticated, service_role;
