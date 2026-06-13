/**
 * Fixture-backed mock provider API client (MP-B-001).
 *
 * Implements the shared `ProviderApiClient` contract (contract 03 § 8/§ 14)
 * entirely from the canonical fixtures, so Track B (web) and — once it consumes
 * the same interface — Track C (mobile) UI can render every provider screen
 * before Developer A's `/api/*` routes exist. Swapping this for the real HTTP
 * client later is a one-line change at the composition root; screens written
 * against `ProviderApiClient` do not change.
 *
 * No network, no auth, no transport — pure resolved promises over the fixtures.
 */

import { boundedCollection, type Collection } from "@/lib/http/collection";
import {
  providerFixtures,
  type AcceptProviderInviteResult,
  type BatchDto,
  type CatalogItemDto,
  type CompleteMemberOnboardingRequest,
  type CreateProviderInviteResult,
  type MemberDto,
  type MemberResponseDto,
  type MenuDayDto,
  type MyProviderMembershipDto,
  type ProviderApiClient,
  type ProviderCreateInput,
  type ProviderDto,
  type ProviderInvitePreviewDto,
  type ProviderSummaryDto,
  type ProviderUpdateInput,
  type SaveProviderResponseRequest,
} from "@/packages/shared/provider";

const f = providerFixtures;

/** Pick the fixture provider matching an id, defaulting to provider A. */
function providerFor(providerId: string): ProviderDto {
  return providerId === f.PROVIDER_B_ID ? f.providerB : f.providerA;
}

/**
 * The fixture-backed mock. Reads return canonical fixtures; mutations echo a
 * plausibly-updated fixture (e.g. `saveMyResponse` bumps the version) so
 * optimistic-update and confirm/cancel flows can be exercised in the UI.
 */
export const mockProviderClient: ProviderApiClient = {
  // ── Discovery / provider ──
  listProviders(): Promise<ProviderSummaryDto[]> {
    return Promise.resolve(f.multiProviderSummaries);
  },
  getProvider(providerId: string): Promise<ProviderDto> {
    return Promise.resolve(providerFor(providerId));
  },
  createProvider(input: ProviderCreateInput): Promise<ProviderDto> {
    return Promise.resolve({
      ...f.providerA,
      name: input.name,
      status: "draft",
    });
  },
  updateProvider(
    providerId: string,
    patch: ProviderUpdateInput,
  ): Promise<ProviderDto> {
    return Promise.resolve({ ...providerFor(providerId), ...patch });
  },
  completeProviderOnboarding(providerId: string): Promise<ProviderDto> {
    return Promise.resolve({ ...providerFor(providerId), status: "active" });
  },

  // ── Catalog ──
  listCatalog(): Promise<CatalogItemDto[]> {
    return Promise.resolve(f.catalogItems);
  },

  // ── Members ──
  listMembers(): Promise<Collection<MemberDto>> {
    return Promise.resolve(boundedCollection(f.members));
  },
  approveMember(): Promise<MemberDto> {
    return Promise.resolve({
      ...f.approvedMember,
      status: "active",
      approvedAt: "2026-06-11T15:00:00Z",
    });
  },
  rejectMember(): Promise<MemberDto> {
    return Promise.resolve({ ...f.awaitingMember, status: "rejected" });
  },
  removeMember(): Promise<MemberDto> {
    return Promise.resolve({ ...f.approvedMember, status: "removed" });
  },

  // ── Invites ──
  createInvite(): Promise<CreateProviderInviteResult> {
    return Promise.resolve(f.createInviteResult);
  },
  getInvitePreview(): Promise<ProviderInvitePreviewDto> {
    return Promise.resolve(f.invitePreview);
  },
  acceptInvite(): Promise<AcceptProviderInviteResult> {
    return Promise.resolve(f.acceptInviteResult);
  },

  // ── Member onboarding ──
  getMyMembership(): Promise<MyProviderMembershipDto> {
    return Promise.resolve(f.myMembershipPending);
  },
  completeMemberOnboarding(
    _providerId: string,
    input: CompleteMemberOnboardingRequest,
  ): Promise<MyProviderMembershipDto> {
    return Promise.resolve({
      ...f.myMembershipOnboarded,
      displayName: input.displayName,
      phone: input.phone,
      defaultSpiceLevel: input.defaultSpiceLevel,
      autoAcceptConsented:
        input.autoAcceptConsent && f.myMembershipPending.autoAcceptEligible,
    });
  },

  // ── Menus ──
  getMenuDay(): Promise<MenuDayDto> {
    return Promise.resolve(f.publishedMenuDay);
  },
  getTodayMenu(): Promise<MenuDayDto | null> {
    return Promise.resolve(f.publishedMenuDay);
  },
  getWeeklyMenu(): Promise<MenuDayDto[]> {
    return Promise.resolve([f.publishedMenuDay]);
  },
  publishMenuDay(): Promise<MenuDayDto> {
    return Promise.resolve({ ...f.publishedMenuDay, status: "published" });
  },

  // ── Member response ──
  getMyResponse(): Promise<MemberResponseDto> {
    return Promise.resolve(f.draftResponse);
  },
  saveMyResponse(
    _menuDayId: string,
    body: SaveProviderResponseRequest,
  ): Promise<MemberResponseDto> {
    return Promise.resolve({
      ...f.confirmedResponse,
      status: "draft",
      version: (body.expectedVersion ?? 0) + 1,
      // Echo the caller's submitted selections (the request and response item
      // shapes match) so optimistic-update UI exercised against the mock sees
      // its own edits, not a stale fixture. The real server derives authoritative
      // quantity/unit/limits from menu config (§ 11.6); the mock trusts the body.
      items: body.items,
      memberNote: body.memberNote,
    });
  },
  confirmResponse(): Promise<MemberResponseDto> {
    return Promise.resolve(f.confirmedResponse);
  },
  cancelResponse(): Promise<MemberResponseDto> {
    return Promise.resolve(f.cancelledResponse);
  },

  // ── Preparation ──
  getPreparationBatch(): Promise<BatchDto> {
    return Promise.resolve(f.currentBatch);
  },
};
