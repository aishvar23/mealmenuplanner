import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/admin", () => ({
  listIngredients: vi.fn(),
  createIngredient: vi.fn(),
}));

import { createIngredient, listIngredients } from "@/lib/services/admin";

import { GET, POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/ingredients", () => {
  it("passes search + category filters and wraps the bounded envelope", async () => {
    vi.mocked(listIngredients).mockResolvedValue([{ id: "i1" } as never]);

    const res = await GET(
      new Request(
        "http://test.local/api/admin/ingredients?search=spin&category=vegetables",
      ),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: [{ id: "i1" }],
      page: { nextCursor: null, hasMore: false },
    });
    expect(listIngredients).toHaveBeenCalledWith({
      search: "spin",
      category: "vegetables",
    });
  });
});

describe("POST /api/admin/ingredients", () => {
  it("creates and returns 201", async () => {
    vi.mocked(createIngredient).mockResolvedValue({ id: "i2" } as never);
    const res = await POST(
      new Request("http://test.local/api/admin/ingredients", {
        method: "POST",
        body: JSON.stringify({
          name: "Spinach",
          category: "vegetables",
          defaultUnit: "g",
        }),
      }),
    );
    expect(res.status).toBe(201);
  });
});
