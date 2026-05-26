import { expect, test } from "@playwright/test";

import {
  ADMIN_STORAGE_STATE,
  OWNER_STORAGE_STATE,
} from "../fixtures/constants";

/**
 * ADMIN — operator-console access and gating. The catalog-mutation cases
 * (creating dishes, pairings, prep tasks, image metadata, side-role validation)
 * write to the SHARED dish catalog, which would pollute the recommendations the
 * other specs rely on; they belong in an isolated content environment and are
 * represented as fixmes here.
 */

test.describe("as admin", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE });

  test("ADMIN: an operator can open the console and dish catalog", async ({
    page,
  }) => {
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: /operator console/i }),
    ).toBeVisible();

    await page.goto("/admin/dishes");
    await expect(
      page.getByRole("heading", { name: "Dishes", exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /new dish/i })).toBeVisible();
  });
});

test.describe("as non-admin", () => {
  test.use({ storageState: OWNER_STORAGE_STATE });

  test("ADMIN gating: a non-operator is redirected away from /admin", async ({
    page,
  }) => {
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin(\?|$|\/)/);
  });
});

// Catalog mutations pollute the shared recommendation catalog; defer to an
// isolated content env. (Image-metadata + side-role validation, ADMIN/IMAGE-006,
// MEALCOMP-010 fall here too.)
test.fixme("ADMIN-001: add a dish with image metadata (writes shared catalog)", async () => {});
test.fixme("ADMIN-002: mark a dish as a side (writes shared catalog)", async () => {});
test.fixme("ADMIN-003: create a dish pairing (writes shared catalog)", async () => {});
test.fixme("ADMIN-004: add a prep task (writes shared catalog)", async () => {});
test.fixme("ADMIN-005: cannot activate a dish missing required metadata (writes shared catalog)", async () => {});
