import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/admin", () => ({
  listPairings: vi.fn(),
  addPairing: vi.fn(),
}));

import { addPairing, listPairings } from "@/lib/services/admin";

import { GET, POST } from "./route";

const DISH_ID = "11111111-1111-1111-1111-111111111111";
const PAIRED = "22222222-2222-2222-2222-222222222222";

function ctx() {
  return { params: Promise.resolve({ dishId: DISH_ID }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dish pairings collection", () => {
  it("GET wraps the bounded envelope", async () => {
    vi.mocked(listPairings).mockResolvedValue([{ id: "pr1" } as never]);
    const res = await GET(new Request("http://test.local"), ctx());
    expect(res.status).toBe(200);
    expect(listPairings).toHaveBeenCalledWith(DISH_ID);
  });

  it("POST adds and returns 201", async () => {
    vi.mocked(addPairing).mockResolvedValue({ id: "pr2" } as never);
    const res = await POST(
      new Request("http://test.local", {
        method: "POST",
        body: JSON.stringify({
          pairedDishId: PAIRED,
          pairingType: "rice_pairing",
        }),
      }),
      ctx(),
    );
    expect(res.status).toBe(201);
  });
});
