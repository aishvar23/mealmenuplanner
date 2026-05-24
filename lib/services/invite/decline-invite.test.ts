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

import { declineInvite } from "./decline-invite";

function stubRpc(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(() => Promise.resolve(result));
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ rpc } as never);
  return rpc;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthUser).mockResolvedValue({ id: "u1" } as never);
});

describe("declineInvite", () => {
  it("returns declined on success", async () => {
    const rpc = stubRpc({ data: { status: "declined" }, error: null });
    expect(await declineInvite("plaintext")).toEqual({ status: "declined" });
    expect(rpc).toHaveBeenCalledWith("decline_invite", {
      p_token_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("propagates UnauthenticatedError when not signed in", async () => {
    vi.mocked(requireAuthUser).mockRejectedValue(new UnauthenticatedError());
    await expect(declineInvite("t")).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  it("404s an empty token", async () => {
    const rpc = stubRpc({ data: null, error: null });
    await expect(declineInvite("")).rejects.toBeInstanceOf(NotFoundError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps P0002 to NotFound and 23514 to Conflict", async () => {
    stubRpc({ data: null, error: { code: "P0002", message: "x" } });
    await expect(declineInvite("t")).rejects.toBeInstanceOf(NotFoundError);
    stubRpc({ data: null, error: { code: "23514", message: "x" } });
    await expect(declineInvite("t")).rejects.toBeInstanceOf(ConflictError);
  });

  it("maps an unknown error to InternalError", async () => {
    stubRpc({ data: null, error: { code: "XX999", message: "x" } });
    await expect(declineInvite("t")).rejects.toBeInstanceOf(InternalError);
  });
});
