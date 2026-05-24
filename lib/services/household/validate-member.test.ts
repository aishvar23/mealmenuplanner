import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";

import { validateMemberUpdate } from "./validate-member";

describe("validateMemberUpdate", () => {
  it("accepts a role-only change", () => {
    expect(validateMemberUpdate({ role: "admin" })).toEqual({
      role: "admin",
      permissionOverrides: {},
    });
  });

  it("accepts top-level camelCase flag overrides", () => {
    const result = validateMemberUpdate({ canChangeTodayMenu: true });
    expect(result.role).toBeNull();
    expect(result.permissionOverrides).toEqual({ can_change_today_menu: true });
  });

  it("accepts a role and flags together (and ignores unknown keys)", () => {
    const result = validateMemberUpdate({
      role: "member",
      canManageGroceryList: true,
      somethingElse: 1,
    });
    expect(result.role).toBe("member");
    expect(result.permissionOverrides).toEqual({
      can_manage_grocery_list: true,
    });
  });

  it("accepts role 'owner' (the transfer trigger)", () => {
    expect(validateMemberUpdate({ role: "owner" }).role).toBe("owner");
  });

  it("rejects an unknown role", () => {
    expect(() => validateMemberUpdate({ role: "boss" })).toThrow(
      ValidationError,
    );
  });

  it("rejects a non-boolean flag", () => {
    expect(() => validateMemberUpdate({ canChangeTodayMenu: "yes" })).toThrow(
      ValidationError,
    );
  });

  it("rejects an empty update (no role and no flags)", () => {
    expect(() => validateMemberUpdate({})).toThrow(ValidationError);
  });
});
