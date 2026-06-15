import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures/provider";
import { signInWithPassword } from "../helpers/auth";

/**
 * Owner dashboard (MP-B-060, spec §13.2). The web counterpart of the mobile MP-C-060
 * screen. Covers the three states the day-at-a-glance composes: a post-cutoff day with a
 * real batch (census + email status), a pre-cutoff published day (live countdown, counts
 * not yet aggregated), and no menu today. Asserts the owner-only gate too — a customer
 * is bounced off the owner workspace and never sees the dashboard.
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

test.describe("Provider dashboard (MP-B-060)", () => {
  test("post-cutoff day shows the menu state + response census + preparation link", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("dash-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Dashboard Kitchen",
    });
    await providerTeam.seedBatch(owner, providerId);

    await signIn(page, owner.email, owner.password);
    await page.goto("/provider/dashboard");

    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
    await expect(page.getByText("Today's menu")).toBeVisible();
    // seedBatch seeds a past-cutoff day, so the countdown reads as passed.
    await expect(page.getByText("Cutoff passed")).toBeVisible();
    // The census from the generated batch.
    await expect(page.getByText("Confirmed")).toBeVisible();
    await expect(page.getByText("Auto-accepted")).toBeVisible();
    // The link into the day's roster.
    await expect(
      page.getByRole("link", { name: /View preparation/ }),
    ).toBeVisible();
  });

  test("pre-cutoff published day shows a live countdown and no counts yet", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("dash-open-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Open Kitchen",
    });
    // A published day whose cutoff is hours away — responses still open, no batch yet.
    await providerTeam.seedMenuDay(providerId, owner, {
      status: "published",
      cutoffHoursFromNow: 8,
    });

    await signIn(page, owner.email, owner.password);
    await page.goto("/provider/dashboard");

    await expect(page.getByText("Today's menu")).toBeVisible();
    await expect(page.getByText("Published")).toBeVisible();
    await expect(page.getByText(/until cutoff/)).toBeVisible();
    await expect(
      page.getByText(/Response counts appear once the cutoff has passed/),
    ).toBeVisible();
  });

  test("an owner with no menu today sees the no-menu state", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("dash-empty-owner");
    await providerTeam.createProvider(owner, { name: "Quiet Kitchen" });

    await signIn(page, owner.email, owner.password);
    await page.goto("/provider/dashboard");

    await expect(
      page.getByText("No menu is published for today."),
    ).toBeVisible();
  });

  test("a non-owner customer cannot reach the owner dashboard", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("dash-gate-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Gated Kitchen",
    });

    const outsider = await providerTeam.createUser("dash-outsider");
    await providerTeam.addCustomer(providerId, outsider, "approved");
    await signIn(page, outsider.email, outsider.password);

    // The owner-app shell bounces a non-owner off /provider/* to the workspace chooser.
    await page.goto("/provider/dashboard");
    await page.waitForURL((url) => !url.pathname.startsWith("/provider/"), {
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: "Dashboard" })).toHaveCount(
      0,
    );
  });
});
