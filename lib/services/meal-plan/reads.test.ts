import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotFoundError } from "@/lib/errors";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getActiveMembership: vi.fn() }));

import { getActiveMembership } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { createSupabaseStub } from "@/lib/services/recommendation/query-stub";

import { getDayPlan, getWeekPlan, listMealHistory } from "./reads";

const HH = "22222222-2222-2222-2222-222222222222";

function item(date: string, slot: string, name: string | null) {
  return {
    id: `${date}-${slot}`,
    meal_plan_id: "p1",
    date,
    meal_slot: slot,
    dish_id: name ? "d1" : null,
    status: "suggested",
    locked: false,
    reason: null,
    changed_by_user_id: null,
    dishes: name ? { name } : null,
  };
}

function withRows(rows: unknown[]) {
  const stub = createSupabaseStub({
    tables: { meal_plan_items: { data: rows, error: null } },
  });
  vi.mocked(createServerSupabaseClient).mockResolvedValue(stub.client as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getActiveMembership).mockResolvedValue({} as never);
});

describe("getDayPlan", () => {
  it("404s a malformed household id before the guard", async () => {
    await expect(getDayPlan("nope", "2026-05-25")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(getActiveMembership).not.toHaveBeenCalled();
  });

  it("404s a non-member (existence-hiding)", async () => {
    vi.mocked(getActiveMembership).mockResolvedValue(null);
    await expect(getDayPlan(HH, "2026-05-25")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("maps rows and orders by slot", async () => {
    withRows([
      item("2026-05-25", "dinner", "Paneer"),
      item("2026-05-25", "breakfast", "Poha"),
    ]);
    const { items } = await getDayPlan(HH, "2026-05-25");
    expect(items.map((i) => i.mealSlot)).toEqual(["breakfast", "dinner"]);
    expect(items[0]?.dishName).toBe("Poha");
  });
});

describe("getWeekPlan", () => {
  it("orders by date then slot", async () => {
    withRows([
      item("2026-05-26", "breakfast", "A"),
      item("2026-05-25", "dinner", "B"),
      item("2026-05-25", "breakfast", "C"),
    ]);
    const { items } = await getWeekPlan(HH, "2026-05-25", "2026-05-26");
    expect(items.map((i) => `${i.date}/${i.mealSlot}`)).toEqual([
      "2026-05-25/breakfast",
      "2026-05-25/dinner",
      "2026-05-26/breakfast",
    ]);
  });
});

describe("listMealHistory", () => {
  it("maps past items, including eating-out (null dish)", async () => {
    withRows([item("2026-05-20", "dinner", null)]);
    const history = await listMealHistory(HH, { before: "2026-05-25" });
    expect(history).toHaveLength(1);
    expect(history[0]?.dishId).toBeNull();
  });
});
