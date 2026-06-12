import { test as base, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { E2E_PASSWORD } from "./constants";
import {
  cleanupUser,
  createAdminClient,
  ensureUserWithPassword,
} from "./supabase-admin";

/**
 * Provider E2E fixtures (Meal Provider Workspace).
 *
 * Established by the regression-suite backbone (Issue #34, seq-00) so feature
 * items CP2+ can add provider specs without re-deriving the harness. It mirrors
 * the household `team` factory in `fixtures/auth.ts`: it mints ephemeral,
 * email-confirmed users and tears them down after.
 *
 * The provider-tenancy rows (organizations, memberships, subscriptions) landed
 * with the provider schema (MP-A-010, Checkpoint 2), so the row-creating methods
 * below insert via the service-role `admin` client, exactly as `addHouseholdMember`
 * does. Teardown deletes any provider org a created user owns BEFORE deleting the
 * user, because `provider_organizations.owner_user_id` references `users(id)` with
 * NO cascade (membership/subscription rows cascade on org or user delete).
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

/** Map the fixture's customer lifecycle to the DB `provider_membership_status`. */
const CUSTOMER_DB_STATUS: Record<ProviderMembershipStatus, string> = {
  awaiting_approval: "awaiting_approval",
  approved: "active",
  removed: "removed",
};

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
      async createProvider(owner, opts) {
        const { data, error } = await admin
          .from("provider_organizations")
          .insert({
            owner_user_id: owner.id,
            name: opts?.name ?? "E2E Provider",
            timezone: opts?.timezone ?? "Asia/Kolkata",
            status: "active",
          })
          .select("id")
          .single();
        if (error || !data) {
          throw new Error(`E2E: createProvider failed: ${error?.message}`);
        }
        const providerId = data.id as string;

        // The active owner membership (the onboarding RPC does this atomically in
        // app code; here we insert it directly for test setup).
        const now = new Date().toISOString();
        const membership = await admin.from("provider_memberships").insert({
          provider_id: providerId,
          user_id: owner.id,
          role: "owner",
          status: "active",
          joined_at: now,
          approved_at: now,
          approved_by_user_id: owner.id,
        });
        if (membership.error) {
          throw new Error(
            `E2E: createProvider owner membership failed: ${membership.error.message}`,
          );
        }
        return providerId;
      },
      async addCustomer(providerId, customer, status) {
        const dbStatus = CUSTOMER_DB_STATUS[status];
        const now = new Date().toISOString();
        const { error } = await admin.from("provider_memberships").insert({
          provider_id: providerId,
          user_id: customer.id,
          role: "customer",
          status: dbStatus,
          joined_at: dbStatus === "active" ? now : null,
          approved_at: dbStatus === "active" ? now : null,
          removed_at: dbStatus === "removed" ? now : null,
        });
        if (error) {
          throw new Error(
            `E2E: addCustomer failed for ${customer.id}: ${error.message}`,
          );
        }
      },
      async addSubscription(providerId, customer) {
        const { error } = await admin.from("provider_subscriptions").insert({
          provider_id: providerId,
          customer_user_id: customer.id,
          status: "active",
          auto_accept_enabled: true,
          auto_accept_consented_at: new Date().toISOString(),
        });
        if (error) {
          throw new Error(
            `E2E: addSubscription failed for ${customer.id}: ${error.message}`,
          );
        }
      },
    };

    await provide(api);

    // Delete any provider org a created user owns first (owner_user_id has no
    // cascade); membership/subscription rows cascade on org delete, and the
    // customer rows of non-owners cascade when their user is deleted below.
    for (const id of created) {
      const orgs = await admin
        .from("provider_organizations")
        .delete()
        .eq("owner_user_id", id);
      if (orgs.error) {
        console.warn(
          `E2E cleanup: failed to delete provider orgs for ${id}: ${orgs.error.message}`,
        );
      }
    }
    for (const id of created) {
      await cleanupUser(admin, id);
    }
  },
});

export { expect };
