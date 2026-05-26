import fs from "node:fs";
import path from "node:path";

import { chromium, type FullConfig } from "@playwright/test";

import {
  ADMIN,
  ADMIN_STORAGE_STATE,
  E2E_PASSWORD,
  OWNER,
  OWNER_STORAGE_STATE,
  SPEC_USERS,
} from "./fixtures/constants";
import {
  createAdminClient,
  ensureUserWithPassword,
  setAdminAppRole,
} from "./fixtures/supabase-admin";
import { signInWithPassword } from "./helpers/auth";
import { completeMinimumOnboarding } from "./helpers/onboarding";

/**
 * Runs once before the whole suite:
 *
 *  1. Idempotently provision the six seeded spec users (email/password,
 *     confirmed). The pilot only drives `owner@`; the rest are provisioned so
 *     later phases (member/viewer/guest/admin/no-household) have accounts ready.
 *  2. Sign in as `owner@` through the real UI and — on first run, when the owner
 *     has no household yet — complete the minimum (vegetarian) onboarding. Then
 *     capture the authenticated session to `e2e/.auth/owner.json` so read-only
 *     specs (today/RECO) start already-signed-in and fast.
 *
 * Both steps are idempotent: reruns reuse the existing owner household.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:3000";

  const admin = createAdminClient();
  const idByEmail = new Map<string, string>();
  for (const email of SPEC_USERS) {
    idByEmail.set(
      email,
      await ensureUserWithPassword(admin, email, E2E_PASSWORD),
    );
  }

  // Grant the operator role to admin@ so the /admin console is reachable. Set
  // before sign-in so the captured session's token carries the app_role.
  const adminId = idByEmail.get(ADMIN);
  if (adminId) await setAdminAppRole(admin, adminId);

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  try {
    await signInWithPassword(page, OWNER, E2E_PASSWORD);
    // A signed-in owner lands on /today (already onboarded) or is bounced to
    // /onboarding (first run, no household).
    await page.waitForURL(/\/(today|onboarding)(\?|$|\/)/, { timeout: 30_000 });

    if (new URL(page.url()).pathname.startsWith("/onboarding")) {
      await completeMinimumOnboarding(page, {
        householdName: "E2E Owner Household",
      });
    }
    await page.waitForURL("**/today", { timeout: 30_000 });

    fs.mkdirSync(path.dirname(OWNER_STORAGE_STATE), { recursive: true });
    await context.storageState({ path: OWNER_STORAGE_STATE });

    // Warm the recommendation/generate route once. Next dev compiles API routes
    // on first hit; without this, the first spec(s) can race that compilation on
    // a cold server and see transient 500s. Best-effort — never fail setup.
    try {
      const suggest = page
        .getByRole("button", { name: /suggest a meal/i })
        .first();
      if (await suggest.isVisible().catch(() => false)) {
        await suggest.click();
        await page
          .getByRole("button", { name: "Try another" })
          .first()
          .waitFor({ state: "visible", timeout: 30_000 })
          .catch(() => {});
      }
    } catch {
      // Ignore — specs still exercise the route directly.
    }

    // Capture admin@ session (separate context so cookies don't mix with owner).
    const adminContext = await browser.newContext({ baseURL });
    const adminPage = await adminContext.newPage();
    await signInWithPassword(adminPage, ADMIN, E2E_PASSWORD);
    // admin@ has no household → lands on /onboarding; that's fine, we only need
    // the authenticated session for the /admin console.
    await adminPage.waitForURL(/\/(today|onboarding)(\?|$|\/)/, {
      timeout: 30_000,
    });
    await adminContext.storageState({ path: ADMIN_STORAGE_STATE });
    await adminContext.close();
  } finally {
    await browser.close();
  }
}
