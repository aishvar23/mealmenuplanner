import { beforeEach, describe, expect, it, vi } from "vitest";

import { getActiveMembership, hasPermission } from "@/lib/auth";
import type { MembershipContext } from "@/lib/auth/permissions";
import { createServerSupabaseClient } from "@/lib/db/server";
import {
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getActiveMembership: vi.fn(),
  hasPermission: vi.fn(),
}));

import { createInvite } from "./create-invite";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const HOUSEHOLD_ID = "22222222-2222-2222-2222-222222222222";
const APP_URL = "https://app.test";

function membershipContext(): MembershipContext {
  return {
    householdId: HOUSEHOLD_ID,
    userId: USER_ID,
    role: "owner",
    membershipType: "permanent",
    expiresAt: null,
    permissions: {
      can_view_plan: true,
      can_suggest_meals: true,
      can_change_today_menu: true,
      can_change_weekly_schedule: true,
      can_manage_grocery_list: true,
      can_invite_members: true,
      can_remove_members: true,
      can_edit_household_preferences: true,
    },
  };
}

/** Stub the insert chain: from(...).insert(...).select(...).single(). */
function stubInsert(result: { data: unknown; error: unknown }) {
  const single = vi.fn(() => Promise.resolve(result));
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ from } as never);
  return { from, insert };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getActiveMembership).mockResolvedValue(membershipContext());
  vi.mocked(hasPermission).mockReturnValue(true);
});

describe("createInvite", () => {
  it("inserts a pending invite and returns the id + shareable link", async () => {
    const { from, insert } = stubInsert({ data: { id: "inv-1" }, error: null });

    const result = await createInvite(
      HOUSEHOLD_ID,
      { email: "guest@example.com", role: "member" },
      APP_URL,
    );

    expect(result.inviteId).toBe("inv-1");
    expect(result.inviteLink).toMatch(
      /^https:\/\/app\.test\/invite\/[A-Za-z0-9_-]+$/,
    );
    expect(from).toHaveBeenCalledWith("household_invites");

    // The token is stored only as its sha256 hash, never the plaintext link.
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        household_id: HOUSEHOLD_ID,
        invited_by_user_id: USER_ID,
        invited_email: "guest@example.com",
        role: "member",
        membership_type: "permanent",
        status: "pending",
        invite_token: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
  });

  it("trims a trailing slash off the base URL", async () => {
    stubInsert({ data: { id: "inv-1" }, error: null });
    const result = await createInvite(
      HOUSEHOLD_ID,
      { email: "g@example.com" },
      "https://app.test/",
    );
    expect(result.inviteLink).toMatch(/^https:\/\/app\.test\/invite\//);
  });

  it("404s a malformed household id before the guard", async () => {
    await expect(
      createInvite("not-a-uuid", { email: "g@example.com" }, APP_URL),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(getActiveMembership).not.toHaveBeenCalled();
  });

  it("404s a non-member (existence-hiding)", async () => {
    vi.mocked(getActiveMembership).mockResolvedValue(null);
    await expect(
      createInvite(HOUSEHOLD_ID, { email: "g@example.com" }, APP_URL),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("403s a member lacking can_invite_members", async () => {
    vi.mocked(hasPermission).mockReturnValue(false);
    await expect(
      createInvite(HOUSEHOLD_ID, { email: "g@example.com" }, APP_URL),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("validates the body only after authorization", async () => {
    vi.mocked(hasPermission).mockReturnValue(false);
    // Invalid body (no target) — but the forbidden check fires first.
    await expect(
      createInvite(HOUSEHOLD_ID, {}, APP_URL),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("throws ValidationError for a body with no email/phone", async () => {
    stubInsert({ data: { id: "inv-1" }, error: null });
    await expect(
      createInvite(HOUSEHOLD_ID, {}, APP_URL),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("wraps an insert error as InternalError", async () => {
    stubInsert({ data: null, error: { message: "boom" } });
    await expect(
      createInvite(HOUSEHOLD_ID, { email: "g@example.com" }, APP_URL),
    ).rejects.toBeInstanceOf(InternalError);
  });
});
