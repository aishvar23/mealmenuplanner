import { expect, test } from "../fixtures/provider";
import { signInWithPassword } from "../helpers/auth";

/**
 * Provider membership invite → accept → approve (MP-A-102 / MP-B-022,
 * UC-MEMBER-001..005).
 *
 * The owner invites a customer from the Members page (hashed-token invite, the
 * link shown once), the customer accepts via the public invite landing and lands
 * in `awaiting_approval`, and the owner approves them to `active`. Runs on a
 * single page, switching users with `signInWithPassword` (which clears cookies).
 */

test.describe("Provider members (MP-B-022)", () => {
  test("owner invites a customer, who accepts and is approved", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("members-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Members Kitchen",
    });
    const customer = await providerTeam.createUser("members-cust");

    // ── Owner creates the invite ──
    await signInWithPassword(page, owner.email, owner.password);
    await page.waitForURL("**/provider/dashboard", { timeout: 30_000 });

    await page.goto("/provider/members");
    await expect(
      page.getByRole("heading", { name: "Members", exact: true }),
    ).toBeVisible();

    await page.getByLabel("Email").fill(customer.email);
    await page.getByRole("button", { name: "Send invite" }).click();

    const linkInput = page.getByLabel("Invite link");
    await expect(linkInput).toBeVisible({ timeout: 15_000 });
    const inviteLink = await linkInput.inputValue();
    const token = inviteLink.split("/provider-invite/")[1]!;
    expect(token.length).toBeGreaterThan(10);

    // ── Customer accepts ──
    await signInWithPassword(page, customer.email, customer.password);
    // No workspace yet → household onboarding; wait for it so auth has landed.
    await page.waitForURL("**/onboarding", { timeout: 30_000 });

    await page.goto(`/provider-invite/${token}`);
    await expect(
      page.getByRole("heading", { name: "Members Kitchen" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Accept invitation" }).click();

    await page.waitForURL(`**/providers/${providerId}/awaiting-approval`, {
      timeout: 30_000,
    });
    await expect(page.getByText("Awaiting approval")).toBeVisible();

    // ── Owner approves ──
    await signInWithPassword(page, owner.email, owner.password);
    await page.waitForURL("**/provider/dashboard", { timeout: 30_000 });

    await page.goto("/provider/members");
    // The customer now appears in the awaiting list.
    await expect(page.getByText(customer.email).first()).toBeVisible();
    await page.getByRole("button", { name: "Approve" }).click();

    // After approval there is no awaiting member left to approve, and the
    // customer remains visible (now active).
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0, {
      timeout: 15_000,
    });
    await expect(page.getByText(customer.email).first()).toBeVisible();
  });

  test("a removed customer can be re-invited and re-accepts without a duplicate membership", async ({
    page,
    providerTeam,
  }) => {
    // Regression for the duplicate-membership bug: a previously removed customer
    // re-accepting must reactivate their single row, not insert a second one (the
    // partial unique index doesn't cover 'removed'). A duplicate would make the
    // own-membership read throw, so reaching the onboarding form after approval
    // proves a single row.
    const owner = await providerTeam.createUser("reinvite-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Reinvite Kitchen",
    });
    const customer = await providerTeam.createUser("reinvite-cust");
    await providerTeam.addCustomer(providerId, customer, "removed");

    // ── Owner re-invites the removed customer ──
    await signInWithPassword(page, owner.email, owner.password);
    await page.waitForURL("**/provider/dashboard", { timeout: 30_000 });
    await page.goto("/provider/members");
    await page.getByLabel("Email").fill(customer.email);
    await page.getByRole("button", { name: "Send invite" }).click();
    const linkInput = page.getByLabel("Invite link");
    await expect(linkInput).toBeVisible({ timeout: 15_000 });
    const token = (await linkInput.inputValue()).split("/provider-invite/")[1]!;

    // ── Customer re-accepts (reactivation, not a 'already a member' conflict) ──
    await signInWithPassword(page, customer.email, customer.password);
    await page.waitForURL("**/onboarding", { timeout: 30_000 });
    await page.goto(`/provider-invite/${token}`);
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await page.waitForURL(`**/providers/${providerId}/awaiting-approval`, {
      timeout: 30_000,
    });

    // ── Owner approves; exactly one awaiting entry to approve ──
    await signInWithPassword(page, owner.email, owner.password);
    await page.waitForURL("**/provider/dashboard", { timeout: 30_000 });
    await page.goto("/provider/members");
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(1);
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0, {
      timeout: 15_000,
    });

    // ── Customer reaches the onboarding form (own-membership read did not throw
    //    on a duplicate row) ──
    await signInWithPassword(page, customer.email, customer.password);
    // Wait for the post-login redirect (no household → household onboarding) so
    // the session cookie is set before navigating to the provider onboarding page.
    await page.waitForURL("**/onboarding", { timeout: 30_000 });
    await page.goto(`/providers/${providerId}/onboarding`);
    await expect(
      page.getByRole("heading", { name: /A few details for/ }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("rejecting an awaiting customer removes them from the list", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("reject-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Reject Kitchen",
    });
    const customer = await providerTeam.createUser("reject-cust");
    await providerTeam.addCustomer(providerId, customer, "awaiting_approval");

    await signInWithPassword(page, owner.email, owner.password);
    await page.waitForURL("**/provider/dashboard", { timeout: 30_000 });

    await page.goto("/provider/members");
    const rejectButton = page.getByRole("button", {
      name: "Reject",
      exact: true,
    });
    await expect(rejectButton).toBeVisible();
    await rejectButton.click();

    await expect(page.getByText("No one is waiting for approval.")).toBeVisible(
      { timeout: 15_000 },
    );
  });
});
