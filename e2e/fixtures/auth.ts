import { test as base, expect } from "@playwright/test";

import { E2E_PASSWORD } from "./constants";
import {
  cleanupUser,
  createAdminClient,
  ensureUserWithPassword,
} from "./supabase-admin";

/**
 * Test fixtures for the e2e suite.
 *
 * `freshUser` mints a brand-new, email-confirmed account before the test and
 * deletes it (and any household it created) afterwards. Mutating flows —
 * onboarding completion today; invites, marking-cooked, etc. later — use this so
 * every run starts from a clean slate and leaves no residue in shared cloud dev.
 * Read-only flows instead reuse the seeded `owner@` household via that role's
 * captured `storageState` (see e2e/global-setup.ts).
 */

export interface FreshUser {
  email: string;
  password: string;
  id: string;
}

export const test = base.extend<{ freshUser: FreshUser }>({
  // Playwright passes the "use" callback positionally; named `provide` here so
  // ESLint's react-hooks rule doesn't mistake it for the React `use` hook.
  freshUser: async ({}, provide, testInfo) => {
    const admin = createAdminClient();
    // Unique per worker + test so parallel runs never collide.
    const unique = `${Date.now()}-${testInfo.workerIndex}-${Math.floor(
      Math.random() * 1e6,
    )}`;
    const email = `e2e+${unique}@example.com`;
    const id = await ensureUserWithPassword(admin, email, E2E_PASSWORD);

    await provide({ email, password: E2E_PASSWORD, id });

    await cleanupUser(admin, id);
  },
});

export { expect };
