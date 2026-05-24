import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotFoundError } from "@/lib/errors";

vi.mock("@/lib/services/admin", () => ({ removePairing: vi.fn() }));

import { removePairing } from "@/lib/services/admin";

import { DELETE } from "./route";

const DISH_ID = "11111111-1111-1111-1111-111111111111";
const PAIRING_ID = "33333333-3333-3333-3333-333333333333";

function ctx() {
  return {
    params: Promise.resolve({ dishId: DISH_ID, pairingId: PAIRING_ID }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DELETE /api/admin/dishes/{dishId}/pairings/{pairingId}", () => {
  it("removes and returns 200", async () => {
    vi.mocked(removePairing).mockResolvedValue({
      id: PAIRING_ID,
      removed: true,
    });
    const res = await DELETE(new Request("http://test.local"), ctx());
    expect(res.status).toBe(200);
    expect(removePairing).toHaveBeenCalledWith(DISH_ID, PAIRING_ID);
  });

  it("maps a NotFoundError to 404", async () => {
    vi.mocked(removePairing).mockRejectedValue(new NotFoundError());
    const res = await DELETE(new Request("http://test.local"), ctx());
    expect(res.status).toBe(404);
  });
});
