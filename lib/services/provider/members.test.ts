import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import {
  ConflictError,
  NotFoundError,
  type ConflictDetails,
} from "@/lib/errors";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAuthUser: vi.fn() }));

import {
  approveProviderMember,
  listProviderMembers,
  removeProviderMember,
} from "./members";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const MEMBER_ID = "33333333-3333-3333-3333-333333333333";

const MEMBER_ROW = {
  member_id: MEMBER_ID,
  user_id: "44444444-4444-4444-4444-444444444444",
  display_name: "Chitra",
  email: "chitra@example.com",
  phone: "+15555550301",
  role: "customer",
  status: "active",
  approved_at: "2026-06-12T00:00:00Z",
  joined_at: "2026-06-12T00:00:00Z",
};

/** Route each `supabase.rpc(name, …)` to a per-name result. */
function stubRpcByName(map: Record<string, { data: unknown; error: unknown }>) {
  const rpc = vi.fn((name: string) =>
    Promise.resolve(map[name] ?? { data: null, error: null }),
  );
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ rpc } as never);
  return rpc;
}

describe("listProviderMembers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuthUser).mockResolvedValue({ id: USER_ID } as never);
  });

  it("maps roster rows to MemberDtos in a collection envelope", async () => {
    stubRpcByName({
      list_provider_members: { data: [MEMBER_ROW], error: null },
    });
    const result = await listProviderMembers("prov-1");
    expect(result.data).toEqual([
      {
        memberId: MEMBER_ID,
        userId: MEMBER_ROW.user_id,
        displayName: "Chitra",
        email: "chitra@example.com",
        phone: "+15555550301",
        role: "customer",
        status: "active",
        approvedAt: "2026-06-12T00:00:00Z",
        joinedAt: "2026-06-12T00:00:00Z",
      },
    ]);
    expect(result.page.hasMore).toBe(false);
  });

  it("maps a non-owner (42501) to NotFound (no leak)", async () => {
    stubRpcByName({
      list_provider_members: { data: null, error: { code: "42501" } },
    });
    await expect(listProviderMembers("prov-1")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("member lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuthUser).mockResolvedValue({ id: USER_ID } as never);
  });

  it("approves then reads the member back via the single-member RPC", async () => {
    stubRpcByName({
      approve_provider_member: { data: null, error: null },
      get_provider_member: { data: [MEMBER_ROW], error: null },
    });
    const result = await approveProviderMember("prov-1", MEMBER_ID);
    expect(result.memberId).toBe(MEMBER_ID);
    expect(result.status).toBe("active");
  });

  it("maps 42501 (not owner) to NotFound", async () => {
    stubRpcByName({
      approve_provider_member: { data: null, error: { code: "42501" } },
    });
    await expect(
      approveProviderMember("prov-1", MEMBER_ID),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("maps approve 23514 (not awaiting) to Conflict member_not_pending", async () => {
    stubRpcByName({
      approve_provider_member: { data: null, error: { code: "23514" } },
    });
    const error = await approveProviderMember("prov-1", MEMBER_ID).catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(ConflictError);
    expect((error.details as ConflictDetails).reason).toBe(
      "provider_member_not_pending",
    );
  });

  it("removes then reads back the now-removed member via the single-member RPC", async () => {
    // The proactive response-cancellation (ADO #85) lives entirely in the RPC; the
    // service still just calls remove then re-reads. This pins that contract: the
    // removed DTO is what the route returns.
    const rpc = stubRpcByName({
      remove_provider_member: { data: null, error: null },
      get_provider_member: {
        data: [{ ...MEMBER_ROW, status: "removed", joined_at: null }],
        error: null,
      },
    });
    const result = await removeProviderMember("prov-1", MEMBER_ID);
    expect(result.memberId).toBe(MEMBER_ID);
    expect(result.status).toBe("removed");
    expect(rpc).toHaveBeenCalledWith("remove_provider_member", {
      p_provider_id: "prov-1",
      p_member_id: MEMBER_ID,
    });
  });

  it("maps remove 23514 (not removable) to Conflict member_not_removable", async () => {
    stubRpcByName({
      remove_provider_member: { data: null, error: { code: "23514" } },
    });
    const error = await removeProviderMember("prov-1", MEMBER_ID).catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(ConflictError);
    expect((error.details as ConflictDetails).reason).toBe(
      "provider_member_not_removable",
    );
  });
});
