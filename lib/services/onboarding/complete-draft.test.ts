import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import {
  ConflictError,
  InternalError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "@/lib/errors";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAuthUser: vi.fn() }));

import { completeOnboarding } from "./complete-draft";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const DRAFT_ID = "b2b2b2b2-0000-0000-0000-0000000000b2";
const HOUSEHOLD_ID = "c3c3c3c3-0000-0000-0000-0000000000c3";

const COMPLETE_DRAFT_DATA = {
  householdBasics: { name: "Suhane Household", familySize: 4 },
  foodPreferences: {
    dietType: "vegetarian",
    preferredCuisines: ["North Indian"],
  },
  mealSchedule: { mealsToPlan: ["dinner"], weekdayCookingTimeMinutes: 30 },
};

type QueryResult = { data: unknown; error: unknown };

function stubSupabase(opts: {
  loadResult?: QueryResult;
  rpcResult?: QueryResult;
}) {
  const builder = {
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(() =>
      Promise.resolve(opts.loadResult ?? { data: null, error: null }),
    ),
  };
  const select = vi.fn(() => builder);
  const from = vi.fn(() => ({ select }));
  const rpc = vi.fn(() =>
    Promise.resolve(opts.rpcResult ?? { data: null, error: null }),
  );
  vi.mocked(createServerSupabaseClient).mockResolvedValue({
    from,
    rpc,
  } as never);
  return { from, select, builder, rpc };
}

function inProgressDraft(draftData: unknown = COMPLETE_DRAFT_DATA) {
  return {
    id: DRAFT_ID,
    status: "in_progress",
    household_id: null,
    draft_data: draftData,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthUser).mockResolvedValue({ id: USER_ID } as never);
});

describe("completeOnboarding", () => {
  it("completes an in-progress draft via the RPC and returns the household", async () => {
    const { rpc } = stubSupabase({
      loadResult: { data: inProgressDraft(), error: null },
      rpcResult: {
        data: { householdId: HOUSEHOLD_ID, status: "completed" },
        error: null,
      },
    });

    const result = await completeOnboarding({ draftId: DRAFT_ID });

    expect(result).toEqual({ householdId: HOUSEHOLD_ID, status: "completed" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "complete_onboarding",
      expect.objectContaining({
        p_draft_id: DRAFT_ID,
        p_household: expect.objectContaining({ name: "Suhane Household" }),
        p_preferences: expect.objectContaining({ familySize: 4 }),
      }),
    );
  });

  it("rejects a missing/invalid draftId before any query", async () => {
    const { from } = stubSupabase({});
    await expect(
      completeOnboarding({ draftId: "nope" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(completeOnboarding({})).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(from).not.toHaveBeenCalled();
  });

  it("404s when the draft is not found / not owned by the caller", async () => {
    stubSupabase({ loadResult: { data: null, error: null } });
    await expect(
      completeOnboarding({ draftId: DRAFT_ID }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("is idempotent: a completed draft returns its household without the RPC", async () => {
    const { rpc } = stubSupabase({
      loadResult: {
        data: {
          id: DRAFT_ID,
          status: "completed",
          household_id: HOUSEHOLD_ID,
          draft_data: {},
        },
        error: null,
      },
    });

    const result = await completeOnboarding({ draftId: DRAFT_ID });
    expect(result).toEqual({ householdId: HOUSEHOLD_ID, status: "completed" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("409s on a terminal (abandoned) draft", async () => {
    stubSupabase({
      loadResult: {
        data: {
          id: DRAFT_ID,
          status: "abandoned",
          household_id: null,
          draft_data: {},
        },
        error: null,
      },
    });
    await expect(
      completeOnboarding({ draftId: DRAFT_ID }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("422-style ValidationError for an incomplete in-progress draft (no RPC)", async () => {
    const { rpc } = stubSupabase({
      loadResult: { data: inProgressDraft({}), error: null },
    });
    await expect(
      completeOnboarding({ draftId: DRAFT_ID }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps the RPC no_data_found (P0002) to NotFoundError", async () => {
    stubSupabase({
      loadResult: { data: inProgressDraft(), error: null },
      rpcResult: { data: null, error: { code: "P0002", message: "missing" } },
    });
    await expect(
      completeOnboarding({ draftId: DRAFT_ID }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("maps an RPC race (23514 / 23505) to ConflictError", async () => {
    stubSupabase({
      loadResult: { data: inProgressDraft(), error: null },
      rpcResult: { data: null, error: { code: "23505", message: "dup" } },
    });
    await expect(
      completeOnboarding({ draftId: DRAFT_ID }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("wraps an unexpected RPC error as InternalError", async () => {
    stubSupabase({
      loadResult: { data: inProgressDraft(), error: null },
      rpcResult: { data: null, error: { code: "XXXXX", message: "boom" } },
    });
    await expect(
      completeOnboarding({ draftId: DRAFT_ID }),
    ).rejects.toBeInstanceOf(InternalError);
  });

  it("wraps a load error as InternalError", async () => {
    stubSupabase({ loadResult: { data: null, error: { message: "boom" } } });
    await expect(
      completeOnboarding({ draftId: DRAFT_ID }),
    ).rejects.toBeInstanceOf(InternalError);
  });

  it("throws InternalError when the RPC returns no household", async () => {
    stubSupabase({
      loadResult: { data: inProgressDraft(), error: null },
      rpcResult: { data: null, error: null },
    });
    await expect(
      completeOnboarding({ draftId: DRAFT_ID }),
    ).rejects.toBeInstanceOf(InternalError);
  });

  it("propagates UnauthenticatedError from the guard", async () => {
    vi.mocked(requireAuthUser).mockRejectedValue(new UnauthenticatedError());
    await expect(
      completeOnboarding({ draftId: DRAFT_ID }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});
