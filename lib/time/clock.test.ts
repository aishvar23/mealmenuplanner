import { describe, expect, it } from "vitest";

import { fixedClock, offsetClock, systemClock, type Clock } from "./clock";

describe("systemClock", () => {
  it("returns the current instant within a tolerance", () => {
    const before = Date.now();
    const now = systemClock.now().getTime();
    const after = Date.now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });
});

describe("fixedClock", () => {
  it("freezes time at the given Date", () => {
    const at = new Date("2026-01-02T03:04:05.000Z");
    const clock = fixedClock(at);
    expect(clock.now().toISOString()).toBe("2026-01-02T03:04:05.000Z");
  });

  it("accepts an ISO string and an epoch-millis number", () => {
    expect(fixedClock("2026-06-11T00:00:00.000Z").now().toISOString()).toBe(
      "2026-06-11T00:00:00.000Z",
    );
    expect(fixedClock(0).now().getTime()).toBe(0);
  });

  it("never returns a value later code can mutate to corrupt the clock", () => {
    const clock = fixedClock("2026-06-11T00:00:00.000Z");
    const first = clock.now();
    first.setFullYear(1999);
    expect(clock.now().toISOString()).toBe("2026-06-11T00:00:00.000Z");
  });

  it("rejects an invalid instant", () => {
    expect(() => fixedClock("not-a-date")).toThrow(TypeError);
  });
});

describe("offsetClock", () => {
  const base: Clock = fixedClock("2026-06-11T12:00:00.000Z");

  it("shifts into the future by a positive offset", () => {
    expect(
      offsetClock(base, 2 * 60_000)
        .now()
        .toISOString(),
    ).toBe("2026-06-11T12:02:00.000Z");
  });

  it("shifts into the past by a negative offset", () => {
    expect(offsetClock(base, -60_000).now().toISOString()).toBe(
      "2026-06-11T11:59:00.000Z",
    );
  });

  it("tracks the base clock when the base advances", () => {
    let t = 0;
    const advancing: Clock = { now: () => new Date(t) };
    const ahead = offsetClock(advancing, 1_000);
    expect(ahead.now().getTime()).toBe(1_000);
    t = 5_000;
    expect(ahead.now().getTime()).toBe(6_000);
  });
});
