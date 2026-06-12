-- PMP-1 (MP-A-010) · Meal Provider Workspace — native enum types.
--
-- First provider migration. Introduces the fixed value sets used by every
-- provider table (org/membership/invite/subscription land here in
-- pmp_2_org_membership_invites; catalog/menu/response/batch tables in later
-- pmp_* files reuse the remaining enums).
--
-- Source of truth: design/planning/meal-provider/04_database_and_rls_plan.md § 1
-- and 03_contracts.md § 1 (the string-union values these enums mirror, published
-- in @mmp/shared/provider). Values must stay byte-for-byte identical to the TS
-- unions in packages/shared/provider/enums.ts.
--
-- Conventions inherited from p0_5: native Postgres enums for fixed value sets.
-- NOTE (03 § 1): provider_spice_level / provider_salt_level are NEW value sets —
-- they intentionally do NOT reuse the household `spice_level` enum
-- ('mild','medium','spicy'), which is a different set.
--
-- Not enums (per design/01 § 8 — kept `text`, service-validated): the org /
-- invite / subscription `status` columns. Only membership role/status are enums
-- among the MP-A-010 tables.

create type provider_membership_role as enum ('owner', 'customer');

create type provider_membership_status as enum (
  'invited', 'awaiting_approval', 'active', 'rejected', 'removed'
);

create type provider_menu_status as enum (
  'draft', 'published', 'locked', 'archived', 'cancelled'
);

create type provider_response_status as enum (
  'no_response', 'draft', 'confirmed', 'cancelled',
  'auto_accepted', 'locked', 'provider_overridden'
);

create type provider_suggestion_status as enum (
  'pending', 'accepted_as_option', 'rejected', 'deferred'
);

create type provider_component_group as enum (
  'main', 'dal_or_legume', 'sabzi', 'bread', 'rice', 'side', 'add_on'
);

create type provider_spice_level as enum ('non_spicy', 'mild', 'regular', 'spicy');

create type provider_salt_level as enum ('low_salt', 'regular_salt', 'high_salt');

create type provider_customization_type as enum (
  'single_select', 'multi_select', 'quantity_increment', 'boolean', 'text_note'
);
