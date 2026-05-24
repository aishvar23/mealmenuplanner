import { describe, expect, it } from "vitest";

import { actorDisplayName, formatShortDate, formatSlotLabel } from "./format";

const NOW = new Date("2026-05-24T10:00:00Z"); // a Sunday

describe("formatSlotLabel", () => {
  it("reads today's dinner as 'tonight's dinner'", () => {
    expect(formatSlotLabel("dinner", "2026-05-24", NOW)).toBe(
      "tonight's dinner",
    );
  });

  it('reads another today slot as "today\'s <slot>"', () => {
    expect(formatSlotLabel("lunch", "2026-05-24", NOW)).toBe("today's lunch");
  });

  it('reads tomorrow as "tomorrow\'s <slot>"', () => {
    expect(formatSlotLabel("breakfast", "2026-05-25", NOW)).toBe(
      "tomorrow's breakfast",
    );
  });

  it("reads a further-out day as '<Weekday> <slot>'", () => {
    // 2026-05-30 is a Saturday.
    expect(formatSlotLabel("dinner", "2026-05-30", NOW)).toBe(
      "Saturday dinner",
    );
  });
});

describe("formatShortDate", () => {
  it("formats an ISO timestamp as 'Month Day' in UTC", () => {
    expect(formatShortDate("2026-05-26T18:30:00Z")).toBe("May 26");
  });
});

describe("actorDisplayName", () => {
  it("prefers the metadata full_name", () => {
    expect(
      actorDisplayName({
        email: "a@test.local",
        user_metadata: { full_name: "Aishvarya Suhane" },
      }),
    ).toBe("Aishvarya Suhane");
  });

  it("falls back to name, then the email local-part", () => {
    expect(
      actorDisplayName({
        email: "riya@test.local",
        user_metadata: { name: "Riya" },
      }),
    ).toBe("Riya");
    expect(
      actorDisplayName({ email: "rahul@test.local", user_metadata: {} }),
    ).toBe("rahul");
  });

  it("never renders an empty name", () => {
    expect(actorDisplayName({ email: "", user_metadata: {} })).toBe("Someone");
  });
});
