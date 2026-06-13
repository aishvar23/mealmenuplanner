-- PMP-3 (MP-A-011) · Provider catalog: provider_catalog_items + RLS + archive
-- semantics. The owner-authored item library every menu component draws from
-- (a menu component's default + alternatives reference catalog items).
--
-- Source of truth: design/meal-provider/01_design_spec.md § 8.5 (table shape)
-- reconciled to repo conventions in
-- design/planning/meal-provider/04_database_and_rls_plan.md § 2.5 + § 4.
--
-- ADR-4 (archive, never delete): catalog items are deactivated (is_active=false),
-- never hard-deleted, so a past menu/response/batch that references an item keeps
-- its history. New menus draw only from active items (enforced in the menu/
-- completeness layer, MP-A-012/121). source_dish_id is a soft link to the
-- household dish catalog: nullable, ON DELETE SET NULL, so a provider item is
-- never orphaned or cascade-deleted when a source dish is removed.
--
-- Conventions (p0_5/pmp_2): gen_random_uuid() PKs; timestamptz + the shared
-- set_updated_at() BEFORE UPDATE trigger; native enum component_group (pmp_1);
-- numeric(10,3) quantities matching dish_ingredients.quantity_per_serving. The
-- ensure_rls event trigger auto-enables RLS on the new table; the owner-only
-- policies below are added in this same migration. Only provider_id is
-- "client must never control" (plan § 9) — and the RLS WITH CHECK gates that
-- (a client can only write rows for a provider it owns), so no guard trigger is
-- needed (unlike pmp_7b's status/owner_user_id columns, which had no such gate).

-- ── provider_catalog_items ─────────────────────────────────────────────────────
-- UC-CATALOG-001/002. Tenant root: provider_id. The owner curates this library;
-- customers have NO access (plan § 2.5 / MP-A-011 — catalog item details reach a
-- customer only through a published menu read, a later task's projection).
create table provider_catalog_items (
  id                  uuid primary key default gen_random_uuid(),
  provider_id         uuid not null references provider_organizations (id) on delete cascade,
  source_dish_id      uuid references dishes (id) on delete set null,
  name                text not null,
  component_group     provider_component_group not null,
  canonical_unit      text not null,
  default_quantity    numeric(10, 3) not null,
  image_url           text,
  supports_spice_level boolean not null default false,
  supports_salt_level  boolean not null default false,
  allergy_warning     text,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint provider_catalog_name_not_blank check (length(btrim(name)) > 0),
  constraint provider_catalog_unit_not_blank check (length(btrim(canonical_unit)) > 0),
  constraint provider_catalog_default_quantity_positive check (default_quantity > 0)
);

create trigger trg_set_updated_at before update on provider_catalog_items
  for each row execute function set_updated_at();

-- Grouped read + active filtering (the GET catalog route lists active-first by
-- component group, MP-A-110); also the tenant-scoping index.
create index ix_provider_catalog_provider
  on provider_catalog_items (provider_id, component_group);

-- ════════════════════════════ policies ════════════════════════════
-- Owner-only, all operations. Mirrors the pmp_7 owner-write pattern: the SECURITY
-- DEFINER is_provider_owner(p) helper reads provider_memberships without
-- recursing into this table's RLS. No customer policy — catalog is owner-private
-- (plan § 4: customers cannot read the member list or the raw catalog; they see
-- only item details surfaced via a published menu). No DELETE policy — archiving
-- is an UPDATE of is_active to false (ADR-4); rows are never hard-deleted.
alter table provider_catalog_items enable row level security;

create policy pcat_select on provider_catalog_items
  for select using (is_provider_owner(provider_id));
create policy pcat_insert on provider_catalog_items
  for insert with check (is_provider_owner(provider_id));
create policy pcat_update on provider_catalog_items
  for update using (is_provider_owner(provider_id)) with check (is_provider_owner(provider_id));
