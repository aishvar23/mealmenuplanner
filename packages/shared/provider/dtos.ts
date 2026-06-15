// Provider Workspace — wire DTOs (contract 03 § 4, § 8, § 10, § 12, § 13).
//
// camelCase wire shapes the `/api/*` routes return and the web + mobile clients
// consume. DB rows are snake_case; translation happens at the service/HTTP
// boundary (repo convention — contract 03 preamble). Pure types only.

import type {
  ProviderComponentGroup,
  ProviderCustomizationType,
  ProviderMembershipRole,
  ProviderMembershipStatus,
  ProviderMenuStatus,
  ProviderResponseStatus,
  ProviderSaltLevel,
  ProviderSpiceLevel,
  ProviderSuggestionStatus,
} from "./enums";

// ─────────────────────────── Invites / membership ───────────────────────────

/** Outcome of the best-effort invite email (mirrors the household invite). */
export type ProviderInviteEmailStatus = "sent" | "failed" | "no_recipient";

/**
 * `POST /api/providers/{id}/invites` body — invite a customer by email and/or
 * phone (§ 8). An email or phone is required (the DB `provider_invite_has_target`
 * check). Only customers are invitable; the role is fixed server-side.
 */
export interface CreateProviderInviteRequest {
  email?: string | null;
  phone?: string | null;
}

/** `POST .../invites` result — the plaintext link is returned exactly once. */
export interface CreateProviderInviteResult {
  inviteId: string;
  /** The acceptance link carrying the one-time plaintext token. */
  inviteLink: string;
  emailStatus: ProviderInviteEmailStatus;
}

/**
 * `GET /api/provider-invites/{token}` — the safe, limited invite preview shown
 * before acceptance (no org id, recipients, or token). Anon-readable by design.
 */
export interface ProviderInvitePreviewDto {
  providerName: string;
  invitedByName: string | null;
  role: ProviderMembershipRole;
  expiresAt: string;
}

/** `POST /api/provider-invites/{token}/accept` result — lands `awaiting_approval`. */
export interface AcceptProviderInviteResult {
  providerId: string;
  membershipStatus: ProviderMembershipStatus;
}

/**
 * The caller's own membership of a provider (`GET .../my-membership`). Drives the
 * member-onboarding gate (`onboardingComplete`) and prefills the onboarding form.
 * `autoAcceptEligible` is true only when the provider has provisioned a
 * subscription for this customer (BR-002) — the onboarding consent toggle shows
 * only then.
 */
export interface MyProviderMembershipDto {
  providerId: string;
  role: ProviderMembershipRole;
  status: ProviderMembershipStatus;
  onboardingComplete: boolean;
  displayName: string | null;
  phone: string | null;
  defaultSpiceLevel: ProviderSpiceLevel | null;
  autoAcceptEligible: boolean;
  autoAcceptConsented: boolean;
}

/**
 * `POST /api/providers/{id}/complete-member-onboarding` body (UC-MEMBER-ONBOARD-001).
 * The minimal provider-interaction profile — NO household fields. `allergyAck` and
 * `termsAck` are required acknowledgments; `autoAcceptConsent` is honored only when
 * the caller is subscription-eligible.
 */
export interface CompleteMemberOnboardingRequest {
  displayName: string;
  phone: string | null;
  defaultSpiceLevel: ProviderSpiceLevel | null;
  allergyAck: boolean;
  termsAck: boolean;
  autoAcceptConsent: boolean;
}

// ─────────────────────────── Provider / discovery ───────────────────────────

/** `GET /api/providers` item — one provider the caller belongs to (§ 4). */
export interface ProviderSummaryDto {
  providerId: string;
  name: string;
  role: ProviderMembershipRole;
  membershipStatus: ProviderMembershipStatus;
  timezone: string;
}

/** Full provider organisation (owner-facing settings; § 4). */
export interface ProviderDto {
  providerId: string;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  timezone: string;
  status: string;
  defaultCutoffLocalTime: string | null;
  summaryEmailRecipients: string[];
}

// ─────────────────────────────── Catalog ───────────────────────────────

/** One catalog item the provider can place on a menu (§ 4). */
export interface CatalogItemDto {
  catalogItemId: string;
  name: string;
  componentGroup: ProviderComponentGroup;
  canonicalUnit: string;
  defaultQuantity: number;
  imageUrl: string | null;
  isActive: boolean;
  supportsSpiceLevel: boolean;
  supportsSaltLevel: boolean;
  allergyWarning: string | null;
  sourceDishId: string | null;
}

/**
 * `POST /api/providers/{id}/catalog` body — add an item to the provider's catalog
 * (MP-A-110, owner only). `defaultQuantity` must be > 0 and `componentGroup` is
 * one of the fixed groups; the optional flags default false and the nullable
 * fields default null server-side. `provider_id` is never client-controlled (it
 * comes from the route + RLS) and `isActive` is implicitly true on create —
 * archiving is a later PATCH (§ 2.5, ADR-4).
 */
export interface CreateCatalogItemRequest {
  name: string;
  componentGroup: ProviderComponentGroup;
  canonicalUnit: string;
  defaultQuantity: number;
  imageUrl?: string | null;
  supportsSpiceLevel?: boolean;
  supportsSaltLevel?: boolean;
  allergyWarning?: string | null;
  sourceDishId?: string | null;
}

/**
 * `PATCH /api/providers/{id}/catalog/{catalogItemId}` body — a partial update of
 * one catalog item. Only the keys present are written. Toggling `isActive` is how
 * an item is archived (`false`) or restored (`true`) — items are never hard
 * deleted (ADR-4).
 */
export type UpdateCatalogItemRequest = Partial<
  Pick<
    CreateCatalogItemRequest,
    | "name"
    | "componentGroup"
    | "canonicalUnit"
    | "defaultQuantity"
    | "imageUrl"
    | "supportsSpiceLevel"
    | "supportsSaltLevel"
    | "allergyWarning"
    | "sourceDishId"
  >
> & { isActive?: boolean };

// ──────────────────────────────── Menu ────────────────────────────────

/** A customization group attached to a menu component (§ 4). */
export interface CustomizationGroupDto {
  customizationGroupId: string;
  name: string;
  customizationType: ProviderCustomizationType;
  includedInPrice: boolean;
  isRequired: boolean;
  minimumSelections: number;
  maximumSelections: number | null;
  options: Array<{
    optionId: string;
    code: string;
    label: string;
    quantityDelta: number | null;
    externalPriceLabel: string | null;
    minimumQuantity: number | null;
    maximumQuantity: number | null;
  }>;
}

/** One component slot of a menu day (e.g. the `dal_or_legume` slot; § 4). */
export interface MenuComponentDto {
  menuComponentId: string;
  componentGroup: ProviderComponentGroup;
  defaultCatalogItemId: string;
  /**
   * Display name of the default item, DENORMALIZED off the catalog at authoring
   * time (§ 4) so a customer reads the dish by name without access to the
   * owner-private catalog (ADO #39). Mirrors the quantity/unit/spice denorm.
   */
  defaultItemName: string;
  defaultQuantity: number;
  canonicalUnit: string;
  isRequired: boolean;
  sortOrder: number;
  alternatives: Array<{
    alternativeId: string;
    catalogItemId: string;
    /** Display name of this alternative item, denormalized off the catalog (ADO #39). */
    itemName: string;
    quantity: number;
    canonicalUnit: string;
  }>;
  customizationGroups: CustomizationGroupDto[];
  supportsSpiceLevel: boolean;
  supportsSaltLevel: boolean;
}

/** A single day's menu with its components (§ 4). */
export interface MenuDayDto {
  menuDayId: string;
  providerId: string;
  weeklyMenuId: string;
  menuDate: string;
  cutoffAt: string;
  status: ProviderMenuStatus;
  note: string | null;
  publishedAt: string | null;
  lockedAt: string | null;
  components: MenuComponentDto[];
}

/**
 * One customization group in a `CreateMenuDayInput` component (MP-A-121 authoring,
 * § 5/§ 8). The builder authors the group + its options; the cross-field bounds
 * (single_select/boolean ⇒ max 1, `quantity_increment` ⇒ finite max, required ⇒
 * min ≥ 1) are the DB CHECKs (pmp_4) the writer relies on. Optional flags default
 * server-side (`includedInPrice` true, `isRequired` false, `minimumSelections` 0).
 */
export interface CreateMenuCustomizationGroupInput {
  name: string;
  customizationType: ProviderCustomizationType;
  includedInPrice?: boolean;
  isRequired?: boolean;
  minimumSelections?: number;
  maximumSelections?: number | null;
  sortOrder?: number;
  options: Array<{
    code: string;
    label: string;
    quantityDelta?: number | null;
    canonicalUnit?: string | null;
    externalPriceLabel?: string | null;
    minimumQuantity?: number | null;
    maximumQuantity?: number | null;
    sortOrder?: number;
  }>;
}

/** One component slot in a `CreateMenuDayInput` (MP-A-121 authoring, § 5/§ 8). */
export interface CreateMenuComponentInput {
  componentGroup: ProviderComponentGroup;
  /** The default catalog item id; its name/quantity/unit/spice-salt flags are
   * DENORMALIZED off the catalog by the server at authoring time (§ 4, ADO #39). */
  defaultCatalogItemId: string;
  isRequired?: boolean;
  sortOrder?: number;
  /** Catalog item ids offered as swaps; each one's name/quantity/unit is likewise
   * denormalized off the catalog server-side. */
  alternativeCatalogItemIds?: string[];
  customizationGroups?: CreateMenuCustomizationGroupInput[];
}

/**
 * `POST /api/providers/{providerId}/menus` body — author a new DRAFT menu day with
 * its full component tree (MP-A-121, contract 03 § 5/§ 8; UC-MENU-001/002). The
 * builder sends only the catalog item IDS + structure; the server DERIVES every
 * display field (name/quantity/unit/spice-salt) from the OWNER-PRIVATE catalog at
 * authoring time, so the catalog stays owner-private while a customer later reads
 * the published menu without catalog access. `providerId` comes from the route,
 * never the client. The day is created `draft` — publishing is a later POST
 * (`.../publish`). Creating a second active day for an existing date is a
 * `409 { reason: "menu_day_exists" }` (edits route to the revision path).
 */
export interface CreateMenuDayInput {
  menuDate: string;
  cutoffAt: string;
  note?: string | null;
  components: CreateMenuComponentInput[];
}

// ─────────────────────────── Member / response ───────────────────────────

/** The caller's response to a menu day (`responseId` null before first save; § 4). */
export interface MemberResponseDto {
  responseId: string | null;
  menuDayId: string;
  status: ProviderResponseStatus;
  version: number;
  memberNote: string | null;
  items: Array<{
    menuComponentId: string;
    selectedCatalogItemId: string;
    quantity: number;
    canonicalUnit: string;
    spiceLevel: ProviderSpiceLevel | null;
    saltLevel: ProviderSaltLevel | null;
    customizations: Array<{
      customizationOptionId: string;
      quantity: number | null;
    }>;
  }>;
  lockedAt: string | null;
}

/** A provider member in the owner's roster (§ 4). */
export interface MemberDto {
  memberId: string;
  userId: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  role: ProviderMembershipRole;
  status: ProviderMembershipStatus;
  approvedAt: string | null;
  joinedAt: string | null;
}

/**
 * `PUT .../my-response` request (§ 8). `expectedVersion` drives optimistic
 * concurrency (§ 6). The server DERIVES authoritative quantity/unit/limits/
 * eligibility from menu config; client-sent price/name/unit/limit values are
 * ignored (§ 11.6) — they are present only so the same shape round-trips.
 */
export interface SaveProviderResponseRequest {
  expectedVersion: number | null;
  items: Array<{
    menuComponentId: string;
    selectedCatalogItemId: string;
    quantity: number;
    canonicalUnit: string;
    spiceLevel: ProviderSpiceLevel | null;
    saltLevel: ProviderSaltLevel | null;
    customizations: Array<{
      customizationOptionId: string;
      quantity: number | null;
    }>;
  }>;
  memberNote: string | null;
}

// ──────────────────────────────── Suggestions ────────────────────────────────

/**
 * One member meal suggestion for a menu day (`GET`-projection / mutation result;
 * § 4, UC-SUGGEST-\*). Non-binding — a suggestion NEVER alters a response or batch
 * (BR-012). `status`/`providerResponse` are owner-controlled; the member owns only
 * the free text. The owner sees every suggestion for their days; a member sees only
 * their own (RLS `pms_select`).
 */
export interface ProviderSuggestionDto {
  suggestionId: string;
  menuDayId: string;
  memberUserId: string;
  suggestionText: string;
  status: ProviderSuggestionStatus;
  /** The owner's optional note recorded when resolving (accept/reject). */
  providerResponse: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * `POST /api/provider-menu-days/{menuDayId}/suggestions` body (UC-SUGGEST-001). A
 * member files a free-text suggestion for the day; `provider_id` and the author are
 * derived server-side (route + auth), never client-controlled. Rate-limited at the
 * endpoint (§ 19.1, BR-012).
 */
export interface CreateProviderSuggestionRequest {
  suggestionText: string;
}

/**
 * `POST /api/provider-suggestions/{suggestionId}/accept-as-option` and
 * `.../reject` body (UC-SUGGEST-002/003, owner only). The optional `providerResponse`
 * is the owner's note back to the member; the resolved `status` is fixed by the route
 * (accepted_as_option / rejected), not the client. Only a `pending` suggestion can be
 * resolved — re-resolving is a `409 { reason: "suggestion_not_pending" }`.
 */
export interface ResolveProviderSuggestionRequest {
  providerResponse?: string | null;
}

// ───────────────────── Provider override / regenerate ─────────────────────

/**
 * `POST /api/provider-responses/{responseId}/provider-override` body (UC-OVERRIDE-001,
 * BR-007; MP-A-150). The owner corrects a LOCKED member response after cutoff:
 * `reason` is mandatory (audited) and `items` is the corrected order in the SAME shape
 * as a member save — the server DERIVES authoritative quantity/unit from the menu
 * config (§ 11.6); client-sent quantity/unit values are ignored.
 */
export interface ProviderOverrideResponseRequest {
  reason: string;
  items: SaveProviderResponseRequest["items"];
}

/**
 * `POST .../provider-override` result. The response is now `provider_overridden`;
 * `staleBatchId` is the batch revision this override marked stale (null when no batch
 * existed yet), the cue for the owner to regenerate.
 */
export interface ProviderOverrideResultDto {
  responseId: string;
  menuDayId: string;
  status: ProviderResponseStatus;
  staleBatchId: string | null;
}

/**
 * `POST /api/provider-preparation-batches/{batchId}/regenerate` result (UC-OVERRIDE-002;
 * MP-A-150) — the freshly-created current revision N+1. A lightweight header (no lines);
 * the full roster is read separately via the preparation-batch route (MP-B-050). The
 * summary email is NOT auto-resent (`emailStatus` resets to null).
 */
export interface ProviderBatchRevisionDto {
  batchId: string;
  menuDayId: string;
  revision: number;
  status: "current" | "stale";
  generatedAt: string;
  totals: BatchDto["totals"];
  emailStatus: "queued" | "sent" | "failed" | null;
}

// ───────────────────────── Preparation / batch ─────────────────────────

/**
 * `GET /api/providers/{providerId}/preparation-batches` row (MP-B-050). The owner's
 * index of generated batches — one per menu day's CURRENT revision, newest day first.
 * A lightweight header (no rosters); the full batch is read via the preparation-batch
 * route. Owner-only — batches are owner-private.
 */
export interface ProviderBatchSummaryDto {
  batchId: string;
  menuDayId: string;
  menuDate: string;
  cutoffAt: string;
  revision: number;
  status: "current" | "stale";
  generatedAt: string;
  emailStatus: "queued" | "sent" | "failed" | null;
  totals: BatchDto["totals"];
}

/**
 * `GET /api/providers/{providerId}/dashboard` response (MP-B-060, spec §13.2) — the
 * owner's day-at-a-glance summary, composed server-side from one read so the web +
 * mobile dashboards render identically. `today` is the menu day for today in the
 * provider's timezone (state + cutoff), or `null` when none is published; `batch` is
 * today's CURRENT preparation batch (the post-cutoff census + email status), or `null`
 * before cutoff has processed. Owner-only — a non-owner is existence-hidden (404).
 */
export interface ProviderDashboardDto {
  providerId: string;
  providerName: string;
  timezone: string;
  today: {
    menuDayId: string;
    menuDate: string;
    cutoffAt: string;
    status: ProviderMenuStatus;
    componentCount: number;
  } | null;
  batch: ProviderBatchSummaryDto | null;
}

/** One aggregated or per-member preparation line (§ 10). */
export interface PreparationLine {
  catalogItemId: string;
  itemName: string;
  componentGroup: ProviderComponentGroup;
  spiceLevel: ProviderSpiceLevel | null;
  saltLevel: ProviderSaltLevel | null;
  includedQuantity: number;
  extraQuantity: number;
  totalQuantity: number;
  canonicalUnit: string;
}

/** A preparation batch revision built at cutoff (§ 10). */
export interface BatchDto {
  batchId: string;
  menuDayId: string;
  revision: number;
  status: "current" | "stale";
  generatedAt: string;
  totals: {
    confirmed: number;
    autoAccepted: number;
    cancelled: number;
    noResponse: number;
  };
  aggregateLines: PreparationLine[];
  individualLines: Array<{
    memberUserId: string;
    displayName: string | null;
    lines: PreparationLine[];
  }>;
  emailStatus: "queued" | "sent" | "failed" | null;
}

/**
 * `GET /api/provider-menu-days/{menuDayId}/preparation-batch` response (MP-B-050) — the
 * full `BatchDto` roster plus the menu-day/provider context the same owner-gated read
 * returns (`menuDate`, `cutoffAt`, `providerName`). The preparation UI headers, the CSV
 * filenames and the print/email views all reuse this context, so it travels with the
 * roster rather than being re-fetched. (The server `ProviderBatchReadDto` is this DTO.)
 */
export interface ProviderBatchDetailDto extends BatchDto {
  providerName: string;
  menuDate: string;
  cutoffAt: string;
}

/** Server-rendered print view of a persisted batch revision (§ 12). */
export interface PrintViewDto {
  providerName: string;
  menuDate: string;
  cutoffAt: string;
  revision: number;
  generatedAt: string;
  totals: BatchDto["totals"];
  aggregateLines: PreparationLine[];
  individuals: BatchDto["individualLines"];
}

/** Parameters for the preparation-summary email, built from a batch (§ 13). */
export interface ProviderSummaryEmailParams {
  toEmail: string;
  providerName: string;
  menuDate: string;
  revision: number;
  generatedAt: string;
  totals: BatchDto["totals"];
  aggregateLines: PreparationLine[];
  individuals: BatchDto["individualLines"];
  csvAggregateUrl: string;
  csvIndividualUrl: string;
  printUrl: string;
  batchUrl: string;
}

/**
 * Outcome of a summary-email send/resend (MP-A-161, contract 03 § 13). The send is
 * best-effort and post-commit (ADR-12: a failure never rolls back the batch), so the
 * route always returns 200 with an honest status the UI can act on:
 *   • `sent`         — delivered to every configured recipient;
 *   • `failed`       — transport unconfigured or at least one send threw (offer resend);
 *   • `no_recipient` — the provider has no `summary_email_recipients` configured.
 */
export interface ProviderSummaryEmailResultDto {
  emailStatus: "sent" | "failed" | "no_recipient";
  recipientCount: number;
}
