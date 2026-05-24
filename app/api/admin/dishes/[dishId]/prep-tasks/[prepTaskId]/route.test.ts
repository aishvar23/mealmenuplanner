import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/admin", () => ({
  updatePrepTask: vi.fn(),
  removePrepTask: vi.fn(),
}));

import { removePrepTask, updatePrepTask } from "@/lib/services/admin";

import { DELETE, PATCH } from "./route";

const DISH_ID = "11111111-1111-1111-1111-111111111111";
const TASK_ID = "33333333-3333-3333-3333-333333333333";

function ctx() {
  return { params: Promise.resolve({ dishId: DISH_ID, prepTaskId: TASK_ID }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dish prep task item", () => {
  it("PATCH updates and returns 200", async () => {
    vi.mocked(updatePrepTask).mockResolvedValue({ id: TASK_ID } as never);
    const res = await PATCH(
      new Request("http://test.local", {
        method: "PATCH",
        body: JSON.stringify({ requiredBeforeMinutes: 60 }),
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(updatePrepTask).toHaveBeenCalledWith(DISH_ID, TASK_ID, {
      requiredBeforeMinutes: 60,
    });
  });

  it("DELETE removes and returns 200", async () => {
    vi.mocked(removePrepTask).mockResolvedValue({ id: TASK_ID, removed: true });
    const res = await DELETE(new Request("http://test.local"), ctx());
    expect(res.status).toBe(200);
  });
});
