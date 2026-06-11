import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures/auth";
import { signInWithPassword } from "../helpers/auth";
import { completeMinimumOnboarding, finishEdit } from "../helpers/onboarding";

/**
 * ONBOARD — routing for a new user, minimum completion, autosave/resume,
 * back-edit, optional-skip, required validation, and post-onboarding edits.
 * Mutating flows use a per-test freshUser / onboardedHousehold so each run is
 * clean and torn down.
 */

async function fillBasics(page: Page, name: string, familySize: string) {
  await page.getByLabel("Household name").fill(name);
  await page.getByLabel("Family size").fill(familySize);
}

async function clickNext(page: Page) {
  await page.getByRole("button", { name: "Next", exact: true }).click();
}

/** Click Next and wait for the per-step draft autosave (PUT) to complete, so a
 * following reload / cookie-clear can't race the persistence. */
async function nextSavingDraft(page: Page) {
  const saved = page.waitForResponse(
    (r) =>
      r.url().includes("/api/onboarding/draft") &&
      r.request().method() === "PUT",
    { timeout: 15_000 },
  );
  await clickNext(page);
  await saved;
}

test("ONBOARD-001: new signed-in user is prompted to set up a household", async ({
  page,
  freshUser,
}) => {
  await signInWithPassword(page, freshUser.email, freshUser.password);
  await page.waitForURL("**/onboarding", { timeout: 30_000 });
  await expect(page.getByLabel("Household name")).toBeVisible();
});

test("ONBOARD-002: user can complete minimum onboarding and generate a first suggestion", async ({
  page,
  freshUser,
}) => {
  await signInWithPassword(page, freshUser.email, freshUser.password);
  await page.waitForURL("**/onboarding", { timeout: 30_000 });

  await completeMinimumOnboarding(page, {
    householdName: "E2E Fresh Household",
  });
  await expect(page).toHaveURL(/\/today(\?|$|\/)/);

  await page
    .getByRole("button", { name: /suggest a meal/i })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Approve" }).first(),
  ).toBeVisible({ timeout: 20_000 });
});

test("ONBOARD-003: onboarding autosaves and restores after refresh", async ({
  page,
  freshUser,
}) => {
  await signInWithPassword(page, freshUser.email, freshUser.password);
  await page.waitForURL("**/onboarding", { timeout: 30_000 });

  await fillBasics(page, "Autosave House", "3");
  await nextSavingDraft(page); // advance + wait for the autosave to persist

  await page.reload();

  // An in-progress draft surfaces the resume prompt with completion %.
  await expect(
    page.getByRole("heading", { name: /continue setting up/i }),
  ).toBeVisible();
  await expect(page.getByText(/% done/i)).toBeVisible();

  await page.getByRole("button", { name: "Resume" }).click();
  // Back to the first step and confirm the value persisted.
  const back = page.getByRole("button", { name: "Back" });
  if (await back.isEnabled().catch(() => false)) await back.click();
  await expect(page.getByLabel("Household name")).toHaveValue("Autosave House");
});

test("ONBOARD-004: user can resume onboarding after closing the app", async ({
  page,
  freshUser,
}) => {
  await signInWithPassword(page, freshUser.email, freshUser.password);
  await page.waitForURL("**/onboarding", { timeout: 30_000 });
  await fillBasics(page, "Resume House", "5");
  await nextSavingDraft(page);

  // Simulate close/reopen: drop the session, then sign back in.
  await page.context().clearCookies();
  await signInWithPassword(page, freshUser.email, freshUser.password);
  await page.waitForURL("**/onboarding", { timeout: 30_000 });

  await expect(
    page.getByRole("heading", { name: /continue setting up/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  const back = page.getByRole("button", { name: "Back" });
  if (await back.isEnabled().catch(() => false)) await back.click();
  await expect(page.getByLabel("Household name")).toHaveValue("Resume House");
});

test("ONBOARD-005: user can go back and edit earlier answers", async ({
  page,
  freshUser,
}) => {
  await signInWithPassword(page, freshUser.email, freshUser.password);
  await page.waitForURL("**/onboarding", { timeout: 30_000 });

  await fillBasics(page, "Back-Edit House", "4");
  await clickNext(page);
  // Now on food preferences — go back and change the family size.
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByLabel("Family size")).toHaveValue("4");
  await page.getByLabel("Family size").fill("6");
  await clickNext(page);
  // It advanced again (no duplicate draft / no block). Diet is a multi-select
  // chip set (OptionChips → role=button), so the Vegetarian option is a button.
  await expect(
    page.getByRole("button", { name: "Vegetarian", exact: true }),
  ).toBeVisible();
});

test("ONBOARD-006: optional sections can be left empty and onboarding still completes", async ({
  page,
  freshUser,
}) => {
  await signInWithPassword(page, freshUser.email, freshUser.password);
  await page.waitForURL("**/onboarding", { timeout: 30_000 });
  // completeMinimumOnboarding fills only required fields, advancing past the
  // optional sections (allergies, budget, preferred dishes) without input.
  await completeMinimumOnboarding(page, { householdName: "Minimal House" });
  await expect(page).toHaveURL(/\/today(\?|$|\/)/);
});

test("ONBOARD-007: required-field validation blocks advancing", async ({
  page,
  freshUser,
}) => {
  await signInWithPassword(page, freshUser.email, freshUser.password);
  await page.waitForURL("**/onboarding", { timeout: 30_000 });

  // Name only, no family size → Next should not advance, and an error shows.
  await page.getByLabel("Household name").fill("Validation House");
  await clickNext(page);
  await expect(page.getByText(/enter your family size/i)).toBeVisible();
  await expect(page.getByLabel("Family size")).toBeVisible(); // still on step 1

  // Provide it, advance to food preferences, then leave diet empty.
  await page.getByLabel("Family size").fill("4");
  await clickNext(page);
  await clickNext(page); // try to advance food prefs with nothing chosen
  await expect(page.getByText(/choose a diet type/i)).toBeVisible();
});

test("ONBOARD-008: preferences can be edited after onboarding and persist", async ({
  page,
  onboardedHousehold,
}) => {
  await page.goto("/onboarding"); // owner with a household → edit mode
  await expect(page.getByLabel("Family size")).toBeVisible();
  await page.getByLabel("Family size").fill("7");
  await finishEdit(page);

  // Re-open the editor and confirm the new value round-tripped.
  await page.goto("/onboarding");
  await expect(page.getByLabel("Family size")).toHaveValue("7");
  expect(onboardedHousehold.householdId).toBeTruthy();
});

test("ONBOARD-009: editing preferences does not remove household members", async ({
  page,
  team,
}) => {
  const owner = await team.createUser("owner");
  const householdId = await team.onboardOwner(page, owner);
  const member = await team.createUser("member");
  await team.addMember(householdId, member, "member");

  // Owner edits a preference and saves.
  await page.goto("/onboarding");
  await page.getByLabel("Family size").fill("5");
  await finishEdit(page);

  // The member is still an active member (membership untouched).
  const { count, error } = await team.admin
    .from("household_members")
    .select("id", { count: "exact", head: true })
    .eq("household_id", householdId)
    .eq("status", "active");
  expect(error).toBeNull();
  expect(count).toBe(2);
});

// ONBOARD-010 needs to inject a transient save (API) failure then recovery.
// There's no built-in fault-injection hook; deferred (would need request routing
// to fail /api/onboarding/draft once).
test.fixme("ONBOARD-010: save failure is visible and recoverable (needs API fault injection)", async () => {});
