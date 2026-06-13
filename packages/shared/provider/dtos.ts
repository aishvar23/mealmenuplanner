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
  defaultQuantity: number;
  canonicalUnit: string;
  isRequired: boolean;
  sortOrder: number;
  alternatives: Array<{
    alternativeId: string;
    catalogItemId: string;
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

// ───────────────────────── Preparation / batch ─────────────────────────

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
