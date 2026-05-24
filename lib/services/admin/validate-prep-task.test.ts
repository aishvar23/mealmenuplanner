import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";
import {
  buildPrepTaskInsert,
  buildPrepTaskUpdate,
} from "@/lib/services/admin/validate-prep-task";

describe("buildPrepTaskInsert", () => {
  it("translates a valid body", () => {
    expect(
      buildPrepTaskInsert({
        taskName: "  Soak chickpeas ",
        requiredBeforeMinutes: 480,
        description: "Soak overnight or at least 8 hours.",
      }),
    ).toEqual({
      task_name: "Soak chickpeas",
      required_before_minutes: 480,
      description: "Soak overnight or at least 8 hours.",
    });
  });

  it("requires taskName and requiredBeforeMinutes", () => {
    expect(() => buildPrepTaskInsert({})).toThrow(ValidationError);
    expect(() => buildPrepTaskInsert({ taskName: "X" })).toThrow(
      ValidationError,
    );
  });

  it("rejects a negative lead time", () => {
    expect(() =>
      buildPrepTaskInsert({ taskName: "X", requiredBeforeMinutes: -5 }),
    ).toThrow(ValidationError);
  });
});

describe("buildPrepTaskUpdate", () => {
  it("clears description with null", () => {
    expect(buildPrepTaskUpdate({ description: null })).toEqual({
      description: null,
    });
  });

  it("rejects an empty update", () => {
    expect(() => buildPrepTaskUpdate({})).toThrow(ValidationError);
  });
});
