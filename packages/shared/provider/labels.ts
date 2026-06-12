// Provider Workspace — display label formatters (contract 03 § 2).
//
// The single source of truth for how a provider membership reads to a user, so
// the web account-menu switcher, the mobile switcher, and the mobile providers
// list never drift. Pure (no `server-only`, no `next/*`, no I/O) — web imports
// via `@/packages/shared/provider`, mobile via `@mmp/shared/provider`.

import type { ProviderMembershipRole, ProviderMembershipStatus } from "./enums";

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
