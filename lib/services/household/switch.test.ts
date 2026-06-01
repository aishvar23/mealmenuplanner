import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, InternalError } from "@/lib/errors";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireAuthUser: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";

import { setActiveHousehold, setPreferredHousehold } from "./switch";

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

describe("setActiveHousehold / setPreferredHousehold", () => {
  it("calls the matching RPC with the household id", async () => {
    const rpc = withRpc({ error: null });
    await setActiveHousehold(HH);
    expect(rpc).toHaveBeenCalledWith("set_active_household", { h: HH });

    const rpc2 = withRpc({ error: null });
    await setPreferredHousehold(HH);
    expect(rpc2).toHaveBeenCalledWith("set_preferred_household", { h: HH });
  });

  it("rejects a non-uuid household without calling the RPC", async () => {
    const rpc = withRpc({ error: null });
    await expect(setActiveHousehold("not-a-uuid")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps the RPC's insufficient-privilege (42501) to ForbiddenError", async () => {
    withRpc({ error: { code: "42501" } });
    await expect(setActiveHousehold(HH)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("wraps any other RPC error as InternalError", async () => {
    withRpc({ error: { code: "XX000" } });
    await expect(setPreferredHousehold(HH)).rejects.toBeInstanceOf(
      InternalError,
    );
  });
});
