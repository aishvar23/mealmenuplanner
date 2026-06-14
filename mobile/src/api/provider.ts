import type {
  AcceptProviderInviteResult,
  CatalogItemDto,
  CompleteMemberOnboardingRequest,
  CreateCatalogItemRequest,
  CreateProviderInviteRequest,
  CreateProviderInviteResult,
  CreateProviderSuggestionRequest,
  MemberDto,
  MemberResponseDto,
  MenuDayDto,
  MyProviderMembershipDto,
  ProviderApiClient,
  ProviderBatchDetailDto,
  ProviderBatchRevisionDto,
  ProviderBatchSummaryDto,
  ProviderCreateInput,
  ProviderDto,
  ProviderInvitePreviewDto,
  ProviderOverrideResponseRequest,
  ProviderOverrideResultDto,
  ProviderSuggestionDto,
  ProviderSummaryDto,
  ProviderSummaryEmailResultDto,
  ProviderUpdateInput,
  ResolveProviderSuggestionRequest,
  SaveProviderResponseRequest,
  UpdateCatalogItemRequest,
} from "@mmp/shared/provider";
import type { Collection } from "@mmp/shared/types";

import { apiRequest, getCollection, requestText } from "./client";

/**
 * Typed HTTP client for the Meal Provider Workspace `/api/*` routes (MP-C-000,
 * the Track-C analogue of the web mock — contract 03 § 8/§ 14, ADR-17).
 *
 * It implements the shared `ProviderApiClient` interface against the same bearer
 * `/api/*` backend the web app uses, so every later MP-C provider screen renders
 * identically whether it is fed this live client or the fixture-backed mock
 * (`src/provider/__fixtures__/mock-client.ts`). It shares **no** code with the
 * Next.js UI — same routes, same `@mmp/shared/provider` DTOs, same transport
 * (`./client`'s `apiRequest`/`getCollection`, which inject the bearer token, map
 * the uniform error envelope to `ApiError`, and refresh-and-retry once on 401).
 *
 * It adds no transport assumptions of its own: reads return DTOs (or `null` where
 * the route may legitimately have no current resource), mutations send only the
 * IDs and the one contract-fixed request body. Routes whose request bodies are
 * not yet frozen by an MP-A service task (invite/preview, catalog write,
 * suggestions, override/regenerate/resend, CSV) are added here alongside that
 * task, mirroring the contract seam in `@mmp/shared/provider`.
 */

const providers = "/api/providers";

/** A provider's nested member-response routes share this menu-day prefix. */
const menuDay = (menuDayId: string) => `/api/provider-menu-days/${menuDayId}`;

export const providerApiClient: ProviderApiClient = {
  // ── Discovery / provider ──
  async listProviders(): Promise<ProviderSummaryDto[]> {
    const { data } = await getCollection<ProviderSummaryDto>(providers);
    return data;
  },
  getProvider(providerId: string): Promise<ProviderDto> {
    return apiRequest<ProviderDto>(`${providers}/${providerId}`);
  },
  createProvider(input: ProviderCreateInput): Promise<ProviderDto> {
    return apiRequest<ProviderDto>(providers, { method: "POST", body: input });
  },
  updateProvider(
    providerId: string,
    patch: ProviderUpdateInput,
  ): Promise<ProviderDto> {
    return apiRequest<ProviderDto>(`${providers}/${providerId}`, {
      method: "PATCH",
      body: patch,
    });
  },
  completeProviderOnboarding(providerId: string): Promise<ProviderDto> {
    return apiRequest<ProviderDto>(
      `${providers}/${providerId}/complete-onboarding`,
      { method: "POST" },
    );
  },

  // ── Catalog ──
  listCatalog(providerId: string): Promise<CatalogItemDto[]> {
    return apiRequest<CatalogItemDto[]>(`${providers}/${providerId}/catalog`);
  },
  createCatalogItem(
    providerId: string,
    input: CreateCatalogItemRequest,
  ): Promise<CatalogItemDto> {
    return apiRequest<CatalogItemDto>(`${providers}/${providerId}/catalog`, {
      method: "POST",
      body: input,
    });
  },
  updateCatalogItem(
    providerId: string,
    catalogItemId: string,
    patch: UpdateCatalogItemRequest,
  ): Promise<CatalogItemDto> {
    return apiRequest<CatalogItemDto>(
      `${providers}/${providerId}/catalog/${catalogItemId}`,
      { method: "PATCH", body: patch },
    );
  },

  // ── Members ──
  listMembers(providerId: string): Promise<Collection<MemberDto>> {
    return getCollection<MemberDto>(`${providers}/${providerId}/members`);
  },
  approveMember(providerId: string, memberId: string): Promise<MemberDto> {
    return apiRequest<MemberDto>(
      `${providers}/${providerId}/members/${memberId}/approve`,
      { method: "POST" },
    );
  },
  rejectMember(providerId: string, memberId: string): Promise<MemberDto> {
    return apiRequest<MemberDto>(
      `${providers}/${providerId}/members/${memberId}/reject`,
      { method: "POST" },
    );
  },
  removeMember(providerId: string, memberId: string): Promise<MemberDto> {
    return apiRequest<MemberDto>(
      `${providers}/${providerId}/members/${memberId}/remove`,
      { method: "POST" },
    );
  },

  // ── Invites ──
  createInvite(
    providerId: string,
    input: CreateProviderInviteRequest,
  ): Promise<CreateProviderInviteResult> {
    return apiRequest<CreateProviderInviteResult>(
      `${providers}/${providerId}/invites`,
      { method: "POST", body: input },
    );
  },
  getInvitePreview(token: string): Promise<ProviderInvitePreviewDto> {
    return apiRequest<ProviderInvitePreviewDto>(
      `/api/provider-invites/${token}`,
    );
  },
  acceptInvite(token: string): Promise<AcceptProviderInviteResult> {
    return apiRequest<AcceptProviderInviteResult>(
      `/api/provider-invites/${token}/accept`,
      { method: "POST" },
    );
  },

  // ── Member onboarding ──
  getMyMembership(providerId: string): Promise<MyProviderMembershipDto> {
    return apiRequest<MyProviderMembershipDto>(
      `${providers}/${providerId}/my-membership`,
    );
  },
  completeMemberOnboarding(
    providerId: string,
    input: CompleteMemberOnboardingRequest,
  ): Promise<MyProviderMembershipDto> {
    return apiRequest<MyProviderMembershipDto>(
      `${providers}/${providerId}/complete-member-onboarding`,
      { method: "POST", body: input },
    );
  },

  // ── Menus ──
  getMenuDay(menuDayId: string): Promise<MenuDayDto> {
    return apiRequest<MenuDayDto>(menuDay(menuDayId));
  },
  getTodayMenu(providerId: string): Promise<MenuDayDto | null> {
    return apiRequest<MenuDayDto | null>(
      `${providers}/${providerId}/today-menu`,
    );
  },
  getWeeklyMenu(providerId: string): Promise<MenuDayDto[]> {
    return apiRequest<MenuDayDto[]>(`${providers}/${providerId}/weekly-menu`);
  },
  publishMenuDay(menuDayId: string): Promise<MenuDayDto> {
    return apiRequest<MenuDayDto>(`${menuDay(menuDayId)}/publish`, {
      method: "POST",
    });
  },

  // ── Member response ──
  getMyResponse(menuDayId: string): Promise<MemberResponseDto> {
    return apiRequest<MemberResponseDto>(`${menuDay(menuDayId)}/my-response`);
  },
  saveMyResponse(
    menuDayId: string,
    body: SaveProviderResponseRequest,
  ): Promise<MemberResponseDto> {
    return apiRequest<MemberResponseDto>(`${menuDay(menuDayId)}/my-response`, {
      method: "PUT",
      body,
    });
  },
  confirmResponse(responseId: string): Promise<MemberResponseDto> {
    return apiRequest<MemberResponseDto>(
      `/api/provider-responses/${responseId}/confirm`,
      { method: "POST" },
    );
  },
  cancelResponse(responseId: string): Promise<MemberResponseDto> {
    return apiRequest<MemberResponseDto>(
      `/api/provider-responses/${responseId}/cancel`,
      { method: "POST" },
    );
  },

  // ── Suggestions ──
  createSuggestion(
    menuDayId: string,
    body: CreateProviderSuggestionRequest,
  ): Promise<ProviderSuggestionDto> {
    return apiRequest<ProviderSuggestionDto>(
      `${menuDay(menuDayId)}/suggestions`,
      {
        method: "POST",
        body,
      },
    );
  },
  acceptSuggestionAsOption(
    suggestionId: string,
    body?: ResolveProviderSuggestionRequest,
  ): Promise<ProviderSuggestionDto> {
    return apiRequest<ProviderSuggestionDto>(
      `/api/provider-suggestions/${suggestionId}/accept-as-option`,
      { method: "POST", body: body ?? {} },
    );
  },
  rejectSuggestion(
    suggestionId: string,
    body?: ResolveProviderSuggestionRequest,
  ): Promise<ProviderSuggestionDto> {
    return apiRequest<ProviderSuggestionDto>(
      `/api/provider-suggestions/${suggestionId}/reject`,
      { method: "POST", body: body ?? {} },
    );
  },

  // ── Preparation ──
  listBatches(providerId: string): Promise<ProviderBatchSummaryDto[]> {
    return apiRequest<ProviderBatchSummaryDto[]>(
      `${providers}/${providerId}/preparation-batches`,
    );
  },
  getPreparationBatch(menuDayId: string): Promise<ProviderBatchDetailDto> {
    return apiRequest<ProviderBatchDetailDto>(
      `${menuDay(menuDayId)}/preparation-batch`,
    );
  },
  getAggregateCsv(batchId: string): Promise<string> {
    return requestText(
      `/api/provider-preparation-batches/${batchId}/aggregate.csv`,
    );
  },
  getIndividualCsv(batchId: string): Promise<string> {
    return requestText(
      `/api/provider-preparation-batches/${batchId}/individual.csv`,
    );
  },

  // ── Provider override / batch regenerate (owner; MP-A-150) ──
  overrideResponse(
    responseId: string,
    body: ProviderOverrideResponseRequest,
  ): Promise<ProviderOverrideResultDto> {
    return apiRequest<ProviderOverrideResultDto>(
      `/api/provider-responses/${responseId}/provider-override`,
      { method: "POST", body },
    );
  },
  regenerateBatch(batchId: string): Promise<ProviderBatchRevisionDto> {
    return apiRequest<ProviderBatchRevisionDto>(
      `/api/provider-preparation-batches/${batchId}/regenerate`,
      { method: "POST" },
    );
  },

  // ── Summary email (owner; MP-A-161) ──
  resendSummaryEmail(batchId: string): Promise<ProviderSummaryEmailResultDto> {
    return apiRequest<ProviderSummaryEmailResultDto>(
      `/api/provider-preparation-batches/${batchId}/resend-email`,
      { method: "POST" },
    );
  },
};
