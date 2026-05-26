import { expect, test } from "@playwright/test";

import { E2E_PASSWORD, OWNER } from "../fixtures/constants";
import { signInWithPassword } from "../helpers/auth";

/**
 * AUTH-001 / AUTH-002 — email/password sign-in, happy and unhappy paths.
 * `owner@` is seeded + onboarded by global-setup, so a successful sign-in lands
 * in the app shell.
 */

test("AUTH-001: user can sign in with email and password", async ({ page }) => {
  await signInWithPassword(page, OWNER, E2E_PASSWORD);

  // Redirected into the authenticated app (off /sign-in, onto /today).
  await page.waitForURL("**/today", { timeout: 30_000 });

  // The profile/account button is the reliable signed-in marker in the header.
  const accountButton = page
    .getByRole("button", { name: /account menu/i })
    .first();
  await expect(accountButton).toBeVisible();

  // Session survives a full reload.
  await page.reload();
  await expect(page).toHaveURL(/\/today(\?|$|\/)/);
  await expect(accountButton).toBeVisible();
});

test("AUTH-002: invalid login fails safely", async ({ page }) => {
  await signInWithPassword(page, OWNER, "definitely-the-wrong-password");

  // An accessible error is surfaced and we stay on the sign-in page (no app access).
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in(\?|$|\/)/);
  await expect(page.getByRole("button", { name: /account menu/i })).toHaveCount(
    0,
  );
});
