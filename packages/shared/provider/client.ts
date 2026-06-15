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

// Through the package's own seam (`@mmp/shared/types` re-exports `Collection`),
// not a direct reach into `lib/http` — same shape mobile already consumes.
import type { Collection } from "../types";

import type {
  AcceptProviderInviteResult,
  CatalogItemDto,
  CompleteMemberOnboardingRequest,
  CreateCatalogItemRequest,
  CreateMenuDayInput,
  CreateProviderInviteRequest,
  CreateProviderInviteResult,
  MemberDto,
  MemberResponseDto,
  MenuDayDto,
  MyProviderMembershipDto,
  ProviderDashboardDto,
  ProviderBatchDetailDto,
  ProviderBatchRevisionDto,
  ProviderBatchSummaryDto,
  ProviderSummaryEmailResultDto,
  ProviderDto,
  ProviderInvitePreviewDto,
  CreateProviderSuggestionRequest,
  ProviderOverrideResponseRequest,
  ProviderOverrideResultDto,
  ProviderSuggestionDto,
  ProviderSummaryDto,
  ResolveProviderSuggestionRequest,
  SaveProviderResponseRequest,
  UpdateCatalogItemRequest,
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
  /** `GET /api/providers/{providerId}/dashboard` — the owner's day-at-a-glance
   * summary (today's menu state + cutoff, today's batch census + email status). Owner
   * only; a non-owner is existence-hidden (MP-B-060, § 13.2). */
  getDashboard(providerId: string): Promise<ProviderDashboardDto>;
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
  /** `GET /api/providers/{providerId}/catalog` — the owner's catalog library. */
  listCatalog(providerId: string): Promise<CatalogItemDto[]>;
  /** `POST /api/providers/{providerId}/catalog` — add an item (owner). */
  createCatalogItem(
    providerId: string,
    input: CreateCatalogItemRequest,
  ): Promise<CatalogItemDto>;
  /** `PATCH /api/providers/{providerId}/catalog/{catalogItemId}` — edit/archive. */
  updateCatalogItem(
    providerId: string,
    catalogItemId: string,
    patch: UpdateCatalogItemRequest,
  ): Promise<CatalogItemDto>;

  // ── Members ──
  /** `GET /api/providers/{providerId}/members` — cursor-paginated roster. */
  listMembers(providerId: string): Promise<Collection<MemberDto>>;
  /** `POST .../members/{memberId}/approve`. */
  approveMember(providerId: string, memberId: string): Promise<MemberDto>;
  /** `POST .../members/{memberId}/reject`. */
  rejectMember(providerId: string, memberId: string): Promise<MemberDto>;
  /** `POST .../members/{memberId}/remove`. */
  removeMember(providerId: string, memberId: string): Promise<MemberDto>;

  // ── Invites ──
  /** `POST /api/providers/{providerId}/invites` — invite a customer (owner). */
  createInvite(
    providerId: string,
    input: CreateProviderInviteRequest,
  ): Promise<CreateProviderInviteResult>;
  /** `GET /api/provider-invites/{token}` — safe invite preview (pre-acceptance). */
  getInvitePreview(token: string): Promise<ProviderInvitePreviewDto>;
  /** `POST /api/provider-invites/{token}/accept` — accept → awaiting approval. */
  acceptInvite(token: string): Promise<AcceptProviderInviteResult>;

  // ── Member onboarding ──
  /** `GET /api/providers/{providerId}/my-membership` — the caller's own membership. */
  getMyMembership(providerId: string): Promise<MyProviderMembershipDto>;
  /** `POST /api/providers/{providerId}/complete-member-onboarding`. */
  completeMemberOnboarding(
    providerId: string,
    input: CompleteMemberOnboardingRequest,
  ): Promise<MyProviderMembershipDto>;

  // ── Menus ──
  /** `POST /api/providers/{providerId}/menus` — author a new DRAFT menu day with its
   * full component tree (owner). The server denormalizes display fields off the
   * owner-private catalog; returns the created (draft) `MenuDayDto`. */
  createMenuDay(
    providerId: string,
    input: CreateMenuDayInput,
  ): Promise<MenuDayDto>;
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

  // ── Suggestions ──
  /** `POST /api/provider-menu-days/{menuDayId}/suggestions` — a member files a
   * non-binding suggestion for the day (rate-limited; BR-012). */
  createSuggestion(
    menuDayId: string,
    body: CreateProviderSuggestionRequest,
  ): Promise<ProviderSuggestionDto>;
  /** `POST /api/provider-suggestions/{suggestionId}/accept-as-option` — owner marks a
   * pending suggestion accepted (optional note). */
  acceptSuggestionAsOption(
    suggestionId: string,
    body?: ResolveProviderSuggestionRequest,
  ): Promise<ProviderSuggestionDto>;
  /** `POST /api/provider-suggestions/{suggestionId}/reject` — owner rejects a pending
   * suggestion (optional note). */
  rejectSuggestion(
    suggestionId: string,
    body?: ResolveProviderSuggestionRequest,
  ): Promise<ProviderSuggestionDto>;

  // ── Preparation ──
  /** `GET /api/providers/{providerId}/preparation-batches` — the owner's index of
   * generated batches (one per menu day's current revision, newest first). Owner only. */
  listBatches(providerId: string): Promise<ProviderBatchSummaryDto[]>;
  /** `GET /api/provider-menu-days/{menuDayId}/preparation-batch` — the current batch's
   * full roster + menu-day context for a menu day (MP-B-050). Owner only. */
  getPreparationBatch(menuDayId: string): Promise<ProviderBatchDetailDto>;
  /** `GET /api/provider-preparation-batches/{batchId}/aggregate.csv` — owner CSV
   * of the aggregate roster as UTF-8 text (MP-A-160). */
  getAggregateCsv(batchId: string): Promise<string>;
  /** `GET /api/provider-preparation-batches/{batchId}/individual.csv` — owner CSV
   * of the per-member breakdown as UTF-8 text (MP-A-160). */
  getIndividualCsv(batchId: string): Promise<string>;

  // ── Provider override / batch regenerate (owner; MP-A-150) ──
  /** `POST /api/provider-responses/{responseId}/provider-override` — owner corrects a
   * locked response after cutoff (reason + corrected order); marks the batch stale. */
  overrideResponse(
    responseId: string,
    body: ProviderOverrideResponseRequest,
  ): Promise<ProviderOverrideResultDto>;
  /** `POST /api/provider-preparation-batches/{batchId}/regenerate` — owner rebuilds the
   * roster as a new immutable revision N+1 (email not auto-resent). */
  regenerateBatch(batchId: string): Promise<ProviderBatchRevisionDto>;

  // ── Summary email (owner; MP-A-161) ──
  /** `POST /api/provider-preparation-batches/{batchId}/resend-email` — owner sends
   * (or resends) the preparation-summary email built from this persisted batch
   * revision to the provider's configured recipients. Best-effort (ADR-12): returns
   * an honest `emailStatus` rather than failing the request. */
  resendSummaryEmail(batchId: string): Promise<ProviderSummaryEmailResultDto>;
}
