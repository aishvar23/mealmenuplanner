import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures/provider";
import { signInWithPassword } from "../helpers/auth";

/**
 * Owner menu builder (MP-B-030, spec §13.3). The web counterpart of the mobile
 * MP-C-030 screen. Covers the authoring flow the builder adds on top of the merged
 * writers (PR #57/#58): build a day from the catalog and publish it; an incomplete
 * (past-cutoff) draft cannot be published and says why; and an owner with no catalog
 * sees the "add catalog first" empty state. Also asserts the owner-only gate.
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

test.describe("Provider menu builder (MP-B-030)", () => {
  test("builds a menu day from the catalog and publishes it", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("menu-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Builder Kitchen",
    });
    await providerTeam.seedCatalog(providerId);

    await signIn(page, owner.email, owner.password);
    await page.goto("/provider/menu");

    await expect(
      page.getByRole("heading", { name: "Weekly menu" }),
    ).toBeVisible();

    // Open the builder, add a component (defaults to the first catalog dish), save.
    await page.getByRole("button", { name: "New menu day" }).click();
    await expect(page.getByLabel("Menu date")).toBeVisible();
    await page.getByRole("button", { name: "Add component" }).click();
    await expect(page.getByTestId("menu-component")).toHaveCount(1);
    // The default cutoff is hours out, so the draft is ready to publish.
    await expect(page.getByText("Ready to publish")).toBeVisible();
    await page.getByRole("button", { name: "Save draft" }).click();

    // Back on the list, the new draft can be published.
    const publish = page.getByRole("button", { name: "Publish" });
    await expect(publish).toBeEnabled({ timeout: 30_000 });
    await publish.click();

    await expect(page.getByText("Published")).toBeVisible({ timeout: 30_000 });
  });

  test("an incomplete (past-cutoff) draft cannot be published and explains why", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("menu-incomplete-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Incomplete Kitchen",
    });
    await providerTeam.seedCatalog(providerId);

    await signIn(page, owner.email, owner.password);
    await page.goto("/provider/menu");

    await page.getByRole("button", { name: "New menu day" }).click();
    // A cutoff already in the past — allowed for a draft, but blocks publish.
    await page.locator("#menu-cutoff").fill("2020-06-15T08:00");
    await page.getByRole("button", { name: "Add component" }).click();
    await expect(page.getByText("Not publishable yet")).toBeVisible();
    await page.getByRole("button", { name: "Save draft" }).click();

    // The draft lands but Publish is blocked, with the reason shown.
    await expect(
      page.getByText("The cutoff time must be in the future."),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Publish" })).toBeDisabled();
  });

  test("an owner with no catalog sees the add-catalog empty state", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("menu-nocatalog-owner");
    await providerTeam.createProvider(owner, { name: "Empty Pantry Kitchen" });

    await signIn(page, owner.email, owner.password);
    await page.goto("/provider/menu");

    await expect(page.getByText("Add catalog items first")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "New menu day" }),
    ).toHaveCount(0);
  });

  test("a non-owner customer cannot reach the owner menu builder", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("menu-gate-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Gated Menu Kitchen",
    });
    const outsider = await providerTeam.createUser("menu-outsider");
    await providerTeam.addCustomer(providerId, outsider, "approved");

    await signIn(page, outsider.email, outsider.password);
    await page.goto("/provider/menu");
    await page.waitForURL((url) => !url.pathname.startsWith("/provider/"), {
      timeout: 30_000,
    });
    await expect(
      page.getByRole("heading", { name: "Weekly menu" }),
    ).toHaveCount(0);
  });
});
