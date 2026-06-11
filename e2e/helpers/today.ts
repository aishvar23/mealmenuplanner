import { expect, type Locator, type Page } from "@playwright/test";

/** Dish-name patterns for diet hard-filter assertions. */
export const MEAT_OR_EGG =
  /\b(chicken|mutton|fish|prawn|shrimp|beef|pork|lamb|keema|egg|omelette|shakshuka)\b/i;
export const LAND_SEA_MEAT =
  /\b(chicken|mutton|fish|prawn|shrimp|beef|pork|lamb|keema)\b/i;

/**
 * Ensure the featured slot on /today holds a suggestion. The Today page
 * auto-prefills empty planned slots on load, so a dish is usually already there;
 * if the slot is still empty (prefill no-op) click "Suggest a meal". Ready when
 * the slot's "Try another" action is present (a dished, changeable slot).
 */
export async function generateFeatured(page: Page): Promise<void> {
  const suggest = page.getByRole("button", { name: /suggest a meal/i }).first();
  if (await suggest.isVisible().catch(() => false)) {
    await suggest.click();
  }
  await expect(
    page.getByRole("button", { name: "Try another" }).first(),
  ).toBeVisible({ timeout: 30_000 });
}

/** The featured slot's current dish title (the level-2 hero heading). */
export async function featuredTitle(page: Page): Promise<string> {
  const h2 = page.getByRole("heading", { level: 2 }).first();
  await expect(h2).toBeVisible();
  return (await h2.textContent())?.trim() ?? "";
}

/** Raw text of the hero h2 without asserting visibility (for polling). */
export async function heroText(page: Page): Promise<string> {
  return (
    (
      await page.getByRole("heading", { level: 2 }).first().textContent()
    )?.trim() ?? ""
  );
}

/**
 * Open the slot-replacement picker from the featured slot's "Try another"
 * (BUG-022/023 replaced the old auto-cycling re-roll with this single-select
 * modal). Returns the picker dialog locator with candidates loaded.
 */
export async function openReplacePicker(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Try another" }).first().click();
  const dialog = page.getByRole("dialog", { name: /choose a dish for/i });
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  // Wait out the candidate fetch so we read dishes, not the loading state.
  await expect(dialog.getByText("Loading dishes…")).toBeHidden({
    timeout: 20_000,
  });
  return dialog;
}

/** The dish labels of every candidate in the open replacement picker. */
export async function pickerCandidateNames(dialog: Locator): Promise<string[]> {
  // Candidate cards are the only `aria-pressed` buttons; the goal filter uses
  // role=radio and the Cancel/Replace/close actions carry no pressed state.
  const candidates = dialog.locator("button[aria-pressed]");
  await candidates.first().waitFor({ state: "visible", timeout: 20_000 });
  return candidates.allInnerTexts();
}
