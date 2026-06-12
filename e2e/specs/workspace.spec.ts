import { expect, test } from "../fixtures/provider";
import { signInWithPassword } from "../helpers/auth";
import { completeMinimumOnboarding } from "../helpers/onboarding";

/**
 * Workspace-aware post-login routing (MP-B-010, ADR-1). The three branches the
 * `(app)` onboarding gate now distinguishes:
 *   1. provider-only user (no household) → the `/workspace` chooser, NOT onboarding;
 *   2. a user with a household → straight to `/today`, even when they also belong
 *      to a provider (household resolves first — the regression guard);
 *   3. (a user who belongs to nothing still goes to `/onboarding` — covered by the
 *      existing onboarding specs).
 */
test.describe("Workspace routing (MP-B-010)", () => {
  test("a provider-only owner lands on the workspace chooser, not onboarding", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("prov-owner");
    await providerTeam.createProvider(owner, { name: "Anna's Tiffins" });

    await signInWithPassword(page, owner.email, owner.password);
    await page.waitForURL("**/workspace", { timeout: 30_000 });

    expect(new URL(page.url()).pathname).toBe("/workspace");
    await expect(
      page.getByRole("heading", { name: "Choose a workspace" }),
    ).toBeVisible();
    await expect(page.getByText("Anna's Tiffins")).toBeVisible();
  });

  test("a provider-only awaiting customer reaches the chooser with an awaiting label", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("prov-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Bay Kitchen",
    });
    const customer = await providerTeam.createUser("prov-cust");
    await providerTeam.addCustomer(providerId, customer, "awaiting_approval");

    await signInWithPassword(page, customer.email, customer.password);
    await page.waitForURL("**/workspace", { timeout: 30_000 });

    expect(new URL(page.url()).pathname).toBe("/workspace");
    await expect(page.getByText("Bay Kitchen")).toBeVisible();
    await expect(page.getByText(/awaiting approval/i)).toBeVisible();
  });

  test("a household member who is also a provider customer still lands on /today", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("prov-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Curry Co",
    });
    const user = await providerTeam.createUser("dual");

    // First give `user` a household via onboarding.
    await signInWithPassword(page, user.email, user.password);
    await page.waitForURL(/\/(today|onboarding)(\?|$|\/)/, { timeout: 30_000 });
    if (new URL(page.url()).pathname.startsWith("/onboarding")) {
      await completeMinimumOnboarding(page, {
        householdName: "Dual Household",
      });
    }
    await page.waitForURL("**/today", { timeout: 30_000 });

    // Now also make them a provider customer.
    await providerTeam.addCustomer(providerId, user, "approved");

    // Re-signing in resolves the household first, so they go straight to /today —
    // the provider membership must not divert them to the chooser.
    await signInWithPassword(page, user.email, user.password);
    await page.waitForURL("**/today", { timeout: 30_000 });
    expect(new URL(page.url()).pathname).toBe("/today");
  });
});
