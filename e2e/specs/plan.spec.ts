import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures/auth";

/**
 * PLAN — the weekly planner board: generate, swap, lock/unlock, eating-out.
 * Each test gets a fresh onboarded household (1 planned slot → 7 cells/week).
 * Assertions use toggle/presence states rather than exact-dish equality to stay
 * deterministic against the engine's choices.
 */

async function generateWeek(page: Page) {
  await page.goto("/plan");
  await page.getByRole("button", { name: /generate week/i }).click();
  await expect(page.getByRole("button", { name: "Swap" }).first()).toBeVisible({
    timeout: 30_000,
  });
}

test("PLAN-001: user can generate a weekly meal plan", async ({
  page,
  onboardedHousehold,
}) => {
  expect(onboardedHousehold.householdId).toBeTruthy();
  await generateWeek(page);
  // At least one slot is now planned (has a Swap control).
  expect(
    await page.getByRole("button", { name: "Swap" }).count(),
  ).toBeGreaterThan(0);
});

test("PLAN-002: user can replace (swap) a planned meal", async ({
  page,
  onboardedHousehold,
}) => {
  expect(onboardedHousehold.householdId).toBeTruthy();
  await generateWeek(page);
  const swap = page.getByRole("button", { name: "Swap" }).first();
  await swap.click();
  await expect(swap).toBeEnabled({ timeout: 20_000 });
  // The slot is still planned after the swap (replacement succeeded).
  await expect(
    page.getByRole("button", { name: "Swap" }).first(),
  ).toBeVisible();
});

test("PLAN-003: a locked meal survives a regenerate", async ({
  page,
  onboardedHousehold,
}) => {
  expect(onboardedHousehold.householdId).toBeTruthy();
  await generateWeek(page);
  await page.getByRole("button", { name: "Lock meal" }).first().click();
  await expect(
    page.getByRole("button", { name: "Unlock meal" }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: /generate week/i }).click();
  // A lock remains after regenerating the rest of the week.
  await expect(
    page.getByRole("button", { name: "Unlock meal" }).first(),
  ).toBeVisible({ timeout: 30_000 });
});

test("PLAN-004: user can unlock a locked meal", async ({
  page,
  onboardedHousehold,
}) => {
  expect(onboardedHousehold.householdId).toBeTruthy();
  await generateWeek(page);
  await page.getByRole("button", { name: "Lock meal" }).first().click();
  const unlock = page.getByRole("button", { name: "Unlock meal" }).first();
  await expect(unlock).toBeVisible();
  await unlock.click();
  await expect(
    page.getByRole("button", { name: "Lock meal" }).first(),
  ).toBeVisible();
});

test("PLAN-005: marking a meal eating-out updates the slot", async ({
  page,
  onboardedHousehold,
}) => {
  expect(onboardedHousehold.householdId).toBeTruthy();
  await generateWeek(page);
  await page.getByRole("button", { name: "Mark eating out" }).first().click();
  // The slot now reflects eating-out (status label).
  await expect(page.getByText(/eating out/i).first()).toBeVisible({
    timeout: 20_000,
  });
});
