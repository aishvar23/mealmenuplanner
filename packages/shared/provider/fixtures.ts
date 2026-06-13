// Provider Workspace — shared, contract-bound fixtures (contract 03 § 14).
//
// One fixtures module consumed by both the web mock client (MP-B-001) and the
// mobile client tests / Track-A route tests, so the same canonical data renders
// every provider screen before live APIs exist. Every fixture is typed by a DTO
// from `./dtos`, so a shape change in the contract breaks compilation here
// rather than drifting silently. Timestamps are fixed literals (the workflow
// runtime forbids `Date.now()`); IDs are stable, readable strings.

import type {
  AcceptProviderInviteResult,
  BatchDto,
  CatalogItemDto,
  CreateProviderInviteResult,
  MemberDto,
  MemberResponseDto,
  MenuDayDto,
  MyProviderMembershipDto,
  PreparationLine,
  ProviderBatchRevisionDto,
  ProviderDto,
  ProviderInvitePreviewDto,
  ProviderOverrideResultDto,
  ProviderSummaryDto,
} from "./dtos";
import type { WorkspaceDiscovery, WorkspaceRef } from "./workspace";

// ─────────────────────────── Stable identifiers ───────────────────────────

export const PROVIDER_A_ID = "prov-a";
export const PROVIDER_B_ID = "prov-b";

const MENU_DAY_ID = "menu-day-2026-06-11";
const WEEKLY_MENU_ID = "weekly-menu-2026-w24";

const COMPONENT_DAL_ID = "comp-dal";
const COMPONENT_BREAD_ID = "comp-bread";
const COMPONENT_RICE_ID = "comp-rice";

const CAT_RAJMA_ID = "cat-dal-rajma";
const CAT_CHANA_ID = "cat-dal-chana";
const CAT_ROTI_ID = "cat-bread-roti";
const CAT_RICE_ID = "cat-rice-jeera";

const CUSTOMIZATION_GROUP_ID = "cust-extra-dal";
const CUSTOMIZATION_OPTION_ID = "opt-extra-dal-portion";

// ───────────────────────────── Providers ─────────────────────────────

export const providerA: ProviderDto = {
  providerId: PROVIDER_A_ID,
  name: "Anna's Home Tiffins",
  email: "anna@example.com",
  phone: "+15555550100",
  city: "Austin",
  state: "TX",
  country: "US",
  timezone: "America/Chicago",
  status: "active",
  defaultCutoffLocalTime: "09:30",
  summaryEmailRecipients: ["anna@example.com", "kitchen@example.com"],
};

export const providerB: ProviderDto = {
  providerId: PROVIDER_B_ID,
  name: "Bay Area Bhojan",
  email: "hello@bhojan.example.com",
  phone: "+15555550200",
  city: "Fremont",
  state: "CA",
  country: "US",
  timezone: "America/Los_Angeles",
  status: "active",
  defaultCutoffLocalTime: "10:00",
  summaryEmailRecipients: ["hello@bhojan.example.com"],
};

// Multi-provider membership set: owner of A, approved customer of B, awaiting at
// a third provider — exercises the workspace switcher + isolation tests.
export const multiProviderSummaries: ProviderSummaryDto[] = [
  {
    providerId: PROVIDER_A_ID,
    name: providerA.name,
    role: "owner",
    membershipStatus: "active",
    timezone: providerA.timezone,
  },
  {
    providerId: PROVIDER_B_ID,
    name: providerB.name,
    role: "customer",
    membershipStatus: "active",
    timezone: providerB.timezone,
  },
  {
    providerId: "prov-c",
    name: "Curry Collective",
    role: "customer",
    membershipStatus: "awaiting_approval",
    timezone: "America/New_York",
  },
];

// ─────────────────────────────── Members ───────────────────────────────

export const ownerMember: MemberDto = {
  memberId: "member-owner",
  userId: "user-anna",
  displayName: "Anna",
  email: "anna@example.com",
  phone: "+15555550100",
  role: "owner",
  status: "active",
  approvedAt: "2026-05-01T12:00:00Z",
  joinedAt: "2026-05-01T12:00:00Z",
};

export const awaitingMember: MemberDto = {
  memberId: "member-awaiting",
  userId: "user-bilal",
  displayName: "Bilal",
  email: "bilal@example.com",
  phone: null,
  role: "customer",
  status: "awaiting_approval",
  approvedAt: null,
  joinedAt: null,
};

export const approvedMember: MemberDto = {
  memberId: "member-approved",
  userId: "user-chitra",
  displayName: "Chitra",
  email: "chitra@example.com",
  phone: "+15555550301",
  role: "customer",
  status: "active",
  approvedAt: "2026-05-20T15:30:00Z",
  joinedAt: "2026-05-20T15:30:00Z",
};

export const members: MemberDto[] = [
  ownerMember,
  approvedMember,
  awaitingMember,
];

// ─────────────────────────── Invites / onboarding ───────────────────────────

export const INVITE_TOKEN = "prov-invite-token-abc123";

export const createInviteResult: CreateProviderInviteResult = {
  inviteId: "invite-1",
  inviteLink: `https://app.example.com/provider-invite/${INVITE_TOKEN}`,
  emailStatus: "sent",
};

export const invitePreview: ProviderInvitePreviewDto = {
  providerName: providerA.name,
  invitedByName: "Anna",
  role: "customer",
  expiresAt: "2026-06-18T12:00:00Z",
};

export const acceptInviteResult: AcceptProviderInviteResult = {
  providerId: PROVIDER_A_ID,
  membershipStatus: "awaiting_approval",
};

/** An approved customer who has NOT yet completed minimal onboarding. */
export const myMembershipPending: MyProviderMembershipDto = {
  providerId: PROVIDER_B_ID,
  role: "customer",
  status: "active",
  onboardingComplete: false,
  displayName: null,
  phone: null,
  defaultSpiceLevel: null,
  autoAcceptEligible: false,
  autoAcceptConsented: false,
};

/** The same customer once minimal onboarding is complete. */
export const myMembershipOnboarded: MyProviderMembershipDto = {
  ...myMembershipPending,
  onboardingComplete: true,
  displayName: "Chitra",
  phone: "+15555550301",
  defaultSpiceLevel: "regular",
};

// ─────────────────────────────── Catalog ───────────────────────────────

export const catalogItems: CatalogItemDto[] = [
  {
    catalogItemId: CAT_RAJMA_ID,
    name: "Rajma",
    componentGroup: "dal_or_legume",
    canonicalUnit: "oz",
    defaultQuantity: 16,
    imageUrl: null,
    isActive: true,
    supportsSpiceLevel: true,
    supportsSaltLevel: true,
    allergyWarning: null,
    sourceDishId: null,
  },
  {
    catalogItemId: CAT_CHANA_ID,
    name: "Chana Masala",
    componentGroup: "dal_or_legume",
    canonicalUnit: "oz",
    defaultQuantity: 16,
    imageUrl: null,
    isActive: true,
    supportsSpiceLevel: true,
    supportsSaltLevel: true,
    allergyWarning: null,
    sourceDishId: null,
  },
  {
    catalogItemId: CAT_ROTI_ID,
    name: "Roti",
    componentGroup: "bread",
    canonicalUnit: "piece",
    defaultQuantity: 2,
    imageUrl: null,
    isActive: true,
    supportsSpiceLevel: false,
    supportsSaltLevel: false,
    allergyWarning: "Contains wheat (gluten).",
    sourceDishId: null,
  },
  {
    catalogItemId: CAT_RICE_ID,
    name: "Jeera Rice",
    componentGroup: "rice",
    canonicalUnit: "oz",
    defaultQuantity: 8,
    imageUrl: null,
    isActive: true,
    supportsSpiceLevel: false,
    supportsSaltLevel: true,
    allergyWarning: null,
    sourceDishId: null,
  },
];

// ────────────────────────── Published menu day ──────────────────────────

export const publishedMenuDay: MenuDayDto = {
  menuDayId: MENU_DAY_ID,
  providerId: PROVIDER_A_ID,
  weeklyMenuId: WEEKLY_MENU_ID,
  menuDate: "2026-06-11",
  cutoffAt: "2026-06-11T14:30:00Z",
  status: "published",
  note: "Fresh rajma soaked overnight.",
  publishedAt: "2026-06-10T18:00:00Z",
  lockedAt: null,
  components: [
    {
      menuComponentId: COMPONENT_DAL_ID,
      componentGroup: "dal_or_legume",
      defaultCatalogItemId: CAT_RAJMA_ID,
      defaultQuantity: 16,
      canonicalUnit: "oz",
      isRequired: true,
      sortOrder: 0,
      supportsSpiceLevel: true,
      supportsSaltLevel: true,
      alternatives: [
        {
          alternativeId: "alt-chana",
          catalogItemId: CAT_CHANA_ID,
          quantity: 16,
          canonicalUnit: "oz",
        },
      ],
      customizationGroups: [
        {
          customizationGroupId: CUSTOMIZATION_GROUP_ID,
          name: "Extra dal portions",
          customizationType: "quantity_increment",
          includedInPrice: false,
          isRequired: false,
          minimumSelections: 0,
          maximumSelections: 1,
          options: [
            {
              optionId: CUSTOMIZATION_OPTION_ID,
              code: "extra_portion",
              label: "Extra portion (+8 oz)",
              quantityDelta: 8,
              externalPriceLabel: "+$3",
              minimumQuantity: 0,
              maximumQuantity: 3,
            },
          ],
        },
      ],
    },
    {
      menuComponentId: COMPONENT_BREAD_ID,
      componentGroup: "bread",
      defaultCatalogItemId: CAT_ROTI_ID,
      defaultQuantity: 2,
      canonicalUnit: "piece",
      isRequired: true,
      sortOrder: 1,
      supportsSpiceLevel: false,
      supportsSaltLevel: false,
      alternatives: [],
      customizationGroups: [],
    },
    {
      menuComponentId: COMPONENT_RICE_ID,
      componentGroup: "rice",
      defaultCatalogItemId: CAT_RICE_ID,
      defaultQuantity: 8,
      canonicalUnit: "oz",
      isRequired: false,
      sortOrder: 2,
      supportsSpiceLevel: false,
      supportsSaltLevel: true,
      alternatives: [],
      customizationGroups: [],
    },
  ],
};

// ────────────────────────────── Responses ──────────────────────────────

/** The default package, no edits yet (`responseId` null before first save). */
export const draftResponse: MemberResponseDto = {
  responseId: null,
  menuDayId: MENU_DAY_ID,
  status: "draft",
  version: 0,
  memberNote: null,
  items: [
    {
      menuComponentId: COMPONENT_DAL_ID,
      selectedCatalogItemId: CAT_RAJMA_ID,
      quantity: 16,
      canonicalUnit: "oz",
      spiceLevel: "regular",
      saltLevel: "regular_salt",
      customizations: [],
    },
    {
      menuComponentId: COMPONENT_BREAD_ID,
      selectedCatalogItemId: CAT_ROTI_ID,
      quantity: 2,
      canonicalUnit: "piece",
      spiceLevel: null,
      saltLevel: null,
      customizations: [],
    },
  ],
  lockedAt: null,
};

export const confirmedResponse: MemberResponseDto = {
  responseId: "resp-confirmed",
  menuDayId: MENU_DAY_ID,
  status: "confirmed",
  version: 2,
  memberNote: "Less oil please.",
  items: [
    {
      menuComponentId: COMPONENT_DAL_ID,
      selectedCatalogItemId: CAT_CHANA_ID,
      quantity: 16,
      canonicalUnit: "oz",
      spiceLevel: "spicy",
      saltLevel: "low_salt",
      customizations: [
        { customizationOptionId: CUSTOMIZATION_OPTION_ID, quantity: 1 },
      ],
    },
    {
      menuComponentId: COMPONENT_BREAD_ID,
      selectedCatalogItemId: CAT_ROTI_ID,
      quantity: 2,
      canonicalUnit: "piece",
      spiceLevel: null,
      saltLevel: null,
      customizations: [],
    },
  ],
  lockedAt: null,
};

export const cancelledResponse: MemberResponseDto = {
  responseId: "resp-cancelled",
  menuDayId: MENU_DAY_ID,
  status: "cancelled",
  version: 3,
  memberNote: null,
  items: [],
  lockedAt: null,
};

export const lockedResponse: MemberResponseDto = {
  ...confirmedResponse,
  responseId: "resp-locked",
  status: "locked",
  lockedAt: "2026-06-11T14:30:00Z",
};

export const autoAcceptedResponse: MemberResponseDto = {
  responseId: "resp-auto",
  menuDayId: MENU_DAY_ID,
  status: "auto_accepted",
  version: 1,
  memberNote: null,
  items: [
    {
      menuComponentId: COMPONENT_DAL_ID,
      selectedCatalogItemId: CAT_RAJMA_ID,
      quantity: 16,
      canonicalUnit: "oz",
      spiceLevel: "regular",
      saltLevel: "regular_salt",
      customizations: [],
    },
  ],
  lockedAt: "2026-06-11T14:30:00Z",
};

// ───────────────────────────── Batches ─────────────────────────────
//
// The batch reconciles exactly: the three contributing members below (2
// confirmed + 1 auto-accepted = the `totals` that produce food; cancelled /
// no-response contribute nothing) are the sole source of the per-member lines,
// and `aggregateLines` is their grouped sum (by item + spice + salt). So a
// batch-detail screen rendered from this fixture shows an aggregate that adds
// up to the per-member breakdown:
//   Rajma  (regular/regular_salt): Farah 16 + Esha 16            = 32 oz
//   Chana  (spicy/low_salt):       Chitra 16 incl + 8 extra      = 24 oz
//   Roti   (—):                    Chitra 2 + Farah 2 + Esha 2   = 6 pieces

const individualBatchLines: BatchDto["individualLines"] = [
  {
    memberUserId: "user-chitra",
    displayName: "Chitra",
    lines: [
      {
        catalogItemId: CAT_CHANA_ID,
        itemName: "Chana Masala",
        componentGroup: "dal_or_legume",
        spiceLevel: "spicy",
        saltLevel: "low_salt",
        includedQuantity: 16,
        extraQuantity: 8,
        totalQuantity: 24,
        canonicalUnit: "oz",
      },
      {
        catalogItemId: CAT_ROTI_ID,
        itemName: "Roti",
        componentGroup: "bread",
        spiceLevel: null,
        saltLevel: null,
        includedQuantity: 2,
        extraQuantity: 0,
        totalQuantity: 2,
        canonicalUnit: "piece",
      },
    ],
  },
  {
    memberUserId: "user-farah",
    displayName: "Farah",
    lines: [
      {
        catalogItemId: CAT_RAJMA_ID,
        itemName: "Rajma",
        componentGroup: "dal_or_legume",
        spiceLevel: "regular",
        saltLevel: "regular_salt",
        includedQuantity: 16,
        extraQuantity: 0,
        totalQuantity: 16,
        canonicalUnit: "oz",
      },
      {
        catalogItemId: CAT_ROTI_ID,
        itemName: "Roti",
        componentGroup: "bread",
        spiceLevel: null,
        saltLevel: null,
        includedQuantity: 2,
        extraQuantity: 0,
        totalQuantity: 2,
        canonicalUnit: "piece",
      },
    ],
  },
  {
    // Auto-accepted: took the default package (Rajma + Roti) unchanged.
    memberUserId: "user-esha",
    displayName: "Esha",
    lines: [
      {
        catalogItemId: CAT_RAJMA_ID,
        itemName: "Rajma",
        componentGroup: "dal_or_legume",
        spiceLevel: "regular",
        saltLevel: "regular_salt",
        includedQuantity: 16,
        extraQuantity: 0,
        totalQuantity: 16,
        canonicalUnit: "oz",
      },
      {
        catalogItemId: CAT_ROTI_ID,
        itemName: "Roti",
        componentGroup: "bread",
        spiceLevel: null,
        saltLevel: null,
        includedQuantity: 2,
        extraQuantity: 0,
        totalQuantity: 2,
        canonicalUnit: "piece",
      },
    ],
  },
];

const aggregateLines: PreparationLine[] = [
  {
    catalogItemId: CAT_RAJMA_ID,
    itemName: "Rajma",
    componentGroup: "dal_or_legume",
    spiceLevel: "regular",
    saltLevel: "regular_salt",
    includedQuantity: 32,
    extraQuantity: 0,
    totalQuantity: 32,
    canonicalUnit: "oz",
  },
  {
    catalogItemId: CAT_CHANA_ID,
    itemName: "Chana Masala",
    componentGroup: "dal_or_legume",
    spiceLevel: "spicy",
    saltLevel: "low_salt",
    includedQuantity: 16,
    extraQuantity: 8,
    totalQuantity: 24,
    canonicalUnit: "oz",
  },
  {
    catalogItemId: CAT_ROTI_ID,
    itemName: "Roti",
    componentGroup: "bread",
    spiceLevel: null,
    saltLevel: null,
    includedQuantity: 6,
    extraQuantity: 0,
    totalQuantity: 6,
    canonicalUnit: "piece",
  },
];

export const currentBatch: BatchDto = {
  batchId: "batch-rev1",
  menuDayId: MENU_DAY_ID,
  revision: 1,
  status: "current",
  generatedAt: "2026-06-11T14:35:00Z",
  totals: { confirmed: 2, autoAccepted: 1, cancelled: 1, noResponse: 1 },
  aggregateLines,
  individualLines: individualBatchLines,
  emailStatus: "sent",
};

/** Same day, superseded after a provider override (UC-OVERRIDE / § 7). */
export const staleBatch: BatchDto = {
  ...currentBatch,
  batchId: "batch-rev1-stale",
  status: "stale",
};

/** Result of an owner override (UC-OVERRIDE-001; MP-A-150) — the response is now
 * `provider_overridden` and the day's current batch was marked stale. */
export const overrideResult: ProviderOverrideResultDto = {
  responseId: "resp-confirmed",
  menuDayId: MENU_DAY_ID,
  status: "provider_overridden",
  staleBatchId: currentBatch.batchId,
};

/** Result of a regenerate (UC-OVERRIDE-002; MP-A-150) — the fresh current revision 2;
 * email is NOT auto-resent. */
export const batchRevision: ProviderBatchRevisionDto = {
  batchId: "batch-rev2",
  menuDayId: MENU_DAY_ID,
  revision: 2,
  status: "current",
  generatedAt: "2026-06-11T15:10:00Z",
  totals: currentBatch.totals,
  emailStatus: null,
};

// ──────────────────────── Workspace discovery ────────────────────────

export const multiWorkspaceDiscovery: WorkspaceDiscovery = {
  workspaces: [
    {
      type: "provider_owner",
      id: PROVIDER_A_ID,
      role: "owner",
      defaultPath: "/provider/dashboard",
    },
    {
      type: "provider_customer",
      id: PROVIDER_B_ID,
      role: "customer",
      status: "active",
      defaultPath: `/providers/${PROVIDER_B_ID}/today`,
    },
    {
      type: "provider_customer",
      id: "prov-c",
      role: "customer",
      status: "awaiting_approval",
      defaultPath: "/providers/prov-c/awaiting-approval",
    },
  ] satisfies WorkspaceRef[],
  activeWorkspace: { type: "provider_owner", id: PROVIDER_A_ID },
};
