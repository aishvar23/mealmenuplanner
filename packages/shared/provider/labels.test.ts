import { describe, expect, it } from "vitest";

import {
  PROVIDER_RESPONSE_STATUS_BADGE_VARIANT,
  PROVIDER_RESPONSE_STATUS_LABELS,
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
