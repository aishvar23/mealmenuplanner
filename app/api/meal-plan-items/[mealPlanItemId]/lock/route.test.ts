import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/meal-plan", () => ({ lockItem: vi.fn() }));

import { lockItem } from "@/lib/services/meal-plan";

import { POST } from "./route";

const ID = "33333333-3333-3333-3333-333333333333";
const ctx = { params: Promise.resolve({ mealPlanItemId: ID }) };
const req = () => new Request("http://t.local", { method: "POST" });

beforeEach(() => vi.clearAllMocks());

describe("POST lock", () => {
  it("delegates and returns 200", async () => {
    vi.mocked(lockItem).mockResolvedValue({ locked: true } as never);
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    expect(lockItem).toHaveBeenCalledWith(ID);
  });
});
