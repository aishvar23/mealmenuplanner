import { expect, test } from "../fixtures/auth";
import { E2E_PASSWORD, OWNER } from "../fixtures/constants";
import { signInWithPassword } from "../helpers/auth";

/**
 * AUTH — sign-in (happy + unhappy), sign-out, and anonymous redirects.
 * `owner@` is seeded + onboarded by global-setup. Google OAuth cases need a
 * mocked provider and are deferred (test.fixme) per the spec's own note.
 */

test("AUTH-001: user can sign in with email and password", async ({ page }) => {
  await signInWithPassword(page, OWNER, E2E_PASSWORD);
  await page.waitForURL("**/today", { timeout: 30_000 });

  const accountButton = page
    .getByRole("button", { name: /account menu/i })
    .first();
  await expect(accountButton).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/today(\?|$|\/)/);
  await expect(accountButton).toBeVisible();
});

test("AUTH-002: invalid login fails safely", async ({ page }) => {
  await signInWithPassword(page, OWNER, "definitely-the-wrong-password");

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in(\?|$|\/)/);
  await expect(page.getByRole("button", { name: /account menu/i })).toHaveCount(
    0,
  );
});

test("AUTH-003: user can sign out", async ({ page, onboardedHousehold }) => {
  // Uses a dedicated ephemeral, onboarded user (already signed in on `page` at
  // /today). NOT the shared owner@ — Supabase global sign-out revokes ALL of a
  // user's sessions, which would invalidate the captured owner storageState.
  expect(onboardedHousehold.householdId).toBeTruthy();

  await page
    .getByRole("button", { name: /account menu/i })
    .first()
    .click();
  await page.getByRole("menuitem", { name: /sign out/i }).click();
  await page.waitForURL(/\/sign-in(\?|$|\/)/, { timeout: 30_000 });

  // Private routes are no longer reachable.
  await page.goto("/today");
  await expect(page).toHaveURL(/\/sign-in(\?|$|\/)/);
});

test("AUTH-004: anonymous user is redirected from private pages", async ({
  page,
}) => {
  for (const path of ["/today", "/plan", "/grocery", "/household"]) {
    await page.goto(path);
    await expect(page, `expected ${path} to redirect anonymous user`).toHaveURL(
      /\/sign-in(\?|$|\/)/,
    );
    // No private content leaked before the redirect.
    await expect(
      page.getByRole("button", { name: /account menu/i }),
    ).toHaveCount(0);
  }
});

// AUTH-005/006/007 exercise Google OAuth (sign in, cancel, account linking).
// They require a mocked/test OAuth provider; the app uses real Supabase Google
// OAuth, which can't be driven headlessly without one. Deferred.
test.fixme("AUTH-005: user can sign in with Google Auth test flow (needs mocked OAuth provider)", async () => {});
test.fixme("AUTH-006: cancelled Google Auth is handled gracefully (needs mocked OAuth provider)", async () => {});
test.fixme("AUTH-007: Google and email login with same email do not duplicate access (needs mocked OAuth provider)", async () => {});
