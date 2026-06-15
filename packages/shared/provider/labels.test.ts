import { describe, expect, it } from "vitest";

import {
  formatCutoffCountdown,
  PROVIDER_MENU_STATUS_BADGE_VARIANT,
  PROVIDER_MENU_STATUS_LABELS,
  PROVIDER_RESPONSE_STATUS_BADGE_VARIANT,
  PROVIDER_RESPONSE_STATUS_LABELS,
  providerMenuStatusLabel,
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

  it("degrades a malformed timestamp to a neutral dash rather than throwing", () => {
    expect(formatCutoffCountdown("not-a-date", NOW)).toEqual({
      passed: false,
      label: "—",
    });
  });
});
