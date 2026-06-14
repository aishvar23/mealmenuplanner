import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures/provider";
import { signInWithPassword } from "../helpers/auth";

/**
 * Owner preparation UI (MP-B-050, UC-BATCH-001; spec §13.5). The web counterpart of
 * the mobile MP-C-050 screen. A real, post-cutoff batch is built via the live
 * `process_provider_cutoff` RPC over service-role-seeded responses (the shared
 * `seedBatch` fixture), then the owner browses the preparation index, opens the day,
 * and reads the persisted roster + census; the summary-email resend round-trips. Asserts
 * the owner-only gate (a customer is bounced off the owner workspace) too.
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

test.describe("Provider preparation UI (MP-B-050)", () => {
  test("owner opens a batch from the index and reads its roster", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("prep-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Prep Kitchen",
    });
    await providerTeam.seedBatch(owner, providerId);

    await signIn(page, owner.email, owner.password);

    // ── Index lists the generated batch ──
    await page.goto("/provider/preparation");
    await expect(
      page.getByRole("heading", { name: "Preparation" }),
    ).toBeVisible();
    const open = page.getByRole("link", { name: /View/ }).first();
    await expect(open).toBeVisible();
    await open.click();

    // ── Detail shows the census + rosters ──
    await page.waitForURL(/\/provider\/preparation\/[0-9a-f-]+$/, {
      timeout: 15_000,
    });
    await expect(
      page.getByRole("heading", { name: /^Preparation —/ }),
    ).toBeVisible();
    // The card titles are styled <div>s (not semantic headings) — assert by text.
    await expect(page.getByText("Cutoff census")).toBeVisible();
    await expect(page.getByText("Aggregate roster")).toBeVisible();
    await expect(page.getByText("Per-member breakdown")).toBeVisible();

    // The CSV download affordances point at the export routes.
    await expect(
      page.getByRole("link", { name: /Aggregate CSV/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Per-member CSV/ }),
    ).toBeVisible();

    // ── Resend the summary email — an honest status surfaces either way ──
    await page.getByRole("button", { name: /Resend summary email/ }).click();
    await expect(page.getByText(/recipient/i)).toBeVisible({ timeout: 15_000 });
  });

  test("owner with no batches sees the empty state", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("prep-empty-owner");
    await providerTeam.createProvider(owner, { name: "Empty Kitchen" });

    await signIn(page, owner.email, owner.password);
    await page.goto("/provider/preparation");

    await expect(page.getByText("No preparation batches yet")).toBeVisible();
  });

  test("a non-owner customer cannot reach the owner preparation page", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("prep-gate-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Gate Kitchen",
    });
    const { batchId } = await providerTeam.seedBatch(owner, providerId);

    const outsider = await providerTeam.createUser("prep-outsider");
    await providerTeam.addCustomer(providerId, outsider, "approved");
    await signIn(page, outsider.email, outsider.password);

    // The owner-app shell bounces a non-owner off /provider/* to the workspace chooser;
    // they never see the batch roster.
    await page.goto(`/provider/preparation/${batchId}`);
    await page.waitForURL((url) => !url.pathname.startsWith("/provider/"), {
      timeout: 15_000,
    });
    await expect(
      page.getByRole("heading", { name: /^Preparation —/ }),
    ).toHaveCount(0);
  });
});
