import { expect, test } from "../fixtures/provider";
import { signInWithPassword } from "../helpers/auth";

/**
 * Minimal member onboarding (MP-B-021, UC-MEMBER-ONBOARD-001).
 *
 * An approved-but-not-onboarded customer is routed to the onboarding page by the
 * menu gate; they fill the minimal provider-interaction profile (name + the two
 * acknowledgments) and land on Today's Menu. The page must show NO household
 * field, and a revisit after completion goes straight to Today (gate satisfied).
 */

test.describe("Provider member onboarding (MP-B-021)", () => {
  test("approved customer is gated into onboarding, completes it, and reaches Today", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("onb-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Onboard Kitchen",
    });
    const customer = await providerTeam.createUser("onb-cust");
    // Approved but NOT onboarded → the menu gate must route them to onboarding.
    await providerTeam.addCustomer(providerId, customer, "approved", {
      onboarded: false,
    });

    await signInWithPassword(page, customer.email, customer.password);
    // Sole workspace → enters the provider; the Today gate redirects a
    // not-yet-onboarded member to the onboarding page.
    await page.waitForURL(`**/providers/${providerId}/onboarding`, {
      timeout: 30_000,
    });

    await expect(
      page.getByRole("heading", { name: /A few details for Onboard Kitchen/ }),
    ).toBeVisible();

    // No household field is present (UC-MEMBER-ONBOARD-001 "must not show").
    await expect(page.getByText(/family size/i)).toHaveCount(0);
    await expect(page.getByText(/cuisine/i)).toHaveCount(0);
    await expect(page.getByText(/cooking time/i)).toHaveCount(0);

    // Submit is gated on name + both acknowledgments.
    const submit = page.getByRole("button", {
      name: /Continue to today's menu/,
    });
    await expect(submit).toBeDisabled();

    await page.getByLabel(/Your name/).fill("Chitra");
    const boxes = page.getByRole("checkbox");
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await expect(submit).toBeEnabled();

    await submit.click();
    await page.waitForURL(`**/providers/${providerId}/today`, {
      timeout: 30_000,
    });
    await expect(page.getByText(/Today's menu coming soon/i)).toBeVisible();

    // Revisiting Today now stays put — onboarding is complete, no re-gate.
    await page.goto(`/providers/${providerId}/today`);
    await page.waitForURL(`**/providers/${providerId}/today`, {
      timeout: 30_000,
    });
    await expect(page.getByText(/Today's menu coming soon/i)).toBeVisible();
  });
});
