import { describe, expect, it } from "vitest";

import { isUuid } from "@/lib/validation";

describe("isUuid", () => {
  it("accepts canonical UUIDs (any case)", () => {
    expect(isUuid("22222222-2222-2222-2222-222222222222")).toBe(true);
    expect(isUuid("5b1f8c0e-9a2d-4e7b-bc31-2f0a6d4e1c88")).toBe(true);
    expect(isUuid("5B1F8C0E-9A2D-4E7B-BC31-2F0A6D4E1C88")).toBe(true);
  });

  it("rejects non-UUID strings", () => {
    for (const value of [
      "",
      "not-a-uuid",
      "22222222-2222-2222-2222-22222222222", // too short
      "22222222-2222-2222-2222-2222222222222", // too long
      "2222222g-2222-2222-2222-222222222222", // non-hex
      "22222222222222222222222222222222", // missing hyphens
    ]) {
      expect(isUuid(value)).toBe(false);
    }
  });
});
