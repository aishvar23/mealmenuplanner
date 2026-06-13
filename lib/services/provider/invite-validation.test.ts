import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";

import {
  DEFAULT_PROVIDER_INVITE_TTL_DAYS,
  MAX_PROVIDER_INVITE_TTL_DAYS,
  validateCreateProviderInvite,
  validateMemberOnboarding,
} from "./invite-validation";

const NOW = new Date("2026-06-12T00:00:00Z");

describe("validateCreateProviderInvite", () => {
  it("accepts an email-only invite and defaults the expiry", () => {
    const result = validateCreateProviderInvite(
      { email: "c@example.com" },
      NOW,
    );
    expect(result.invitedEmail).toBe("c@example.com");
    expect(result.invitedPhone).toBeNull();
    expect(Date.parse(result.expiresAt)).toBe(
      NOW.getTime() + DEFAULT_PROVIDER_INVITE_TTL_DAYS * 86_400_000,
    );
  });

  it("accepts a phone-only invite", () => {
    const result = validateCreateProviderInvite({ phone: "+15555550100" }, NOW);
    expect(result.invitedPhone).toBe("+15555550100");
    expect(result.invitedEmail).toBeNull();
  });

  it("requires an email or phone", () => {
    expect(() => validateCreateProviderInvite({}, NOW)).toThrow(
      ValidationError,
    );
  });

  it("rejects a malformed email", () => {
    expect(() =>
      validateCreateProviderInvite({ email: "not-an-email" }, NOW),
    ).toThrow(ValidationError);
  });

  it("rejects an expiry in the past", () => {
    expect(() =>
      validateCreateProviderInvite(
        { email: "c@example.com", expiresAt: "2026-06-11T00:00:00Z" },
        NOW,
      ),
    ).toThrow(ValidationError);
  });

  it("rejects an expiry beyond the max window", () => {
    const tooFar = new Date(
      NOW.getTime() + (MAX_PROVIDER_INVITE_TTL_DAYS + 1) * 86_400_000,
    ).toISOString();
    expect(() =>
      validateCreateProviderInvite(
        { email: "c@example.com", expiresAt: tooFar },
        NOW,
      ),
    ).toThrow(ValidationError);
  });
});

describe("validateMemberOnboarding", () => {
  const valid = {
    displayName: "Chitra",
    phone: "+15555550301",
    defaultSpiceLevel: "regular",
    allergyAck: true,
    termsAck: true,
    autoAcceptConsent: true,
  };

  it("accepts a complete payload", () => {
    const result = validateMemberOnboarding(valid);
    expect(result).toEqual({
      displayName: "Chitra",
      phone: "+15555550301",
      defaultSpiceLevel: "regular",
      allergyAck: true,
      termsAck: true,
      autoAcceptConsent: true,
    });
  });

  it("requires a display name", () => {
    expect(() =>
      validateMemberOnboarding({ ...valid, displayName: "  " }),
    ).toThrow(ValidationError);
  });

  it("requires both acknowledgments", () => {
    expect(() =>
      validateMemberOnboarding({ ...valid, allergyAck: false }),
    ).toThrow(ValidationError);
    expect(() =>
      validateMemberOnboarding({ ...valid, termsAck: false }),
    ).toThrow(ValidationError);
  });

  it("allows omitting spice + consent (defaults applied)", () => {
    const result = validateMemberOnboarding({
      displayName: "Chitra",
      allergyAck: true,
      termsAck: true,
    });
    expect(result.defaultSpiceLevel).toBeNull();
    expect(result.phone).toBeNull();
    expect(result.autoAcceptConsent).toBe(false);
  });

  it("rejects an out-of-set spice level", () => {
    expect(() =>
      validateMemberOnboarding({ ...valid, defaultSpiceLevel: "medium" }),
    ).toThrow(ValidationError);
  });

  it("ignores any household field smuggled into the body", () => {
    // No household fields are in the contract; they simply don't appear in the
    // normalized output, so the RPC never receives them.
    const result = validateMemberOnboarding({
      ...valid,
      familySize: 5,
      cuisinePreference: "north_indian",
    });
    expect(result).not.toHaveProperty("familySize");
    expect(result).not.toHaveProperty("cuisinePreference");
  });
});
