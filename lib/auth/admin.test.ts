import { describe, expect, it } from "vitest";

import { ADMIN_APP_ROLE, getAppRole, isAdminUser } from "@/lib/auth/admin";

/** A user-ish object with the given `app_role` in `app_metadata`. */
function userWithRole(appRole: unknown): {
  app_metadata: Record<string, unknown>;
} {
  return { app_metadata: { app_role: appRole } };
}

describe("getAppRole", () => {
  it("reads a string app_role from app_metadata", () => {
    expect(getAppRole(userWithRole("admin"))).toBe("admin");
    expect(getAppRole(userWithRole("reviewer"))).toBe("reviewer");
  });

  it("returns null when the role is absent, null, or non-string", () => {
    expect(getAppRole(null)).toBeNull();
    expect(getAppRole(undefined)).toBeNull();
    expect(getAppRole({ app_metadata: {} })).toBeNull();
    expect(getAppRole(userWithRole(undefined))).toBeNull();
    expect(getAppRole(userWithRole(123))).toBeNull();
  });

  it("ignores user_metadata (only app_metadata is server-controlled)", () => {
    const spoofed = {
      app_metadata: {},
      user_metadata: { app_role: "admin" },
    } as unknown as Parameters<typeof getAppRole>[0];
    expect(getAppRole(spoofed)).toBeNull();
  });
});

describe("isAdminUser", () => {
  it("is true only for the admin app_role", () => {
    expect(isAdminUser(userWithRole(ADMIN_APP_ROLE))).toBe(true);
  });

  it("is false for any other role or a missing/anonymous user", () => {
    expect(isAdminUser(userWithRole("reviewer"))).toBe(false);
    expect(isAdminUser(userWithRole("operator"))).toBe(false);
    expect(isAdminUser(userWithRole(""))).toBe(false);
    expect(isAdminUser({ app_metadata: {} })).toBe(false);
    expect(isAdminUser(null)).toBe(false);
  });
});
