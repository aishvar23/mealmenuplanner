import { describe, expect, it } from "vitest";

import { formatRelativeLastSaved } from "./save-state";

const NOW = Date.parse("2026-05-24T12:00:00Z");

function ago(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatRelativeLastSaved", () => {
  it("returns null when there is nothing saved yet", () => {
    expect(formatRelativeLastSaved(null, NOW)).toBeNull();
    expect(formatRelativeLastSaved(undefined, NOW)).toBeNull();
  });

  it("returns null for an unparseable timestamp", () => {
    expect(formatRelativeLastSaved("not-a-date", NOW)).toBeNull();
  });

  it("reads 'Saved just now' under a minute", () => {
    expect(formatRelativeLastSaved(ago(0), NOW)).toBe("Saved just now");
    expect(formatRelativeLastSaved(ago(59 * SECOND), NOW)).toBe(
      "Saved just now",
    );
  });

  it("clamps a future timestamp to 'Saved just now'", () => {
    expect(formatRelativeLastSaved(ago(-5 * SECOND), NOW)).toBe(
      "Saved just now",
    );
  });

  it("pluralizes minutes", () => {
    expect(formatRelativeLastSaved(ago(MINUTE), NOW)).toBe(
      "Last saved 1 minute ago",
    );
    expect(formatRelativeLastSaved(ago(2 * MINUTE), NOW)).toBe(
      "Last saved 2 minutes ago",
    );
  });

  it("rolls up to hours", () => {
    expect(formatRelativeLastSaved(ago(HOUR), NOW)).toBe(
      "Last saved 1 hour ago",
    );
    expect(formatRelativeLastSaved(ago(3 * HOUR), NOW)).toBe(
      "Last saved 3 hours ago",
    );
  });

  it("rolls up to days", () => {
    expect(formatRelativeLastSaved(ago(DAY), NOW)).toBe("Last saved 1 day ago");
    expect(formatRelativeLastSaved(ago(2 * DAY), NOW)).toBe(
      "Last saved 2 days ago",
    );
  });
});
