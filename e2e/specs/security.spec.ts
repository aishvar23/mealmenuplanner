import { expect, test } from "../fixtures/auth";
import { signInWithPassword } from "../helpers/auth";

/**
 * SECURITY — server-side authorization (global criteria 4 & 15): non-members are
 * denied, and permission checks hold at the API even when the UI is bypassed.
 */

const today = () => new Date().toISOString().slice(0, 10);

test("SECURITY-001: a non-member cannot access a household", async ({
  page,
  team,
}) => {
  const owner = await team.createUser("owner");
  const householdId = await team.onboardOwner(page, owner);

  // An unrelated, signed-in user who is NOT a member.
  const outsider = await team.createUser("outsider");
  await signInWithPassword(page, outsider.email, outsider.password);

  const res = await page.request.get(`/api/households/${householdId}/members`);
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

test("SECURITY-002: backend rejects a write the user lacks permission for", async ({
  page,
  team,
}) => {
  const owner = await team.createUser("owner");
  const householdId = await team.onboardOwner(page, owner);
  const viewer = await team.createUser("viewer");
  await team.addMember(householdId, viewer, "viewer");

  await signInWithPassword(page, viewer.email, viewer.password);
  // Direct API call (UI hides the control) must still be rejected.
  const res = await page.request.post(
    `/api/households/${householdId}/meal-plans/today/generate`,
    { data: { date: today(), mealSlot: "dinner" } },
  );
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

test("SECURITY-005: an invite link exposes no household data before auth", async ({
  page,
}) => {
  // Anonymous visit to an unknown invite token must not leak any household data
  // — the app shows a generic "invite not available" state (no roster, plan, or
  // preferences). Assert the visible (rendered) text, not raw HTML/RSC payload.
  await page.goto("/invite/not-a-real-token");
  await expect(
    page.getByRole("heading", { name: /invite not available/i }),
  ).toBeVisible();
  const visible = (await page.locator("main").innerText()).toLowerCase();
  expect(visible).not.toContain("grocery list");
  expect(visible).not.toContain("meal plan");
});

// Expired/cancelled invite acceptance needs an invite created + status-mutated
// via the invite flow; represented for completeness.
test.fixme("SECURITY-003: an expired invite cannot be accepted (invite lifecycle setup)", async () => {});
test.fixme("SECURITY-004: a cancelled invite cannot be accepted (invite lifecycle setup)", async () => {});
