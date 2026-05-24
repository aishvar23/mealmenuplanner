import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { InternalError, UnauthenticatedError } from "@/lib/errors";

// get-draft.ts is server-only and depends on the auth guard + the per-request
// Supabase client. Stub the `server-only` marker and the two I/O dependencies so
// the service runs in a plain Node test.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAuthUser: vi.fn() }));

import { getDraft } from "./get-draft";

const USER_ID = "11111111-1111-1111-1111-111111111111";

const DRAFT_ROW = {
  status: "in_progress",
  current_step: "food_preferences",
  completion_percentage: 50,
  last_saved_at: "2026-05-22T09:14:00Z",
  draft_data: { householdBasics: { name: "Suhane Household" } },
};

type QueryResult = { data: unknown; error: unknown };

/** Stub `.from(table).select().eq().eq().maybeSingle()` resolving to `result`. */
function stubSupabase(result: QueryResult) {
  const builder = {
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };
  const select = vi.fn(() => builder);
  const from = vi.fn(() => ({ select }));
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ from } as never);
  return { from, select, builder };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthUser).mockResolvedValue({ id: USER_ID } as never);
});

describe("getDraft", () => {
  it("returns the draft DTO when an in-progress draft exists", async () => {
    stubSupabase({ data: DRAFT_ROW, error: null });

    const dto = await getDraft();

    expect(dto).toEqual({
      status: "in_progress",
      currentStep: "food_preferences",
      completionPercentage: 50,
      lastSavedAt: "2026-05-22T09:14:00Z",
      draftData: { householdBasics: { name: "Suhane Household" } },
    });
  });

  it("scopes the read to the caller and to in_progress drafts", async () => {
    const { from, builder } = stubSupabase({ data: DRAFT_ROW, error: null });
    await getDraft();
    expect(from).toHaveBeenCalledWith("household_profile_drafts");
    expect(builder.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(builder.eq).toHaveBeenCalledWith("status", "in_progress");
  });

  it("returns null when there is no in-progress draft", async () => {
    stubSupabase({ data: null, error: null });
    await expect(getDraft()).resolves.toBeNull();
  });

  it("defaults a null draft_data to an empty object", async () => {
    stubSupabase({ data: { ...DRAFT_ROW, draft_data: null }, error: null });
    const dto = await getDraft();
    expect(dto?.draftData).toEqual({});
  });

  it("wraps a query error as InternalError", async () => {
    stubSupabase({ data: null, error: { message: "boom" } });
    await expect(getDraft()).rejects.toBeInstanceOf(InternalError);
  });

  it("propagates UnauthenticatedError from the guard", async () => {
    vi.mocked(requireAuthUser).mockRejectedValue(new UnauthenticatedError());
    await expect(getDraft()).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});
