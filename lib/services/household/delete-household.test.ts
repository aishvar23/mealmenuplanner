import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, InternalError, NotFoundError } from "@/lib/errors";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireAuthUser: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";

import { deleteHousehold } from "./delete-household";

const HH = "11111111-1111-1111-1111-111111111111";

function withRpc(result: { error: { code?: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(result);
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ rpc } as never);
  return rpc;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthUser).mockResolvedValue({ id: "user-1" } as never);
});

describe("deleteHousehold", () => {
  it("calls the delete_household RPC with the household id", async () => {
    const rpc = withRpc({ error: null });
    await deleteHousehold(HH);
    expect(rpc).toHaveBeenCalledWith("delete_household", { h: HH });
  });

  it("rejects a non-uuid household without calling the RPC", async () => {
    const rpc = withRpc({ error: null });
    await expect(deleteHousehold("nope")).rejects.toBeInstanceOf(NotFoundError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps the RPC's insufficient-privilege (42501) to ForbiddenError", async () => {
    withRpc({ error: { code: "42501" } });
    await expect(deleteHousehold(HH)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("wraps any other RPC error as InternalError", async () => {
    withRpc({ error: { code: "XX000" } });
    await expect(deleteHousehold(HH)).rejects.toBeInstanceOf(InternalError);
  });
});
