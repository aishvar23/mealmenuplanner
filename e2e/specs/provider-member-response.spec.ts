import { expect, test } from "../fixtures/provider";
import { signInWithPassword } from "../helpers/auth";

/**
 * Member Today's Menu + response (MP-B-040/041, UC-RESPONSE-001..009).
 *
 * An approved customer opens today's published menu, reviews the default package
 * and alternatives, and confirms / sees the locked state. The menu is seeded
 * directly via the service-role client (`seedMenuDay`); the customer interacts
 * through the real UI against the live `/api/*` routes (the server derives
 * quantities and enforces the cutoff — MP-A-130).
 */

/** Sign in as `customer`, wait for auth to land, then open today's menu. */
async function openToday(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
  providerId: string,
): Promise<void> {
  await signInWithPassword(page, email, password);
  await page.waitForURL((url) => !url.pathname.includes("/sign-in"), {
    timeout: 30_000,
  });
  await page.goto(`/providers/${providerId}/today`);
}

test.describe("Provider member response (MP-B-041)", () => {
  test("approved customer reviews the menu, swaps an alternative, and confirms", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("resp-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Response Kitchen",
    });
    const customer = await providerTeam.createUser("resp-cust");
    await providerTeam.addCustomer(providerId, customer, "approved");
    await providerTeam.seedMenuDay(providerId, owner, {
      cutoffHoursFromNow: 8,
    });

    await openToday(page, customer.email, customer.password, providerId);

    // The menu renders: component groups + an open cutoff countdown.
    await expect(
      page.getByRole("heading", { name: "Today’s menu" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Dal / legume")).toBeVisible();
    await expect(page.getByText("Bread")).toBeVisible();
    await expect(page.getByTestId("cutoff-countdown")).toBeVisible();
    // Choices are labelled by dish NAME, not "Default"/"Option N" (ADO #39):
    // the seeded dal slot offers Rajma (default) and Chana (alternative).
    await expect(
      page.getByRole("radio", { name: /Rajma/ }).first(),
    ).toBeVisible();

    // Swap the dal to its Chana alternative (named choice chip), then confirm.
    await page.getByRole("radio", { name: /Chana/ }).first().click();
    await page.getByRole("button", { name: "Confirm order" }).click();

    // The status flips to confirmed (badge + notice), proving the save+confirm
    // round-trip hit the live route.
    await expect(page.getByText("Order confirmed.")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
  });

  test("a locked menu is read-only with no response controls", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("lock-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Locked Kitchen",
    });
    const customer = await providerTeam.createUser("lock-cust");
    await providerTeam.addCustomer(providerId, customer, "approved");
    // A locked day: responses are closed.
    await providerTeam.seedMenuDay(providerId, owner, {
      status: "locked",
      cutoffHoursFromNow: -2,
    });

    await openToday(page, customer.email, customer.password, providerId);

    await expect(
      page.getByRole("heading", { name: "Today’s menu" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/This menu is locked/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Confirm order" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Cancel order" }),
    ).toHaveCount(0);
  });

  test("shows the empty state when no menu is published today", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("empty-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Empty Kitchen",
    });
    const customer = await providerTeam.createUser("empty-cust");
    await providerTeam.addCustomer(providerId, customer, "approved");
    // No seedMenuDay — nothing is published for today.

    await openToday(page, customer.email, customer.password, providerId);

    await expect(page.getByText("No menu published for today")).toBeVisible({
      timeout: 30_000,
    });
  });
});
