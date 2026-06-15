import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures/provider";
import { signInWithPassword } from "../helpers/auth";

/**
 * Owner preparation PRINT page (MP-B-051, UC-BATCH-005; spec §17 / ADR-14). The web
 * counterpart of the mobile MP-C-051 share. A real, post-cutoff batch is built via the
 * live `process_provider_cutoff` RPC over service-role-seeded responses (the shared
 * `seedBatch` fixture); the owner opens the server-rendered print view and reads the
 * roster — rendered WITHOUT the owner-app nav chrome and with a Print control that is
 * hidden in print media. Asserts the owner-only gate (a non-owner is existence-hidden).
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

test.describe("Provider preparation print page (MP-B-051)", () => {
  test("owner opens the chrome-free print view and reads the roster", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("print-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Print Kitchen",
    });
    const { batchId } = await providerTeam.seedBatch(owner, providerId);

    await signIn(page, owner.email, owner.password);

    // The detail page exposes the Print affordance...
    await page.goto(`/provider/preparation/${batchId}`);
    await expect(
      page.getByRole("link", { name: "Print", exact: true }),
    ).toBeVisible();

    // ...and the print page itself renders the document.
    await page.goto(`/provider/preparation/${batchId}/print`);
    await expect(
      page.getByRole("heading", { name: "Print Kitchen" }),
    ).toBeVisible();
    await expect(page.getByText(/Preparation roster —/)).toBeVisible();
    await expect(page.getByText("Cutoff census")).toBeVisible();
    await expect(page.getByText("Aggregate roster")).toBeVisible();
    await expect(page.getByText("Per-member breakdown")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Print", exact: true }),
    ).toBeVisible();

    // No owner-app nav chrome on the print page (it lives outside the owner shell).
    await expect(page.getByRole("link", { name: "Dashboard" })).toHaveCount(0);
  });

  test("a non-owner customer cannot reach the print page", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("print-gate-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Gate Print Kitchen",
    });
    const { batchId } = await providerTeam.seedBatch(owner, providerId);

    const outsider = await providerTeam.createUser("print-outsider");
    await providerTeam.addCustomer(providerId, outsider, "approved");
    await signIn(page, outsider.email, outsider.password);

    // The batch is owner-private — a non-owner is existence-hidden (404), so the roster
    // never renders.
    await page.goto(`/provider/preparation/${batchId}/print`);
    await expect(page.getByText(/Preparation roster —/)).toHaveCount(0);
  });
});
