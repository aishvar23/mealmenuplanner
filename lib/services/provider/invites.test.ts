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
vi.mock("./access", () => ({ requireOwnedProvider: vi.fn() }));

import { acceptProviderInvite, previewProviderInvite } from "./invites";

const USER_ID = "11111111-1111-1111-1111-111111111111";

function stubRpc(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(() => Promise.resolve(result));
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ rpc } as never);
  return rpc;
}

describe("acceptProviderInvite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuthUser).mockResolvedValue({ id: USER_ID } as never);
  });

  it("returns awaiting_approval on success", async () => {
    stubRpc({
      data: { providerId: "prov-1", membershipStatus: "awaiting_approval" },
      error: null,
    });
    const result = await acceptProviderInvite("plaintext-token");
    expect(result).toEqual({
      providerId: "prov-1",
      membershipStatus: "awaiting_approval",
    });
  });

  it("hashes the token before calling the RPC (never sends plaintext)", async () => {
    const rpc = stubRpc({
      data: { providerId: "prov-1", membershipStatus: "awaiting_approval" },
      error: null,
    });
    await acceptProviderInvite("plaintext-token");
    const call = rpc.mock.calls[0] as unknown as [
      string,
      { p_token_hash: string },
    ];
    expect(call[1].p_token_hash).not.toBe("plaintext-token");
    expect(call[1].p_token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("maps P0002 to NotFound (unknown/expired token)", async () => {
    stubRpc({ data: null, error: { code: "P0002" } });
    await expect(acceptProviderInvite("t")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("maps 23514 to Conflict invite_not_pending", async () => {
    stubRpc({ data: null, error: { code: "23514" } });
    const error = await acceptProviderInvite("t").catch((e) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error.details as ConflictDetails).reason).toBe(
      "provider_invite_not_pending",
    );
  });

  it("maps 23505 to Conflict already_member", async () => {
    stubRpc({ data: null, error: { code: "23505" } });
    const error = await acceptProviderInvite("t").catch((e) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error.details as ConflictDetails).reason).toBe(
      "provider_already_member",
    );
  });

  it("rejects an empty token without calling the RPC", async () => {
    const rpc = stubRpc({ data: null, error: null });
    await expect(acceptProviderInvite("   ")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("previewProviderInvite", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps a preview row to the DTO", async () => {
    stubRpc({
      data: [
        {
          provider_name: "Anna's Tiffins",
          invited_by: "Anna",
          role: "customer",
          expires_at: "2026-06-18T00:00:00Z",
        },
      ],
      error: null,
    });
    const result = await previewProviderInvite("token");
    expect(result).toEqual({
      providerName: "Anna's Tiffins",
      invitedByName: "Anna",
      role: "customer",
      expiresAt: "2026-06-18T00:00:00Z",
    });
  });

  it("throws NotFound when no row matches", async () => {
    stubRpc({ data: [], error: null });
    await expect(previewProviderInvite("token")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
