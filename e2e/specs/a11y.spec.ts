import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "../fixtures/auth";
import { OWNER_STORAGE_STATE } from "../fixtures/constants";
import { signInWithPassword } from "../helpers/auth";

/**
 * A11Y — keyboard reachability, accessible names on cards/controls, and
 * accessible form errors. Axe scans are scoped to the name/label/role rules the
 * acceptance criteria call out (rather than full WCAG) so the checks are stable
 * and targeted.
 */

const NAME_RULES = [
  "image-alt",
  "button-name",
  "link-name",
  "label",
  "aria-required-attr",
  "aria-roles",
];

test.describe("authenticated", () => {
  test.use({ storageState: OWNER_STORAGE_STATE });

  test("A11Y-001: Today is keyboard reachable", async ({ page }) => {
    await page.goto("/today");
    await page.keyboard.press("Tab");
    const tag = await page.evaluate(
      () => document.activeElement?.tagName ?? "",
    );
    expect(["A", "BUTTON", "INPUT", "SELECT"]).toContain(tag);
  });

  test("A11Y-002: dish cards, images, and controls have accessible names", async ({
    page,
  }) => {
    await page.goto("/today");
    const results = await new AxeBuilder({ page })
      .include("main")
      .withRules(NAME_RULES)
      .analyze();
    expect(
      results.violations,
      JSON.stringify(results.violations.map((v) => v.id)),
    ).toEqual([]);
  });
});

test("A11Y-003: onboarding form errors are exposed accessibly", async ({
  page,
  freshUser,
}) => {
  await signInWithPassword(page, freshUser.email, freshUser.password);
  await page.waitForURL("**/onboarding", { timeout: 30_000 });
  // Trigger required-field validation (name only, no family size).
  await page.getByLabel("Household name").fill("A11y House");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
});
