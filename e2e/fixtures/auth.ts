import { test as base, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { E2E_PASSWORD } from "./constants";
import {
  addHouseholdMember,
  cleanupUser,
  createAdminClient,
  ensureUserWithPassword,
  findHouseholdIdByOwner,
  setAdminAppRole,
  type MemberRole,
} from "./supabase-admin";
import { signInWithPassword } from "../helpers/auth";
import { completeMinimumOnboarding } from "../helpers/onboarding";

/**
 * Test fixtures for the e2e suite.
 *
 * - `freshUser` — a brand-new email-confirmed account, no household, torn down
 *   after (used by ONBOARD specs that create a household).
 * - `onboardedHousehold` — signs a fresh user in on the test's `page` and
 *   completes minimum (vegetarian) onboarding, yielding a clean owner household
 *   per test (used by RECO/PLAN/GROCERY/MEALCOMP/IMAGE mutating specs).
 * - `team` — a factory for multi-user collaboration tests: mints users, onboards
 *   an owner, adds members by role, grants admin. Every user it creates (and the
 *   owner's household) is torn down after.
 *
 * Read-only specs instead reuse the seeded `owner@`/`admin@` storageState (see
 * global-setup.ts).
 */

export interface FreshUser {
  email: string;
  password: string;
  id: string;
}

let counter = 0;
function uniqueEmail(prefix = "e2e"): string {
  counter += 1;
  return `${prefix}+${Date.now()}-${process.pid}-${counter}-${Math.floor(
    Math.random() * 1e6,
  )}@example.com`;
}

export interface Team {
  admin: SupabaseClient;
  /** Mint an ephemeral, email-confirmed user (tracked for teardown). */
  createUser(prefix?: string): Promise<FreshUser>;
  /** Sign `user` in on `page` and complete minimum onboarding; returns householdId. */
  onboardOwner(
    page: Page,
    user: FreshUser,
    householdName?: string,
  ): Promise<string>;
  /** Add `user` to `householdId` with `role` (active membership, correct flags). */
  addMember(
    householdId: string,
    user: FreshUser,
    role: MemberRole,
    opts?: {
      membershipType?: "permanent" | "temporary_guest";
      expiresAt?: string | null;
      permissionOverrides?: Record<string, boolean>;
    },
  ): Promise<void>;
  /** Grant app-operator (admin console) access to `user`. */
  makeAdmin(user: FreshUser): Promise<void>;
}

export const test = base.extend<{
  freshUser: FreshUser;
  onboardedHousehold: { user: FreshUser; householdId: string };
  team: Team;
}>({
  freshUser: async ({}, provide) => {
    const admin = createAdminClient();
    const email = uniqueEmail();
    const id = await ensureUserWithPassword(admin, email, E2E_PASSWORD);
    await provide({ email, password: E2E_PASSWORD, id });
    await cleanupUser(admin, id);
  },

  onboardedHousehold: async ({ page }, provide) => {
    const admin = createAdminClient();
    const email = uniqueEmail();
    const id = await ensureUserWithPassword(admin, email, E2E_PASSWORD);

    await signInWithPassword(page, email, E2E_PASSWORD);
    await page.waitForURL(/\/(today|onboarding)(\?|$|\/)/, { timeout: 30_000 });
    if (new URL(page.url()).pathname.startsWith("/onboarding")) {
      await completeMinimumOnboarding(page, { householdName: "E2E Household" });
    }
    await page.waitForURL("**/today", { timeout: 30_000 });

    const householdId = await findHouseholdIdByOwner(admin, id);
    if (!householdId) throw new Error("E2E: onboarded owner has no household.");

    await provide({ user: { email, password: E2E_PASSWORD, id }, householdId });
    await cleanupUser(admin, id);
  },

  team: async ({}, provide) => {
    const admin = createAdminClient();
    const created: string[] = [];

    const teamApi: Team = {
      admin,
      async createUser(prefix = "e2e") {
        const email = uniqueEmail(prefix);
        const id = await ensureUserWithPassword(admin, email, E2E_PASSWORD);
        created.push(id);
        return { email, password: E2E_PASSWORD, id };
      },
      async onboardOwner(page, user, householdName = "E2E Team Household") {
        await signInWithPassword(page, user.email, user.password);
        await page.waitForURL(/\/(today|onboarding)(\?|$|\/)/, {
          timeout: 30_000,
        });
        if (new URL(page.url()).pathname.startsWith("/onboarding")) {
          await completeMinimumOnboarding(page, { householdName });
        }
        await page.waitForURL("**/today", { timeout: 30_000 });
        const householdId = await findHouseholdIdByOwner(admin, user.id);
        if (!householdId) throw new Error("E2E: team owner has no household.");
        return householdId;
      },
      async addMember(householdId, user, role, opts) {
        await addHouseholdMember(admin, {
          householdId,
          userId: user.id,
          role,
          ...opts,
        });
      },
      async makeAdmin(user) {
        await setAdminAppRole(admin, user.id);
      },
    };

    await provide(teamApi);

    // Teardown: delete every user we created. Deleting the owner cascades the
    // household (and all membership rows); member users have no owned household.
    for (const id of created) {
      await cleanupUser(admin, id);
    }
  },
});

export { expect };
