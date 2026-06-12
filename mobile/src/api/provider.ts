import type {
  BatchDto,
  CatalogItemDto,
  MemberDto,
  MemberResponseDto,
  MenuDayDto,
  ProviderApiClient,
  ProviderCreateInput,
  ProviderDto,
  ProviderSummaryDto,
  ProviderUpdateInput,
  SaveProviderResponseRequest,
} from "@mmp/shared/provider";
import type { Collection } from "@mmp/shared/types";

import { apiRequest, getCollection } from "./client";

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

  // ── Preparation ──
  getPreparationBatch(menuDayId: string): Promise<BatchDto> {
    return apiRequest<BatchDto>(`${menuDay(menuDayId)}/preparation-batch`);
  },
};
