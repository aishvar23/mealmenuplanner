import { describe, expect, it } from "vitest";

import {
  categoryForEvent,
  EMAIL_CATEGORIES,
  EMAIL_CATEGORY_OPTIONS,
  EVENT_CATEGORY,
  isSettableEmailCategory,
  SETTABLE_EMAIL_CATEGORIES,
} from "./categories";
import { EVENT_TYPES } from "./types";

describe("EVENT_CATEGORY", () => {
  it("maps every event type to a known category and adds no extra keys", () => {
    for (const event of EVENT_TYPES) {
      expect(EMAIL_CATEGORIES).toContain(EVENT_CATEGORY[event]);
    }
    expect(Object.keys(EVENT_CATEGORY).sort()).toEqual([...EVENT_TYPES].sort());
  });

  it("groups meal, weekly, and membership events as expected", () => {
    expect(categoryForEvent("meal_changed")).toBe("today_meal");
    expect(categoryForEvent("meal_marked_eating_out")).toBe("today_meal");
    expect(categoryForEvent("weekly_plan_updated")).toBe("weekly_plan");
    expect(categoryForEvent("member_invited")).toBe("member_invited");
    expect(categoryForEvent("member_removed")).toBe("member_removed");
    expect(categoryForEvent("role_changed")).toBe("member_changes");
    expect(categoryForEvent("prep_task_due")).toBe("prep_reminders");
  });
});

describe("settable categories", () => {
  it("excludes prep_reminders (no request-path producer) from the UI options", () => {
    expect(SETTABLE_EMAIL_CATEGORIES).not.toContain("prep_reminders");
    expect(isSettableEmailCategory("prep_reminders")).toBe(false);
    expect(isSettableEmailCategory("today_meal")).toBe(true);
    expect(isSettableEmailCategory("nonsense")).toBe(false);
  });

  it("exposes every UI option as a real, distinct email category", () => {
    const seen = new Set<string>();
    for (const option of EMAIL_CATEGORY_OPTIONS) {
      expect(EMAIL_CATEGORIES).toContain(option.category);
      expect(seen.has(option.category)).toBe(false);
      seen.add(option.category);
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.description.length).toBeGreaterThan(0);
    }
  });
});
