import { expect, test } from "../fixtures/provider";
import { signInWithPassword } from "../helpers/auth";

/**
 * Provider workspace shells + switcher (MP-B-011 / MP-B-012, spec §13/§14).
 *
 * Covers the CP2 read-only shells: a provider owner reaches the owner shell with
 * provider-only navigation (no household nav); an approved customer reaches the
 * member shell scoped to one provider; an awaiting customer sees only the holding
 * screen; a customer of two providers never sees one provider's identity inside
 * the other (§14.4); and the account-menu switcher moves between workspaces and
 * persists the choice.
 */

test.describe("Provider owner shell (MP-B-011)", () => {
  test("owner reaches the dashboard with provider-only navigation", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("prov-owner");
    await providerTeam.createProvider(owner, { name: "Anna's Tiffins" });

    await signInWithPassword(page, owner.email, owner.password);
    // Sole provider workspace → auto-enters the owner shell (spec §12.3.3).
    await page.waitForURL("**/provider/dashboard", { timeout: 30_000 });
    await expect(page.getByText(/Dashboard coming soon/i)).toBeVisible();

    // Owner navigation is present…
    const nav = page.getByRole("navigation", { name: "Provider" }).first();
    await expect(nav.getByRole("link", { name: /Dashboard/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Members/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Preparation/ })).toBeVisible();
    // …and household navigation is NOT (spec §13.1: no grocery/household nav).
    await expect(page.getByRole("link", { name: /Grocery/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Preferences/ })).toHaveCount(
      0,
    );
  });
});

test.describe("Provider member shell (MP-B-012)", () => {
  test("approved customer reaches Today's Menu with member navigation", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("prov-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Bay Bhojan",
    });
    const customer = await providerTeam.createUser("prov-cust");
    await providerTeam.addCustomer(providerId, customer, "approved");

    await signInWithPassword(page, customer.email, customer.password);
    // Sole workspace → auto-enters the member shell at Today's Menu (spec §12.3.3);
    // waiting for it also guarantees auth has landed before we assert.
    await page.waitForURL(`**/providers/${providerId}/today`, {
      timeout: 30_000,
    });

    await expect(page.getByText(/No menu published for today/i)).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Provider" }).first();
    await expect(nav.getByRole("link", { name: /Today/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Account/ })).toBeVisible();
  });

  test("awaiting customer sees the holding screen and no menu", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("prov-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Curry Co",
    });
    const customer = await providerTeam.createUser("prov-cust");
    await providerTeam.addCustomer(providerId, customer, "awaiting_approval");

    await signInWithPassword(page, customer.email, customer.password);
    // Sole workspace → auto-enters the holding screen; waiting for it confirms
    // auth has landed.
    await page.waitForURL(`**/providers/${providerId}/awaiting-approval`, {
      timeout: 30_000,
    });

    // The menu-bearing page also redirects an awaiting member to the holding
    // screen (the per-page guard), so a direct visit never shows the menu.
    await page.goto(`/providers/${providerId}/today`);
    await page.waitForURL(`**/providers/${providerId}/awaiting-approval`, {
      timeout: 30_000,
    });
    // The holding-screen body (EmptyState renders its title as a paragraph).
    await expect(page.getByText("Awaiting approval")).toBeVisible();
    await expect(
      page.getByText(/needs to approve your membership/),
    ).toBeVisible();
    // No menu navigation for an awaiting customer.
    await expect(
      page.getByRole("navigation", { name: "Provider" }),
    ).toHaveCount(0);
  });

  test("a customer of two providers never sees one provider inside the other", async ({
    page,
    providerTeam,
  }) => {
    const ownerA = await providerTeam.createUser("owner-a");
    const providerA = await providerTeam.createProvider(ownerA, {
      name: "Provider Alpha",
    });
    const ownerB = await providerTeam.createUser("owner-b");
    const providerB = await providerTeam.createProvider(ownerB, {
      name: "Provider Beta",
    });
    const customer = await providerTeam.createUser("multi-cust");
    await providerTeam.addCustomer(providerA, customer, "approved");
    await providerTeam.addCustomer(providerB, customer, "approved");

    await signInWithPassword(page, customer.email, customer.password);
    // Two provider workspaces, no stored pointer → the chooser; waiting for it
    // confirms auth has landed before we navigate into each provider.
    await page.waitForURL("**/workspace", { timeout: 30_000 });

    // The provider name appears in the shell brand in both the mobile header
    // (lg:hidden) and the desktop sidebar; assert the visible sidebar copy
    // (`complementary`) so the check is viewport-robust. The absence check stays a
    // strict count of 0 — the other provider must not appear anywhere in the DOM.
    const sidebar = page.getByRole("complementary");
    await page.goto(`/providers/${providerA}/today`);
    await expect(sidebar.getByText("Provider Alpha")).toBeVisible();
    await expect(page.getByText("Provider Beta")).toHaveCount(0);

    await page.goto(`/providers/${providerB}/today`);
    await expect(sidebar.getByText("Provider Beta")).toBeVisible();
    await expect(page.getByText("Provider Alpha")).toHaveCount(0);
  });
});

test.describe("Workspace switcher (MP-B-012)", () => {
  test("an owner of two providers switches between them and the choice persists", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("multi-owner");
    await providerTeam.createProvider(owner, { name: "Kitchen One" });
    await providerTeam.createProvider(owner, { name: "Kitchen Two" });

    await signInWithPassword(page, owner.email, owner.password);
    await page.waitForURL("**/workspace", { timeout: 30_000 });
    // Enter the second provider explicitly (records the active pointer).
    await page.getByRole("button", { name: /Kitchen Two/ }).click();
    await page.waitForURL("**/provider/dashboard", { timeout: 30_000 });
    await expect(page.getByText(/Dashboard coming soon/i)).toBeVisible();

    // Re-signing in resolves the stored pointer → straight back to a provider
    // dashboard (no chooser), proving the switch persisted.
    await signInWithPassword(page, owner.email, owner.password);
    await page.waitForURL("**/provider/dashboard", { timeout: 30_000 });
  });
});
