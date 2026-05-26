import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures/auth";
import { signInWithPassword } from "../helpers/auth";
import { completeMinimumOnboarding } from "../helpers/onboarding";

/**
 * MOBILE — core flows on a phone viewport with no horizontal overflow
 * (global criterion 16 / regression checklist).
 */
test.use({ viewport: { width: 390, height: 844 } });

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

test("MOBILE-001: onboarding completes on mobile with no horizontal overflow", async ({
  page,
  freshUser,
}) => {
  await signInWithPassword(page, freshUser.email, freshUser.password);
  await page.waitForURL("**/onboarding", { timeout: 30_000 });
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

  await completeMinimumOnboarding(page, { householdName: "Mobile House" });
  await expect(page).toHaveURL(/\/today(\?|$|\/)/);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
});

test("MOBILE-002: the weekly planner is usable on mobile with no overflow", async ({
  page,
  onboardedHousehold,
}) => {
  expect(onboardedHousehold.householdId).toBeTruthy();
  await page.goto("/plan");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
});

test.fixme("MOBILE-003: invite acceptance works on mobile (invite UI round-trip)", async () => {});
