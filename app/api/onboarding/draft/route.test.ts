import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConflictError } from "@/lib/errors";

// Mock the `onboarding` service so the test exercises only the boundary wiring
// (body parse → service call → envelope/status).
vi.mock("@/lib/services/onboarding", () => ({
  getDraft: vi.fn(),
  saveDraft: vi.fn(),
}));

import { getDraft, saveDraft } from "@/lib/services/onboarding";

import { GET, PUT } from "./route";

const DRAFT_DTO = {
  status: "in_progress" as const,
  currentStep: "food_preferences",
  completionPercentage: 50,
  lastSavedAt: "2026-05-22T09:14:00Z",
  draftData: { householdBasics: { name: "Suhane Household" } },
};

function putRequest(rawBody: string): Request {
  return new Request("http://test.local/api/onboarding/draft", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/onboarding/draft", () => {
  it("returns 200 with the draft DTO from the service", async () => {
    vi.mocked(getDraft).mockResolvedValue(DRAFT_DTO);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(DRAFT_DTO);
  });

  it("returns 200 with a null body when there is no draft", async () => {
    vi.mocked(getDraft).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });
});

describe("PUT /api/onboarding/draft", () => {
  it("returns 200 with the saved draft and forwards the parsed body", async () => {
    vi.mocked(saveDraft).mockResolvedValue(DRAFT_DTO);

    const res = await PUT(
      putRequest(
        '{"currentStep":"food_preferences","draftData":{"foodPreferences":{"dietType":"vegetarian"}}}',
      ),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(DRAFT_DTO);
    expect(saveDraft).toHaveBeenCalledWith({
      currentStep: "food_preferences",
      draftData: { foodPreferences: { dietType: "vegetarian" } },
    });
  });

  it("maps a service ConflictError to a 409 envelope", async () => {
    vi.mocked(saveDraft).mockRejectedValue(
      new ConflictError("An onboarding draft is already in progress.", {
        reason: "draft_in_progress",
      }),
    );

    const res = await PUT(
      putRequest('{"currentStep":"review","draftData":{}}'),
    );

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("CONFLICT");
  });

  it("returns a 400 envelope for a malformed JSON body, without calling the service", async () => {
    const res = await PUT(putRequest("{not json"));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    expect(saveDraft).not.toHaveBeenCalled();
  });
});
