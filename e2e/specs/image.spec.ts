import { expect, test } from "../fixtures/auth";
import { generateFeatured } from "../helpers/today";

/**
 * IMAGE — dish/ingredient imagery (global criterion 11). The verifiable baseline
 * is that rendered dish images always carry alt text (a real description, or the
 * safe "image unavailable" fallback for placeholders). Cases needing seeded
 * broken/missing image statuses or LCP-warning inspection are fixmes.
 */

test("IMAGE-001: a generated meal renders a dish image with alt text", async ({
  page,
  onboardedHousehold,
}) => {
  expect(onboardedHousehold.householdId).toBeTruthy();
  await page.goto("/today");
  await generateFeatured(page);

  // The featured card's image has non-empty alt text (described dish or the
  // neutral "Dish image unavailable" placeholder).
  const img = page.locator("img[alt]").first();
  await expect(img).toBeAttached();
  const alt = (await img.getAttribute("alt")) ?? "";
  expect(alt.trim().length).toBeGreaterThan(0);
});

test.fixme("IMAGE-002: ingredient images display where ingredients are shown (needs ingredient image assertions)", async () => {});
test.fixme("IMAGE-003: dish image matches the selected dish (can't force a specific dish via UI)", async () => {});
test.fixme("IMAGE-004: broken image has a safe fallback (needs a seeded image_status=broken dish)", async () => {});
test.fixme("IMAGE-005: meal-package image is representative (can't force a specific dish via UI)", async () => {});
test.fixme("IMAGE-006: admin image-metadata update reflects in user UI (see ADMIN image tests)", async () => {});
test.fixme("IMAGE-007: above-the-fold placeholder emits no LCP warning (needs console/perf inspection)", async () => {});
