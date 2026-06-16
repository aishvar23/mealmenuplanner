import { describe, expect, it } from "vitest";

import {
  dishCountLabel,
  formatCutoffCountdown,
  formatCutoffDateTime,
  PROVIDER_BATCH_EMAIL_STATUS_LABELS,
  PROVIDER_MENU_STATUS_BADGE_VARIANT,
  PROVIDER_MENU_STATUS_LABELS,
  PROVIDER_RESPONSE_STATUS_BADGE_VARIANT,
  PROVIDER_RESPONSE_STATUS_LABELS,
  PROVIDER_SUGGESTION_STATUS_BADGE_VARIANT,
  PROVIDER_SUGGESTION_STATUS_LABELS,
  providerMenuStatusLabel,
  providerSuggestionStatusLabel,
  SUGGESTION_RESPONSE_MAX_LENGTH,
  SUGGESTION_TEXT_MAX_LENGTH,
} from "./labels";

describe("PROVIDER_RESPONSE_STATUS_BADGE_VARIANT", () => {
  it("covers every response status that has a label (no neutral fallthrough gap)", () => {
    expect(Object.keys(PROVIDER_RESPONSE_STATUS_BADGE_VARIANT).sort()).toEqual(
      Object.keys(PROVIDER_RESPONSE_STATUS_LABELS).sort(),
    );
  });

  it("colours confirmed/auto-accepted positive, cancelled ember, idle neutral", () => {
    expect(PROVIDER_RESPONSE_STATUS_BADGE_VARIANT.confirmed).toBe("emerald");
    expect(PROVIDER_RESPONSE_STATUS_BADGE_VARIANT.auto_accepted).toBe(
      "emerald",
    );
    expect(PROVIDER_RESPONSE_STATUS_BADGE_VARIANT.cancelled).toBe("ember");
    expect(PROVIDER_RESPONSE_STATUS_BADGE_VARIANT.no_response).toBe("neutral");
  });
});

describe("providerMenuStatusLabel / PROVIDER_MENU_STATUS_BADGE_VARIANT (MP-B-060)", () => {
  it("labels every menu status (published reads open, locked reads closed)", () => {
    expect(providerMenuStatusLabel("published")).toBe("Published");
    expect(providerMenuStatusLabel("locked")).toBe("Locked");
    expect(providerMenuStatusLabel("draft")).toBe("Draft");
    expect(providerMenuStatusLabel("cancelled")).toBe("Cancelled");
  });

  it("colours every menu status (no neutral fallthrough gap)", () => {
    expect(Object.keys(PROVIDER_MENU_STATUS_BADGE_VARIANT).sort()).toEqual(
      Object.keys(PROVIDER_MENU_STATUS_LABELS).sort(),
    );
    expect(PROVIDER_MENU_STATUS_BADGE_VARIANT.published).toBe("emerald");
    expect(PROVIDER_MENU_STATUS_BADGE_VARIANT.cancelled).toBe("ember");
    expect(PROVIDER_MENU_STATUS_BADGE_VARIANT.draft).toBe("marigold");
  });
});

describe("provider suggestion status labels (MP-A-131)", () => {
  it("labels every suggestion status (pending reads awaiting, accepted a win)", () => {
    expect(providerSuggestionStatusLabel("pending")).toBe("Pending review");
    expect(providerSuggestionStatusLabel("accepted_as_option")).toBe(
      "Accepted as an option",
    );
    expect(providerSuggestionStatusLabel("rejected")).toBe("Not added");
    expect(providerSuggestionStatusLabel("deferred")).toBe("Maybe later");
  });

  it("colours every suggestion status (no neutral fallthrough gap)", () => {
    expect(
      Object.keys(PROVIDER_SUGGESTION_STATUS_BADGE_VARIANT).sort(),
    ).toEqual(Object.keys(PROVIDER_SUGGESTION_STATUS_LABELS).sort());
    expect(PROVIDER_SUGGESTION_STATUS_BADGE_VARIANT.accepted_as_option).toBe(
      "emerald",
    );
    expect(PROVIDER_SUGGESTION_STATUS_BADGE_VARIANT.pending).toBe("marigold");
    expect(PROVIDER_SUGGESTION_STATUS_BADGE_VARIANT.rejected).toBe("ember");
  });

  it("caps suggestion text + owner response at the shared bound (mirrors the service)", () => {
    expect(SUGGESTION_TEXT_MAX_LENGTH).toBe(1000);
    expect(SUGGESTION_RESPONSE_MAX_LENGTH).toBe(1000);
  });
});

describe("formatCutoffCountdown (MP-B-060)", () => {
  const NOW = Date.UTC(2026, 5, 14, 12, 0, 0); // 2026-06-14T12:00:00Z

  it("reports a passed cutoff once now is at or after it", () => {
    expect(formatCutoffCountdown("2026-06-14T12:00:00Z", NOW)).toEqual({
      passed: true,
      label: "Cutoff passed",
    });
    expect(formatCutoffCountdown("2026-06-14T11:59:00Z", NOW).passed).toBe(
      true,
    );
  });

  it("shows hours+minutes under a day, never a bare 0h", () => {
    expect(formatCutoffCountdown("2026-06-14T14:30:00Z", NOW)).toEqual({
      passed: false,
      label: "2h 30m until cutoff",
    });
    // Under an hour: minutes only.
    expect(formatCutoffCountdown("2026-06-14T12:45:00Z", NOW).label).toBe(
      "45m until cutoff",
    );
  });

  it("shows days+hours (two units max) when more than a day away", () => {
    expect(formatCutoffCountdown("2026-06-16T15:00:00Z", NOW).label).toBe(
      "2d 3h until cutoff",
    );
  });

  it("reads the final sub-minute window as '<1m', never a bare '0m'", () => {
    // 30s before cutoff: still open, but under a minute — must not read "0m until cutoff".
    expect(formatCutoffCountdown("2026-06-14T12:00:30Z", NOW)).toEqual({
      passed: false,
      label: "<1m until cutoff",
    });
  });

  it("degrades a malformed timestamp to a neutral dash rather than throwing", () => {
    expect(formatCutoffCountdown("not-a-date", NOW)).toEqual({
      passed: false,
      label: "—",
    });
  });
});

describe("PROVIDER_BATCH_EMAIL_STATUS_LABELS (MP-B-060)", () => {
  it("labels every non-null email status", () => {
    expect(PROVIDER_BATCH_EMAIL_STATUS_LABELS).toEqual({
      queued: "Queued",
      sent: "Sent",
      failed: "Failed",
    });
  });
});

describe("dishCountLabel (MP-B-060)", () => {
  it("pluralizes the dish count (1 dish / N dishes)", () => {
    expect(dishCountLabel(1)).toBe("1 dish");
    expect(dishCountLabel(0)).toBe("0 dishes");
    expect(dishCountLabel(3)).toBe("3 dishes");
  });
});

describe("formatCutoffDateTime (MP-B-060)", () => {
  it("renders the cutoff instant in the provider timezone", () => {
    // 2026-06-14T12:00:00Z is 17:30 in Asia/Kolkata (UTC+5:30).
    const label = formatCutoffDateTime("2026-06-14T12:00:00Z", "Asia/Kolkata");
    expect(label).toContain("5:30");
  });

  it("falls back to the raw ISO when the timezone is invalid", () => {
    expect(formatCutoffDateTime("2026-06-14T12:00:00Z", "Not/AZone")).toBe(
      "2026-06-14T12:00:00Z",
    );
  });
});
