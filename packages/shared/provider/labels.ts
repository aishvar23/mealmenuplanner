// Provider Workspace — display label formatters (contract 03 § 2).
//
// The single source of truth for how a provider membership reads to a user, so
// the web account-menu switcher, the mobile switcher, and the mobile providers
// list never drift. Pure (no `server-only`, no `next/*`, no I/O) — web imports
// via `@/packages/shared/provider`, mobile via `@mmp/shared/provider`.

import type { ProviderSummaryEmailResultDto } from "./dtos";
import type {
  ProviderComponentGroup,
  ProviderMembershipRole,
  ProviderMembershipStatus,
  ProviderMenuStatus,
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

/** Display label for a spice level (falls back to the raw value). */
export function providerSpiceLabel(level: ProviderSpiceLevel): string {
  return PROVIDER_SPICE_OPTIONS.find((o) => o.value === level)?.label ?? level;
}

/** Display label for a salt level (falls back to the raw value). */
export function providerSaltLabel(level: ProviderSaltLevel): string {
  return PROVIDER_SALT_OPTIONS.find((o) => o.value === level)?.label ?? level;
}

/**
 * The parenthetical spice/salt variant suffix for a preparation line —
 * e.g. `" (Spicy, Low salt)"`, or `""` when neither is set. The single source for the
 * preparation UI (MP-B-050/MP-C-050), the summary email (MP-A-161) and the print view,
 * so the variant reads identically everywhere.
 */
export function providerVariantSuffix(
  spiceLevel: ProviderSpiceLevel | null,
  saltLevel: ProviderSaltLevel | null,
): string {
  const parts: string[] = [];
  if (spiceLevel) parts.push(providerSpiceLabel(spiceLevel));
  if (saltLevel) parts.push(providerSaltLabel(saltLevel));
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

/**
 * The owner-facing notice for a summary-email send/resend outcome — the single source
 * for the web (MP-B-050) and mobile (MP-C-050) preparation screens, so the three-way
 * sent/no_recipient/failed wording (and the recipient pluralization) can't drift across
 * platforms. Drives off the honest `emailStatus` the best-effort route always returns.
 */
export function providerSummaryEmailNotice(
  result: ProviderSummaryEmailResultDto,
): string {
  switch (result.emailStatus) {
    case "sent":
      return `Summary email sent to ${result.recipientCount} recipient${result.recipientCount === 1 ? "" : "s"}.`;
    case "no_recipient":
      return "No summary-email recipients are configured.";
    default:
      return "The summary email couldn't be delivered. Try again later.";
  }
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
 * How a menu day's status reads on the owner dashboard (MP-B-060) — the single source
 * so the web + mobile dashboards label the day's state identically. `locked` reads as
 * "Locked" (cutoff has passed; responses are closed), distinct from `published` (open).
 */
export const PROVIDER_MENU_STATUS_LABELS: Record<ProviderMenuStatus, string> = {
  draft: "Draft",
  published: "Published",
  locked: "Locked",
  archived: "Archived",
  cancelled: "Cancelled",
};

/** Display label for a menu-day status (falls back to the raw value). */
export function providerMenuStatusLabel(status: ProviderMenuStatus): string {
  return PROVIDER_MENU_STATUS_LABELS[status] ?? status;
}

/**
 * The semantic badge variant for each menu-day status — reuses the Forest & Ember
 * token set (`emerald` live/published, `marigold` draft attention, `ember` cancelled,
 * `neutral` idle) so the web Badge and the mobile status colour stay in lockstep and no
 * status falls through to neutral silently.
 */
export const PROVIDER_MENU_STATUS_BADGE_VARIANT: Record<
  ProviderMenuStatus,
  ProviderResponseBadgeVariant
> = {
  draft: "marigold",
  published: "emerald",
  locked: "neutral",
  archived: "neutral",
  cancelled: "ember",
};

/**
 * The owner dashboard's cutoff countdown (MP-B-060) — pure so the web and mobile
 * dashboards render the same "time remaining" wording from the cutoff timestamp and a
 * caller-supplied `now` (epoch ms; the screens pass `Date.now()` and re-tick). Returns
 * whether cutoff has passed plus a short human label. At most two units (days+hours, or
 * hours+minutes) so it reads at a glance; under a day always shows minutes so "0h" never
 * stands alone, and the final sub-minute window reads "<1m" rather than a bare "0m". A
 * malformed timestamp degrades to a neutral dash rather than throwing.
 */
export function formatCutoffCountdown(
  cutoffAtIso: string,
  nowMs: number,
): { passed: boolean; label: string } {
  const cutoffMs = new Date(cutoffAtIso).getTime();
  if (!Number.isFinite(cutoffMs)) return { passed: false, label: "—" };
  const diffMs = cutoffMs - nowMs;
  if (diffMs <= 0) return { passed: true, label: "Cutoff passed" };

  const totalMinutes = Math.floor(diffMs / 60_000);
  // Under a minute remaining: don't render a bare "0m" (reads as if cutoff is now).
  if (totalMinutes === 0) return { passed: false, label: "<1m until cutoff" };

  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  // Show minutes only when we're under a day (so the label stays to two units).
  if (days === 0) parts.push(`${minutes}m`);
  return { passed: false, label: `${parts.join(" ")} until cutoff` };
}

/** A preparation batch's summary-email delivery status (null = not yet sent). */
export type ProviderBatchEmailStatus = "queued" | "sent" | "failed";

/**
 * How a preparation batch's summary-email status reads — the single source shared by the
 * owner dashboard (MP-B-060) and the preparation detail view, so the two surfaces label
 * `queued`/`sent`/`failed` identically. A `null` status (not yet sent) is rendered by the
 * caller, not in this map.
 */
export const PROVIDER_BATCH_EMAIL_STATUS_LABELS: Record<
  ProviderBatchEmailStatus,
  string
> = {
  queued: "Queued",
  sent: "Sent",
  failed: "Failed",
};

/**
 * A readable cutoff date+time in the provider's timezone (MP-B-060) — the single source
 * shared by the web + mobile dashboards so both render the cutoff instant identically;
 * falls back to the raw ISO if the timezone or timestamp can't be formatted.
 */
export function formatCutoffDateTime(
  cutoffAtIso: string,
  timeZone: string,
): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(cutoffAtIso));
  } catch {
    return cutoffAtIso;
  }
}

/** "1 dish" / "N dishes" — shared so web + mobile pluralize the dish count identically. */
export function dishCountLabel(count: number): string {
  return `${count} ${count === 1 ? "dish" : "dishes"}`;
}

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
