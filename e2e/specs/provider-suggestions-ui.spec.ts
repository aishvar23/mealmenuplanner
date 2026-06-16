import { expect, test } from "../fixtures/provider";
import { signInWithPassword } from "../helpers/auth";

/**
 * Provider meal-suggestion UI (MP-A-131, UC-SUGGEST-001..003) — the user-facing flow on
 * top of the API the `provider-suggestions.spec.ts` already proves at the route level.
 *
 * A member opens Today's Menu, files a free-text suggestion through the real form, and sees
 * it land as "Pending review"; the owner then opens the Weekly Menu, expands the day's
 * triage, accepts it as an option with a note, and watches the status flip. Both interact
 * through the live `/api/*` routes (the server derives the author/provider, rate-limits, and
 * gates resolution to the owner). The menu day is seeded service-role (`seedMenuDay`).
 */

async function signIn(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
): Promise<void> {
  await signInWithPassword(page, email, password);
  await page.waitForURL((url) => !url.pathname.includes("/sign-in"), {
    timeout: 30_000,
  });
}

test.describe("Provider suggestion UI (MP-A-131)", () => {
  test("a member files a suggestion on Today's Menu; the owner accepts it from the Weekly Menu", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("sugg-ui-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Suggestion UI Kitchen",
    });
    const customer = await providerTeam.createUser("sugg-ui-cust");
    await providerTeam.addCustomer(providerId, customer, "approved");
    await providerTeam.seedMenuDay(providerId, owner, {
      cutoffHoursFromNow: 8,
    });

    const suggestionText = "Please add a millet roti option for today";

    // ── Member files a suggestion through the Today's Menu form ──
    await signIn(page, customer.email, customer.password);
    await page.goto(`/providers/${providerId}/today`);
    await expect(
      page.getByRole("heading", { name: "Today’s menu" }),
    ).toBeVisible({ timeout: 30_000 });

    await expect(
      page.getByRole("heading", { name: "Suggest a change" }),
    ).toBeVisible();
    await page
      .getByPlaceholder("e.g. Could you add a millet roti option?")
      .fill(suggestionText);
    await page.getByRole("button", { name: /Send suggestion/ }).click();

    // It lands: a confirmation, the text in "Your suggestions", and a Pending badge.
    await expect(page.getByText("Suggestion sent. Thanks!")).toBeVisible({
      timeout: 15_000,
    });
    const memberList = page.getByTestId("member-suggestion-list");
    await expect(memberList.getByText(suggestionText)).toBeVisible();
    await expect(memberList.getByText("Pending review")).toBeVisible();

    // ── Owner accepts it from the Weekly Menu triage ──
    await signIn(page, owner.email, owner.password);
    await page.goto("/provider/menu");
    await expect(
      page.getByRole("heading", { name: "Weekly menu" }),
    ).toBeVisible({ timeout: 30_000 });

    // Expand the day's triage (lazy-loads the suggestions) and resolve.
    await page.getByRole("button", { name: "Member suggestions" }).click();
    const panel = page.getByTestId("owner-suggestion-panel");
    await expect(panel.getByText(suggestionText)).toBeVisible({
      timeout: 15_000,
    });
    await panel
      .getByPlaceholder("Optional note back to the member")
      .fill("Great idea — adding it next week.");
    await panel.getByRole("button", { name: "Accept as option" }).click();

    // The row flips to accepted (status + the owner note now read-only).
    await expect(panel.getByText("Accepted as an option")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      panel.getByText("Great idea — adding it next week."),
    ).toBeVisible();
  });

  test("a member sees their own suggestion's status but the owner's note too", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("sugg-ui-owner2");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Suggestion UI Kitchen 2",
    });
    const customer = await providerTeam.createUser("sugg-ui-cust2");
    await providerTeam.addCustomer(providerId, customer, "approved");
    const { menuDayId } = await providerTeam.seedMenuDay(providerId, owner, {
      cutoffHoursFromNow: 8,
    });

    // The member files a suggestion via the API, the owner rejects it via the API…
    await signIn(page, customer.email, customer.password);
    const created = await page.request.post(
      `/api/provider-menu-days/${menuDayId}/suggestions`,
      { data: { suggestionText: "Could we get less oil?" } },
    );
    expect(created.status()).toBe(201);
    const { suggestionId } = await created.json();

    await signIn(page, owner.email, owner.password);
    const rejected = await page.request.post(
      `/api/provider-suggestions/${suggestionId}/reject`,
      { data: { providerResponse: "Sorry, not this week." } },
    );
    expect(rejected.status()).toBe(200);

    // …then the member opens Today's Menu and sees the resolved status + the note.
    await signIn(page, customer.email, customer.password);
    await page.goto(`/providers/${providerId}/today`);
    const memberList = page.getByTestId("member-suggestion-list");
    await expect(memberList.getByText("Could we get less oil?")).toBeVisible({
      timeout: 30_000,
    });
    await expect(memberList.getByText("Not added")).toBeVisible();
    await expect(memberList.getByText(/Sorry, not this week\./)).toBeVisible();
  });

  test("the owner triage recovers from a transient load failure on re-expand", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("sugg-ui-owner3");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Suggestion UI Kitchen 3",
    });
    const customer = await providerTeam.createUser("sugg-ui-cust3");
    await providerTeam.addCustomer(providerId, customer, "approved");
    const { menuDayId } = await providerTeam.seedMenuDay(providerId, owner, {
      cutoffHoursFromNow: 8,
    });

    // A member files a suggestion so the day's triage has a row to show on success.
    await signIn(page, customer.email, customer.password);
    const created = await page.request.post(
      `/api/provider-menu-days/${menuDayId}/suggestions`,
      { data: { suggestionText: "Add jeera rice please" } },
    );
    expect(created.status()).toBe(201);

    // Fail only the FIRST read of this day's suggestions; let the retry through.
    let failedOnce = false;
    await page.route(
      `**/api/provider-menu-days/${menuDayId}/suggestions`,
      async (route) => {
        if (route.request().method() === "GET" && !failedOnce) {
          failedOnce = true;
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: { message: "Temporary outage" } }),
          });
          return;
        }
        await route.continue();
      },
    );

    await signIn(page, owner.email, owner.password);
    await page.goto("/provider/menu");
    await expect(
      page.getByRole("heading", { name: "Weekly menu" }),
    ).toBeVisible({ timeout: 30_000 });

    const triageToggle = page.getByRole("button", {
      name: "Member suggestions",
    });
    const panel = page.getByTestId("owner-suggestion-panel");

    // First expand → the GET fails → the error surfaces.
    await triageToggle.click();
    await expect(panel.getByText("Temporary outage")).toBeVisible({
      timeout: 15_000,
    });

    // Collapse, then re-expand → the retry succeeds and the suggestion loads.
    await triageToggle.click();
    await triageToggle.click();
    await expect(panel.getByText("Add jeera rice please")).toBeVisible({
      timeout: 15_000,
    });
    await expect(panel.getByText("Temporary outage")).toBeHidden();
  });

  test("an optimistic create survives a slow initial GET that omits it", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("sugg-ui-owner4");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Suggestion UI Kitchen 4",
    });
    const customer = await providerTeam.createUser("sugg-ui-cust4");
    await providerTeam.addCustomer(providerId, customer, "approved");
    const { menuDayId } = await providerTeam.seedMenuDay(providerId, owner, {
      cutoffHoursFromNow: 8,
    });

    await signIn(page, customer.email, customer.password);

    // Hold the initial list read so it resolves AFTER the create, and return a STALE
    // list (empty) that omits the just-sent row — the merge must keep the optimistic
    // row rather than let the in-flight GET clobber it. The create POST is real.
    await page.route(
      `**/api/provider-menu-days/${menuDayId}/suggestions`,
      async (route) => {
        if (route.request().method() === "GET") {
          await new Promise((resolve) => setTimeout(resolve, 2_500));
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: "[]",
          });
          return;
        }
        await route.continue();
      },
    );

    const staleGet = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/provider-menu-days/${menuDayId}/suggestions`) &&
        r.request().method() === "GET",
    );

    await page.goto(`/providers/${providerId}/today`);
    await expect(
      page.getByRole("heading", { name: "Today’s menu" }),
    ).toBeVisible({ timeout: 30_000 });

    await page
      .getByPlaceholder("e.g. Could you add a millet roti option?")
      .fill("Add jeera rice please");
    await page.getByRole("button", { name: /Send suggestion/ }).click();
    await expect(page.getByText("Suggestion sent. Thanks!")).toBeVisible({
      timeout: 15_000,
    });

    const memberList = page.getByTestId("member-suggestion-list");
    await expect(memberList.getByText("Add jeera rice please")).toBeVisible();

    // Let the stale initial GET land; the optimistic row must NOT disappear.
    await staleGet;
    await expect(memberList.getByText("Add jeera rice please")).toBeVisible();
  });
});
