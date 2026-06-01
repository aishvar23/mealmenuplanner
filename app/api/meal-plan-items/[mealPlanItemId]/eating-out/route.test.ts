import { beforeEach, describe, expect, it, vi } from "vitest";

// Stub the service module. `validateEatingOutRequest` is pure, so a small
// faithful stand-in keeps the route test free of server-only imports while still
// exercising the body → note plumbing.
vi.mock("@/lib/services/meal-plan", () => ({
  markEatingOut: vi.fn(),
  validateEatingOutRequest: (body: { note?: unknown }) => ({
    note:
      typeof body?.note === "string" && body.note.trim().length > 0
        ? body.note.trim()
        : null,
  }),
}));

import { markEatingOut } from "@/lib/services/meal-plan";

import { POST } from "./route";

const ID = "33333333-3333-3333-3333-333333333333";
const ctx = { params: Promise.resolve({ mealPlanItemId: ID }) };
const bareReq = () => new Request("http://t.local", { method: "POST" });
const noteReq = (note: string) =>
  new Request("http://t.local", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ note }),
  });

beforeEach(() => vi.clearAllMocks());

describe("POST eating-out", () => {
  it("delegates with a null note for a bare request and returns 200", async () => {
    vi.mocked(markEatingOut).mockResolvedValue({
      status: "eating_out",
    } as never);
    const res = await POST(bareReq(), ctx);
    expect(res.status).toBe(200);
    expect(markEatingOut).toHaveBeenCalledWith(ID, null);
  });

  it("forwards a place note from the body", async () => {
    vi.mocked(markEatingOut).mockResolvedValue({
      status: "eating_out",
      eatingOutNote: "Pizza place",
    } as never);
    const res = await POST(noteReq("Pizza place"), ctx);
    expect(res.status).toBe(200);
    expect(markEatingOut).toHaveBeenCalledWith(ID, "Pizza place");
  });
});
