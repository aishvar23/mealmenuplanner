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
