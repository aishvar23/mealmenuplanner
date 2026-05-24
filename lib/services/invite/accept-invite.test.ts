import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import {
  ConflictError,
  InternalError,
  NotFoundError,
  UnauthenticatedError,
} from "@/lib/errors";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAuthUser: vi.fn() }));

import { acceptInvite } from "./accept-invite";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const HOUSEHOLD_ID = "22222222-2222-2222-2222-222222222222";

function stubRpc(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(() => Promise.resolve(result));
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ rpc } as never);
  return rpc;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthUser).mockResolvedValue({ id: USER_ID } as never);
});

describe("acceptInvite", () => {
  it("returns the household + active status on success", async () => {
    const rpc = stubRpc({
      data: { householdId: HOUSEHOLD_ID, membershipStatus: "active" },
      error: null,
    });
    const result = await acceptInvite("plaintext");
    expect(result).toEqual({
      householdId: HOUSEHOLD_ID,
      membershipStatus: "active",
    });
    expect(rpc).toHaveBeenCalledWith("accept_invite", {
      p_token_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("propagates UnauthenticatedError when not signed in", async () => {
    vi.mocked(requireAuthUser).mockRejectedValue(new UnauthenticatedError());
    const rpc = stubRpc({ data: null, error: null });
    await expect(acceptInvite("t")).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("404s an empty token", async () => {
    const rpc = stubRpc({ data: null, error: null });
    await expect(acceptInvite("  ")).rejects.toBeInstanceOf(NotFoundError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps P0002 (unknown token) to NotFound", async () => {
    stubRpc({ data: null, error: { code: "P0002", message: "x" } });
    await expect(acceptInvite("t")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("maps 23505 (duplicate membership) to Conflict", async () => {
    stubRpc({ data: null, error: { code: "23505", message: "x" } });
    await expect(acceptInvite("t")).rejects.toBeInstanceOf(ConflictError);
  });

  it("maps 23514 (invite not pending) to Conflict", async () => {
    stubRpc({ data: null, error: { code: "23514", message: "x" } });
    await expect(acceptInvite("t")).rejects.toBeInstanceOf(ConflictError);
  });

  it("maps an unknown error to InternalError", async () => {
    stubRpc({ data: null, error: { code: "XX999", message: "x" } });
    await expect(acceptInvite("t")).rejects.toBeInstanceOf(InternalError);
  });

  it("throws InternalError when the RPC returns no household", async () => {
    stubRpc({ data: {}, error: null });
    await expect(acceptInvite("t")).rejects.toBeInstanceOf(InternalError);
  });
});
