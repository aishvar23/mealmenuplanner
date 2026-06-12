import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/household", () => ({ listUserHouseholds: vi.fn() }));
vi.mock("./resolve", () => ({
  listProviderSummaries: vi.fn(),
  resolveWorkspaceDiscovery: vi.fn(),
}));

import { listUserHouseholds } from "@/lib/services/household";
import type {
  ProviderSummaryDto,
  WorkspaceDiscovery,
} from "@/packages/shared/provider";

import { resolveWorkspaceOptions } from "./options";
import { listProviderSummaries, resolveWorkspaceDiscovery } from "./resolve";

const HOUSEHOLD_REF = {
  type: "household" as const,
  id: "hh-1",
  role: "owner" as const,
  defaultPath: "/today",
};
const OWNER_REF = {
  type: "provider_owner" as const,
  id: "prov-a",
  role: "owner" as const,
  defaultPath: "/provider/dashboard",
};
const CUSTOMER_REF = {
  type: "provider_customer" as const,
  id: "prov-b",
  role: "customer" as const,
  status: "awaiting_approval" as const,
  defaultPath: "/providers/prov-b/awaiting-approval",
};

function setup(discovery: WorkspaceDiscovery) {
  vi.mocked(resolveWorkspaceDiscovery).mockResolvedValue(discovery);
  vi.mocked(listUserHouseholds).mockResolvedValue([
    { householdId: "hh-1", name: "Suhane Household" },
  ] as never);
  const providers: ProviderSummaryDto[] = [
    {
      providerId: "prov-a",
      name: "Anna's Tiffins",
      role: "owner",
      membershipStatus: "active",
      timezone: "Asia/Kolkata",
    },
    {
      providerId: "prov-b",
      name: "Bay Bhojan",
      role: "customer",
      membershipStatus: "awaiting_approval",
      timezone: "UTC",
    },
  ];
  vi.mocked(listProviderSummaries).mockResolvedValue(providers);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveWorkspaceOptions", () => {
  it("joins display names + subtitles from household and provider summaries", async () => {
    setup({
      workspaces: [HOUSEHOLD_REF, OWNER_REF, CUSTOMER_REF],
      activeWorkspace: null,
    });

    const options = await resolveWorkspaceOptions();

    expect(options).toEqual([
      {
        type: "household",
        id: "hh-1",
        name: "Suhane Household",
        subtitle: "Household · owner",
        defaultPath: "/today",
        isActive: false,
      },
      {
        type: "provider_owner",
        id: "prov-a",
        name: "Anna's Tiffins",
        subtitle: "Meal provider · owner",
        defaultPath: "/provider/dashboard",
        isActive: false,
      },
      {
        type: "provider_customer",
        id: "prov-b",
        name: "Bay Bhojan",
        subtitle: "Meal provider · awaiting approval",
        defaultPath: "/providers/prov-b/awaiting-approval",
        isActive: false,
      },
    ]);
  });

  it("flags the active workspace by type AND id", async () => {
    setup({
      workspaces: [OWNER_REF, CUSTOMER_REF],
      activeWorkspace: { type: "provider_customer", id: "prov-b" },
    });

    const options = await resolveWorkspaceOptions();

    expect(options.find((o) => o.id === "prov-b")?.isActive).toBe(true);
    expect(options.find((o) => o.id === "prov-a")?.isActive).toBe(false);
  });

  it("falls back to a type label when no name is joined", async () => {
    vi.mocked(resolveWorkspaceDiscovery).mockResolvedValue({
      workspaces: [OWNER_REF],
      activeWorkspace: null,
    });
    vi.mocked(listUserHouseholds).mockResolvedValue([] as never);
    vi.mocked(listProviderSummaries).mockResolvedValue([]);

    const options = await resolveWorkspaceOptions();
    expect(options[0]?.name).toBe("Your provider");
  });
});
