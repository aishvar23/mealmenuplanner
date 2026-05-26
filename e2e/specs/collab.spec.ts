import { expect, test } from "../fixtures/auth";
import { signInWithPassword } from "../helpers/auth";

/**
 * COLLAB — household roles, permissions, and access lifecycle. The permission
 * and access-loss cases (the security-critical core, global criterion 15) are
 * verified single-context using the `team` fixture: build a household, add a
 * member with a role, sign that member in, and check BOTH the UI surface and the
 * server-side API. Full invite/notification round-trips across two browsers are
 * represented as fixmes.
 */

const today = () => new Date().toISOString().slice(0, 10);

test("COLLAB-006: viewer cannot change today's menu (UI + API)", async ({
  page,
  team,
}) => {
  const owner = await team.createUser("owner");
  const householdId = await team.onboardOwner(page, owner);
  const viewer = await team.createUser("viewer");
  await team.addMember(householdId, viewer, "viewer");

  await signInWithPassword(page, viewer.email, viewer.password);
  await page.goto("/today");
  // Read-only: no change controls are rendered.
  await expect(
    page.getByRole("button", { name: /suggest a meal/i }),
  ).toHaveCount(0);

  // Server-side: the generate API rejects the viewer.
  const res = await page.request.post(
    `/api/households/${householdId}/meal-plans/today/generate`,
    { data: { date: today(), mealSlot: "dinner" } },
  );
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

test("COLLAB-008: viewer cannot change the weekly schedule (UI + API)", async ({
  page,
  team,
}) => {
  const owner = await team.createUser("owner");
  const householdId = await team.onboardOwner(page, owner);
  const viewer = await team.createUser("viewer");
  await team.addMember(householdId, viewer, "viewer");

  await signInWithPassword(page, viewer.email, viewer.password);
  await page.goto("/plan");
  await expect(
    page.getByRole("button", { name: /generate week/i }),
  ).toHaveCount(0);

  const res = await page.request.post(
    `/api/households/${householdId}/meal-plans/week/generate`,
    { data: { startDate: today(), endDate: today() } },
  );
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

test("COLLAB-018: member without invite permission cannot invite (UI + API)", async ({
  page,
  team,
}) => {
  const owner = await team.createUser("owner");
  const householdId = await team.onboardOwner(page, owner);
  const member = await team.createUser("member");
  await team.addMember(householdId, member, "member");

  await signInWithPassword(page, member.email, member.password);
  await page.goto("/household");
  // No invite affordance for a plain member.
  await expect(page.getByLabel(/invite email/i)).toHaveCount(0);

  const res = await page.request.post(
    `/api/households/${householdId}/invites`,
    {
      data: {
        email: "x@example.com",
        role: "member",
        membershipType: "permanent",
      },
    },
  );
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

test("COLLAB-020: view-only user cannot mutate the grocery list (API)", async ({
  page,
  team,
}) => {
  const owner = await team.createUser("owner");
  const householdId = await team.onboardOwner(page, owner);
  const viewer = await team.createUser("viewer");
  await team.addMember(householdId, viewer, "viewer");

  await signInWithPassword(page, viewer.email, viewer.password);
  await page.goto("/grocery");
  // No manage controls.
  await expect(
    page.getByRole("button", { name: /generate grocery list|regenerate/i }),
  ).toHaveCount(0);

  // Server-side guard on the regenerate endpoint.
  const res = await page.request.post(
    `/api/households/${householdId}/grocery-list/regenerate`,
  );
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

test("COLLAB-011: owner cannot leave without transferring ownership", async ({
  page,
  team,
}) => {
  const owner = await team.createUser("owner");
  const householdId = await team.onboardOwner(page, owner);
  const member = await team.createUser("member");
  await team.addMember(householdId, member, "member");

  await signInWithPassword(page, owner.email, owner.password);
  await page.goto("/household");

  // Server-side: an owner leaving is rejected while other members exist.
  const res = await page.request.post(`/api/households/${householdId}/leave`);
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

test("COLLAB-015/016: expired temporary guest loses household access", async ({
  page,
  team,
}) => {
  const owner = await team.createUser("owner");
  const householdId = await team.onboardOwner(page, owner);
  const guest = await team.createUser("guest");
  await team.addMember(householdId, guest, "viewer", {
    membershipType: "temporary_guest",
    expiresAt: "2020-01-01T00:00:00.000Z", // already expired
  });

  await signInWithPassword(page, guest.email, guest.password);
  // No active membership → routed to onboarding, not the household.
  await page.waitForURL(/\/onboarding/, { timeout: 30_000 });

  // Direct access to the household's plan API is denied.
  const res = await page.request.get(`/api/households/${householdId}/members`);
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

test("COLLAB-017: removed member cannot access the household", async ({
  page,
  team,
}) => {
  const owner = await team.createUser("owner");
  const householdId = await team.onboardOwner(page, owner);
  const member = await team.createUser("member");
  await team.addMember(householdId, member, "member", undefined);
  // Flip to removed.
  await team.admin
    .from("household_members")
    .update({ status: "removed" })
    .eq("household_id", householdId)
    .eq("user_id", member.id);

  await signInWithPassword(page, member.email, member.password);
  await page.waitForURL(/\/onboarding/, { timeout: 30_000 });
  const res = await page.request.get(`/api/households/${householdId}/members`);
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

// Full invite/decline/transfer/notification round-trips need a second
// authenticated browser context and the invite-acceptance UI; represented here
// for completeness, automated in a later pass.
test.fixme("COLLAB-001: owner can invite a permanent member (invite UI round-trip)", async () => {});
test.fixme("COLLAB-002: invitee can accept an invite (two-context flow)", async () => {});
test.fixme("COLLAB-003: invitee can decline an invite (two-context flow)", async () => {});
test.fixme("COLLAB-004: owner and member see the same plan (two-context flow)", async () => {});
test.fixme("COLLAB-005: permitted member can change today's menu (two-context flow)", async () => {});
test.fixme("COLLAB-007: permitted member can change the weekly schedule (two-context flow)", async () => {});
test.fixme("COLLAB-009: owner can remove a member (member-side access-loss verification)", async () => {});
test.fixme("COLLAB-010: member can leave the household (two-context flow)", async () => {});
test.fixme("COLLAB-012: owner can transfer ownership (two-context flow)", async () => {});
test.fixme("COLLAB-013: owner can invite a temporary guest with expiry (invite UI)", async () => {});
test.fixme("COLLAB-014: temporary guest can accept and view the plan (two-context flow)", async () => {});
test.fixme("COLLAB-019: member with invite permission can invite others (two-context flow)", async () => {});
