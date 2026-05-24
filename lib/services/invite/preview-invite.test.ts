import { beforeEach, describe, expect, it, vi } from "vitest";

import { createServerSupabaseClient } from "@/lib/db/server";
import { InternalError, NotFoundError } from "@/lib/errors";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));

import { getInvitePreview } from "./preview-invite";

const PREVIEW_ROW = {
  household_name: "Suhane Household",
  invited_by: "Aishvarya",
  membership_type: "temporary_guest",
  role: "viewer",
  expires_at: "2026-05-26T00:00:00Z",
};

function stubRpc(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(() => Promise.resolve(result));
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ rpc } as never);
  return rpc;
}

beforeEach(() => vi.clearAllMocks());

describe("getInvitePreview", () => {
  it("maps the RPC row to the safe preview DTO", async () => {
    const rpc = stubRpc({ data: [PREVIEW_ROW], error: null });
    const result = await getInvitePreview("plaintext-token");
    expect(result).toMatchObject({
      householdName: "Suhane Household",
      invitedBy: "Aishvarya",
      role: "viewer",
    });
    // Calls the RPC with the HASH (64-hex), never the plaintext.
    expect(rpc).toHaveBeenCalledWith("get_invite_preview", {
      p_token_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("404s an empty token without calling the RPC", async () => {
    const rpc = stubRpc({ data: [], error: null });
    await expect(getInvitePreview("   ")).rejects.toBeInstanceOf(NotFoundError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("404s when the RPC returns no row (unknown/expired — no oracle)", async () => {
    stubRpc({ data: [], error: null });
    await expect(getInvitePreview("token")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("wraps an RPC error as InternalError", async () => {
    stubRpc({ data: null, error: { message: "boom" } });
    await expect(getInvitePreview("token")).rejects.toBeInstanceOf(
      InternalError,
    );
  });
});
