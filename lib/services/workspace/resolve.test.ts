import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireAuthUser: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/services/household", () => ({ listUserHouseholds: vi.fn() }));

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { InternalError } from "@/lib/errors";
import { listUserHouseholds } from "@/lib/services/household";
import {
  createSupabaseStub,
  type QueryResult,
} from "@/lib/services/recommendation/query-stub";

import {
  listProviderSummaries,
  resolveWorkspaceDiscovery,
  resolveWorkspaceEntryPath,
  resolveWorkspaces,
} from "./resolve";

type ProviderRow = {
  provider_id: string;
  role: "owner" | "customer";
  status: string;
  provider_organizations: {
    name: string;
    timezone: string;
    status?: string;
  } | null;
};

function providerRow(overrides: Partial<ProviderRow> = {}): ProviderRow {
  return {
    provider_id: "prov-1",
    role: "customer",
    status: "active",
    provider_organizations: {
      name: "Anna's Kitchen",
      timezone: "Asia/Kolkata",
    },
    ...overrides,
  };
}

type HouseholdSummary = {
  householdId: string;
  name: string;
  role: "owner" | "admin" | "member" | "viewer";
  isActive: boolean;
  isPreferred: boolean;
};

function householdSummary(
  overrides: Partial<HouseholdSummary> = {},
): HouseholdSummary {
  return {
    householdId: "hh-1",
    name: "Suhane Household",
    role: "owner",
    isActive: true,
    isPreferred: true,
    ...overrides,
  };
}

/** Wire the mocks: household summaries + provider rows + the active pointer. */
function setup(opts: {
  households?: HouseholdSummary[];
  providers?: ProviderRow[] | QueryResult;
  pointer?: { workspace_type: string; workspace_id: string } | null;
}) {
  vi.mocked(listUserHouseholds).mockResolvedValue(
    (opts.households ?? []) as never,
  );
  const providerResult: QueryResult = Array.isArray(opts.providers)
    ? { data: opts.providers, error: null }
    : (opts.providers ?? { data: [], error: null });
  const stub = createSupabaseStub({
    tables: {
      provider_memberships: providerResult,
      user_active_workspace: {
        data: opts.pointer ?? null,
        error: null,
      },
    },
  });
  vi.mocked(createServerSupabaseClient).mockResolvedValue(stub.client as never);
  return stub;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthUser).mockResolvedValue({ id: "user-1" } as never);
});

describe("listProviderSummaries", () => {
  it("maps each live membership to a ProviderSummaryDto", async () => {
    setup({
      providers: [
        providerRow({ provider_id: "prov-a", role: "owner", status: "active" }),
        providerRow({
          provider_id: "prov-b",
          role: "customer",
          status: "awaiting_approval",
          provider_organizations: { name: "Bay Tiffins", timezone: "UTC" },
        }),
      ],
    });

    const summaries = await listProviderSummaries();

    expect(summaries).toEqual([
      {
        providerId: "prov-a",
        name: "Anna's Kitchen",
        role: "owner",
        membershipStatus: "active",
        timezone: "Asia/Kolkata",
      },
      {
        providerId: "prov-b",
        name: "Bay Tiffins",
        role: "customer",
        membershipStatus: "awaiting_approval",
        timezone: "UTC",
      },
    ]);
  });

  it("excludes a draft org (the in-progress onboarding store, not an enterable workspace)", async () => {
    setup({
      providers: [
        providerRow({
          provider_id: "prov-draft",
          role: "owner",
          status: "active",
          provider_organizations: {
            name: "Half-set Kitchen",
            timezone: "UTC",
            status: "draft",
          },
        }),
        providerRow({
          provider_id: "prov-live",
          role: "owner",
          status: "active",
          provider_organizations: {
            name: "Anna's Kitchen",
            timezone: "Asia/Kolkata",
            status: "active",
          },
        }),
      ],
    });

    const summaries = await listProviderSummaries();
    expect(summaries.map((s) => s.providerId)).toEqual(["prov-live"]);
  });

  it("queries only enterable statuses (awaiting_approval / active), excluding invited", async () => {
    const stub = setup({ providers: [] });
    await listProviderSummaries();

    const inCall = stub.calls.find(
      (c) => c.target === "provider_memberships" && c.method === "in",
    );
    // `invited` is deliberately omitted: a not-yet-accepted invite confers no
    // provider access (pmp_7b §5), so it must not surface as a workspace.
    expect(inCall?.args).toEqual(["status", ["awaiting_approval", "active"]]);
  });

  it("falls back to safe defaults when the org join is missing", async () => {
    setup({
      providers: [providerRow({ provider_organizations: null })],
    });
    const summaries = await listProviderSummaries();
    expect(summaries[0]?.name).toBe("Your provider");
    expect(summaries[0]?.timezone).toBe("UTC");
  });

  it("wraps a query error as InternalError", async () => {
    setup({ providers: { data: null, error: { message: "boom" } } });
    await expect(listProviderSummaries()).rejects.toBeInstanceOf(InternalError);
  });
});

describe("resolveWorkspaces", () => {
  it("returns household workspaces pointing at /today", async () => {
    setup({ households: [householdSummary()], providers: [] });
    const refs = await resolveWorkspaces();
    expect(refs).toEqual([
      {
        type: "household",
        id: "hh-1",
        role: "owner",
        defaultPath: "/today",
      },
    ]);
  });

  it("maps a provider owner to /provider/dashboard", async () => {
    setup({
      providers: [
        providerRow({ provider_id: "prov-a", role: "owner", status: "active" }),
      ],
    });
    const refs = await resolveWorkspaces();
    expect(refs).toEqual([
      {
        type: "provider_owner",
        id: "prov-a",
        role: "owner",
        defaultPath: "/provider/dashboard",
      },
    ]);
  });

  it("routes an active customer to today and an awaiting one to awaiting-approval", async () => {
    setup({
      providers: [
        providerRow({ provider_id: "p-active", status: "active" }),
        providerRow({ provider_id: "p-await", status: "awaiting_approval" }),
      ],
    });
    const refs = await resolveWorkspaces();
    expect(refs.map((r) => r.defaultPath)).toEqual([
      "/providers/p-active/today",
      "/providers/p-await/awaiting-approval",
    ]);
  });

  it("lists household workspaces before provider workspaces", async () => {
    setup({
      households: [householdSummary({ householdId: "hh-1" })],
      providers: [providerRow({ provider_id: "prov-a", role: "owner" })],
    });
    const refs = await resolveWorkspaces();
    expect(refs.map((r) => r.type)).toEqual(["household", "provider_owner"]);
  });

  it("is empty for a user who belongs to nothing", async () => {
    setup({ households: [], providers: [] });
    expect(await resolveWorkspaces()).toEqual([]);
  });
});

describe("resolveWorkspaceDiscovery", () => {
  it("surfaces the active pointer when it matches a current workspace", async () => {
    setup({
      providers: [providerRow({ provider_id: "prov-a", role: "owner" })],
      pointer: { workspace_type: "provider_owner", workspace_id: "prov-a" },
    });
    const { activeWorkspace } = await resolveWorkspaceDiscovery();
    expect(activeWorkspace).toEqual({ type: "provider_owner", id: "prov-a" });
  });

  it("drops a stale pointer at a workspace the user no longer belongs to", async () => {
    setup({
      providers: [providerRow({ provider_id: "prov-a", role: "owner" })],
      pointer: { workspace_type: "provider_owner", workspace_id: "gone" },
    });
    const { activeWorkspace } = await resolveWorkspaceDiscovery();
    expect(activeWorkspace).toBeNull();
  });

  it("is null when no pointer is set", async () => {
    setup({
      providers: [providerRow({ provider_id: "prov-a", role: "owner" })],
      pointer: null,
    });
    const { activeWorkspace, workspaces } = await resolveWorkspaceDiscovery();
    expect(activeWorkspace).toBeNull();
    expect(workspaces).toHaveLength(1);
  });
});

describe("resolveWorkspaceEntryPath", () => {
  it("sends a user who belongs to nothing to onboarding", async () => {
    setup({ households: [], providers: [] });
    expect(await resolveWorkspaceEntryPath()).toBe("/onboarding");
  });

  it("auto-enters a sole provider workspace (no chooser)", async () => {
    setup({
      providers: [
        providerRow({ provider_id: "prov-a", role: "owner", status: "active" }),
      ],
    });
    expect(await resolveWorkspaceEntryPath()).toBe("/provider/dashboard");
  });

  it("routes to the stored active workspace when several exist", async () => {
    setup({
      providers: [
        providerRow({ provider_id: "prov-a", role: "owner" }),
        providerRow({ provider_id: "prov-b", role: "owner" }),
      ],
      pointer: { workspace_type: "provider_owner", workspace_id: "prov-b" },
    });
    expect(await resolveWorkspaceEntryPath()).toBe("/provider/dashboard");
  });

  it("falls back to the chooser when several exist with no valid pointer", async () => {
    setup({
      households: [householdSummary({ householdId: "hh-1" })],
      providers: [providerRow({ provider_id: "prov-a", role: "owner" })],
      pointer: null,
    });
    expect(await resolveWorkspaceEntryPath()).toBe("/workspace");
  });
});
