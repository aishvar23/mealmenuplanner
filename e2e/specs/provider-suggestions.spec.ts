import { expect, test } from "../fixtures/provider";
import { signInWithPassword } from "../helpers/auth";

/**
 * Provider meal suggestions (MP-A-131, UC-SUGGEST-001..003).
 *
 * Suggestions are a backend-only slice (no provider UI yet — that lands with the
 * owner dashboard), so this spec drives the live `/api/*` routes directly through
 * an authenticated `page.request` (cookies set by the real sign-in form). It
 * proves the member create path (rate-limited), the owner accept/reject
 * resolution, the pending-only guard, and that a non-owner can't resolve.
 */

/** Sign `email` in and wait for the session to land (so `page.request` is authed). */
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

test.describe("Provider suggestions (MP-A-131)", () => {
  test("a member files a suggestion and the owner accepts it as an option", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("sugg-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Suggestion Kitchen",
    });
    const customer = await providerTeam.createUser("sugg-cust");
    await providerTeam.addCustomer(providerId, customer, "approved");
    const { menuDayId } = await providerTeam.seedMenuDay(providerId, owner, {
      cutoffHoursFromNow: 8,
    });

    // ── Member creates a suggestion (201) ──
    await signIn(page, customer.email, customer.password);
    const created = await page.request.post(
      `/api/provider-menu-days/${menuDayId}/suggestions`,
      { data: { suggestionText: "Could you add a millet roti option?" } },
    );
    expect(created.status()).toBe(201);
    const suggestion = await created.json();
    expect(suggestion.status).toBe("pending");
    expect(suggestion.suggestionText).toBe(
      "Could you add a millet roti option?",
    );
    const suggestionId: string = suggestion.suggestionId;

    // ── A non-owner (the member) cannot resolve it (existence-hiding 404) ──
    const memberResolve = await page.request.post(
      `/api/provider-suggestions/${suggestionId}/accept-as-option`,
    );
    expect(memberResolve.status()).toBe(404);

    // ── Owner accepts it as an option (200) with a note ──
    await signIn(page, owner.email, owner.password);
    const accepted = await page.request.post(
      `/api/provider-suggestions/${suggestionId}/accept-as-option`,
      { data: { providerResponse: "Great idea — adding it next week." } },
    );
    expect(accepted.status()).toBe(200);
    const accBody = await accepted.json();
    expect(accBody.status).toBe("accepted_as_option");
    expect(accBody.providerResponse).toBe("Great idea — adding it next week.");

    // ── Re-resolving is a 409 with the suggestion_not_pending reason ──
    const reResolve = await page.request.post(
      `/api/provider-suggestions/${suggestionId}/reject`,
    );
    expect(reResolve.status()).toBe(409);
    const conflict = await reResolve.json();
    expect(conflict.error?.details?.reason).toBe("suggestion_not_pending");
  });

  test("the owner rejects a suggestion", async ({ page, providerTeam }) => {
    const owner = await providerTeam.createUser("rej-owner");
    const providerId = await providerTeam.createProvider(owner);
    const customer = await providerTeam.createUser("rej-cust");
    await providerTeam.addCustomer(providerId, customer, "approved");
    const { menuDayId } = await providerTeam.seedMenuDay(providerId, owner);

    await signIn(page, customer.email, customer.password);
    const created = await page.request.post(
      `/api/provider-menu-days/${menuDayId}/suggestions`,
      { data: { suggestionText: "More rice please" } },
    );
    const { suggestionId } = await created.json();

    await signIn(page, owner.email, owner.password);
    const rejected = await page.request.post(
      `/api/provider-suggestions/${suggestionId}/reject`,
      { data: { providerResponse: "Sorry, can't this week." } },
    );
    expect(rejected.status()).toBe(200);
    expect((await rejected.json()).status).toBe("rejected");
  });

  test("suggestions are rate-limited per member", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("rl-owner");
    const providerId = await providerTeam.createProvider(owner);
    const customer = await providerTeam.createUser("rl-cust");
    await providerTeam.addCustomer(providerId, customer, "approved");
    const { menuDayId } = await providerTeam.seedMenuDay(providerId, owner);

    await signIn(page, customer.email, customer.password);

    // Fire suggestions until the rolling-window cap trips. The service cap is 10
    // (SUGGESTION_RATE_MAX); bound the loop above it so a regression that removes
    // the limit fails instead of looping forever.
    let sawRateLimit = false;
    for (let i = 0; i < 13 && !sawRateLimit; i += 1) {
      const res = await page.request.post(
        `/api/provider-menu-days/${menuDayId}/suggestions`,
        { data: { suggestionText: `idea ${i}` } },
      );
      if (res.status() === 429) {
        sawRateLimit = true;
        expect(res.headers()["retry-after"]).toBeTruthy();
      } else {
        expect(res.status()).toBe(201);
      }
    }
    expect(sawRateLimit).toBe(true);
  });

  test("a suggestion on an unknown menu day is a 404", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("unk-owner");
    const providerId = await providerTeam.createProvider(owner);
    const customer = await providerTeam.createUser("unk-cust");
    await providerTeam.addCustomer(providerId, customer, "approved");

    await signIn(page, customer.email, customer.password);
    const res = await page.request.post(
      `/api/provider-menu-days/00000000-0000-0000-0000-000000000000/suggestions`,
      { data: { suggestionText: "hi" } },
    );
    expect(res.status()).toBe(404);
  });
});
