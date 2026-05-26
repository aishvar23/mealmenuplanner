import { expect, test } from "@playwright/test";

import { OWNER_STORAGE_STATE } from "../fixtures/constants";

const MEAT = /\b(chicken|mutton|fish|prawn|shrimp|egg|beef|pork|lamb|meat)\b/i;

/**
 * Today happy path + RECO-001 — as the seeded VEGETARIAN owner household, a
 * suggestion can be generated for the featured slot, it renders with its
 * recommendation reason (an approvable/re-rollable suggestion), and it is never
 * a meat dish (the engine's hard diet filter). Reuses the owner's captured
 * session, so no sign-in step here.
 */
test.use({ storageState: OWNER_STORAGE_STATE });

test("TODAY/RECO-001: vegetarian household gets an explainable, meat-free suggestion", async ({
  page,
}) => {
  await page.goto("/today");

  // First visit of the day shows the generate CTA; a rerun may already have a
  // suggestion in the slot. Generate only if needed.
  const suggest = page.getByRole("button", { name: /suggest a meal/i }).first();
  if (await suggest.isVisible().catch(() => false)) {
    await suggest.click();
  }

  // A real suggestion is present (it can be approved / re-rolled) — these only
  // render once the engine returned a dish with a human-readable reason.
  await expect(
    page.getByRole("button", { name: "Try another" }).first(),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByRole("button", { name: "Approve" }).first(),
  ).toBeVisible();

  // The featured dish title: a real dish (not the "Plan dinner" placeholder) and,
  // for a vegetarian household, never a meat dish.
  const dishTitle = page.getByRole("heading", { level: 2 }).first();
  await expect(dishTitle).toBeVisible();
  const name = (await dishTitle.textContent())?.trim() ?? "";
  expect(name.length).toBeGreaterThan(0);
  expect(name).not.toMatch(/^plan /i);
  expect(name).not.toMatch(MEAT);
});
