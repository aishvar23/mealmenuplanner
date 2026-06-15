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
 *
 * The assertions check the member's ACTUAL data end-to-end — the swapped dal item
 * ("Chana", not the default "Rajma"), the member's display name, and the confirmed
 * count/quantity — rather than always-present headers, section labels, or group
 * tokens, so a regression that drops the order from the batch cannot pass green.
 */

const PROVIDER_TZ = "Asia/Kolkata";

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

/**
 * Minutes remaining until the next midnight in the provider timezone. The seed
 * freezes `menu_date` to "today" in IST at seed time, but the member reload, the
 * cutoff RPC, and the owner dashboard recompute "today" live; if the IST wall clock
 * crosses midnight mid-journey the rows stop matching. We skip in that thin window
 * rather than flake. (Not a guard on the app — purely on the test's seed-vs-read
 * clock assumption.)
 */
function minutesToProviderMidnight(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PROVIDER_TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const at = (type: string) =>
    Number(parts.find((p) => p.type === type)!.value);
  return 24 * 60 - (at("hour") * 60 + at("minute") + at("second") / 60);
}

/**
 * Parse a provider CSV export (UTF-8 BOM + CRLF rows) into header-keyed records.
 * The seeded data never contains commas/quotes, so a plain split is sufficient and
 * lets the specs assert specific cells (item name, quantity, member name) instead of
 * substring-matching always-present header/group tokens.
 */
function parseCsv(body: string): Record<string, string>[] {
  // Strip a leading UTF-8 BOM (the renderer prepends one) by code point, so no
  // irregular-whitespace literal lands in the source.
  const withoutBom = body.charCodeAt(0) === 0xfeff ? body.slice(1) : body;
  const lines = withoutBom.trim().split("\r\n");
  const header = lines[0]!.split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
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

    // Guard the IST-midnight race (see helper): seed-time and read-time "today"
    // must agree across the whole journey. Skip only in the ~15-minute window
    // before IST midnight, where the clock could cross during the run.
    test.skip(
      minutesToProviderMidnight(new Date()) < 15,
      'within the IST-midnight window where seed-time and read-time "today" can differ',
    );

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
    // Read back the membership: prove the approval committed server-side (the UI
    // removing the button only proves an optimistic update, and a cloud-dev replica
    // read could lag), so step 4's onboarding routing has a durable active member.
    await expect
      .poll(
        async () => {
          const { data } = await providerTeam.admin
            .from("provider_memberships")
            .select("status")
            .eq("provider_id", providerId)
            .eq("user_id", customer.id)
            .single();
          return data?.status ?? null;
        },
        { timeout: 15_000 },
      )
      .toBe("active");

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
    const chana = page.getByRole("radio", { name: /Chana/ }).first();
    await chana.check();
    await expect(chana).toBeChecked();
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
    //       (revive-from-cancelled keeps the Chana swap, UC-RESPONSE-006). ──
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
    // The census counts the member's manual confirm (no subscription → no
    // auto-accept), so exactly one confirmed order — assert the value, not the label.
    await expect(page.locator('dt:text-is("Confirmed") + dd')).toHaveText("1");
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
    // Data-level: the member's row and the swapped dal item actually rendered —
    // not just the section headings (which render even on an empty batch).
    await expect(page.getByText("Pipeline Member")).toBeVisible();
    await expect(page.getByText(/Chana/).first()).toBeVisible();

    // ── 12. CSV downloads (UC-BATCH-003): the member's UI order reached the export.
    //        Full reconciliation math is covered by provider-preparation-csv.spec —
    //        here we prove the loop closes by asserting the member's ACTUAL line: the
    //        swapped dal ("Chana", not the default "Rajma"), its quantity, and the
    //        member's name — values that only appear if the order survived the cutoff. ──
    const batchId = await providerTeam.currentBatchId(seed.menuDayId);
    const aggRes = await page.request.get(
      `/api/provider-preparation-batches/${batchId}/aggregate.csv`,
    );
    expect(aggRes.status()).toBe(200);
    expect(aggRes.headers()["content-type"]).toContain("text/csv");
    const aggBody = await aggRes.text();
    const aggDal = parseCsv(aggBody).find(
      (r) => r.component_group === "dal_or_legume",
    );
    expect(aggDal, "aggregate must carry the member's dal line").toBeTruthy();
    // The swap persisted through cancel→re-confirm: Chana, not the default Rajma.
    expect(aggDal!.item_name).toBe("Chana");
    expect(aggDal!.total_quantity).toBe("16");
    expect(aggDal!.canonical_unit).toBe("oz");
    expect(aggBody).not.toContain("Rajma");

    const indRes = await page.request.get(
      `/api/provider-preparation-batches/${batchId}/individual.csv`,
    );
    expect(indRes.status()).toBe(200);
    const indDal = parseCsv(await indRes.text()).find(
      (r) =>
        r.member_name === "Pipeline Member" &&
        r.component_group === "dal_or_legume",
    );
    expect(
      indDal,
      "individual breakdown must include the member's dal line",
    ).toBeTruthy();
    expect(indDal!.item_name).toBe("Chana");
    expect(indDal!.quantity).toBe("16");

    // ── 13. Print opens (UC-BATCH-005): the chrome-free roster renders the member's
    //        actual data, not just the section headings. ──
    await page.goto(`/provider/preparation/${batchId}/print`);
    await expect(
      page.getByRole("heading", { name: "Pipeline Kitchen" }),
    ).toBeVisible();
    await expect(page.getByText(/Preparation roster —/)).toBeVisible();
    await expect(page.getByText("Aggregate roster")).toBeVisible();
    await expect(page.getByText("Pipeline Member")).toBeVisible();
    await expect(page.getByText(/Chana/).first()).toBeVisible();
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

    const aggregateUrl = `/api/provider-preparation-batches/${batchId}/aggregate.csv`;

    // ── Positive control: Provider A's OWN owner CAN read the batch over this exact
    //    route, so the denial below is provably an AUTHORIZATION outcome — not a
    //    mistyped route or a stale/garbage batch id (either of which would 404). ──
    await signIn(page, ownerA.email, ownerA.password);
    const ownRes = await page.request.get(aggregateUrl);
    expect(ownRes.status()).toBe(200);
    expect(ownRes.headers()["content-type"]).toContain("text/csv");

    // ── Owner B (a different provider's owner) is denied the SAME, existing batch
    //    with 403 (PROWN): the read RPC self-gates on ownership after finding the
    //    row, so this is a forbidden denial, not existence-hiding. ──
    await signIn(page, ownerB.email, ownerB.password);
    const crossRes = await page.request.get(aggregateUrl);
    expect(crossRes.status()).toBe(403);

    // ── Customer A (a member of A only) cannot enter Provider B's workspace — the
    //    member guard bounces a non-member off `/providers/{B}/today`. Assert both
    //    the positive landing (their own allowed context) AND that B's identity
    //    never renders, so a broken guard that exposed B would be caught. ──
    await signIn(page, customerA.email, customerA.password);
    await page.goto(`/providers/${providerB}/today`);
    await page.waitForURL(
      (url) => !url.pathname.includes(`/providers/${providerB}`),
      { timeout: 15_000 },
    );
    await expect(page).toHaveURL(
      new RegExp(`/workspace|/providers/${providerA}`),
    );
    await expect(page.getByText("Isolation Beta")).toHaveCount(0);
  });
});
