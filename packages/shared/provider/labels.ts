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
  ProviderResponseStatus,
  ProviderSaltLevel,
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
 * The provider salt levels a member may pick on a response component, with display
 * labels — the single source for the web + mobile response pickers AND the
 * server-side response validation allow-list (MP-A-130), so the set can never
 * drift across the three.
 */
export const PROVIDER_SALT_OPTIONS: {
  value: ProviderSaltLevel;
  label: string;
}[] = [
  { value: "low_salt", label: "Low salt" },
  { value: "regular_salt", label: "Regular salt" },
  { value: "high_salt", label: "High salt" },
];

/** Just the salt-level values, in display order (server validation allow-list). */
export const PROVIDER_SALT_LEVELS: readonly ProviderSaltLevel[] =
  PROVIDER_SALT_OPTIONS.map((o) => o.value);

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

/** Display label for a component group (single lookup; falls back to the raw value). */
export function providerComponentGroupLabel(
  group: ProviderComponentGroup,
): string {
  return (
    PROVIDER_COMPONENT_GROUP_OPTIONS.find((o) => o.value === group)?.label ??
    group
  );
}

/**
 * How a member's response status reads to them — the single source for the web +
 * mobile response screens and the response recap, so the wording can't drift. The
 * "no response yet" empty shape (`no_response`) reads as a call to action.
 */
export const PROVIDER_RESPONSE_STATUS_LABELS: Record<
  ProviderResponseStatus,
  string
> = {
  no_response: "Not responded yet",
  draft: "Draft — not confirmed",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  auto_accepted: "Auto-accepted",
  locked: "Locked",
  provider_overridden: "Adjusted by provider",
};

/**
 * The semantic badge variant for each response status — Forest & Ember tokens
 * (`emerald` positive, `marigold` attention/pending, `ember` cancelled, `neutral`
 * idle). One map for EVERY status so the web Badge and the mobile status label
 * colour them identically and no status silently falls through to neutral. The web
 * `Badge` consumes the variant name directly; mobile maps it to a text colour.
 */
export type ProviderResponseBadgeVariant =
  | "neutral"
  | "emerald"
  | "marigold"
  | "ember";

export const PROVIDER_RESPONSE_STATUS_BADGE_VARIANT: Record<
  ProviderResponseStatus,
  ProviderResponseBadgeVariant
> = {
  no_response: "neutral",
  draft: "marigold",
  confirmed: "emerald",
  cancelled: "ember",
  auto_accepted: "emerald",
  locked: "neutral",
  provider_overridden: "marigold",
};

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
