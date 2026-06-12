import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./resolve", () => ({
  listProviderSummaries: vi.fn(),
  resolveWorkspaceDiscovery: vi.fn(),
}));

import type {
  ProviderSummaryDto,
  WorkspaceDiscovery,
} from "@/packages/shared/provider";

import { resolveCustomerAccess, resolveOwnerProvider } from "./provider-access";
import { listProviderSummaries, resolveWorkspaceDiscovery } from "./resolve";

function summary(
  providerId: string,
  role: ProviderSummaryDto["role"],
  membershipStatus: ProviderSummaryDto["membershipStatus"] = "active",
): ProviderSummaryDto {
  return {
    providerId,
    name: `Provider ${providerId}`,
    role,
    membershipStatus,
    timezone: "Asia/Kolkata",
  };
}

function discovery(
  active: WorkspaceDiscovery["activeWorkspace"],
): WorkspaceDiscovery {
  return { workspaces: [], activeWorkspace: active };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveOwnerProvider", () => {
  it("returns null when the caller owns no provider", async () => {
    vi.mocked(listProviderSummaries).mockResolvedValue([
      summary("prov-x", "customer"),
    ]);
    vi.mocked(resolveWorkspaceDiscovery).mockResolvedValue(discovery(null));

    expect(await resolveOwnerProvider()).toBeNull();
  });

  it("prefers the provider the active-workspace pointer names", async () => {
    vi.mocked(listProviderSummaries).mockResolvedValue([
      summary("prov-a", "owner"),
      summary("prov-b", "owner"),
    ]);
    vi.mocked(resolveWorkspaceDiscovery).mockResolvedValue(
      discovery({ type: "provider_owner", id: "prov-b" }),
    );

    expect((await resolveOwnerProvider())?.providerId).toBe("prov-b");
  });

  it("falls back to the first owned provider when no valid pointer", async () => {
    vi.mocked(listProviderSummaries).mockResolvedValue([
      summary("prov-a", "owner"),
      summary("prov-b", "owner"),
    ]);
    vi.mocked(resolveWorkspaceDiscovery).mockResolvedValue(discovery(null));

    expect((await resolveOwnerProvider())?.providerId).toBe("prov-a");
  });

  it("ignores a pointer at a customer workspace and uses the first owned", async () => {
    vi.mocked(listProviderSummaries).mockResolvedValue([
      summary("prov-a", "owner"),
    ]);
    vi.mocked(resolveWorkspaceDiscovery).mockResolvedValue(
      discovery({ type: "provider_customer", id: "prov-z" }),
    );

    expect((await resolveOwnerProvider())?.providerId).toBe("prov-a");
  });
});

describe("resolveCustomerAccess", () => {
  beforeEach(() => {
    vi.mocked(resolveWorkspaceDiscovery).mockResolvedValue(discovery(null));
  });

  it("returns the customer membership for the requested provider", async () => {
    vi.mocked(listProviderSummaries).mockResolvedValue([
      summary("prov-a", "customer", "awaiting_approval"),
    ]);

    const membership = await resolveCustomerAccess("prov-a");
    expect(membership?.providerId).toBe("prov-a");
    expect(membership?.membershipStatus).toBe("awaiting_approval");
  });

  it("returns null for a provider the caller is not a customer of (cross-provider)", async () => {
    // The RLS client only surfaces the caller's own rows, so a different provider
    // simply isn't in the list — resolveCustomerAccess must not find it.
    vi.mocked(listProviderSummaries).mockResolvedValue([
      summary("prov-a", "customer"),
    ]);

    expect(await resolveCustomerAccess("prov-b")).toBeNull();
  });

  it("returns null when the caller is the owner (not a customer) of the provider", async () => {
    vi.mocked(listProviderSummaries).mockResolvedValue([
      summary("prov-a", "owner"),
    ]);

    expect(await resolveCustomerAccess("prov-a")).toBeNull();
  });
});
