import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";

import {
  isValidTimeZone,
  validateProviderName,
  validateProviderUpdate,
} from "./validation";

describe("isValidTimeZone", () => {
  it("accepts real IANA zones including UTC", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("rejects unknown or empty zones", () => {
    expect(isValidTimeZone("Mars/Phobos")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("   ")).toBe(false);
  });
});

describe("validateProviderName", () => {
  it("trims and returns a valid name", () => {
    expect(validateProviderName("  Anna's Kitchen ")).toBe("Anna's Kitchen");
  });

  it("rejects a blank or non-string name", () => {
    expect(() => validateProviderName("   ")).toThrow(ValidationError);
    expect(() => validateProviderName(undefined)).toThrow(ValidationError);
    expect(() => validateProviderName(42)).toThrow(ValidationError);
  });

  it("rejects an over-long name", () => {
    expect(() => validateProviderName("x".repeat(121))).toThrow(
      ValidationError,
    );
  });
});

describe("validateProviderUpdate", () => {
  it("returns only the present keys, normalized to snake_case", () => {
    const patch = validateProviderUpdate({
      name: "  Bistro  ",
      timezone: "Asia/Kolkata",
      defaultCutoffLocalTime: "18:30",
    });
    expect(patch).toEqual({
      name: "Bistro",
      timezone: "Asia/Kolkata",
      default_cutoff_local_time: "18:30",
    });
  });

  it("maps blank optional text to null and ignores absent keys", () => {
    const patch = validateProviderUpdate({ email: "   ", phone: "12345" });
    expect(patch).toEqual({ email: null, phone: "12345" });
    expect("city" in patch).toBe(false);
  });

  it("accepts null to clear a nullable field", () => {
    const patch = validateProviderUpdate({ defaultCutoffLocalTime: null });
    expect(patch).toEqual({ default_cutoff_local_time: null });
  });

  it("de-dupes summary recipients while preserving order", () => {
    const patch = validateProviderUpdate({
      summaryEmailRecipients: ["a@x.com", "b@x.com", "a@x.com"],
    });
    expect(patch.summary_email_recipients).toEqual(["a@x.com", "b@x.com"]);
  });

  it("rejects an invalid timezone", () => {
    expect(() => validateProviderUpdate({ timezone: "Nowhere/Bad" })).toThrow(
      ValidationError,
    );
  });

  it("rejects an invalid cutoff time", () => {
    expect(() =>
      validateProviderUpdate({ defaultCutoffLocalTime: "25:99" }),
    ).toThrow(ValidationError);
  });

  it("rejects a malformed email and a bad recipient", () => {
    expect(() => validateProviderUpdate({ email: "not-an-email" })).toThrow(
      ValidationError,
    );
    expect(() =>
      validateProviderUpdate({ summaryEmailRecipients: ["ok@x.com", "bad"] }),
    ).toThrow(ValidationError);
  });

  it("aggregates multiple field issues into one error", () => {
    try {
      validateProviderUpdate({ timezone: "bad", email: "bad" });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      const issues = (e as ValidationError).details ?? [];
      const fields = issues.map((i) => i.field);
      expect(fields).toContain("timezone");
      expect(fields).toContain("email");
    }
  });
});
