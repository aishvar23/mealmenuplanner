import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/meal-plan", () => ({ unlockItem: vi.fn() }));

import { unlockItem } from "@/lib/services/meal-plan";

import { POST } from "./route";

const ID = "33333333-3333-3333-3333-333333333333";
const ctx = { params: Promise.resolve({ mealPlanItemId: ID }) };
const req = () => new Request("http://t.local", { method: "POST" });

beforeEach(() => vi.clearAllMocks());

describe("POST unlock", () => {
  it("delegates and returns 200", async () => {
    vi.mocked(unlockItem).mockResolvedValue({ locked: false } as never);
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    expect(unlockItem).toHaveBeenCalledWith(ID);
  });
});
