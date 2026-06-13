-- PMP-4 (MP-A-012) · Provider weekly menus + day menus + components + alternatives
-- + customization groups/options: table shape, RLS, indexes. **Table shape only —
-- no edit-after-response policy enforcement (that is MP-A-012E, BLOCKED on ADR-7).**
--
-- Source of truth: design/meal-provider/01_design_spec.md § 8.6–8.11 (table shapes)
-- reconciled to repo conventions in
-- design/planning/meal-provider/04_database_and_rls_plan.md § 2.6–2.11 + § 4.
--
-- Conventions (pmp_3): gen_random_uuid() PKs; timestamptz + the shared
-- set_updated_at() BEFORE UPDATE trigger; native enums from pmp_1; numeric(10,3)
-- quantities matching provider_catalog_items.default_quantity. The ensure_rls event
-- trigger auto-enables RLS on every new table; the explicit enables + policies below
-- are added in this same migration so each table is never a window of open access.
--
-- ADR-7 / E3 deferrals (tracker 05 lines 124/128 — do NOT add until E3 is decided):
--   • NO unique active-week index on provider_weekly_menus.
--   • NO partial-unique (provider_id, menu_date) on provider_menu_days.
-- These overlap/uniqueness rules depend on the unconfirmed publishing UX (ADR-7);
-- the cutoff-sweep + lookup indexes below are independent and shipped now.
--
-- Denormalization note (design/04 § 2.8 pattern): a menu component copies
-- default_quantity + canonical_unit off its catalog item at authoring time;
-- supports_spice_level / supports_salt_level are copied the same way. This keeps the
-- catalog OWNER-PRIVATE (pcat_select is owner-only) while letting an approved
-- customer read a published menu's spice/salt affordances WITHOUT any catalog access
-- — the menu read (MP-A-120) never embeds provider_catalog_items, so no customer
-- catalog-read policy is needed. MP-A-121 (authoring, BLOCKED) populates these.

-- ════════════════════════════ tables ════════════════════════════

-- ── provider_weekly_menus ──────────────────────────────────────────────────────
-- UC-MENU-001. The week container an owner authors days under. Tenant root:
-- provider_id. created_by_user_id references users(id) (the authoring owner).
create table provider_weekly_menus (
  id                  uuid primary key default gen_random_uuid(),
  provider_id         uuid not null references provider_organizations (id) on delete cascade,
  week_start_date     date not null,
  week_end_date       date not null,
  status              provider_menu_status not null default 'draft',
  published_at        timestamptz,
  created_by_user_id  uuid not null references users (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint provider_weekly_menu_week_order check (week_end_date >= week_start_date)
);

create trigger trg_set_updated_at before update on provider_weekly_menus
  for each row execute function set_updated_at();

create index ix_provider_weekly_menus_provider
  on provider_weekly_menus (provider_id, week_start_date);

-- ── provider_menu_days ─────────────────────────────────────────────────────────
-- UC-MENU-001/003. A single date's menu within a week. cutoff_at is the response
-- deadline; the cutoff sweep (§19.3, a later cron task) locks published, unlocked
-- days at/after cutoff. status/published_at/locked_at are server-controlled.
create table provider_menu_days (
  id              uuid primary key default gen_random_uuid(),
  weekly_menu_id  uuid not null references provider_weekly_menus (id) on delete cascade,
  provider_id     uuid not null references provider_organizations (id) on delete cascade,
  menu_date       date not null,
  cutoff_at       timestamptz not null,
  status          provider_menu_status not null default 'draft',
  note            text,
  published_at    timestamptz,
  locked_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger trg_set_updated_at before update on provider_menu_days
  for each row execute function set_updated_at();

-- Owner day lookup + the per-day weekly grouping.
create index ix_provider_menu_days_provider
  on provider_menu_days (provider_id, menu_date, status);
create index ix_provider_menu_days_weekly
  on provider_menu_days (weekly_menu_id);
-- Cutoff sweep (§19.3): only published, not-yet-locked days are sweep candidates.
create index ix_provider_menu_days_cutoff_sweep
  on provider_menu_days (cutoff_at, status)
  where status = 'published' and locked_at is null;

-- ── provider_menu_components ───────────────────────────────────────────────────
-- UC-MENU-002. One component slot of a day (e.g. the dal_or_legume slot). The
-- default catalog item + its quantity/unit/spice-salt affordances are DENORMALIZED
-- here (see header note) so a customer reads the menu without catalog access.
create table provider_menu_components (
  id                      uuid primary key default gen_random_uuid(),
  menu_day_id             uuid not null references provider_menu_days (id) on delete cascade,
  component_group         provider_component_group not null,
  default_catalog_item_id uuid not null references provider_catalog_items (id),
  default_quantity        numeric(10, 3) not null,
  canonical_unit          text not null,
  is_required             boolean not null default true,
  supports_spice_level    boolean not null default false,
  supports_salt_level     boolean not null default false,
  sort_order              integer not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint provider_menu_component_quantity_positive check (default_quantity > 0),
  constraint provider_menu_component_unit_not_blank check (length(btrim(canonical_unit)) > 0)
);

create trigger trg_set_updated_at before update on provider_menu_components
  for each row execute function set_updated_at();

create index ix_provider_menu_components_day
  on provider_menu_components (menu_day_id, sort_order);

-- ── provider_menu_alternatives ─────────────────────────────────────────────────
-- UC-RESPONSE-002. An alternative catalog item a member may swap in for a
-- component. Unique per (component, item); archived (is_active=false) alternatives
-- are kept for history but filtered out of customer reads.
create table provider_menu_alternatives (
  id                 uuid primary key default gen_random_uuid(),
  menu_component_id  uuid not null references provider_menu_components (id) on delete cascade,
  catalog_item_id    uuid not null references provider_catalog_items (id),
  quantity           numeric(10, 3) not null,
  canonical_unit     text not null,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint provider_menu_alternative_quantity_positive check (quantity > 0),
  constraint provider_menu_alternative_unit_not_blank check (length(btrim(canonical_unit)) > 0),
  unique (menu_component_id, catalog_item_id)
);

create trigger trg_set_updated_at before update on provider_menu_alternatives
  for each row execute function set_updated_at();

-- ── provider_customization_groups ──────────────────────────────────────────────
-- UC-RESPONSE-004/005. A customization a member chooses on a component (e.g. a
-- single-select sauce, or a quantity_increment "extra roti"). BR-010: a
-- quantity_increment group MUST cap its selections (a finite max — never an
-- unbounded extra). included_in_price is informational only; no payment state.
create table provider_customization_groups (
  id                  uuid primary key default gen_random_uuid(),
  menu_component_id   uuid not null references provider_menu_components (id) on delete cascade,
  name                text not null,
  customization_type  provider_customization_type not null,
  included_in_price   boolean not null default true,
  is_required         boolean not null default false,
  minimum_selections  integer not null default 0,
  maximum_selections  integer,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint provider_customization_group_name_not_blank check (length(btrim(name)) > 0),
  constraint provider_customization_group_min_nonneg check (minimum_selections >= 0),
  constraint provider_customization_group_max_order
    check (maximum_selections is null or maximum_selections >= minimum_selections),
  -- BR-010: a quantity increment must be bounded (finite max).
  constraint provider_customization_group_increment_bounded
    check (customization_type <> 'quantity_increment' or maximum_selections is not null)
);

create trigger trg_set_updated_at before update on provider_customization_groups
  for each row execute function set_updated_at();

create index ix_provider_customization_groups_component
  on provider_customization_groups (menu_component_id, sort_order);

-- ── provider_customization_options ─────────────────────────────────────────────
-- UC-RESPONSE-004/005. One selectable option within a group. code is unique per
-- group (stable identifier); external_price_label is informational only.
create table provider_customization_options (
  id                    uuid primary key default gen_random_uuid(),
  customization_group_id uuid not null references provider_customization_groups (id) on delete cascade,
  code                  text not null,
  label                 text not null,
  quantity_delta        numeric(10, 3),
  canonical_unit        text,
  external_price_label  text,
  minimum_quantity      numeric(10, 3),
  maximum_quantity      numeric(10, 3),
  is_active             boolean not null default true,
  sort_order            integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint provider_customization_option_code_not_blank check (length(btrim(code)) > 0),
  constraint provider_customization_option_label_not_blank check (length(btrim(label)) > 0),
  constraint provider_customization_option_qty_order
    check (minimum_quantity is null or maximum_quantity is null or maximum_quantity >= minimum_quantity),
  unique (customization_group_id, code)
);

create trigger trg_set_updated_at before update on provider_customization_options
  for each row execute function set_updated_at();

create index ix_provider_customization_options_group
  on provider_customization_options (customization_group_id, sort_order);

-- ════════════════════════════ RLS helper functions ════════════════════════════
-- The menu child tables (components/alternatives/groups/options) carry no
-- provider_id; a policy must reach the owning provider through the FK chain. As in
-- pmp_7, that lookup MUST run in a SECURITY DEFINER helper (search_path='') so the
-- policy does NOT recurse into the referenced tables' own RLS. is_provider_owner /
-- is_active_provider_member (pmp_7) are reused for the owner / approved-customer
-- gates; these helpers only resolve the chain and fold in the publish-state read
-- rule (owner sees any status; an active member sees only published/locked days).

-- provider_id that owns a menu day (NULL if the day does not exist).
create or replace function provider_of_menu_day(d uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select md.provider_id from public.provider_menu_days md where md.id = d;
$$;

-- Current user may READ menu day d: owner (any status) or active member of the
-- provider AND the day is published or locked (drafts stay owner-private; an
-- awaiting/removed member is not active so reads nothing — UC-VIEW-002).
create or replace function can_read_provider_menu_day(d uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_menu_days md
    where md.id = d
      and (
        public.is_provider_owner(md.provider_id)
        or (
          public.is_active_provider_member(md.provider_id)
          and md.status in ('published', 'locked')
        )
      )
  );
$$;

-- provider_id that owns a menu component (via its day).
create or replace function provider_of_menu_component(c uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select md.provider_id
  from public.provider_menu_components mc
  join public.provider_menu_days md on md.id = mc.menu_day_id
  where mc.id = c;
$$;

-- Read reachability of a component (delegates to its day's read rule).
create or replace function can_read_provider_menu_component(c uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_menu_components mc
    where mc.id = c
      and public.can_read_provider_menu_day(mc.menu_day_id)
  );
$$;

-- provider_id that owns a customization group (via component → day).
create or replace function provider_of_customization_group(g uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select md.provider_id
  from public.provider_customization_groups cg
  join public.provider_menu_components mc on mc.id = cg.menu_component_id
  join public.provider_menu_days md on md.id = mc.menu_day_id
  where cg.id = g;
$$;

-- Read reachability of a customization group (delegates to its component).
create or replace function can_read_provider_customization_group(g uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_customization_groups cg
    where cg.id = g
      and public.can_read_provider_menu_component(cg.menu_component_id)
  );
$$;

-- Lock the SECURITY DEFINER surface (advisor 0028/0029): not callable by anon
-- (no session → auth.uid() null → owner/member checks false), kept for
-- authenticated (so policies can invoke them) + service_role.
revoke execute on function public.provider_of_menu_day(uuid) from public, anon;
grant execute on function public.provider_of_menu_day(uuid) to authenticated, service_role;
revoke execute on function public.can_read_provider_menu_day(uuid) from public, anon;
grant execute on function public.can_read_provider_menu_day(uuid) to authenticated, service_role;
revoke execute on function public.provider_of_menu_component(uuid) from public, anon;
grant execute on function public.provider_of_menu_component(uuid) to authenticated, service_role;
revoke execute on function public.can_read_provider_menu_component(uuid) from public, anon;
grant execute on function public.can_read_provider_menu_component(uuid) to authenticated, service_role;
revoke execute on function public.provider_of_customization_group(uuid) from public, anon;
grant execute on function public.provider_of_customization_group(uuid) to authenticated, service_role;
revoke execute on function public.can_read_provider_customization_group(uuid) from public, anon;
grant execute on function public.can_read_provider_customization_group(uuid) to authenticated, service_role;

-- ════════════════════════════ policies ════════════════════════════
-- Owner writes every menu table (gated on is_provider_owner of the owning
-- provider); an approved (active) customer READS only published/locked content.
-- No hard-delete restriction is needed beyond the owner gate — menu rows ARE
-- deletable by the owner while drafting (authoring rebuilds them, MP-A-121); past
-- responses reference items, not menu structure, so history is preserved upstream.

-- provider_weekly_menus — owner all; active member reads published weeks.
alter table provider_weekly_menus enable row level security;
create policy pwm_select on provider_weekly_menus
  for select using (
    is_provider_owner(provider_id)
    or (is_active_provider_member(provider_id) and status = 'published')
  );
create policy pwm_insert on provider_weekly_menus
  for insert with check (is_provider_owner(provider_id));
create policy pwm_update on provider_weekly_menus
  for update using (is_provider_owner(provider_id)) with check (is_provider_owner(provider_id));
create policy pwm_delete on provider_weekly_menus
  for delete using (is_provider_owner(provider_id));

-- provider_menu_days — owner all; active member reads published/locked days.
alter table provider_menu_days enable row level security;
create policy pmd_select on provider_menu_days
  for select using (
    is_provider_owner(provider_id)
    or (is_active_provider_member(provider_id) and status in ('published', 'locked'))
  );
create policy pmd_insert on provider_menu_days
  for insert with check (is_provider_owner(provider_id));
create policy pmd_update on provider_menu_days
  for update using (is_provider_owner(provider_id)) with check (is_provider_owner(provider_id));
create policy pmd_delete on provider_menu_days
  for delete using (is_provider_owner(provider_id));

-- provider_menu_components — read via the day rule; owner writes.
alter table provider_menu_components enable row level security;
create policy pmc_select on provider_menu_components
  for select using (can_read_provider_menu_day(menu_day_id));
create policy pmc_insert on provider_menu_components
  for insert with check (is_provider_owner(provider_of_menu_day(menu_day_id)));
create policy pmc_update on provider_menu_components
  for update using (is_provider_owner(provider_of_menu_day(menu_day_id)))
  with check (is_provider_owner(provider_of_menu_day(menu_day_id)));
create policy pmc_delete on provider_menu_components
  for delete using (is_provider_owner(provider_of_menu_day(menu_day_id)));

-- provider_menu_alternatives — read via the component rule; owner writes.
alter table provider_menu_alternatives enable row level security;
create policy pma_select on provider_menu_alternatives
  for select using (can_read_provider_menu_component(menu_component_id));
create policy pma_insert on provider_menu_alternatives
  for insert with check (is_provider_owner(provider_of_menu_component(menu_component_id)));
create policy pma_update on provider_menu_alternatives
  for update using (is_provider_owner(provider_of_menu_component(menu_component_id)))
  with check (is_provider_owner(provider_of_menu_component(menu_component_id)));
create policy pma_delete on provider_menu_alternatives
  for delete using (is_provider_owner(provider_of_menu_component(menu_component_id)));

-- provider_customization_groups — read via the component rule; owner writes.
alter table provider_customization_groups enable row level security;
create policy pcg_select on provider_customization_groups
  for select using (can_read_provider_menu_component(menu_component_id));
create policy pcg_insert on provider_customization_groups
  for insert with check (is_provider_owner(provider_of_menu_component(menu_component_id)));
create policy pcg_update on provider_customization_groups
  for update using (is_provider_owner(provider_of_menu_component(menu_component_id)))
  with check (is_provider_owner(provider_of_menu_component(menu_component_id)));
create policy pcg_delete on provider_customization_groups
  for delete using (is_provider_owner(provider_of_menu_component(menu_component_id)));

-- provider_customization_options — read via the group rule; owner writes.
alter table provider_customization_options enable row level security;
create policy pco_select on provider_customization_options
  for select using (can_read_provider_customization_group(customization_group_id));
create policy pco_insert on provider_customization_options
  for insert with check (is_provider_owner(provider_of_customization_group(customization_group_id)));
create policy pco_update on provider_customization_options
  for update using (is_provider_owner(provider_of_customization_group(customization_group_id)))
  with check (is_provider_owner(provider_of_customization_group(customization_group_id)));
create policy pco_delete on provider_customization_options
  for delete using (is_provider_owner(provider_of_customization_group(customization_group_id)));
