// Provider Workspace — enums / string unions (contract 03 § 1).
//
// These mirror the native Postgres enums introduced by the provider migrations
// (MP-A-010+); request DTOs and fixtures branch on these string unions on both
// web and mobile. Pure — no `server-only`, no `next/*`, no I/O — so the Expo app
// can import them via `@mmp/shared/provider`.
//
// NOTE: `ProviderSpiceLevel` / `ProviderSaltLevel` are NEW value sets — do NOT
// reuse the household `spice_level` enum (`mild/medium/spicy`), which is a
// different set (design/01 § G-09, contract 03 § 1 note).

export type ProviderMembershipRole = "owner" | "customer";

export type ProviderMembershipStatus =
  | "invited"
  | "awaiting_approval"
  | "active"
  | "rejected"
  | "removed";

export type ProviderMenuStatus =
  | "draft"
  | "published"
  | "locked"
  | "archived"
  | "cancelled";

export type ProviderResponseStatus =
  | "no_response"
  | "draft"
  | "confirmed"
  | "cancelled"
  | "auto_accepted"
  | "locked"
  | "provider_overridden";

export type ProviderSuggestionStatus =
  | "pending"
  | "accepted_as_option"
  | "rejected"
  | "deferred";

export type ProviderComponentGroup =
  | "main"
  | "dal_or_legume"
  | "sabzi"
  | "bread"
  | "rice"
  | "side"
  | "add_on";

export type ProviderSpiceLevel = "non_spicy" | "mild" | "regular" | "spicy";

export type ProviderSaltLevel = "low_salt" | "regular_salt" | "high_salt";

export type ProviderCustomizationType =
  | "single_select"
  | "multi_select"
  | "quantity_increment"
  | "boolean"
  | "text_note";
