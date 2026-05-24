import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConflictError } from "@/lib/errors";

vi.mock("@/lib/services/admin", () => ({
  updateIngredient: vi.fn(),
  deleteIngredient: vi.fn(),
}));

import { deleteIngredient, updateIngredient } from "@/lib/services/admin";

import { DELETE, PATCH } from "./route";

const ING_ID = "11111111-1111-1111-1111-111111111111";

function ctx() {
  return { params: Promise.resolve({ ingredientId: ING_ID }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/admin/ingredients/{ingredientId}", () => {
  it("updates and returns 200", async () => {
    vi.mocked(updateIngredient).mockResolvedValue({ id: ING_ID } as never);
    const res = await PATCH(
      new Request("http://test.local", {
        method: "PATCH",
        body: JSON.stringify({ category: "spices" }),
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(updateIngredient).toHaveBeenCalledWith(ING_ID, {
      category: "spices",
    });
  });
});

describe("DELETE /api/admin/ingredients/{ingredientId}", () => {
  it("returns 200 on delete", async () => {
    vi.mocked(deleteIngredient).mockResolvedValue({
      id: ING_ID,
      deleted: true,
    });
    const res = await DELETE(new Request("http://test.local"), ctx());
    expect(res.status).toBe(200);
  });

  it("maps an in-use ConflictError to 409", async () => {
    vi.mocked(deleteIngredient).mockRejectedValue(
      new ConflictError("in use", { reason: "in_use" }),
    );
    const res = await DELETE(new Request("http://test.local"), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("CONFLICT");
  });
});
