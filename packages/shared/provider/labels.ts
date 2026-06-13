// Provider Workspace — display label formatters (contract 03 § 2).
//
// The single source of truth for how a provider membership reads to a user, so
// the web account-menu switcher, the mobile switcher, and the mobile providers
// list never drift. Pure (no `server-only`, no `next/*`, no I/O) — web imports
// via `@/packages/shared/provider`, mobile via `@mmp/shared/provider`.

import type {
  ProviderComponentGroup,
  ProviderMembershipRole,
  ProviderMembershipStatus,
  ProviderSpiceLevel,
} from "./enums";

/**
 * The provider spice levels a member may pick as their default, with display
 * labels — the single source for the web + mobile onboarding pickers AND the
 * server-side validation allow-list, so the set can never drift across the three.
 */
export const PROVIDER_SPICE_OPTIONS: {
  value: ProviderSpiceLevel;
  label: string;
}[] = [
  { value: "non_spicy", label: "Non-spicy" },
  { value: "mild", label: "Mild" },
  { value: "regular", label: "Regular" },
  { value: "spicy", label: "Spicy" },
];

/** Just the spice-level values, in display order (server validation allow-list). */
export const PROVIDER_SPICE_LEVELS: readonly ProviderSpiceLevel[] =
  PROVIDER_SPICE_OPTIONS.map((o) => o.value);

/**
 * The component groups a catalog item / menu component can belong to, with display
 * labels — the single source for the web + mobile catalog & menu-builder pickers
 * AND the server-side catalog validation allow-list (MP-A-110), so the set can
 * never drift across the three. Order is the natural plate order (a thali reads
 * main → dal → sabzi → bread → rice → side → add-on).
 */
export const PROVIDER_COMPONENT_GROUP_OPTIONS: {
  value: ProviderComponentGroup;
  label: string;
}[] = [
  { value: "main", label: "Main" },
  { value: "dal_or_legume", label: "Dal / legume" },
  { value: "sabzi", label: "Sabzi" },
  { value: "bread", label: "Bread" },
  { value: "rice", label: "Rice" },
  { value: "side", label: "Side" },
  { value: "add_on", label: "Add-on" },
];

/** Just the component-group values, in display order (server validation allow-list). */
export const PROVIDER_COMPONENT_GROUPS: readonly ProviderComponentGroup[] =
  PROVIDER_COMPONENT_GROUP_OPTIONS.map((o) => o.value);

/**
 * The caller's standing with a provider as a short, lowercase noun phrase:
 * `owner`, `subscriber`, or `awaiting approval`. Every user-facing provider label
 * derives from this one mapping, so a wording change happens in exactly one place.
 */
export function providerMembershipStanding(
  role: ProviderMembershipRole,
  status: ProviderMembershipStatus,
): string {
  if (role === "owner") return "owner";
  return status === "active" ? "subscriber" : "awaiting approval";
}

/**
 * Capitalized standing for a provider row subtitle (the mobile providers list):
 * `Owner` / `Subscriber` / `Awaiting approval`.
 */
export function providerMembershipLabel(
  role: ProviderMembershipRole,
  status: ProviderMembershipStatus,
): string {
  const standing = providerMembershipStanding(role, status);
  return standing.charAt(0).toUpperCase() + standing.slice(1);
}

/**
 * The workspace-switcher subtitle line, shared by web + mobile:
 * `Meal provider · owner` / `· subscriber` / `· awaiting approval`.
 */
export function providerWorkspaceSubtitle(
  role: ProviderMembershipRole,
  status: ProviderMembershipStatus,
): string {
  return `Meal provider · ${providerMembershipStanding(role, status)}`;
}
