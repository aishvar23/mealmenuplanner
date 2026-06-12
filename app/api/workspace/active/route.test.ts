import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/workspace", () => ({ setActiveWorkspace: vi.fn() }));

import { ForbiddenError } from "@/lib/errors";
import { setActiveWorkspace } from "@/lib/services/workspace";

import { POST } from "./route";

function post(body: unknown): Request {
  return new Request("http://test.local/api/workspace/active", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/workspace/active", () => {
  it("calls the service and returns 204 on a valid body", async () => {
    vi.mocked(setActiveWorkspace).mockResolvedValue();

    const res = await POST(post({ type: "provider_owner", id: "prov-a" }));

    expect(res.status).toBe(204);
    expect(setActiveWorkspace).toHaveBeenCalledWith("provider_owner", "prov-a");
  });

  it("rejects an unknown workspace type with a 400 envelope", async () => {
    const res = await POST(post({ type: "nope", id: "prov-a" }));

    expect(res.status).toBe(400);
    expect(setActiveWorkspace).not.toHaveBeenCalled();
  });

  it("rejects a missing id with a 400 envelope", async () => {
    const res = await POST(post({ type: "household" }));

    expect(res.status).toBe(400);
    expect(setActiveWorkspace).not.toHaveBeenCalled();
  });

  it("maps a ForbiddenError from the service to a 403 envelope", async () => {
    vi.mocked(setActiveWorkspace).mockRejectedValue(
      new ForbiddenError("You are not a member of that workspace."),
    );

    const res = await POST(post({ type: "provider_customer", id: "x" }));

    expect(res.status).toBe(403);
  });
});
