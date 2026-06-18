import type { Page } from "@playwright/test";

/**
 * Sign in through the real email/password form on `/sign-in` (the form is shown
 * by default; Google + magic-link are the other, non-automatable, methods). Does
 * NOT assert where it lands — the caller decides (e.g. `/today` vs `/onboarding`).
 *
 * `/sign-in` renders two panels (households + meal providers, ADO #86), each with
 * its own copy of the email/password form, so the controls are scoped to the
 * "For households" panel. That panel's default `next` (`/today`) preserves the
 * historic post-login fall-through, so provider-owner callers still reach
 * `/provider/dashboard` via the workspace pointer just as before.
 */
export async function signInWithPassword(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  // Drop any existing session first: when already authenticated, the proxy
  // redirects /sign-in → /today, so the form wouldn't render. Clearing cookies
  // lets a test switch users on the same page (owner → member, etc.).
  await page.context().clearCookies();
  await page.goto("/sign-in");
  const panel = page.getByRole("region", { name: "For households" });
  await panel.getByLabel("Email").fill(email);
  await panel.getByLabel("Password").fill(password);
  await panel.getByRole("button", { name: "Sign in", exact: true }).click();
}
