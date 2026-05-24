import { describe, expect, it } from "vitest";

import { computePrepReminders, type UpcomingPrepInput } from "./deadlines";

// Config mealtimes (UTC): breakfast 08:00, lunch 12:30, dinner 19:00, snack 16:00.

function input(overrides: Partial<UpcomingPrepInput> = {}): UpcomingPrepInput {
  return {
    mealPlanItemId: "item-1",
    date: "2026-05-25",
    mealSlot: "lunch",
    dishId: "dish-1",
    dishName: "Chole Rice",
    taskName: "Soak chickpeas",
    description: "Cover with water",
    requiredBeforeMinutes: 480, // 8h
    ...overrides,
  };
}

describe("computePrepReminders", () => {
  it("computes deadline = mealtime − required_before_minutes (UTC)", () => {
    // Lunch 2026-05-25 12:30 UTC − 480 min = 2026-05-25 04:30 UTC.
    const [reminder] = computePrepReminders(
      [input()],
      new Date("2026-05-24T00:00:00Z"),
    );
    expect(reminder?.prepDeadline).toBe("2026-05-25T04:30:00.000Z");
    expect(reminder?.overdue).toBe(false);
  });

  it("flags a deadline already in the past as overdue", () => {
    const [reminder] = computePrepReminders(
      [input()],
      new Date("2026-05-25T10:00:00Z"), // after the 04:30 deadline
    );
    expect(reminder?.overdue).toBe(true);
  });

  it("sorts reminders earliest-deadline first", () => {
    const dinner = input({
      mealPlanItemId: "item-dinner",
      mealSlot: "dinner",
      requiredBeforeMinutes: 60, // 19:00 − 1h = 18:00
    });
    const lunch = input({ mealPlanItemId: "item-lunch" }); // 04:30
    const reminders = computePrepReminders(
      [dinner, lunch],
      new Date("2026-05-24T00:00:00Z"),
    );
    expect(reminders.map((r) => r.mealPlanItemId)).toEqual([
      "item-lunch",
      "item-dinner",
    ]);
  });

  it("carries through dish + task display fields", () => {
    const [reminder] = computePrepReminders(
      [input()],
      new Date("2026-05-24T00:00:00Z"),
    );
    expect(reminder).toMatchObject({
      dishName: "Chole Rice",
      taskName: "Soak chickpeas",
      description: "Cover with water",
      mealSlot: "lunch",
      date: "2026-05-25",
    });
  });

  it("returns an empty list for no inputs", () => {
    expect(computePrepReminders([], new Date())).toEqual([]);
  });

  it("handles a zero-lead task (deadline equals mealtime)", () => {
    const [reminder] = computePrepReminders(
      [input({ requiredBeforeMinutes: 0, mealSlot: "dinner" })],
      new Date("2026-05-24T00:00:00Z"),
    );
    expect(reminder?.prepDeadline).toBe("2026-05-25T19:00:00.000Z");
  });
});
