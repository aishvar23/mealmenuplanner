import { expect, type Page } from "@playwright/test";

/** Dish-name patterns for diet hard-filter assertions. */
export const MEAT_OR_EGG =
  /\b(chicken|mutton|fish|prawn|shrimp|beef|pork|lamb|keema|egg|omelette|shakshuka)\b/i;
export const LAND_SEA_MEAT =
  /\b(chicken|mutton|fish|prawn|shrimp|beef|pork|lamb|keema)\b/i;

/**
 * Generate a suggestion for the featured slot on /today (no-op if one already
 * exists), then wait until it's a real, re-rollable suggestion.
 */
export async function generateFeatured(page: Page): Promise<void> {
  const suggest = page.getByRole("button", { name: /suggest a meal/i }).first();
  if (await suggest.isVisible().catch(() => false)) {
    await suggest.click();
  }
  await expect(
    page.getByRole("button", { name: "Try another" }).first(),
  ).toBeVisible({ timeout: 20_000 });
}

/** The featured slot's current dish title (the level-2 hero heading). */
export async function featuredTitle(page: Page): Promise<string> {
  const h2 = page.getByRole("heading", { level: 2 }).first();
  await expect(h2).toBeVisible();
  return (await h2.textContent())?.trim() ?? "";
}

/** Click "Try another" and wait for the re-suggestion to settle. */
export async function tryAnother(page: Page): Promise<void> {
  const btn = page.getByRole("button", { name: "Try another" }).first();
  await btn.click();
  await expect(btn).toBeEnabled({ timeout: 20_000 });
}
