import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConflictError, ValidationError } from "@/lib/errors";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireAuthUser: vi.fn() }));
vi.mock("@/lib/services/grocery", () => ({
  safeRegenerateGroceryListForPlan: vi.fn(),
}));
vi.mock("./access", () => ({
  loadItemForAction: vi.fn(),
  ITEM_ACTION_SELECT: "id",
}));
vi.mock("./suggest", () => ({
  suggestForSlot: vi.fn(),
  // toAlternatives is pure — reproduce its mapping so reject/replace stay realistic.
  toAlternatives: (
    recs: { dishId: string; score: number; reason: string }[],
    nameById: Map<string, string>,
    imageById: Map<
      string,
      {
        imageUrl: string | null;
        imageAltText: string | null;
        imageStatus: string;
      }
    > = new Map(),
  ) =>
    recs.map((r) => ({
      dishId: r.dishId,
      dishName: nameById.get(r.dishId) ?? null,
      dishImageUrl: imageById.get(r.dishId)?.imageUrl ?? null,
      dishImageAltText: imageById.get(r.dishId)?.imageAltText ?? null,
      dishImageStatus: imageById.get(r.dishId)?.imageStatus ?? null,
      score: r.score,
      reason: r.reason,
    })),
}));
vi.mock("./generate", () => ({ generateToday: vi.fn() }));
vi.mock("./propose-combination", () => ({ safeProposeCombination: vi.fn() }));

import { requireAuthUser } from "@/lib/auth";

import { loadItemForAction } from "./access";
import { generateToday } from "./generate";
import { safeProposeCombination } from "./propose-combination";
import {
  acceptItem,
  markCookedItem,
  markEatingOut,
  rejectItem,
  replaceItem,
  suggestAnotherItem,
} from "./items";
import { suggestForSlot } from "./suggest";

const USER = { id: "user-1" };
const ITEM_ID = "33333333-3333-3333-3333-333333333333";

interface StubItem {
  id: string;
  household_id: string;
  meal_plan_id: string;
  date: string;
  meal_slot: string;
  dish_id: string | null;
  status: string;
  locked: boolean;
  reason: string | null;
  changed_by_user_id: string | null;
  dishes: { name: string } | null;
}

function makeItem(overrides: Partial<StubItem> = {}): StubItem {
  return {
    id: ITEM_ID,
    household_id: "hh-1",
    meal_plan_id: "plan-1",
    date: "2026-05-25",
    meal_slot: "dinner",
    dish_id: "dish-old",
    status: "suggested",
    locked: false,
    reason: null,
    changed_by_user_id: null,
    dishes: { name: "Old Dish" },
    ...overrides,
  };
}

/** A minimal supabase stub supporting the item update + feedback insert chains. */
function makeClient() {
  const calls: { table: string; op: string; payload?: unknown }[] = [];
  const updatePayload = { holder: undefined as unknown };

  const mpi = {
    update(payload: unknown) {
      calls.push({ table: "meal_plan_items", op: "update", payload });
      updatePayload.holder = payload;
      return mpi;
    },
    eq: () => mpi,
    select: () => mpi,
    maybeSingle: () =>
      Promise.resolve({
        // Echo back the applied update merged onto the loaded item.
        data: {
          ...makeItem(),
          ...(updatePayload.holder as object),
          dishes: { name: "New Dish" },
        },
        error: null,
      }),
  };
  const mf = {
    insert(payload: unknown) {
      calls.push({ table: "meal_feedback", op: "insert", payload });
      return Promise.resolve({ error: null });
    },
  };
  // `attachPackages` reads dish_pairings + dishes after each action; resolve them
  // empty so the item actions need no package fixtures (covered in packaging.test).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const empty: any = {
    select: () => empty,
    eq: () => empty,
    in: () => empty,
    then: (resolve: (v: unknown) => unknown) =>
      resolve({ data: [], error: null }),
  };

  return {
    calls,
    client: {
      from: (table: string) =>
        table === "meal_feedback"
          ? mf
          : table === "meal_plan_items"
            ? mpi
            : empty,
    },
  };
}

function recommend(dishIds: string[]) {
  return {
    recommendations: dishIds.map((dishId, i) => ({
      dishId,
      score: 100 - i,
      reason: `Reason ${dishId}`,
      missingConstraints: [],
      prepTasks: [],
      pairedDishes: [],
    })),
    nameById: new Map(dishIds.map((id) => [id, `Name ${id}`])),
    imageById: new Map(
      dishIds.map((id) => [
        id,
        {
          imageUrl: null,
          imageAltText: null,
          imageStatus: "placeholder",
        },
      ]),
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthUser).mockResolvedValue(USER as never);
});

describe("acceptItem", () => {
  it("rejects accepting a slot with no dish", async () => {
    const { client } = makeClient();
    vi.mocked(loadItemForAction).mockResolvedValue({
      supabase: client,
      item: makeItem({ dish_id: null }),
    } as never);

    await expect(acceptItem(ITEM_ID)).rejects.toBeInstanceOf(ValidationError);
  });

  it("sets status accepted with the actor", async () => {
    const stub = makeClient();
    vi.mocked(loadItemForAction).mockResolvedValue({
      supabase: stub.client,
      item: makeItem(),
    } as never);

    const result = await acceptItem(ITEM_ID);

    const update = stub.calls.find((c) => c.op === "update")?.payload as Record<
      string,
      unknown
    >;
    expect(update.status).toBe("accepted");
    expect(update.changed_by_user_id).toBe(USER.id);
    expect(result.status).toBe("accepted");
    // Accepting fires the daily-approval promotion hook (P10-5).
    expect(vi.mocked(safeProposeCombination)).toHaveBeenCalledTimes(1);
  });
});

describe("rejectItem", () => {
  it("records feedback, marks rejected (keeping the dish), and returns alternatives", async () => {
    const stub = makeClient();
    vi.mocked(loadItemForAction).mockResolvedValue({
      supabase: stub.client,
      item: makeItem({ dish_id: "dish-old" }),
    } as never);
    vi.mocked(suggestForSlot).mockResolvedValue(
      recommend(["alt-1", "alt-2"]) as never,
    );

    const result = await rejectItem(ITEM_ID, {
      feedbackType: "too_much_effort",
      reason: "long soak",
    });

    const feedback = stub.calls.find((c) => c.table === "meal_feedback")
      ?.payload as Record<string, unknown>;
    expect(feedback.feedback_type).toBe("too_much_effort");
    expect(feedback.meal_plan_item_id).toBe(ITEM_ID);
    expect(feedback.user_id).toBe(USER.id);

    const update = stub.calls.find((c) => c.op === "update")?.payload as Record<
      string,
      unknown
    >;
    expect(update.status).toBe("rejected");
    // The rejected dish is excluded from the returned alternatives.
    expect(vi.mocked(suggestForSlot)).toHaveBeenCalledWith(
      "hh-1",
      "2026-05-25",
      "dinner",
      { excludeDishIds: ["dish-old"] },
    );
    expect(result.alternatives.map((a) => a.dishId)).toEqual([
      "alt-1",
      "alt-2",
    ]);
  });

  it("rejects when the slot has no dish", async () => {
    const { client } = makeClient();
    vi.mocked(loadItemForAction).mockResolvedValue({
      supabase: client,
      item: makeItem({ dish_id: null }),
    } as never);
    await expect(
      rejectItem(ITEM_ID, { feedbackType: "disliked", reason: null }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("replaceItem", () => {
  it("409s when the item is locked", async () => {
    const { client } = makeClient();
    vi.mocked(loadItemForAction).mockResolvedValue({
      supabase: client,
      item: makeItem({ locked: true }),
    } as never);
    await expect(
      replaceItem(ITEM_ID, {
        replacementDishId: null,
        reason: null,
        feedbackType: null,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects a replacement dish that isn't eligible for the slot", async () => {
    const stub = makeClient();
    vi.mocked(loadItemForAction).mockResolvedValue({
      supabase: stub.client,
      item: makeItem(),
    } as never);
    vi.mocked(suggestForSlot).mockResolvedValue(recommend(["alt-1"]) as never);

    await expect(
      replaceItem(ITEM_ID, {
        replacementDishId: "not-eligible",
        reason: null,
        feedbackType: null,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("applies an eligible chosen dish and accepts the cell", async () => {
    const stub = makeClient();
    vi.mocked(loadItemForAction).mockResolvedValue({
      supabase: stub.client,
      item: makeItem(),
    } as never);
    vi.mocked(suggestForSlot).mockResolvedValue(
      recommend(["alt-1", "alt-2"]) as never,
    );

    const result = await replaceItem(ITEM_ID, {
      replacementDishId: "alt-2",
      reason: null,
      feedbackType: null,
    });

    const update = stub.calls.find((c) => c.op === "update")?.payload as Record<
      string,
      unknown
    >;
    expect(update.dish_id).toBe("alt-2");
    expect(update.status).toBe("accepted");
    expect(result.groceryListUpdated).toBe(true);
  });

  it("picks the top recommendation when no dish is supplied", async () => {
    const stub = makeClient();
    vi.mocked(loadItemForAction).mockResolvedValue({
      supabase: stub.client,
      item: makeItem(),
    } as never);
    vi.mocked(suggestForSlot).mockResolvedValue(
      recommend(["alt-1", "alt-2"]) as never,
    );

    await replaceItem(ITEM_ID, {
      replacementDishId: null,
      reason: null,
      feedbackType: null,
    });

    const update = stub.calls.find((c) => c.op === "update")?.payload as Record<
      string,
      unknown
    >;
    expect(update.dish_id).toBe("alt-1");
  });
});

describe("markEatingOut", () => {
  it("409s when locked", async () => {
    const { client } = makeClient();
    vi.mocked(loadItemForAction).mockResolvedValue({
      supabase: client,
      item: makeItem({ locked: true }),
    } as never);
    await expect(markEatingOut(ITEM_ID)).rejects.toBeInstanceOf(ConflictError);
  });

  it("clears the dish and sets eating_out", async () => {
    const stub = makeClient();
    vi.mocked(loadItemForAction).mockResolvedValue({
      supabase: stub.client,
      item: makeItem(),
    } as never);

    await markEatingOut(ITEM_ID);

    const update = stub.calls.find((c) => c.op === "update")?.payload as Record<
      string,
      unknown
    >;
    expect(update.status).toBe("eating_out");
    expect(update.dish_id).toBeNull();
  });
});

describe("markCookedItem", () => {
  it("rejects an eating-out / dishless slot", async () => {
    const { client } = makeClient();
    vi.mocked(loadItemForAction).mockResolvedValue({
      supabase: client,
      item: makeItem({ dish_id: null, status: "eating_out" }),
    } as never);
    await expect(markCookedItem(ITEM_ID)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("sets status cooked", async () => {
    const stub = makeClient();
    vi.mocked(loadItemForAction).mockResolvedValue({
      supabase: stub.client,
      item: makeItem({ status: "accepted" }),
    } as never);

    await markCookedItem(ITEM_ID);

    const update = stub.calls.find((c) => c.op === "update")?.payload as Record<
      string,
      unknown
    >;
    expect(update.status).toBe("cooked");
  });
});

describe("suggestAnotherItem", () => {
  it("delegates to generateToday excluding the current dish", async () => {
    const { client } = makeClient();
    vi.mocked(loadItemForAction).mockResolvedValue({
      supabase: client,
      item: makeItem({ dish_id: "dish-old" }),
    } as never);
    vi.mocked(generateToday).mockResolvedValue({
      mealPlanId: "plan-1",
      mealPlanItem: null,
      alternatives: [],
    });

    await suggestAnotherItem(ITEM_ID);

    expect(vi.mocked(generateToday)).toHaveBeenCalledWith(
      "hh-1",
      "2026-05-25",
      "dinner",
      {
        excludeDishIds: ["dish-old"],
      },
    );
  });
});
