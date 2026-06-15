import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures/provider";
import { signInWithPassword } from "../helpers/auth";

/**
 * Full provider pipeline E2E (MP-B-070, `07_test_strategy.md` §1.11 / E2E-001..006).
 *
 * The single end-to-end journey the per-feature specs only cover piecemeal: provider
 * onboarding (an owner with a workspace) → invite a customer → customer accepts →
 * owner approves → customer minimal onboarding → land on Today → confirm → update
 * before cutoff → cancel before cutoff → re-confirm → CANNOT edit after cutoff →
 * owner sees the aggregate census + roster → CSV downloads → print opens →
 * multi-provider isolation.
 *
 * The menu is SEEDED via the service-role client (`seedMenuDay`) exactly as the
 * member-response specs do — MP-B-070's flow never authors a menu through the UI
 * (that is the ADR-7-gated menu builder, MP-A-121/MP-B-030), so this pipeline is
 * independent of ADR-7. The cutoff is driven DETERMINISTICALLY (§4, line 163): the
 * day's `cutoff_at` is moved into the past via the admin client and the live
 * `process_provider_cutoff` RPC is invoked directly, rather than waiting on the
 * 5-minute cron. Every member/owner interaction goes through the real UI against the
 * live `/api/*` routes, so the journey proves the layers compose: a member's UI
 * response flows through the cutoff into the owner's aggregate, export, and print.
 */

/** Sign in as `email`, then wait until the post-login redirect leaves `/sign-in`. */
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

test.describe("Provider full pipeline (MP-B-070)", () => {
  test("a customer is invited, responds, and the order flows through cutoff to the owner's batch", async ({
    page,
    providerTeam,
  }) => {
    // Many sign-in switches + a real cutoff round-trip — give it room over the 60s
    // per-test default so a slow cloud-dev round-trip doesn't false-fail.
    test.slow();

    const owner = await providerTeam.createUser("pipeline-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Pipeline Kitchen",
    });
    // A fresh user with NO membership yet — they join through the real invite flow.
    const customer = await providerTeam.createUser("pipeline-cust");

    // ── 1. Owner invites the customer from the Members page (UC-MEMBER-001) ──
    await signIn(page, owner.email, owner.password);
    await page.waitForURL("**/provider/dashboard", { timeout: 30_000 });
    await page.goto("/provider/members");
    await page.getByLabel("Email").fill(customer.email);
    await page.getByRole("button", { name: "Send invite" }).click();
    const linkInput = page.getByLabel("Invite link");
    await expect(linkInput).toBeVisible({ timeout: 15_000 });
    const token = (await linkInput.inputValue()).split("/provider-invite/")[1]!;
    expect(token.length).toBeGreaterThan(10);

    // ── 2. Customer accepts the invite → awaiting_approval (UC-MEMBER-002) ──
    await signInWithPassword(page, customer.email, customer.password);
    // No workspace yet → household onboarding; waiting for it confirms auth landed.
    await page.waitForURL("**/onboarding", { timeout: 30_000 });
    await page.goto(`/provider-invite/${token}`);
    await expect(
      page.getByRole("heading", { name: "Pipeline Kitchen" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await page.waitForURL(`**/providers/${providerId}/awaiting-approval`, {
      timeout: 30_000,
    });

    // ── 3. Owner approves the awaiting customer → active (UC-MEMBER-003) ──
    await signIn(page, owner.email, owner.password);
    await page.waitForURL("**/provider/dashboard", { timeout: 30_000 });
    await page.goto("/provider/members");
    await expect(page.getByText(customer.email).first()).toBeVisible();
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0, {
      timeout: 15_000,
    });

    // Seed today's published menu (cutoff open, 8h out) so the just-approved
    // customer has something to respond to. Authoring is ADR-7-gated and out of
    // scope for MP-B-070 — the menu is seeded, as the member-response specs do.
    const seed = await providerTeam.seedMenuDay(providerId, owner, {
      cutoffHoursFromNow: 8,
    });

    // ── 4. Customer minimal onboarding → lands on Today (UC-MEMBER-ONBOARD-001) ──
    await signInWithPassword(page, customer.email, customer.password);
    // Sole workspace → auto-enters the provider; the Today gate routes a
    // not-yet-onboarded member to onboarding (never to household onboarding).
    await page.waitForURL(`**/providers/${providerId}/onboarding`, {
      timeout: 30_000,
    });
    await page.getByLabel(/Your name/).fill("Pipeline Member");
    const boxes = page.getByRole("checkbox");
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await page
      .getByRole("button", { name: /Continue to today's menu/ })
      .click();
    await page.waitForURL(`**/providers/${providerId}/today`, {
      timeout: 30_000,
    });
    await expect(
      page.getByRole("heading", { name: "Today’s menu" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("cutoff-countdown")).toBeVisible();

    // ── 5. Confirm the default order (UC-RESPONSE-002/003) ──
    await page.getByRole("button", { name: "Confirm order" }).click();
    await expect(page.getByText("Order confirmed.")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();

    // ── 6. Update before cutoff: swap the dal to its Chana alternative
    //       (UC-RESPONSE-004). A confirmed order exposes "Save changes". ──
    await page.getByRole("radio", { name: /Chana/ }).first().click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved.", { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // ── 7. Cancel before cutoff (UC-RESPONSE-006) ──
    await page.getByRole("button", { name: "Cancel order" }).click();
    await expect(page.getByText("Order cancelled.")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();

    // ── 8. Re-confirm so a real confirmed order feeds the batch
    //       (revive-from-cancelled, UC-RESPONSE-006). ──
    await page.getByRole("button", { name: "Confirm order" }).click();
    await expect(page.getByText("Order confirmed.")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();

    // ── 9. Cutoff fires (deterministic): move cutoff into the past, then run the
    //       live cutoff RPC — the day locks and batch revision 1 is built from the
    //       confirmed response (UC-CUTOFF-001). ──
    const past = new Date(Date.now() - 60_000).toISOString();
    const moved = await providerTeam.admin
      .from("provider_menu_days")
      .update({ cutoff_at: past })
      .eq("id", seed.menuDayId);
    expect(moved.error).toBeNull();
    const cutoff = await providerTeam.admin.rpc("process_provider_cutoff", {
      p_menu_day_id: seed.menuDayId,
    });
    expect(cutoff.error).toBeNull();

    // ── 10. Cannot edit after cutoff (UC-RESPONSE-009): the member reloads Today
    //        and the menu is read-only with no response controls. ──
    await page.goto(`/providers/${providerId}/today`);
    await expect(
      page.getByRole("heading", { name: "Today’s menu" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/This menu is locked/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Confirm order" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Save changes" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Cancel order" }),
    ).toHaveCount(0);

    // ── 11. Owner sees the aggregate: dashboard census + preparation roster
    //        (UC-BATCH-001/004). ──
    await signIn(page, owner.email, owner.password);
    await page.goto("/provider/dashboard");
    await expect(page.getByText("Today's menu")).toBeVisible();
    await expect(page.getByText("Cutoff passed")).toBeVisible();
    await expect(page.getByText("Confirmed")).toBeVisible();
    const prepLink = page.getByRole("link", { name: /View preparation/ });
    await expect(prepLink).toBeVisible();
    await prepLink.click();
    await page.waitForURL(/\/provider\/preparation\/[0-9a-f-]+$/, {
      timeout: 15_000,
    });
    await expect(
      page.getByRole("heading", { name: /^Preparation —/ }),
    ).toBeVisible();
    await expect(page.getByText("Cutoff census")).toBeVisible();
    await expect(page.getByText("Aggregate roster")).toBeVisible();
    await expect(page.getByText("Per-member breakdown")).toBeVisible();

    // ── 12. CSV downloads (UC-BATCH-003): the member's UI order reached the export.
    //        Full reconciliation math is covered by provider-preparation-csv.spec —
    //        here we prove the loop closes (aggregate carries the dal line). ──
    const batchId = await providerTeam.currentBatchId(seed.menuDayId);
    const aggRes = await page.request.get(
      `/api/provider-preparation-batches/${batchId}/aggregate.csv`,
    );
    expect(aggRes.status()).toBe(200);
    expect(aggRes.headers()["content-type"]).toContain("text/csv");
    const aggBody = await aggRes.text();
    expect(aggBody).toContain("component_group");
    expect(aggBody).toContain("dal_or_legume");
    const indRes = await page.request.get(
      `/api/provider-preparation-batches/${batchId}/individual.csv`,
    );
    expect(indRes.status()).toBe(200);
    expect(await indRes.text()).toContain("member_name");

    // ── 13. Print opens (UC-BATCH-005): the chrome-free roster renders. ──
    await page.goto(`/provider/preparation/${batchId}/print`);
    await expect(
      page.getByRole("heading", { name: "Pipeline Kitchen" }),
    ).toBeVisible();
    await expect(page.getByText(/Preparation roster —/)).toBeVisible();
    await expect(page.getByText("Aggregate roster")).toBeVisible();
  });

  test("multi-provider isolation: neither a customer nor an owner reaches another provider (E2E-006)", async ({
    page,
    providerTeam,
  }) => {
    // Provider A with a real post-cutoff batch, plus an unrelated Provider B owner.
    const ownerA = await providerTeam.createUser("iso-owner-a");
    const providerA = await providerTeam.createProvider(ownerA, {
      name: "Isolation Alpha",
    });
    const { batchId } = await providerTeam.seedBatch(ownerA, providerA);
    const customerA = await providerTeam.createUser("iso-cust-a");
    await providerTeam.addCustomer(providerA, customerA, "approved");

    const ownerB = await providerTeam.createUser("iso-owner-b");
    const providerB = await providerTeam.createProvider(ownerB, {
      name: "Isolation Beta",
    });

    // ── Owner B cannot read Provider A's batch export — the read RPC self-gates,
    //    so a different provider's owner is denied (existence-hidden / forbidden). ──
    await signIn(page, ownerB.email, ownerB.password);
    const crossRes = await page.request.get(
      `/api/provider-preparation-batches/${batchId}/aggregate.csv`,
    );
    expect(crossRes.ok()).toBe(false);
    expect([403, 404]).toContain(crossRes.status());

    // ── Customer A (a member of A only) cannot enter Provider B's workspace — the
    //    member guard bounces a non-member off `/providers/{B}/today`, and B's
    //    identity never renders. ──
    await signIn(page, customerA.email, customerA.password);
    await page.goto(`/providers/${providerB}/today`);
    await page.waitForURL(
      (url) => !url.pathname.includes(`/providers/${providerB}/today`),
      { timeout: 15_000 },
    );
    await expect(page.getByText("Isolation Beta")).toHaveCount(0);
  });
});
