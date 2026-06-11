import { expect, type Locator, type Page } from "@playwright/test";

import { DEFAULT_ONBOARDING } from "../fixtures/constants";

type OnboardingAnswers = {
  householdName: string;
  familySize?: number;
  diet?: string;
  cuisine?: string;
  mealSlot?: string;
  weekdayMinutes?: number;
};

async function fillIfVisible(locator: Locator, value: string): Promise<void> {
  if (await locator.isVisible().catch(() => false)) {
    await locator.fill(value);
  }
}

async function clickIfVisible(locator: Locator): Promise<void> {
  if (await locator.isVisible().catch(() => false)) {
    await locator.click();
  }
}

/**
 * Drive the onboarding wizard through the minimum required set and finish,
 * landing on `/today`. Assumes the caller is already on `/onboarding` in create
 * mode (a user with no household).
 *
 * The wizard mounts only the current step's controls and keeps step state in
 * memory (no per-step URL), so we walk it with a "fill whatever required field is
 * present, then Next" loop and detect each transition by the step heading (h2)
 * changing — robust to the exact step order and to optional steps in between.
 */
export async function completeMinimumOnboarding(
  page: Page,
  answers: OnboardingAnswers,
): Promise<void> {
  const cfg = { ...DEFAULT_ONBOARDING, ...answers };

  // If a prior in-progress draft surfaced the resume prompt, start fresh.
  const startOver = page.getByRole("button", { name: "Start over" });
  if (await startOver.isVisible().catch(() => false)) {
    await startOver.click();
  }

  const heading = page.getByRole("heading", { level: 2 });

  for (let step = 0; step < 10; step++) {
    // Only the current step's controls exist, so these no-op on other steps.
    await fillIfVisible(
      page.getByLabel("Household name"),
      answers.householdName,
    );
    await fillIfVisible(page.getByLabel("Family size"), String(cfg.familySize));
    // Diet is a multi-select chip set (food-preferences step's `OptionChips`,
    // which renders role=button + aria-pressed), NOT a radio group — selecting it
    // as a `radio` silently no-ops and the required field blocks "Next". Target
    // the diet pill by its button role, like the cuisine/meal-slot chips below.
    await clickIfVisible(
      page.getByRole("button", { name: cfg.diet, exact: true }),
    );
    await clickIfVisible(
      page.getByRole("button", { name: cfg.cuisine, exact: true }),
    );
    await clickIfVisible(
      page.getByRole("button", { name: cfg.mealSlot, exact: true }),
    );
    await fillIfVisible(
      page.getByLabel("Weekday cooking time"),
      String(cfg.weekdayMinutes),
    );

    const finish = page.getByRole("button", { name: "Finish setup" });
    if (await finish.isVisible().catch(() => false)) {
      await finish.click();
      await page.waitForURL("**/today", { timeout: 30_000 });
      return;
    }

    const before =
      (await heading
        .first()
        .textContent()
        .catch(() => null)) ?? "";
    await page.getByRole("button", { name: "Next", exact: true }).click();
    // The step changes client-side; wait for the heading to actually update so
    // we don't re-run on a step that rejected Next (missing required field).
    await expect
      .poll(
        async () =>
          (await heading
            .first()
            .textContent()
            .catch(() => null)) ?? "",
        { timeout: 10_000 },
      )
      .not.toBe(before);
  }

  throw new Error(
    "E2E: onboarding never reached the review step (10-step cap).",
  );
}

/**
 * In onboarding EDIT mode (an existing household at /onboarding), advance through
 * the edit steps and click "Save changes", landing on the preferences summary
 * (/preferences) where the saved values are re-read server-side.
 */
export async function finishEdit(page: Page): Promise<void> {
  const heading = page.getByRole("heading", { level: 2 });
  for (let step = 0; step < 8; step++) {
    const save = page.getByRole("button", { name: "Save changes" });
    if (await save.isVisible().catch(() => false)) {
      await save.click();
      await page.waitForURL("**/preferences", { timeout: 30_000 });
      return;
    }
    const before =
      (await heading
        .first()
        .textContent()
        .catch(() => null)) ?? "";
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect
      .poll(
        async () =>
          (await heading
            .first()
            .textContent()
            .catch(() => null)) ?? "",
        { timeout: 10_000 },
      )
      .not.toBe(before);
  }
  throw new Error("E2E: edit flow never reached 'Save changes' (8-step cap).");
}
