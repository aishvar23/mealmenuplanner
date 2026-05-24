import { beforeEach, describe, expect, it, vi } from "vitest";

import { ValidationError } from "@/lib/errors";

vi.mock("@/lib/services/admin", () => ({ setDishStatus: vi.fn() }));

import { setDishStatus } from "@/lib/services/admin";

import { POST } from "./route";

const DISH_ID = "11111111-1111-1111-1111-111111111111";

function ctx() {
  return { params: Promise.resolve({ dishId: DISH_ID }) };
}

function statusRequest(body: unknown) {
  return new Request("http://test.local", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/admin/dishes/{dishId}/status", () => {
  it("activates a dish and returns 200 with the refreshed detail", async () => {
    vi.mocked(setDishStatus).mockResolvedValue({
      id: DISH_ID,
      status: "active",
    } as never);

    const res = await POST(statusRequest({ status: "active" }), ctx());

    expect(res.status).toBe(200);
    expect(setDishStatus).toHaveBeenCalledWith(DISH_ID, "active");
  });

  it("400s an unknown status value before calling the service", async () => {
    const res = await POST(statusRequest({ status: "published" }), ctx());
    expect(res.status).toBe(400);
    expect(setDishStatus).not.toHaveBeenCalled();
  });

  it("surfaces a checklist ValidationError from the service as 400", async () => {
    vi.mocked(setDishStatus).mockRejectedValue(
      new ValidationError("not ready", [
        { field: "qualityChecklist", rule: "incomplete" },
      ]),
    );
    const res = await POST(statusRequest({ status: "active" }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });
});
