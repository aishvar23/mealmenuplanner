import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotFoundError } from "@/lib/errors";

vi.mock("@/lib/services/admin", () => ({
  getDish: vi.fn(),
  updateDish: vi.fn(),
}));

import { getDish, updateDish } from "@/lib/services/admin";

import { GET, PATCH } from "./route";

const DISH_ID = "11111111-1111-1111-1111-111111111111";

function ctx() {
  return { params: Promise.resolve({ dishId: DISH_ID }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/dishes/{dishId}", () => {
  it("returns 200 with the dish detail", async () => {
    vi.mocked(getDish).mockResolvedValue({ id: DISH_ID } as never);
    const res = await GET(new Request("http://test.local"), ctx());
    expect(res.status).toBe(200);
    expect(getDish).toHaveBeenCalledWith(DISH_ID);
  });

  it("maps a NotFoundError to 404", async () => {
    vi.mocked(getDish).mockRejectedValue(new NotFoundError());
    const res = await GET(new Request("http://test.local"), ctx());
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/admin/dishes/{dishId}", () => {
  it("updates and returns 200", async () => {
    vi.mocked(updateDish).mockResolvedValue({ id: DISH_ID } as never);
    const res = await PATCH(
      new Request("http://test.local", {
        method: "PATCH",
        body: JSON.stringify({ name: "New" }),
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(updateDish).toHaveBeenCalledWith(DISH_ID, { name: "New" });
  });
});
