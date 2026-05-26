import path from "node:path";

/**
 * Shared constants for the e2e suite: the seeded spec users (from
 * `test/14_end_to_end_acceptance_tests.md`), storageState paths, and the default
 * "minimum onboarding" answers used to build the owner household.
 */

export const OWNER = "owner@example.com";
export const MEMBER = "member@example.com";
export const VIEWER = "viewer@example.com";
export const GUEST = "guest@example.com";
export const ADMIN = "admin@example.com";
export const NO_HOUSEHOLD = "nohousehold@example.com";

/** Every user the global-setup ensures exists (later phases use the rest). */
export const SPEC_USERS = [
  OWNER,
  MEMBER,
  VIEWER,
  GUEST,
  ADMIN,
  NO_HOUSEHOLD,
] as const;

/** Shared password for all e2e accounts; overridable via `.env.e2e`. */
export const E2E_PASSWORD =
  process.env.E2E_USER_PASSWORD ?? "e2e-Password-1234";

export const AUTH_DIR = path.resolve(process.cwd(), "e2e", ".auth");
export const OWNER_STORAGE_STATE = path.join(AUTH_DIR, "owner.json");
export const ADMIN_STORAGE_STATE = path.join(AUTH_DIR, "admin.json");

/**
 * Minimum onboarding answers (the required-field set from design/06 § 2). Diet is
 * vegetarian so the today/RECO specs can assert a meat dish is never suggested.
 * Labels must match the wizard's option text (lib/onboarding/options.ts).
 */
export const DEFAULT_ONBOARDING = {
  familySize: 4,
  diet: "Vegetarian",
  cuisine: "North Indian",
  mealSlot: "Dinner",
  weekdayMinutes: 60,
} as const;
