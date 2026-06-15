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
  renderAggregateCsv,
  renderIndividualCsv,
  type AcceptProviderInviteResult,
  type CatalogItemDto,
  type CompleteMemberOnboardingRequest,
  type CreateCatalogItemRequest,
  type CreateMenuDayInput,
  type CreateProviderInviteResult,
  type EditMenuDayInput,
  type MemberDto,
  type MemberResponseDto,
  type MenuDayDto,
  type UpdateMenuDayNoteInput,
  type MyProviderMembershipDto,
  type ProviderApiClient,
  type ProviderBatchDetailDto,
  type ProviderBatchRevisionDto,
  type ProviderBatchSummaryDto,
  type ProviderCreateInput,
  type ProviderDashboardDto,
  type ProviderDto,
  type ProviderInvitePreviewDto,
  type ProviderOverrideResultDto,
  type ProviderSuggestionDto,
  type ProviderSummaryDto,
  type ProviderSummaryEmailResultDto,
  type ProviderUpdateInput,
  type SaveProviderResponseRequest,
  type UpdateCatalogItemRequest,
} from "@/packages/shared/provider";

const f = providerFixtures;

// A monotonic id source so each mock-created catalog item gets a distinct id
// (the real server assigns one) — reusing a fixture id would collide React keys
// when the UI lists several just-created items.
let mockCatalogSeq = 0;

// A monotonic id source so each mock-authored menu day gets a distinct id.
let mockMenuDaySeq = 0;

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
  getDashboard(): Promise<ProviderDashboardDto> {
    return Promise.resolve(f.dashboard);
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
  createCatalogItem(
    _providerId: string,
    input: CreateCatalogItemRequest,
  ): Promise<CatalogItemDto> {
    // Echo the submitted item as a freshly-created active catalog item so the UI
    // sees its own input; the real server assigns the id + defaults.
    return Promise.resolve({
      ...f.catalogItems[0]!,
      catalogItemId: `mock-catalog-${++mockCatalogSeq}`,
      name: input.name,
      componentGroup: input.componentGroup,
      canonicalUnit: input.canonicalUnit,
      defaultQuantity: input.defaultQuantity,
      imageUrl: input.imageUrl ?? null,
      supportsSpiceLevel: input.supportsSpiceLevel ?? false,
      supportsSaltLevel: input.supportsSaltLevel ?? false,
      allergyWarning: input.allergyWarning ?? null,
      sourceDishId: input.sourceDishId ?? null,
      isActive: true,
    });
  },
  updateCatalogItem(
    _providerId: string,
    catalogItemId: string,
    patch: UpdateCatalogItemRequest,
  ): Promise<CatalogItemDto> {
    return Promise.resolve({ ...f.catalogItems[0]!, catalogItemId, ...patch });
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
  createMenuDay(
    _providerId: string,
    input: CreateMenuDayInput,
  ): Promise<MenuDayDto> {
    // Echo a freshly-authored DRAFT day from the input's date/cutoff/note over the
    // canonical menu-day fixture so the builder UI sees its own header; the real
    // server assigns ids and denormalizes the component tree off the catalog.
    return Promise.resolve({
      ...f.publishedMenuDay,
      menuDayId: `mock-menu-day-${++mockMenuDaySeq}`,
      status: "draft",
      publishedAt: null,
      lockedAt: null,
      menuDate: input.menuDate,
      cutoffAt: input.cutoffAt,
      note: input.note ?? null,
    });
  },
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
  reviseMenuDay(
    _menuDayId: string,
    input: EditMenuDayInput,
  ): Promise<MenuDayDto> {
    // Echo the edited cutoff/note over the canonical fixture; the real server applies
    // the in-place-vs-revision policy and re-reads the live day.
    return Promise.resolve({
      ...f.publishedMenuDay,
      cutoffAt: input.cutoffAt,
      note: input.note ?? null,
    });
  },
  updateMenuDayNote(
    _menuDayId: string,
    input: UpdateMenuDayNoteInput,
  ): Promise<MenuDayDto> {
    return Promise.resolve({ ...f.publishedMenuDay, note: input.note });
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

  // ── Suggestions ──
  createSuggestion(): Promise<ProviderSuggestionDto> {
    return Promise.resolve(f.pendingSuggestion);
  },
  acceptSuggestionAsOption(): Promise<ProviderSuggestionDto> {
    return Promise.resolve(f.acceptedSuggestion);
  },
  rejectSuggestion(): Promise<ProviderSuggestionDto> {
    return Promise.resolve(f.rejectedSuggestion);
  },

  // ── Preparation ──
  listBatches(): Promise<ProviderBatchSummaryDto[]> {
    return Promise.resolve(f.batchSummaries);
  },
  getPreparationBatch(): Promise<ProviderBatchDetailDto> {
    return Promise.resolve(f.currentBatch);
  },
  getAggregateCsv(): Promise<string> {
    return Promise.resolve(renderAggregateCsv(f.currentBatch.aggregateLines));
  },
  getIndividualCsv(): Promise<string> {
    return Promise.resolve(renderIndividualCsv(f.currentBatch.individualLines));
  },

  // ── Provider override / batch regenerate ──
  overrideResponse(responseId: string): Promise<ProviderOverrideResultDto> {
    return Promise.resolve({ ...f.overrideResult, responseId });
  },
  regenerateBatch(): Promise<ProviderBatchRevisionDto> {
    return Promise.resolve(f.batchRevision);
  },

  // ── Summary email ──
  resendSummaryEmail(): Promise<ProviderSummaryEmailResultDto> {
    return Promise.resolve({ emailStatus: "sent", recipientCount: 1 });
  },
};
