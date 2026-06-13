-- PMP-5 (MP-A-013) · Member responses (+ items + customizations) + meal
-- suggestions: table shape, RLS, indexes. **Schema + read posture only** — the
-- save/confirm/cancel mutation path (quantity derivation, cutoff + optimistic
-- concurrency) is MP-A-130 and the suggestion-create endpoint (rate-limited) is
-- MP-A-131; both ship separately. Nothing here is ADR-7-dependent (that gates the
-- menu edit guard, MP-A-012E, not the response tables).
--
-- Source of truth: design/meal-provider/01_design_spec.md § 8.12–8.15 (table
-- shapes) reconciled to repo conventions in
-- design/planning/meal-provider/04_database_and_rls_plan.md § 2.12–2.15 + § 4/§ 9.
--
-- Conventions (pmp_4): gen_random_uuid() PKs; timestamptz + the shared
-- set_updated_at() BEFORE UPDATE trigger on mutable tables; native enums from
-- pmp_1; numeric(10,3) quantities matching provider_menu_components. The ensure_rls
-- event trigger auto-enables RLS on every new table; the explicit enables +
-- policies below ship in this same migration so each table is never a window of
-- open access.
--
-- ── Field-control posture (design/04 § 9) — why writes are NOT granted by RLS ──
-- A member response's quantity / canonical_unit / status / version / locked_at /
-- auto_accepted / provider_overridden are all CLIENT-NEVER-CONTROLLED: the server
-- DERIVES quantities/units from the menu config and owns every lifecycle column
-- (§ 11.6). RLS cannot express "derive quantity" or "only before cutoff_at", so
-- granting a member direct INSERT/UPDATE on responses/items would open a path to
-- client-controlled quantities that bypasses derivation. Therefore the response
-- tables grant **SELECT only** (self for the member, all for the owner via the
-- chain helpers); every mutation flows through the SECURITY DEFINER
-- save_provider_response / process_provider_cutoff / provider_override_response
-- RPCs (MP-A-130/141/150, service-role, RLS-bypassing). Suggestions carry NO
-- server-derived field (just member text), so a self-INSERT is safe and IS granted
-- (rate-limited at the MP-A-131 endpoint); owner UPDATE is granted for resolution.

-- ════════════════════════════ tables ════════════════════════════

-- ── provider_member_responses ───────────────────────────────────────────────────
-- UC-RESPONSE-001/007. One member's response to one menu day. Tenant root:
-- provider_id (denormalized off the day so RLS self/owner scoping needs no FK walk).
-- version drives optimistic concurrency (§ 8.12): the save RPC updates WHERE
-- version = expectedVersion and increments on success. status/confirmed_at/
-- cancelled_at/locked_at/auto_accepted/provider_overridden/version are all
-- server-controlled.
create table provider_member_responses (
  id                      uuid primary key default gen_random_uuid(),
  provider_id             uuid not null references provider_organizations (id) on delete cascade,
  menu_day_id             uuid not null references provider_menu_days (id) on delete cascade,
  member_user_id          uuid not null references users (id) on delete cascade,
  status                  provider_response_status not null default 'draft',
  confirmed_at            timestamptz,
  cancelled_at            timestamptz,
  locked_at               timestamptz,
  auto_accepted           boolean not null default false,
  provider_overridden     boolean not null default false,
  provider_override_reason text,
  member_note             text,
  version                 integer not null default 1,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint provider_member_response_version_positive check (version >= 1),
  unique (menu_day_id, member_user_id)
);

create trigger trg_set_updated_at before update on provider_member_responses
  for each row execute function set_updated_at();

-- Batch reads (§ 19.3): the cutoff processor + owner roster scan responses for a
-- day by status. (The unique (menu_day_id, member_user_id) index already serves a
-- member's own-response lookup; member_user_id alone backs an "all my responses"
-- read.)
create index ix_provider_member_responses_day
  on provider_member_responses (menu_day_id, status);
create index ix_provider_member_responses_member
  on provider_member_responses (member_user_id);

-- ── provider_member_response_items ──────────────────────────────────────────────
-- UC-RESPONSE-002/003. The per-component lines of a response: the catalog item the
-- member chose (default or an alternative) + its DERIVED quantity/unit and optional
-- structural spice/salt selection. Unique per (response, component) — one line per
-- slot. quantity/canonical_unit are server-derived (§ 11.6); no free-text spice.
create table provider_member_response_items (
  id                        uuid primary key default gen_random_uuid(),
  response_id               uuid not null references provider_member_responses (id) on delete cascade,
  menu_component_id         uuid not null references provider_menu_components (id),
  selected_catalog_item_id  uuid not null references provider_catalog_items (id),
  quantity                  numeric(10, 3) not null,
  canonical_unit            text not null,
  spice_level               provider_spice_level,
  salt_level                provider_salt_level,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint provider_member_response_item_quantity_positive check (quantity > 0),
  constraint provider_member_response_item_unit_not_blank check (length(btrim(canonical_unit)) > 0),
  unique (response_id, menu_component_id)
);

create trigger trg_set_updated_at before update on provider_member_response_items
  for each row execute function set_updated_at();

-- Read a response's lines in one indexed lookup.
create index ix_provider_member_response_items_response
  on provider_member_response_items (response_id);

-- ── provider_member_response_customizations ─────────────────────────────────────
-- UC-RESPONSE-004/005. The customization options a member picked on a response
-- line (e.g. an extra roti × N, a chosen sauce). quantity is the derived increment
-- count (NULL for single/boolean choices). Unique per (line, option). Append/rebuilt
-- by the save RPC; no updated_at (spec § 8.14) → no set_updated_at trigger.
create table provider_member_response_customizations (
  id                       uuid primary key default gen_random_uuid(),
  response_item_id         uuid not null references provider_member_response_items (id) on delete cascade,
  customization_option_id  uuid not null references provider_customization_options (id),
  quantity                 numeric(10, 3),
  created_at               timestamptz not null default now(),
  constraint provider_member_response_customization_quantity_positive
    check (quantity is null or quantity > 0),
  unique (response_item_id, customization_option_id)
);

create index ix_provider_member_response_customizations_item
  on provider_member_response_customizations (response_item_id);

-- ── provider_meal_suggestions ───────────────────────────────────────────────────
-- UC-SUGGEST-*. A member's non-binding free-text suggestion for a menu day. Never
-- alters a response or batch (BR-012); the owner resolves it (accepted_as_option /
-- rejected / deferred) with an optional provider_response note. Tenant root:
-- provider_id. status/provider_response are owner-controlled.
create table provider_meal_suggestions (
  id               uuid primary key default gen_random_uuid(),
  provider_id      uuid not null references provider_organizations (id) on delete cascade,
  menu_day_id      uuid not null references provider_menu_days (id) on delete cascade,
  member_user_id   uuid not null references users (id) on delete cascade,
  suggestion_text  text not null,
  status           provider_suggestion_status not null default 'pending',
  provider_response text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint provider_meal_suggestion_text_not_blank check (length(btrim(suggestion_text)) > 0)
);

create trigger trg_set_updated_at before update on provider_meal_suggestions
  for each row execute function set_updated_at();

-- Owner reads a day's suggestions newest-first; member_user_id backs a member's
-- own-suggestions read.
create index ix_provider_meal_suggestions_day
  on provider_meal_suggestions (provider_id, menu_day_id, created_at desc);
create index ix_provider_meal_suggestions_member
  on provider_meal_suggestions (member_user_id);

-- ════════════════════════════ RLS helper functions ════════════════════════════
-- provider_member_responses carries provider_id + member_user_id directly, so its
-- own policies need no helper. The child tables (_items, _customizations) carry no
-- provider/member columns; a policy must reach the owning response (and through it
-- the provider/member) via the FK chain. As in pmp_4, that lookup MUST run in a
-- SECURITY DEFINER helper (search_path='') so the child policy does NOT recurse into
-- provider_member_responses' own RLS — the helper runs as table owner and reads it
-- directly. The read rule is single-sourced in can_read_provider_response: the
-- response owner's provider owner sees all; the member sees only their own.

-- Current user may READ response r: owner of its provider, OR it is their own
-- response. (Wrap auth.uid() once; § auth_rls_initplan parity with pmp_7.)
create or replace function can_read_provider_response(r uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_member_responses pr
    where pr.id = r
      and (
        public.is_provider_owner(pr.provider_id)
        or pr.member_user_id = (select auth.uid())
      )
  );
$$;

-- Read reachability of a response ITEM: resolve its response and apply the response
-- read rule ONCE. Returns NULL (→ not visible, treated as false by USING) when the
-- item is gone.
create or replace function can_read_provider_response_item(i uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_read_provider_response(ri.response_id)
  from public.provider_member_response_items ri
  where ri.id = i;
$$;

-- Lock the SECURITY DEFINER surface (advisor 0028/0029): not callable by anon (no
-- session → auth.uid() null → owner/self checks false); kept for authenticated (so
-- policies can invoke them) + service_role. Self/owner-scoped, so any residual 0029
-- is benign — a caller can only ever resolve visibility of rows they could already
-- read.
revoke execute on function public.can_read_provider_response(uuid) from public, anon;
grant execute on function public.can_read_provider_response(uuid) to authenticated, service_role;
revoke execute on function public.can_read_provider_response_item(uuid) from public, anon;
grant execute on function public.can_read_provider_response_item(uuid) to authenticated, service_role;

-- ════════════════════════════ policies ════════════════════════════
-- Responses/items/customizations are SELECT-only for authenticated callers (see the
-- field-control posture note in the header): the member reads their own, the owner
-- reads all; every mutation is a server-role RPC. Suggestions additionally grant a
-- member self-INSERT (safe — member text, no derived field; rate-limited at the
-- MP-A-131 endpoint) and an owner UPDATE (resolution).

-- provider_member_responses — owner reads all; member reads own. No member/owner
-- direct write (save/override flow through MP-A-130/150 RPCs).
alter table provider_member_responses enable row level security;
create policy pmr_select on provider_member_responses
  for select using (
    is_provider_owner(provider_id)
    or member_user_id = (select auth.uid())
  );

-- provider_member_response_items — read via the response rule; no direct write.
alter table provider_member_response_items enable row level security;
create policy pmri_select on provider_member_response_items
  for select using (can_read_provider_response(response_id));

-- provider_member_response_customizations — read via the response-item rule; no
-- direct write.
alter table provider_member_response_customizations enable row level security;
create policy pmrc_select on provider_member_response_customizations
  for select using (can_read_provider_response_item(response_item_id));

-- provider_meal_suggestions — owner reads all + resolves (update); member reads own
-- + creates own (active member). No delete (history preserved, BR-012).
alter table provider_meal_suggestions enable row level security;
create policy pms_select on provider_meal_suggestions
  for select using (
    is_provider_owner(provider_id)
    or member_user_id = (select auth.uid())
  );
create policy pms_insert on provider_meal_suggestions
  for insert with check (
    member_user_id = (select auth.uid())
    and is_active_provider_member(provider_id)
  );
create policy pms_update on provider_meal_suggestions
  for update using (is_provider_owner(provider_id))
  with check (is_provider_owner(provider_id));
