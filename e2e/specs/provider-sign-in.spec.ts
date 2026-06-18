import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures/provider";

/**
 * Two-panel sign-in routing (ADO #86). The household and provider panels share
 * the SAME Supabase auth and differ only in their post-login `next`: the provider
 * panel carries `next=/provider/dashboard`, so an owner who signs in there lands
 * on their provider workspace directly (rather than the household default,
 * `/today`). Proves the provider-panel form is wired to the provider destination.
 */

/** Sign in through the "For meal providers" panel's email/password form. */
async function signInViaProviderPanel(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  const panel = page.getByRole("region", { name: "For meal providers" });
  await panel.getByLabel("Email").fill(email);
  await panel.getByLabel("Password").fill(password);
  await panel.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("PROV-SIGNIN-001: provider-panel login lands an owner on the provider dashboard", async ({
  page,
  providerTeam,
}) => {
  const owner = await providerTeam.createUser("signin-owner");
  await providerTeam.createProvider(owner, { name: "Sign-in Kitchen" });

  await signInViaProviderPanel(page, owner.email, owner.password);

  await page.waitForURL("**/provider/dashboard", { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});
