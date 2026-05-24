import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/admin", () => ({
  listPrepTasks: vi.fn(),
  addPrepTask: vi.fn(),
}));

import { addPrepTask, listPrepTasks } from "@/lib/services/admin";

import { GET, POST } from "./route";

const DISH_ID = "11111111-1111-1111-1111-111111111111";

function ctx() {
  return { params: Promise.resolve({ dishId: DISH_ID }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dish prep tasks collection", () => {
  it("GET wraps the bounded envelope", async () => {
    vi.mocked(listPrepTasks).mockResolvedValue([{ id: "p1" } as never]);
    const res = await GET(new Request("http://test.local"), ctx());
    expect(res.status).toBe(200);
    expect(listPrepTasks).toHaveBeenCalledWith(DISH_ID);
  });

  it("POST adds and returns 201", async () => {
    vi.mocked(addPrepTask).mockResolvedValue({ id: "p2" } as never);
    const res = await POST(
      new Request("http://test.local", {
        method: "POST",
        body: JSON.stringify({
          taskName: "Soak chickpeas",
          requiredBeforeMinutes: 480,
        }),
      }),
      ctx(),
    );
    expect(res.status).toBe(201);
  });
});
