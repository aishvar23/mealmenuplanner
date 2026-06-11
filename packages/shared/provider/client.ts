// Provider Workspace — typed API-client interface (contract 03 § 8, § 14).
//
// The contract seam both clients implement against the same `/api/*` routes:
//   • web: the MP-B-001 fixture-backed mock (`lib/provider/mock-client.ts`) now,
//     a real HTTP client later;
//   • mobile: `mobile/src/api/provider.ts` (MP-C-000), an HTTP client over the
//     same routes.
// Returning the DTOs from `./dtos`, so a screen written against this interface
// renders identically whether it is fed fixtures or live data. Pure — no I/O,
// no transport assumptions — so it lives in the shared package.
//
// This surface covers the read paths early UI needs plus the lifecycle
// mutations whose request shape the contract fixes. Methods for routes whose
// request bodies are not yet specified (invites/preview, catalog write,
// suggestions, override/regenerate/resend, CSV) are added alongside their
// MP-A service task, which freezes those shapes.

import type { Collection } from "../../../lib/http/collection";

import type {
  BatchDto,
  CatalogItemDto,
  MemberDto,
  MemberResponseDto,
  MenuDayDto,
  ProviderDto,
  ProviderSummaryDto,
  SaveProviderResponseRequest,
} from "./dtos";

/** `POST /api/providers` body — creates the org as a draft (contract 03 § 8). */
export interface ProviderCreateInput {
  name: string;
}

/** `PATCH /api/providers/{id}` body — partial provider settings update. */
export type ProviderUpdateInput = Partial<
  Pick<
    ProviderDto,
    | "name"
    | "email"
    | "phone"
    | "city"
    | "state"
    | "country"
    | "timezone"
    | "defaultCutoffLocalTime"
    | "summaryEmailRecipients"
  >
>;

/**
 * The provider API surface. Reads return DTOs (or `null` where the route may
 * have no current resource); lifecycle mutations take only the IDs and the one
 * specified request body (`SaveProviderResponseRequest`).
 */
export interface ProviderApiClient {
  // ── Discovery / provider ──
  /** `GET /api/providers` — providers the caller belongs to. */
  listProviders(): Promise<ProviderSummaryDto[]>;
  /** `GET /api/providers/{providerId}`. */
  getProvider(providerId: string): Promise<ProviderDto>;
  /** `POST /api/providers` — create a draft org (caller becomes owner). */
  createProvider(input: ProviderCreateInput): Promise<ProviderDto>;
  /** `PATCH /api/providers/{providerId}`. */
  updateProvider(
    providerId: string,
    patch: ProviderUpdateInput,
  ): Promise<ProviderDto>;
  /** `POST /api/providers/{providerId}/complete-onboarding`. */
  completeProviderOnboarding(providerId: string): Promise<ProviderDto>;

  // ── Catalog ──
  /** `GET /api/providers/{providerId}/catalog`. */
  listCatalog(providerId: string): Promise<CatalogItemDto[]>;

  // ── Members ──
  /** `GET /api/providers/{providerId}/members` — cursor-paginated roster. */
  listMembers(providerId: string): Promise<Collection<MemberDto>>;
  /** `POST .../members/{memberId}/approve`. */
  approveMember(providerId: string, memberId: string): Promise<MemberDto>;
  /** `POST .../members/{memberId}/reject`. */
  rejectMember(providerId: string, memberId: string): Promise<MemberDto>;
  /** `POST .../members/{memberId}/remove`. */
  removeMember(providerId: string, memberId: string): Promise<MemberDto>;

  // ── Menus ──
  /** `GET /api/provider-menu-days/{menuDayId}`. */
  getMenuDay(menuDayId: string): Promise<MenuDayDto>;
  /** `GET /api/providers/{providerId}/today-menu` — null when none is published. */
  getTodayMenu(providerId: string): Promise<MenuDayDto | null>;
  /** `GET /api/providers/{providerId}/weekly-menu`. */
  getWeeklyMenu(providerId: string): Promise<MenuDayDto[]>;
  /** `POST /api/provider-menu-days/{menuDayId}/publish`. */
  publishMenuDay(menuDayId: string): Promise<MenuDayDto>;

  // ── Member response ──
  /** `GET /api/provider-menu-days/{menuDayId}/my-response`. */
  getMyResponse(menuDayId: string): Promise<MemberResponseDto>;
  /** `PUT /api/provider-menu-days/{menuDayId}/my-response`. */
  saveMyResponse(
    menuDayId: string,
    body: SaveProviderResponseRequest,
  ): Promise<MemberResponseDto>;
  /** `POST /api/provider-responses/{responseId}/confirm`. */
  confirmResponse(responseId: string): Promise<MemberResponseDto>;
  /** `POST /api/provider-responses/{responseId}/cancel`. */
  cancelResponse(responseId: string): Promise<MemberResponseDto>;

  // ── Preparation ──
  /** `GET /api/provider-menu-days/{menuDayId}/preparation-batch`. */
  getPreparationBatch(menuDayId: string): Promise<BatchDto>;
}
