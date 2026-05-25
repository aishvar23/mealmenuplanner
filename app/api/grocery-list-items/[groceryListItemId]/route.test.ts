import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/grocery", () => ({
  setGroceryItemChecked: vi.fn(),
  validateCheckedRequest: vi.fn((b: { checked: boolean }) => ({
    checked: b.checked,
  })),
}));

import { setGroceryItemChecked } from "@/lib/services/grocery";

import { PATCH } from "./route";

const ITEM = "44444444-4444-4444-4444-444444444444";

function req(body: string): Request {
  return new Request("http://t.local", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body,
  });
}

const ctx = { params: Promise.resolve({ groceryListItemId: ITEM }) };

beforeEach(() => vi.clearAllMocks());

describe("PATCH grocery-list-items/{id}", () => {
  it("delegates to setGroceryItemChecked and returns 200", async () => {
    vi.mocked(setGroceryItemChecked).mockResolvedValue({
      groceryListItemId: ITEM,
      ingredientId: "i1",
      name: "Spinach",
      category: "vegetables",
      quantity: 400,
      unit: "g",
      checked: true,
      ingredientImageUrl: null,
      ingredientImageAltText: null,
      ingredientImageStatus: "placeholder",
    });

    const res = await PATCH(req('{"checked":true}'), ctx);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ checked: true });
    expect(setGroceryItemChecked).toHaveBeenCalledWith(ITEM, true);
  });

  it("400s a malformed JSON body", async () => {
    const res = await PATCH(req("{nope"), ctx);
    expect(res.status).toBe(400);
    expect(setGroceryItemChecked).not.toHaveBeenCalled();
  });
});
