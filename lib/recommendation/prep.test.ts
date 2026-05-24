import { describe, expect, it } from "vitest";

import { RECOMMENDATION_CONFIG } from "@/lib/recommendation/config";
import { isWeekend, minutesUntilMeal } from "@/lib/recommendation/mealtimes";
import { prepFeasibility } from "@/lib/recommendation/prep";
import { makeDish } from "@/lib/recommendation/test-fixtures";

const config = RECOMMENDATION_CONFIG;

describe("isWeekend (UTC)", () => {
  it("is true for Saturday and Sunday", () => {
    expect(isWeekend("2026-05-23")).toBe(true); // Saturday
    expect(isWeekend("2026-05-24")).toBe(true); // Sunday
  });
  it("is false for weekdays", () => {
    expect(isWeekend("2026-05-25")).toBe(false); // Monday
    expect(isWeekend("2026-05-22")).toBe(false); // Friday
  });
});

describe("minutesUntilMeal", () => {
  it("computes minutes from now to the slot mealtime (UTC)", () => {
    const now = new Date("2026-05-25T17:00:00Z");
    // dinner = 19:00 → 120 minutes away.
    expect(minutesUntilMeal("2026-05-25", "dinner", now, config)).toBe(120);
  });

  it("is negative once the mealtime has passed", () => {
    const now = new Date("2026-05-25T20:00:00Z");
    expect(minutesUntilMeal("2026-05-25", "dinner", now, config)).toBe(-60);
  });
});

describe("prepFeasibility", () => {
  const rajma = makeDish({
    prepTasks: [
      {
        taskName: "Soak rajma",
        requiredBeforeMinutes: 480,
        description: "Soak overnight",
      },
    ],
  });

  it("is `none` for a dish with no prep tasks", () => {
    const now = new Date("2026-05-25T17:00:00Z");
    expect(
      prepFeasibility(makeDish(), "2026-05-25", "dinner", now, config).outcome,
    ).toBe("none");
  });

  it("is `impossible` when the soak can't finish before dinner today (6 PM)", () => {
    // now 18:00, dinner 19:00 → 60 min left < 480 min soak.
    const now = new Date("2026-05-25T18:00:00Z");
    const result = prepFeasibility(rajma, "2026-05-25", "dinner", now, config);
    expect(result.outcome).toBe("impossible");
    expect(result.maxLeadMinutes).toBe(480);
  });

  it("is `deferrable` when planning tomorrow's dinner (ample lead)", () => {
    const now = new Date("2026-05-25T18:00:00Z");
    const result = prepFeasibility(rajma, "2026-05-26", "dinner", now, config);
    expect(result.outcome).toBe("deferrable");
  });

  it("uses the longest prep lead across tasks", () => {
    const dish = makeDish({
      prepTasks: [
        { taskName: "Chop", requiredBeforeMinutes: 30, description: null },
        { taskName: "Marinate", requiredBeforeMinutes: 240, description: null },
      ],
    });
    const now = new Date("2026-05-25T17:00:00Z"); // 120 min to dinner
    const result = prepFeasibility(dish, "2026-05-25", "dinner", now, config);
    expect(result.maxLeadMinutes).toBe(240);
    expect(result.outcome).toBe("impossible");
  });
});
