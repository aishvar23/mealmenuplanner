import { expect, test } from "../fixtures/provider";
import { signInWithPassword } from "../helpers/auth";

/**
 * Provider owner onboarding (MP-B-020, UC-PROVIDER-001/002).
 *
 * A fresh user with no household lands on household onboarding; from the
 * standalone `/provider-onboarding` wizard they create a provider workspace,
 * which on finish promotes the draft to active and enters the owner dashboard.
 * Also covers the required-field gating and server-side resume (revisiting after
 * completion goes straight to the dashboard).
 *
 * The provider org created through the UI is owned by the fixture's tracked user,
 * so it is torn down with that user.
 */

test.describe("Provider owner onboarding (MP-B-020)", () => {
  test("creates a provider and lands on the owner dashboard, with required-field gating", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("onboard-owner");

    await signInWithPassword(page, owner.email, owner.password);
    // A brand-new user with no workspace is routed to household onboarding;
    // waiting for it confirms auth has landed before we open the provider wizard.
    await page.waitForURL("**/onboarding", { timeout: 30_000 });

    await page.goto("/provider-onboarding");
    await expect(
      page.getByRole("heading", { name: /Create your provider/i }),
    ).toBeVisible();

    // Required-field gating: with no name, "Continue" is disabled.
    const continueBtn = page.getByRole("button", { name: /Continue/ });
    await expect(continueBtn).toBeDisabled();

    await page.getByLabel(/Provider name/i).fill("Playwright Tiffins");
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    // Step 2 (service defaults) — finish without filling the optional fields.
    const finishBtn = page.getByRole("button", { name: /Finish setup/ });
    await expect(finishBtn).toBeVisible();
    await finishBtn.click();

    // Completion promotes draft → active, records the pointer, enters the shell.
    await page.waitForURL("**/provider/dashboard", { timeout: 30_000 });
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();

    // Resume: revisiting the wizard for an already-active provider bounces to the
    // dashboard rather than re-running setup.
    await page.goto("/provider-onboarding");
    await page.waitForURL("**/provider/dashboard", { timeout: 30_000 });
  });
});
