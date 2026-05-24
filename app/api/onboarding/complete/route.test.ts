import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotFoundError, ValidationError } from "@/lib/errors";

// Mock the `onboarding` service so the test exercises only the boundary wiring
// (body parse → service call → envelope/status).
vi.mock("@/lib/services/onboarding", () => ({
  completeOnboarding: vi.fn(),
}));

import { completeOnboarding } from "@/lib/services/onboarding";

import { POST } from "./route";

const DRAFT_ID = "b2b2b2b2-0000-0000-0000-0000000000b2";
const HOUSEHOLD_ID = "c3c3c3c3-0000-0000-0000-0000000000c3";

function postRequest(rawBody: string): Request {
  return new Request("http://test.local/api/onboarding/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/onboarding/complete", () => {
  it("returns 201 with the result and forwards the parsed body", async () => {
    vi.mocked(completeOnboarding).mockResolvedValue({
      householdId: HOUSEHOLD_ID,
      status: "completed",
    });

    const res = await POST(postRequest(`{"draftId":"${DRAFT_ID}"}`));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      householdId: HOUSEHOLD_ID,
      status: "completed",
    });
    expect(completeOnboarding).toHaveBeenCalledWith({ draftId: DRAFT_ID });
  });

  it("maps a service ValidationError to a 400 envelope", async () => {
    vi.mocked(completeOnboarding).mockRejectedValue(
      new ValidationError("Your household setup is incomplete or invalid.", [
        { field: "name", rule: "required" },
      ]),
    );

    const res = await POST(postRequest(`{"draftId":"${DRAFT_ID}"}`));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("maps a service NotFoundError to a 404 envelope", async () => {
    vi.mocked(completeOnboarding).mockRejectedValue(
      new NotFoundError("Onboarding draft not found."),
    );

    const res = await POST(postRequest(`{"draftId":"${DRAFT_ID}"}`));

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });

  it("returns a 400 envelope for a malformed JSON body, without calling the service", async () => {
    const res = await POST(postRequest("{not json"));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    expect(completeOnboarding).not.toHaveBeenCalled();
  });
});
