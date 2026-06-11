import { test as base, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { E2E_PASSWORD } from "./constants";
import {
  cleanupUser,
  createAdminClient,
  ensureUserWithPassword,
} from "./supabase-admin";

/**
 * SCAFFOLD — provider E2E fixtures (Meal Provider Workspace).
 *
 * Established by the regression-suite backbone (Issue #34, seq-00) so feature
 * items CP2+ can add provider specs without re-deriving the harness. It mirrors
 * the household `team` factory in `fixtures/auth.ts`: it mints ephemeral,
 * email-confirmed users today and tears them down after.
 *
 * The provider-tenancy rows (organizations, memberships, invites, subscriptions)
 * do NOT exist yet — they land with the provider schema (MP-A-010, Checkpoint 2).
 * Until then the row-creating methods throw {@link providerSchemaPending} with a
 * pointer to the blocking task, and NO spec consumes them, so the constant
 * regression suite stays green. When MP-A-010 merges, fill in the method bodies
 * (insert via the service-role `admin` client, exactly as `addHouseholdMember`
 * does) and add the named provider specs from `07_test_strategy.md` §1.11.
 *
 * Target fixture shapes (`07_test_strategy.md` §3):
 *   providerOwner (owns Provider A), providerOwnerB (Provider B),
 *   awaitingCustomer, approvedCustomer, subscriptionCustomer (consented),
 *   multiProviderCustomer (A+B).
 */

export interface ProviderUser {
  email: string;
  password: string;
  id: string;
}

/** Lifecycle state of a customer's membership in a provider org. */
export type ProviderMembershipStatus =
  | "awaiting_approval"
  | "approved"
  | "removed";

let counter = 0;
function uniqueEmail(prefix = "provider"): string {
  counter += 1;
  return `${prefix}+${Date.now()}-${process.pid}-${counter}-${Math.floor(
    Math.random() * 1e6,
  )}@example.com`;
}

/**
 * The standard "this depends on unbuilt provider schema" guard. Throwing keeps
 * the scaffold honest: a spec that reaches for an unimplemented method fails
 * loudly with the blocking task id rather than silently passing.
 */
export function providerSchemaPending(what: string): never {
  throw new Error(
    `Provider E2E fixture "${what}" is not implemented yet: it needs the ` +
      `provider tenancy schema (MP-A-010, Checkpoint 2). Implement the row ` +
      `creation against the service-role admin client once those tables exist. ` +
      `See e2e/fixtures/provider.ts and design/planning/meal-provider/07_test_strategy.md §3.`,
  );
}

export interface ProviderTeam {
  admin: SupabaseClient;
  /** Mint an ephemeral, email-confirmed user (tracked for teardown). Works today. */
  createUser(prefix?: string): Promise<ProviderUser>;

  // --- The following land with MP-A-010 (Checkpoint 2). ---

  /** Create a provider organization owned by `owner`; returns the providerId. */
  createProvider(
    owner: ProviderUser,
    opts?: { name?: string; timezone?: string },
  ): Promise<string>;
  /** Attach `customer` to `providerId` in the given membership state. */
  addCustomer(
    providerId: string,
    customer: ProviderUser,
    status: ProviderMembershipStatus,
  ): Promise<void>;
  /** Give `customer` an active, consented subscription to `providerId`. */
  addSubscription(providerId: string, customer: ProviderUser): Promise<void>;
}

export const test = base.extend<{ providerTeam: ProviderTeam }>({
  providerTeam: async ({}, provide) => {
    const admin = createAdminClient();
    const created: string[] = [];

    const api: ProviderTeam = {
      admin,
      async createUser(prefix = "provider") {
        const email = uniqueEmail(prefix);
        const id = await ensureUserWithPassword(admin, email, E2E_PASSWORD);
        created.push(id);
        return { email, password: E2E_PASSWORD, id };
      },
      async createProvider() {
        return providerSchemaPending("createProvider");
      },
      async addCustomer() {
        return providerSchemaPending("addCustomer");
      },
      async addSubscription() {
        return providerSchemaPending("addSubscription");
      },
    };

    await provide(api);

    for (const id of created) {
      await cleanupUser(admin, id);
    }
  },
});

export { expect };
