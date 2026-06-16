import { test as base, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { E2E_PASSWORD } from "./constants";
import {
  cleanupUser,
  createAdminClient,
  ensureUserWithPassword,
} from "./supabase-admin";
import { createAuthedClient } from "../helpers/authed-client";

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
  /**
   * Attach `customer` to `providerId` in the given membership state. An
   * `approved` customer is marked as having completed minimal onboarding by
   * default (so menu pages don't bounce them to the onboarding gate); pass
   * `{ onboarded: false }` to seed an approved-but-not-onboarded member.
   */
  addCustomer(
    providerId: string,
    customer: ProviderUser,
    status: ProviderMembershipStatus,
    opts?: { onboarded?: boolean },
  ): Promise<void>;
  /** Give `customer` an active, consented subscription to `providerId`. */
  addSubscription(providerId: string, customer: ProviderUser): Promise<void>;
  /**
   * Seed a single published (or locked) menu day for `providerId` "today" in the
   * provider timezone, with a dal component (default Rajma, Chana alternative,
   * spice/salt, an "extra portion" quantity-increment customization) and a bread
   * component. `cutoffHoursFromNow` controls whether responses are open (positive)
   * or already closed (negative). Returns the ids the member-response specs need.
   */
  seedMenuDay(
    providerId: string,
    owner: ProviderUser,
    opts?: {
      cutoffHoursFromNow?: number;
      status?: "draft" | "published" | "locked";
      timezone?: string;
    },
  ): Promise<MenuDaySeed>;
  /**
   * Like `seedMenuDay`, but authors + publishes the day through the PRODUCTION
   * writer (`create_provider_menu_day` + `publish_provider_menu_day`) signed in as
   * the owner — NOT via direct table inserts. The catalog stays owner-private, so
   * the dish names on the menu tree (`default_item_name` / `item_name`) are
   * populated by the writer's denormalization (MP-A-121), not by the fixture. This
   * is the only seeder that exercises the writer→read→member-display chain end to
   * end (ADO #39). Returns the catalog ids the member-display assertions need.
   */
  seedMenuDayViaWriter(
    providerId: string,
    owner: ProviderUser,
    opts?: { cutoffHoursFromNow?: number; timezone?: string },
  ): Promise<WriterMenuDaySeed>;
  /**
   * Seed the owner's catalog (Rajma + Chana in `dal_or_legume`, Roti in `bread`)
   * WITHOUT any menu day — the precondition for the menu-builder specs, which author
   * a day through the UI. All active. Returns the catalog ids.
   */
  seedCatalog(providerId: string): Promise<CatalogSeed>;
  /**
   * Sign in as `user` with a real anon-key client whose every `.from()/.rpc()`
   * runs under that user's Postgres RLS context (the RLS-respecting counterpart to
   * the service-role `admin`). The client is tracked and signed out in teardown so
   * callers never have to — and a failing assertion mid-test can't leak the session.
   */
  signInAs(user: ProviderUser): Promise<SupabaseClient>;
  /**
   * Seed a confirmed response (one default dal line) for `customer` on the seeded
   * `menuDayId`, via the service-role client. Returns the new response id. Shared by
   * the response/batch/RLS specs so the confirmed-response shape lives in one place.
   */
  seedConfirmedResponse(
    providerId: string,
    seed: MenuDaySeed,
    customer: ProviderUser,
  ): Promise<string>;
  /** The id of the `current` preparation batch for a menu day, or throws. */
  currentBatchId(menuDayId: string): Promise<string>;
  /**
   * Build a real post-cutoff batch (revision 1, status current) for `providerId`:
   * a published past-cutoff day + one approved customer with a confirmed response,
   * then run the cutoff RPC. Returns the ids the override/idempotency specs need.
   */
  seedBatch(
    owner: ProviderUser,
    providerId: string,
  ): Promise<{ seed: MenuDaySeed; batchId: string; responseId: string }>;
}

/** The catalog ids returned by `seedCatalog`. */
export interface CatalogSeed {
  rajmaCatalogId: string;
  chanaCatalogId: string;
  rotiCatalogId: string;
}

/** The ids returned by `seedMenuDayViaWriter`, for member-display assertions. */
export interface WriterMenuDaySeed {
  menuDayId: string;
  rajmaCatalogId: string;
  chanaCatalogId: string;
}

/** The ids returned by `seedMenuDay`, for assertions + response building. */
export interface MenuDaySeed {
  menuDayId: string;
  dalComponentId: string;
  breadComponentId: string;
  chanaAlternativeId: string;
  rajmaCatalogId: string;
  chanaCatalogId: string;
}

export const test = base.extend<{ providerTeam: ProviderTeam }>({
  providerTeam: async ({}, provide) => {
    const admin = createAdminClient();
    const created: string[] = [];
    const authedClients: SupabaseClient[] = [];

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
      async addCustomer(providerId, customer, status, opts) {
        const dbStatus = CUSTOMER_DB_STATUS[status];
        const now = new Date().toISOString();
        const isActive = dbStatus === "active";
        // Default: an approved (active) customer is treated as already onboarded
        // so the menu pages don't redirect them to the onboarding gate.
        const onboarded = isActive && (opts?.onboarded ?? true);
        const { error } = await admin.from("provider_memberships").insert({
          provider_id: providerId,
          user_id: customer.id,
          role: "customer",
          status: dbStatus,
          joined_at: isActive ? now : null,
          approved_at: isActive ? now : null,
          removed_at: dbStatus === "removed" ? now : null,
          onboarding_completed_at: onboarded ? now : null,
          allergy_ack_at: onboarded ? now : null,
          terms_ack_at: onboarded ? now : null,
          member_display_name: onboarded ? "E2E Customer" : null,
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
      async seedMenuDay(providerId, owner, opts) {
        const tz = opts?.timezone ?? "Asia/Kolkata";
        const status = opts?.status ?? "published";
        const cutoffHours = opts?.cutoffHoursFromNow ?? 8;
        const now = new Date();
        // "Today" in the provider tz must match getTodayMenu's own computation.
        const menuDate = new Intl.DateTimeFormat("en-CA", {
          timeZone: tz,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(now);
        const cutoffAt = new Date(
          now.getTime() + cutoffHours * 3_600_000,
        ).toISOString();
        const nowIso = now.toISOString();
        // A draft has not been published yet, so it carries no published_at; the
        // publish RPC (pmp_18) sets it. published/locked days are stamped as before.
        const publishedAt = status === "draft" ? null : nowIso;

        const fail = (what: string, message?: string) => {
          throw new Error(`E2E: seedMenuDay ${what} failed: ${message}`);
        };

        // ── Catalog items (Rajma default, Chana alternative, Roti bread) ──
        const cat = await admin
          .from("provider_catalog_items")
          .insert([
            {
              provider_id: providerId,
              name: "Rajma",
              component_group: "dal_or_legume",
              canonical_unit: "oz",
              default_quantity: 16,
              supports_spice_level: true,
              supports_salt_level: true,
            },
            {
              provider_id: providerId,
              name: "Chana",
              component_group: "dal_or_legume",
              canonical_unit: "oz",
              default_quantity: 16,
              // A heterogeneous batch insert sends explicit NULLs for keys missing
              // on any row (bypassing column defaults), so set the flags on every row.
              supports_spice_level: false,
              supports_salt_level: false,
            },
            {
              provider_id: providerId,
              name: "Roti",
              component_group: "bread",
              canonical_unit: "piece",
              default_quantity: 2,
              supports_spice_level: false,
              supports_salt_level: false,
            },
          ])
          .select("id, name");
        if (cat.error || !cat.data) fail("catalog", cat.error?.message);
        const byName = (n: string) => {
          const row = cat.data!.find((r) => r.name === n);
          if (!row) fail("catalog lookup", `missing ${n}`);
          return row!.id as string;
        };
        const rajmaCatalogId = byName("Rajma");
        const chanaCatalogId = byName("Chana");
        const rotiCatalogId = byName("Roti");

        // ── Weekly menu container ──
        const week = await admin
          .from("provider_weekly_menus")
          .insert({
            provider_id: providerId,
            week_start_date: menuDate,
            week_end_date: menuDate,
            status,
            published_at: publishedAt,
            created_by_user_id: owner.id,
          })
          .select("id")
          .single();
        if (week.error || !week.data) fail("weekly", week.error?.message);

        // ── Menu day ──
        const day = await admin
          .from("provider_menu_days")
          .insert({
            weekly_menu_id: week.data!.id,
            provider_id: providerId,
            menu_date: menuDate,
            cutoff_at: cutoffAt,
            status,
            published_at: publishedAt,
            locked_at: status === "locked" ? nowIso : null,
          })
          .select("id")
          .single();
        if (day.error || !day.data) fail("day", day.error?.message);
        const menuDayId = day.data!.id as string;

        // ── Components (dal + bread) ──
        const comps = await admin
          .from("provider_menu_components")
          .insert([
            {
              menu_day_id: menuDayId,
              component_group: "dal_or_legume",
              default_catalog_item_id: rajmaCatalogId,
              default_item_name: "Rajma",
              default_quantity: 16,
              canonical_unit: "oz",
              is_required: true,
              supports_spice_level: true,
              supports_salt_level: true,
              sort_order: 0,
            },
            {
              menu_day_id: menuDayId,
              component_group: "bread",
              default_catalog_item_id: rotiCatalogId,
              default_item_name: "Roti",
              default_quantity: 2,
              canonical_unit: "piece",
              is_required: true,
              supports_spice_level: false,
              supports_salt_level: false,
              sort_order: 1,
            },
          ])
          .select("id, component_group");
        if (comps.error || !comps.data)
          fail("components", comps.error?.message);
        const dalComponentId = comps.data!.find(
          (c) => c.component_group === "dal_or_legume",
        )!.id as string;
        const breadComponentId = comps.data!.find(
          (c) => c.component_group === "bread",
        )!.id as string;

        // ── Chana alternative on the dal component ──
        const alt = await admin
          .from("provider_menu_alternatives")
          .insert({
            menu_component_id: dalComponentId,
            catalog_item_id: chanaCatalogId,
            item_name: "Chana",
            quantity: 16,
            canonical_unit: "oz",
          })
          .select("id")
          .single();
        if (alt.error || !alt.data) fail("alternative", alt.error?.message);

        // ── A bounded quantity-increment customization on the dal component ──
        const group = await admin
          .from("provider_customization_groups")
          .insert({
            menu_component_id: dalComponentId,
            name: "Extra dal portions",
            customization_type: "quantity_increment",
            included_in_price: false,
            is_required: false,
            minimum_selections: 0,
            maximum_selections: 1,
            sort_order: 0,
          })
          .select("id")
          .single();
        if (group.error || !group.data) fail("group", group.error?.message);
        const opt = await admin.from("provider_customization_options").insert({
          customization_group_id: group.data!.id,
          code: "extra_portion",
          label: "Extra portion (+8 oz)",
          quantity_delta: 8,
          canonical_unit: "oz",
          external_price_label: "+$3",
          minimum_quantity: 0,
          maximum_quantity: 3,
          sort_order: 0,
        });
        if (opt.error) fail("option", opt.error.message);

        return {
          menuDayId,
          dalComponentId,
          breadComponentId,
          chanaAlternativeId: alt.data!.id as string,
          rajmaCatalogId,
          chanaCatalogId,
        };
      },
      async seedCatalog(providerId) {
        const cat = await admin
          .from("provider_catalog_items")
          .insert([
            {
              provider_id: providerId,
              name: "Rajma",
              component_group: "dal_or_legume",
              canonical_unit: "oz",
              default_quantity: 16,
              supports_spice_level: true,
              supports_salt_level: true,
            },
            {
              provider_id: providerId,
              name: "Chana",
              component_group: "dal_or_legume",
              canonical_unit: "oz",
              default_quantity: 16,
              supports_spice_level: false,
              supports_salt_level: false,
            },
            {
              provider_id: providerId,
              name: "Roti",
              component_group: "bread",
              canonical_unit: "piece",
              default_quantity: 2,
              supports_spice_level: false,
              supports_salt_level: false,
            },
          ])
          .select("id, name");
        if (cat.error || !cat.data) {
          throw new Error(`E2E: seedCatalog failed: ${cat.error?.message}`);
        }
        const idByName = (n: string) => {
          const row = cat.data!.find((r) => r.name === n);
          if (!row) throw new Error(`E2E: seedCatalog missing ${n}`);
          return row.id as string;
        };
        return {
          rajmaCatalogId: idByName("Rajma"),
          chanaCatalogId: idByName("Chana"),
          rotiCatalogId: idByName("Roti"),
        };
      },
      async seedMenuDayViaWriter(providerId, owner, opts) {
        const tz = opts?.timezone ?? "Asia/Kolkata";
        const cutoffHours = opts?.cutoffHoursFromNow ?? 8;
        const now = new Date();
        // "Today" in the provider tz must match getTodayMenu's own computation.
        const menuDate = new Intl.DateTimeFormat("en-CA", {
          timeZone: tz,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(now);
        const cutoffAt = new Date(
          now.getTime() + cutoffHours * 3_600_000,
        ).toISOString();
        const fail = (what: string, message?: string) => {
          throw new Error(
            `E2E: seedMenuDayViaWriter ${what} failed: ${message}`,
          );
        };

        // ── Owner-private catalog (Rajma default, Chana alternative) ──
        // Inserted via the service-role admin; pcat_select is owner-only, so the
        // member can NEVER read these. The writer must denormalize the names onto
        // the menu tree for the member to see them — which is exactly what #39 proves.
        const cat = await admin
          .from("provider_catalog_items")
          .insert([
            {
              provider_id: providerId,
              name: "Rajma",
              component_group: "dal_or_legume",
              canonical_unit: "oz",
              default_quantity: 16,
              supports_spice_level: true,
              supports_salt_level: true,
            },
            {
              provider_id: providerId,
              name: "Chana",
              component_group: "dal_or_legume",
              canonical_unit: "oz",
              default_quantity: 16,
              supports_spice_level: false,
              supports_salt_level: false,
            },
          ])
          .select("id, name");
        if (cat.error || !cat.data) fail("catalog", cat.error?.message);
        const byName = (n: string) => {
          const row = cat.data!.find((r) => r.name === n);
          if (!row) fail("catalog lookup", `missing ${n}`);
          return row!.id as string;
        };
        const rajmaCatalogId = byName("Rajma");
        const chanaCatalogId = byName("Chana");

        // ── Author + publish through the PRODUCTION writer as the OWNER ──
        // The RPCs are owner-gated on auth.uid(), so they must run under the owner's
        // RLS context, not the service-role admin (whose auth.uid() is null).
        const ownerClient = await api.signInAs(owner);
        const created = await ownerClient.rpc("create_provider_menu_day", {
          p_provider_id: providerId,
          p_payload: {
            menuDate,
            cutoffAt,
            note: null,
            components: [
              {
                componentGroup: "dal_or_legume",
                defaultCatalogItemId: rajmaCatalogId,
                isRequired: true,
                sortOrder: 0,
                alternativeCatalogItemIds: [chanaCatalogId],
                customizationGroups: [],
              },
            ],
          },
        });
        if (created.error || !created.data)
          fail("create", created.error?.message);
        const menuDayId = created.data as string;
        const published = await ownerClient.rpc("publish_provider_menu_day", {
          p_menu_day_id: menuDayId,
        });
        if (published.error) fail("publish", published.error.message);

        return { menuDayId, rajmaCatalogId, chanaCatalogId };
      },
      async signInAs(user) {
        const client = await createAuthedClient(user.email, user.password);
        authedClients.push(client);
        return client;
      },
      async seedConfirmedResponse(providerId, seed, customer) {
        const resp = await admin
          .from("provider_member_responses")
          .insert({
            provider_id: providerId,
            menu_day_id: seed.menuDayId,
            member_user_id: customer.id,
            status: "confirmed",
            version: 1,
            confirmed_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (resp.error || !resp.data) {
          throw new Error(`E2E: seed response failed: ${resp.error?.message}`);
        }
        const responseId = resp.data.id as string;
        const item = await admin.from("provider_member_response_items").insert({
          response_id: responseId,
          menu_component_id: seed.dalComponentId,
          selected_catalog_item_id: seed.rajmaCatalogId,
          quantity: 16,
          canonical_unit: "oz",
          spice_level: "spicy",
          salt_level: "low_salt",
        });
        if (item.error) {
          throw new Error(
            `E2E: seed response item failed: ${item.error.message}`,
          );
        }
        return responseId;
      },
      async currentBatchId(menuDayId) {
        const batch = await admin
          .from("provider_preparation_batches")
          .select("id")
          .eq("menu_day_id", menuDayId)
          .eq("status", "current")
          .single();
        if (batch.error || !batch.data) {
          throw new Error(`E2E: no current batch: ${batch.error?.message}`);
        }
        return batch.data.id as string;
      },
      async seedBatch(owner, providerId) {
        const seed = await api.seedMenuDay(providerId, owner, {
          status: "published",
          cutoffHoursFromNow: -1,
        });
        const customer = await api.createUser("batch-cust");
        await api.addCustomer(providerId, customer, "approved");
        // seedConfirmedResponse returns the (stable) response id directly — no need
        // to re-query it after the cutoff.
        const responseId = await api.seedConfirmedResponse(
          providerId,
          seed,
          customer,
        );
        const cutoff = await admin.rpc("process_provider_cutoff", {
          p_menu_day_id: seed.menuDayId,
        });
        if (cutoff.error) {
          throw new Error(`E2E: cutoff failed: ${cutoff.error.message}`);
        }
        const batchId = await api.currentBatchId(seed.menuDayId);
        return { seed, batchId, responseId };
      },
    };

    await provide(api);

    // Sign out any RLS-context clients we minted. Best-effort and always runs (even
    // when a test assertion failed before its own cleanup), so GoTrue sessions don't
    // leak on shared cloud dev; the user rows are deleted below regardless.
    for (const client of authedClients) {
      try {
        await client.auth.signOut();
      } catch {
        /* the user is deleted below regardless */
      }
    }

    // Delete the provider-owned rows that DON'T cascade on user delete before we
    // delete the users themselves:
    //   • provider_organizations.owner_user_id has no cascade — delete owned orgs
    //     (this cascades their memberships, subscriptions, AND invites via
    //     provider_id), so a non-owner's customer rows cascade on user delete.
    //   • provider_invites.invited_by_user_id ALSO has no cascade. Invites for a
    //     deleted org are already gone, but an invite a created user sent for an
    //     org NOT deleted here would otherwise block their user delete with an FK
    //     violation — so delete any invite they sent explicitly.
    for (const id of created) {
      // Tear the menu tree down BEFORE the org. provider_menu_components reference
      // provider_catalog_items with NO cascade, but BOTH cascade off the org, so an
      // org delete can drop catalog rows while components still point at them (FK
      // violation, nondeterministic cascade order). Deleting the weekly menus first
      // cascades days → components → alternatives → customizations, leaving the
      // catalog unreferenced so the org delete cascades it cleanly.
      const ownedOrgs = await admin
        .from("provider_organizations")
        .select("id")
        .eq("owner_user_id", id);
      for (const org of ownedOrgs.data ?? []) {
        const orgId = org.id as string;
        // Member responses reference menu components (no cascade), so drop them
        // first (this cascades their items + customizations off response_id).
        const responses = await admin
          .from("provider_member_responses")
          .delete()
          .eq("provider_id", orgId);
        if (responses.error) {
          console.warn(
            `E2E cleanup: failed to delete provider responses for org ${orgId}: ${responses.error.message}`,
          );
        }
        // Then the menu tree (cascades days → components → alternatives →
        // customization groups/options), leaving the catalog unreferenced.
        const menus = await admin
          .from("provider_weekly_menus")
          .delete()
          .eq("provider_id", orgId);
        if (menus.error) {
          console.warn(
            `E2E cleanup: failed to delete provider menus for org ${orgId}: ${menus.error.message}`,
          );
        }
      }
      const orgs = await admin
        .from("provider_organizations")
        .delete()
        .eq("owner_user_id", id);
      if (orgs.error) {
        console.warn(
          `E2E cleanup: failed to delete provider orgs for ${id}: ${orgs.error.message}`,
        );
      }
      const invites = await admin
        .from("provider_invites")
        .delete()
        .eq("invited_by_user_id", id);
      if (invites.error) {
        console.warn(
          `E2E cleanup: failed to delete provider invites for ${id}: ${invites.error.message}`,
        );
      }
    }
    for (const id of created) {
      await cleanupUser(admin, id);
    }
  },
});

export { expect };
