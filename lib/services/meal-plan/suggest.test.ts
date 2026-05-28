import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  emptyHistory,
  makeDish,
  makeHousehold,
} from "@/lib/recommendation/test-fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/recommendation", () => ({ loadSlotInputs: vi.fn() }));

import { loadSlotInputs } from "@/lib/services/recommendation";

import { listSlotCandidates } from "./suggest";

const HOUSEHOLD_ID = "22222222-2222-2222-2222-222222222222";

function slotInputs(dishCount: number) {
  return {
    household: makeHousehold(),
    members: [],
    // All vegetarian main_component dishes valid for lunch+dinner — every one
    // survives the hard filters, so they exercise the uncapped candidate list.
    dishes: Array.from({ length: dishCount }, (_, i) =>
      makeDish({ id: `dish-${i}`, name: `Dish ${i}`, totalTimeMinutes: 30 }),
    ),
    history: emptyHistory(),
    date: "2026-05-25",
    mealSlot: "dinner" as const,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listSlotCandidates (BUG-022/023, SLOTPICK-005)", () => {
  it("returns every eligible dish, uncapped beyond the tuned topN", async () => {
    // 8 eligible dishes — more than the engine's default topN of 5.
    vi.mocked(loadSlotInputs).mockResolvedValue(slotInputs(8) as never);

    const candidates = await listSlotCandidates(
      HOUSEHOLD_ID,
      "2026-05-25",
      "dinner",
    );

    expect(candidates).toHaveLength(8);
  });

  it("excludes the dish already in the cell (no no-op replacement)", async () => {
    vi.mocked(loadSlotInputs).mockResolvedValue(slotInputs(4) as never);

    const candidates = await listSlotCandidates(
      HOUSEHOLD_ID,
      "2026-05-25",
      "dinner",
      { excludeDishIds: ["dish-1"] },
    );

    expect(candidates).toHaveLength(3);
    expect(candidates.map((c) => c.dishId)).not.toContain("dish-1");
  });

  it("offers only the household's chosen dishes, not the wider catalog (BUG-027)", async () => {
    // 6 eligible catalog dishes, but the household only chose two of them.
    const inputs = slotInputs(6);
    const chosen = makeHousehold({
      chosenDishIds: new Set(["dish-0", "dish-3"]),
    });
    vi.mocked(loadSlotInputs).mockResolvedValue({
      ...inputs,
      household: chosen,
    } as never);

    const candidates = await listSlotCandidates(
      HOUSEHOLD_ID,
      "2026-05-25",
      "dinner",
    );

    expect(candidates.map((c) => c.dishId).sort()).toEqual([
      "dish-0",
      "dish-3",
    ]);
  });
});
