import type { Page } from "@playwright/test";

/**
 * Sign in through the real email/password form on `/sign-in` (the form is shown
 * by default; Google + magic-link are the other, non-automatable, methods). Does
 * NOT assert where it lands — the caller decides (e.g. `/today` vs `/onboarding`).
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
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
