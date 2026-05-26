import { expect, test } from "../fixtures/auth";
import { createAdminClient } from "../fixtures/supabase-admin";

/**
 * NOTIF — the notification inbox. NOTIF-006 (mark-read + unread count) is
 * verified single-user by seeding a notification via service-role. The event
 * fan-out cases (NOTIF-001..005) require a second member performing an action
 * and are represented as fixmes.
 */

test("NOTIF-006: a notification can be marked read and the unread state clears", async ({
  page,
  onboardedHousehold,
}) => {
  const { user, householdId } = onboardedHousehold;
  const admin = createAdminClient();
  const { error } = await admin.from("notifications").insert({
    household_id: householdId,
    recipient_user_id: user.id,
    actor_user_id: user.id,
    event_type: "meal_changed",
    title: "E2E test notification",
    message: "A test notification for the inbox.",
  });
  expect(error).toBeNull();

  await page.goto("/notifications");
  await expect(page.getByText("E2E test notification")).toBeVisible();

  await page
    .getByRole("button", { name: /mark read/i })
    .first()
    .click();
  // With the only unread notification read, the inbox reports it's caught up.
  await expect(page.getByText(/all caught up/i)).toBeVisible({
    timeout: 15_000,
  });
});

test.fixme("NOTIF-001: a menu change notifies other members (needs a second member action)", async () => {});
test.fixme("NOTIF-002: a weekly-plan change notifies members (needs a second member action)", async () => {});
test.fixme("NOTIF-003: invite-accepted notifies the owner (two-context invite flow)", async () => {});
test.fixme("NOTIF-004: member-left notifies the owner (two-context flow)", async () => {});
test.fixme("NOTIF-005: a removed member receives no further notifications (two-context flow)", async () => {});
