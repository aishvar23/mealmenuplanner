import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures/provider";
import { signInWithPassword } from "../helpers/auth";

/**
 * Owner catalog management UI (ADO #88, spec §13.2). The self-service dish library
 * behind the menu builder. Covers the acceptance criteria: an owner adds a dish
 * through the UI and it appears in the menu builder's default-dish picker; edit +
 * archive work and an archived dish drops out of the active picker; and a non-owner
 * customer can't reach the owner catalog page.
 */

async function signIn(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await signInWithPassword(page, email, password);
  await page.waitForURL((url) => !url.pathname.includes("/sign-in"), {
    timeout: 30_000,
  });
}

test.describe("Provider catalog management (ADO #88)", () => {
  test("owner adds a dish through the UI and it appears in the menu builder picker", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("catalog-owner");
    await providerTeam.createProvider(owner, { name: "Catalog Kitchen" });

    await signIn(page, owner.email, owner.password);
    await page.goto("/provider/catalog");

    await expect(page.getByRole("heading", { name: "Catalog" })).toBeVisible();
    // A brand-new provider has no dishes.
    await expect(page.getByText("No dishes yet")).toBeVisible();

    // Add a dish via the form.
    await page.getByRole("button", { name: "Add dish" }).click();
    await page.getByLabel("Name").fill("Paneer Butter Masala");
    await page.getByLabel("Unit").fill("bowl");
    await page.getByLabel("Default quantity").fill("1");
    await page.getByRole("button", { name: "Add dish" }).click();

    // It shows in the list.
    await expect(page.getByText("Paneer Butter Masala")).toBeVisible({
      timeout: 30_000,
    });

    // And it's now placeable in the menu builder's default-dish picker.
    await page.goto("/provider/menu");
    await page.getByRole("button", { name: "New menu day" }).click();
    await page.getByRole("button", { name: "Add component" }).click();
    await expect(page.getByTestId("menu-component")).toHaveCount(1);
    await expect(
      page.getByRole("option", { name: /Paneer Butter Masala/ }),
    ).toBeAttached();
  });

  test("owner edits and archives a dish; an archived dish drops out of the active picker", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("catalog-edit-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Edit Catalog Kitchen",
    });
    // Rajma + Chana (dal) + Roti (bread).
    await providerTeam.seedCatalog(providerId);

    await signIn(page, owner.email, owner.password);
    await page.goto("/provider/catalog");

    await expect(page.getByText("Rajma")).toBeVisible({ timeout: 30_000 });

    // Edit Rajma → Rajma Masala.
    await page
      .getByRole("listitem")
      .filter({ hasText: "Rajma" })
      .getByRole("button", { name: "Edit" })
      .click();
    await expect(page.getByText("Edit dish")).toBeVisible();
    await page.getByLabel("Name").fill("Rajma Masala");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Rajma Masala")).toBeVisible({
      timeout: 30_000,
    });

    // Archive Chana → it moves to the Archived section (Restore offered).
    await page
      .getByRole("listitem")
      .filter({ hasText: "Chana" })
      .getByRole("button", { name: "Archive" })
      .click();
    await expect(page.getByText("Archived")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Restore" })).toBeVisible();

    // In the menu builder, the archived Chana is no longer offered as a default dish.
    await page.goto("/provider/menu");
    await page.getByRole("button", { name: "New menu day" }).click();
    await page.getByRole("button", { name: "Add component" }).click();
    await expect(page.getByTestId("menu-component")).toHaveCount(1);
    await expect(page.getByRole("option", { name: /Chana/ })).toHaveCount(0);
    // The edited name IS offered.
    await expect(
      page.getByRole("option", { name: /Rajma Masala/ }),
    ).toBeAttached();
  });

  test("while one archive is in flight, the other rows' archive buttons are disabled", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("catalog-race-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Race Catalog Kitchen",
    });
    // Rajma + Chana (dal) + Roti (bread).
    await providerTeam.seedCatalog(providerId);

    await signIn(page, owner.email, owner.password);

    // Hold the archive PATCH open so the in-flight state stays observable.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/catalog/**", async (route) => {
      if (route.request().method() === "PATCH") {
        await held;
      }
      await route.continue();
    });

    await page.goto("/provider/catalog");
    await expect(page.getByText("Rajma")).toBeVisible({ timeout: 30_000 });

    const chanaArchive = page
      .getByRole("listitem")
      .filter({ hasText: "Chana" })
      .getByRole("button", { name: "Archive" });
    await expect(chanaArchive).toBeEnabled();

    // Start archiving Rajma; its request is held open by the route above.
    await page
      .getByRole("listitem")
      .filter({ hasText: "Rajma" })
      .getByRole("button", { name: "Archive" })
      .click();

    // While Rajma's archive is in flight, a second archive must NOT be silently
    // dropped — Chana's button is disabled rather than a no-op click.
    await expect(chanaArchive).toBeDisabled();

    // Release the held request and confirm the toggle settles.
    release();
    await expect(page.getByText("Archived")).toBeVisible({ timeout: 30_000 });
    await expect(chanaArchive).toBeEnabled();
  });

  test("a non-owner customer cannot reach the owner catalog page", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("catalog-gate-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Gated Catalog Kitchen",
    });
    const outsider = await providerTeam.createUser("catalog-outsider");
    await providerTeam.addCustomer(providerId, outsider, "approved");

    await signIn(page, outsider.email, outsider.password);
    await page.goto("/provider/catalog");
    await page.waitForURL((url) => !url.pathname.startsWith("/provider/"), {
      timeout: 30_000,
    });
    await expect(page.getByRole("heading", { name: "Catalog" })).toHaveCount(0);
  });
});
