import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures/auth";

/**
 * GROCERY — generating a list from a weekly plan, de-duped items, and persistent
 * check-off. Each test seeds its own plan via a fresh onboarded household.
 */

async function generateWeekThenGrocery(page: Page): Promise<void> {
  await page.goto("/plan");
  await page.getByRole("button", { name: /generate week/i }).click();
  await expect(page.getByRole("button", { name: "Swap" }).first()).toBeVisible({
    timeout: 30_000,
  });

  await page.goto("/grocery");
  await page
    .getByRole("button", { name: /generate grocery list|regenerate/i })
    .click();
  // Items render as check-off rows labelled "Mark <item> as bought". They are
  // disabled while the list is (re)generating — wait until interactive.
  await expect(
    page.getByRole("checkbox", { name: /mark .* as bought/i }).first(),
  ).toBeEnabled({ timeout: 30_000 });
}

test("GROCERY-001: a weekly plan generates a categorized grocery list", async ({
  page,
  onboardedHousehold,
}) => {
  expect(onboardedHousehold.householdId).toBeTruthy();
  await generateWeekThenGrocery(page);
  const items = page.getByRole("checkbox", { name: /mark .* as bought/i });
  expect(await items.count()).toBeGreaterThan(0);
  // Grouped under category headings.
  expect(await page.getByRole("heading").count()).toBeGreaterThan(0);
});

test("GROCERY-002: duplicate ingredients are merged into one line", async ({
  page,
  onboardedHousehold,
}) => {
  expect(onboardedHousehold.householdId).toBeTruthy();
  await generateWeekThenGrocery(page);

  const labels = await page
    .getByRole("checkbox", { name: /mark .* as bought/i })
    .evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute("aria-label") ?? ""),
    );
  // Each ingredient appears exactly once (quantities are summed, not duplicated).
  const unique = new Set(labels);
  expect(unique.size).toBe(labels.length);
});

test("GROCERY-003: a checked-off item stays checked after refresh", async ({
  page,
  onboardedHousehold,
}) => {
  expect(onboardedHousehold.householdId).toBeTruthy();
  await generateWeekThenGrocery(page);

  // Switch to the "All" filter so a checked item stays visible (the default
  // "Remaining" filter hides it once bought, which would shift `.first()`).
  await page.getByRole("button", { name: "All", exact: true }).click();

  const target = page
    .getByRole("checkbox", { name: /mark .* as bought/i })
    .first();
  await expect(target).toBeEnabled({ timeout: 15_000 });
  const label = (await target.getAttribute("aria-label")) ?? undefined;
  const byLabel = page.getByRole("checkbox", { name: label, exact: true });

  // The checkbox is sr-only and React-controlled (reverts until the PATCH
  // resolves), so click + poll for the persisted state rather than check().
  await byLabel.click({ force: true });
  await expect(byLabel).toBeChecked({ timeout: 15_000 });

  await page.reload();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: label, exact: true }),
  ).toBeChecked({ timeout: 15_000 });
});

// GROCERY-004 (meal replacement updates the list) needs to correlate specific
// dish ingredients before/after a swap; deterministic correlation isn't
// observable from the list UI alone. Deferred.
test.fixme("GROCERY-004: meal replacement updates the grocery list (needs ingredient correlation)", async () => {});
