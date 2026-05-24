import { describe, expect, it } from "vitest";

import { toInvitePreviewDto, type InvitePreviewRow } from "./dto";

describe("toInvitePreviewDto", () => {
  it("maps a get_invite_preview row to the camelCase preview DTO", () => {
    const row: InvitePreviewRow = {
      household_name: "Suhane Household",
      invited_by: "Aishvarya",
      membership_type: "temporary_guest",
      role: "viewer",
      expires_at: "2026-05-26T00:00:00Z",
    };
    expect(toInvitePreviewDto(row)).toEqual({
      householdName: "Suhane Household",
      invitedBy: "Aishvarya",
      membershipType: "temporary_guest",
      role: "viewer",
      expiresAt: "2026-05-26T00:00:00Z",
    });
  });

  it("preserves a null inviter display name", () => {
    const row = {
      household_name: "H",
      invited_by: null,
      membership_type: "permanent",
      role: "member",
      expires_at: "2026-06-01T00:00:00Z",
    } as unknown as InvitePreviewRow;
    expect(toInvitePreviewDto(row).invitedBy).toBeNull();
  });
});
