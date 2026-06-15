-- PMP-17 (ADO #39) · Denormalize catalog item display NAMES onto the menu tree.
--
-- The member menu read (MP-A-120 / MenuDayDto) must show each dish by NAME, but
-- provider_catalog_items is OWNER-PRIVATE (pcat_select is owner-only; design/04
-- § 2.8), so an approved customer cannot join to it. The member Today's Menu +
-- response UI shipped in AB#23 therefore labelled choices "Default" / "Option N"
-- and headed each slot only by its component GROUP — never by the dish name.
--
-- Fix, mirroring the existing default_quantity / canonical_unit / supports_*
-- denorm in pmp_4: copy the catalog item's name onto the component (its default
-- item) and onto each alternative. The menu read continues to never embed
-- provider_catalog_items, so the catalog stays owner-private while a customer
-- reads the dish names straight off the (RLS-readable) menu tree.
--
-- This is TABLE-SHAPE + read only and is NOT ADR-7-gated. Going forward the
-- authoring writer (MP-A-121, BLOCKED on ADR-7 / #30) populates these columns at
-- publish time exactly as it already does for default_quantity/canonical_unit.
-- All existing rows are backfilled here from the (NOT NULL) catalog name via the
-- FK, so the columns can be made NOT NULL immediately — matching the denorm
-- contract that every component/alternative carries its display fields inline.

-- ── add the denormalized name columns (nullable first, for a safe backfill) ──
alter table provider_menu_components
  add column default_item_name text;

alter table provider_menu_alternatives
  add column item_name text;

-- ── backfill from the catalog (both FKs are NOT NULL → the backfill is total) ──
update provider_menu_components mc
  set default_item_name = ci.name
  from provider_catalog_items ci
  where ci.id = mc.default_catalog_item_id;

update provider_menu_alternatives ma
  set item_name = ci.name
  from provider_catalog_items ci
  where ci.id = ma.catalog_item_id;

-- ── enforce NOT NULL + non-blank, mirroring the unit/quantity denorm checks ──
alter table provider_menu_components
  alter column default_item_name set not null,
  add constraint provider_menu_component_item_name_not_blank
    check (length(btrim(default_item_name)) > 0);

alter table provider_menu_alternatives
  alter column item_name set not null,
  add constraint provider_menu_alternative_item_name_not_blank
    check (length(btrim(item_name)) > 0);

comment on column provider_menu_components.default_item_name is
  'Denormalized provider_catalog_items.name for the default item, copied at authoring time so an approved customer reads the dish name without access to the owner-private catalog (ADO #39).';
comment on column provider_menu_alternatives.item_name is
  'Denormalized provider_catalog_items.name for this alternative, copied at authoring time (ADO #39).';
