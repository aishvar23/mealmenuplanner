import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@/lib/errors";

// Mock the `admin` service so the test exercises only the boundary wiring.
vi.mock("@/lib/services/admin", () => ({
  listDishes: vi.fn(),
  createDish: vi.fn(),
  parseDishListFilters: vi.fn(),
}));

import {
  createDish,
  listDishes,
  parseDishListFilters,
} from "@/lib/services/admin";

import { GET, POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/dishes", () => {
  it("parses filters, calls the service, and wraps the bounded envelope", async () => {
    const filters = { status: "draft" as const };
    vi.mocked(parseDishListFilters).mockReturnValue(filters);
    vi.mocked(listDishes).mockResolvedValue([
      { id: "d1", name: "Rajma" } as never,
    ]);

    const res = await GET(
      new Request("http://test.local/api/admin/dishes?status=draft"),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: [{ id: "d1", name: "Rajma" }],
      page: { nextCursor: null, hasMore: false },
    });
    expect(listDishes).toHaveBeenCalledWith(filters);
  });

  it("maps a ForbiddenError from the guard to a 403 envelope", async () => {
    vi.mocked(parseDishListFilters).mockReturnValue({});
    vi.mocked(listDishes).mockRejectedValue(new ForbiddenError());

    const res = await GET(new Request("http://test.local/api/admin/dishes"));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
  });
});

describe("POST /api/admin/dishes", () => {
  it("creates a dish and returns 201", async () => {
    vi.mocked(createDish).mockResolvedValue({ id: "d2" } as never);

    const res = await POST(
      new Request("http://test.local/api/admin/dishes", {
        method: "POST",
        body: JSON.stringify({ name: "Idli", dietType: "vegetarian" }),
      }),
    );

    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("d2");
  });

  it("maps a malformed body to a 400 envelope", async () => {
    const res = await POST(
      new Request("http://test.local/api/admin/dishes", {
        method: "POST",
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
  });
});
