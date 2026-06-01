import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import {
  ConflictError,
  InternalError,
  UnauthenticatedError,
  ValidationError,
} from "@/lib/errors";

// save-draft.ts is server-only and depends on the auth guard + the per-request
// Supabase client. Stub the `server-only` marker and the two I/O dependencies so
// the service runs in a plain Node test.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAuthUser: vi.fn() }));

import { saveDraft } from "./save-draft";

const USER_ID = "11111111-1111-1111-1111-111111111111";

/** A body whose draftData satisfies all six required fields → 100% complete. */
const COMPLETE_BODY = {
  currentStep: "review",
  completionPercentage: 12, // advisory; the server ignores it
  draftData: {
    householdBasics: { name: "Suhane Household", familySize: 4 },
    foodPreferences: {
      dietTypes: ["vegetarian"],
      preferredCuisines: ["North Indian"],
    },
    mealSchedule: { mealsToPlan: ["dinner"], weekdayCookingTimeMinutes: 30 },
  },
};

const SAVED_ROW = {
  id: "d3d3d3d3-0000-0000-0000-0000000000d3",
  status: "in_progress",
  current_step: "review",
  completion_percentage: 100,
  last_saved_at: "2026-05-23T10:00:00Z",
  draft_data: COMPLETE_BODY.draftData,
};

type QueryResult = { data: unknown; error: unknown };

function stubSupabase(opts: {
  updateResult?: QueryResult;
  insertResult?: QueryResult;
}) {
  const updateBuilder = {
    eq: vi.fn(() => updateBuilder),
    select: vi.fn(() => updateBuilder),
    maybeSingle: vi.fn(() =>
      Promise.resolve(opts.updateResult ?? { data: null, error: null }),
    ),
  };
  const insertBuilder = {
    select: vi.fn(() => insertBuilder),
    single: vi.fn(() =>
      Promise.resolve(opts.insertResult ?? { data: null, error: null }),
    ),
  };
  // Typed via the generic (not a named param) so the captured payload is
  // accessible without tripping no-unused-vars.
  const update = vi.fn<
    (payload: Record<string, unknown>) => typeof updateBuilder
  >(() => updateBuilder);
  const insert = vi.fn<
    (payload: Record<string, unknown>) => typeof insertBuilder
  >(() => insertBuilder);
  const from = vi.fn(() => ({ update, insert }));
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ from } as never);
  return { from, update, insert, updateBuilder, insertBuilder };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthUser).mockResolvedValue({ id: USER_ID } as never);
});

describe("saveDraft", () => {
  it("updates the existing in-progress draft and returns the DTO", async () => {
    const { update, insert } = stubSupabase({
      updateResult: { data: SAVED_ROW, error: null },
    });

    const dto = await saveDraft(COMPLETE_BODY);

    expect(dto).toEqual({
      id: "d3d3d3d3-0000-0000-0000-0000000000d3",
      status: "in_progress",
      currentStep: "review",
      completionPercentage: 100,
      lastSavedAt: "2026-05-23T10:00:00Z",
      draftData: COMPLETE_BODY.draftData,
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(insert).not.toHaveBeenCalled();
  });

  it("recomputes completion_percentage and re-stamps last_saved_at, ignoring client input", async () => {
    const { update } = stubSupabase({
      updateResult: { data: SAVED_ROW, error: null },
    });

    await saveDraft(COMPLETE_BODY);

    const payload = update.mock.calls[0]?.[0];
    expect(payload).toBeDefined();
    expect(payload?.completion_percentage).toBe(100); // not the client's 12
    expect(payload?.current_step).toBe("review");
    expect(payload?.draft_data).toEqual(COMPLETE_BODY.draftData);
    expect(typeof payload?.last_saved_at).toBe("string");
    expect(Number.isNaN(Date.parse(payload?.last_saved_at as string))).toBe(
      false,
    );
  });

  it("scopes the update to the caller's in-progress draft", async () => {
    const { updateBuilder } = stubSupabase({
      updateResult: { data: SAVED_ROW, error: null },
    });
    await saveDraft(COMPLETE_BODY);
    expect(updateBuilder.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(updateBuilder.eq).toHaveBeenCalledWith("status", "in_progress");
  });

  it("inserts a new draft when none is in progress", async () => {
    const { insert } = stubSupabase({
      updateResult: { data: null, error: null },
      insertResult: { data: SAVED_ROW, error: null },
    });

    const dto = await saveDraft(COMPLETE_BODY);

    expect(dto.completionPercentage).toBe(100);
    expect(insert).toHaveBeenCalledTimes(1);
    const payload = insert.mock.calls[0]?.[0];
    expect(payload).toMatchObject({
      user_id: USER_ID,
      status: "in_progress",
      current_step: "review",
      completion_percentage: 100,
    });
  });

  it("maps a unique-violation on insert to ConflictError (lost the race)", async () => {
    stubSupabase({
      updateResult: { data: null, error: null },
      insertResult: { data: null, error: { code: "23505", message: "dup" } },
    });
    await expect(saveDraft(COMPLETE_BODY)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("wraps a non-unique insert error as InternalError", async () => {
    stubSupabase({
      updateResult: { data: null, error: null },
      insertResult: { data: null, error: { code: "XXXXX", message: "boom" } },
    });
    await expect(saveDraft(COMPLETE_BODY)).rejects.toBeInstanceOf(
      InternalError,
    );
  });

  it("wraps an update error as InternalError", async () => {
    stubSupabase({ updateResult: { data: null, error: { message: "boom" } } });
    await expect(saveDraft(COMPLETE_BODY)).rejects.toBeInstanceOf(
      InternalError,
    );
  });

  it("throws ValidationError for a bad body without touching the database", async () => {
    const { from } = stubSupabase({});
    await expect(
      saveDraft({ currentStep: "nope", draftData: {} }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(from).not.toHaveBeenCalled();
  });

  it("propagates UnauthenticatedError from the guard", async () => {
    vi.mocked(requireAuthUser).mockRejectedValue(new UnauthenticatedError());
    await expect(saveDraft(COMPLETE_BODY)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });
});
