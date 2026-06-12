import { expect, test } from "../fixtures/provider";
import { signInWithPassword } from "../helpers/auth";
import { completeMinimumOnboarding } from "../helpers/onboarding";

/**
 * Workspace-aware post-login routing (MP-B-010 + MP-B-012, ADR-1). The branches
 * the `(app)` onboarding gate distinguishes, now that the provider shells exist
 * and the entry rule (spec §12.3) auto-enters a sole workspace:
 *   1. provider-only user with exactly one provider → straight into that provider
 *      shell (NOT onboarding, and no chooser for a single place);
 *   2. provider-only user with several providers and no stored pointer → the
 *      `/workspace` chooser;
 *   3. a user with a household → straight to `/today`, even when they also belong
 *      to a provider (household resolves first — the regression guard);
 *   4. (a user who belongs to nothing still goes to `/onboarding` — covered by the
 *      existing onboarding specs).
 */
test.describe("Workspace routing (MP-B-010 / MP-B-012)", () => {
  test("a provider-only owner with one provider auto-enters the owner shell", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("prov-owner");
    await providerTeam.createProvider(owner, { name: "Anna's Tiffins" });

    await signInWithPassword(page, owner.email, owner.password);
    // Exactly one workspace → directly into it, no chooser (spec §12.3.3).
    await page.waitForURL("**/provider/dashboard", { timeout: 30_000 });
    expect(new URL(page.url()).pathname).toBe("/provider/dashboard");
  });

  test("a provider-only awaiting customer auto-enters their holding screen", async ({
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
    await page.waitForURL(`**/providers/${providerId}/awaiting-approval`, {
      timeout: 30_000,
    });
    // EmptyState renders its title as a paragraph; the provider name shows in the
    // holding-screen body (scope to main — the brand also shows it, in the header).
    await expect(page.getByText("Awaiting approval")).toBeVisible();
    await expect(page.getByRole("main").getByText("Bay Kitchen")).toBeVisible();
  });

  test("a provider-only owner of several providers lands on the chooser", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("prov-owner");
    await providerTeam.createProvider(owner, { name: "Kitchen One" });
    await providerTeam.createProvider(owner, { name: "Kitchen Two" });

    await signInWithPassword(page, owner.email, owner.password);
    await page.waitForURL("**/workspace", { timeout: 30_000 });

    expect(new URL(page.url()).pathname).toBe("/workspace");
    await expect(
      page.getByRole("heading", { name: "Choose a workspace" }),
    ).toBeVisible();
    await expect(page.getByText("Kitchen One")).toBeVisible();
    await expect(page.getByText("Kitchen Two")).toBeVisible();
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
