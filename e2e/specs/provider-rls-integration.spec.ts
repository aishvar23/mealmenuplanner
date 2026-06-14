import type { SupabaseClient } from "@supabase/supabase-js";

import { expect, test } from "../fixtures/provider";
import type {
  MenuDaySeed,
  ProviderTeam,
  ProviderUser,
} from "../fixtures/provider";
import { E2E_PASSWORD } from "../fixtures/constants";
import { createAuthedClient } from "../helpers/authed-client";

/**
 * Provider integration / RLS suite (MP-A-180; 07_test_strategy.md § 1.4–1.7;
 * UC-SECURITY-001..006, UC-RESPONSE-009, UC-CUTOFF-002, UC-OVERRIDE-001..003).
 *
 * The other provider specs prove the **API-route** authorization layer (they sign
 * in via a browser and call `/api/*` with `page.request`). This suite proves the
 * layer underneath: the actual **Postgres RLS policies + SECURITY DEFINER RPCs**,
 * exercised with a real anon-key client signed in as each actor (`createAuthedClient`)
 * so every `.from()/.rpc()` runs under that user's row-level context — the
 * repeatable, CI-runnable form of the manual rolled-back MCP probes used while the
 * provider schema was built. It runs against cloud dev (no Docker); the `providerTeam`
 * fixture mints + tears down ephemeral users/orgs.
 *
 * Coverage:
 *   • read isolation — owner full access; approved-customer own-response only;
 *     awaiting-customer no menu; active-customer positive menu read; customer cannot
 *     read batches/lines/catalog/audit/other members (UC-SECURITY-001..006);
 *   • cross-provider denial — provider B can never read provider A's rows;
 *   • response-mutation gating — pre-cutoff save succeeds, post-cutoff save is
 *     PRLCK, an awaiting customer is PRAPP (UC-RESPONSE-009);
 *   • cutoff idempotency — process_provider_cutoff twice → one batch, no dup lines
 *     (UC-CUTOFF-002);
 *   • override → batch stale, regenerate → revision N+1, old revision retained
 *     (UC-OVERRIDE-001..003);
 *   • the one-live-membership partial-unique constraint.
 */

/** Seed a confirmed response (with one dal line) for `customer` on `menuDayId`. */
async function seedConfirmedResponse(
  team: ProviderTeam,
  providerId: string,
  seed: MenuDaySeed,
  customer: ProviderUser,
): Promise<string> {
  const resp = await team.admin
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
  const item = await team.admin.from("provider_member_response_items").insert({
    response_id: responseId,
    menu_component_id: seed.dalComponentId,
    selected_catalog_item_id: seed.rajmaCatalogId,
    quantity: 16,
    canonical_unit: "oz",
    spice_level: "spicy",
    salt_level: "low_salt",
  });
  if (item.error) {
    throw new Error(`E2E: seed response item failed: ${item.error.message}`);
  }
  return responseId;
}

/** The id of the current preparation batch for a menu day, or throws. */
async function currentBatchId(
  team: ProviderTeam,
  menuDayId: string,
): Promise<string> {
  const batch = await team.admin
    .from("provider_preparation_batches")
    .select("id")
    .eq("menu_day_id", menuDayId)
    .eq("status", "current")
    .single();
  if (batch.error || !batch.data) {
    throw new Error(`E2E: no current batch: ${batch.error?.message}`);
  }
  return batch.data.id as string;
}

/**
 * Build a real post-cutoff batch (revision 1, status current) for `providerId`:
 * a published past-cutoff day + one approved customer with a confirmed response,
 * then run the cutoff RPC. Returns the ids the override/idempotency tests need.
 */
async function buildBatch(
  team: ProviderTeam,
  owner: ProviderUser,
  providerId: string,
): Promise<{ seed: MenuDaySeed; batchId: string; responseId: string }> {
  const seed = await team.seedMenuDay(providerId, owner, {
    status: "published",
    cutoffHoursFromNow: -1,
  });
  const customer = await team.createUser("rls-batch-cust");
  await team.addCustomer(providerId, customer, "approved");
  await seedConfirmedResponse(team, providerId, seed, customer);

  const cutoff = await team.admin.rpc("process_provider_cutoff", {
    p_menu_day_id: seed.menuDayId,
  });
  if (cutoff.error) {
    throw new Error(`E2E: cutoff failed: ${cutoff.error.message}`);
  }
  const batchId = await currentBatchId(team, seed.menuDayId);
  // After the cutoff the confirmed response is locked — the override path's input.
  const resp = await team.admin
    .from("provider_member_responses")
    .select("id")
    .eq("menu_day_id", seed.menuDayId)
    .eq("member_user_id", customer.id)
    .single();
  if (resp.error || !resp.data) {
    throw new Error(
      `E2E: locked response lookup failed: ${resp.error?.message}`,
    );
  }
  return { seed, batchId, responseId: resp.data.id as string };
}

/** Sign out a per-test authed client (best-effort) once an assertion block is done. */
async function signOut(client: SupabaseClient): Promise<void> {
  try {
    await client.auth.signOut();
  } catch {
    /* the fixture deletes the user in teardown regardless */
  }
}

test.describe("Provider RLS — read isolation (UC-SECURITY-001..006)", () => {
  test("the owner has full read access to their org's data", async ({
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("rls-owner-full");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Owner Full Access Kitchen",
    });
    const seed = await providerTeam.seedMenuDay(providerId, owner);
    const custA = await providerTeam.createUser("rls-owner-a");
    const custB = await providerTeam.createUser("rls-owner-b");
    await providerTeam.addCustomer(providerId, custA, "approved");
    await providerTeam.addCustomer(providerId, custB, "approved");
    await seedConfirmedResponse(providerTeam, providerId, seed, custA);
    await seedConfirmedResponse(providerTeam, providerId, seed, custB);

    const ownerClient = await createAuthedClient(owner.email, E2E_PASSWORD);

    const days = await ownerClient
      .from("provider_menu_days")
      .select("id")
      .eq("provider_id", providerId);
    expect(days.error).toBeNull();
    expect(days.data?.length).toBe(1);

    const responses = await ownerClient
      .from("provider_member_responses")
      .select("id")
      .eq("provider_id", providerId);
    expect(responses.data?.length).toBe(2);

    const members = await ownerClient
      .from("provider_memberships")
      .select("id")
      .eq("provider_id", providerId);
    // owner + two customers.
    expect(members.data?.length).toBe(3);

    const catalog = await ownerClient
      .from("provider_catalog_items")
      .select("id")
      .eq("provider_id", providerId);
    expect(catalog.data?.length).toBe(3);

    await signOut(ownerClient);
  });

  test("an approved customer reads only their own response, never another's", async ({
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("rls-own-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Own Response Kitchen",
    });
    const seed = await providerTeam.seedMenuDay(providerId, owner);
    const custA = await providerTeam.createUser("rls-own-a");
    const custB = await providerTeam.createUser("rls-own-b");
    await providerTeam.addCustomer(providerId, custA, "approved");
    await providerTeam.addCustomer(providerId, custB, "approved");
    await seedConfirmedResponse(providerTeam, providerId, seed, custA);
    const respB = await seedConfirmedResponse(
      providerTeam,
      providerId,
      seed,
      custB,
    );

    const a = await createAuthedClient(custA.email, E2E_PASSWORD);

    const mine = await a
      .from("provider_member_responses")
      .select("id, member_user_id")
      .eq("provider_id", providerId);
    expect(mine.error).toBeNull();
    expect(mine.data?.length).toBe(1);
    expect(mine.data?.[0]?.member_user_id).toBe(custA.id);

    // Customer A cannot read customer B's response items either (chained RLS).
    const bItems = await a
      .from("provider_member_response_items")
      .select("id")
      .eq("response_id", respB);
    expect(bItems.data?.length).toBe(0);

    await signOut(a);
  });

  test("an awaiting-approval customer sees no published menu", async ({
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("rls-await-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Awaiting Kitchen",
    });
    await providerTeam.seedMenuDay(providerId, owner); // published, open
    const awaiting = await providerTeam.createUser("rls-await-cust");
    await providerTeam.addCustomer(providerId, awaiting, "awaiting_approval");

    const client = await createAuthedClient(awaiting.email, E2E_PASSWORD);

    const days = await client
      .from("provider_menu_days")
      .select("id")
      .eq("provider_id", providerId);
    expect(days.error).toBeNull();
    expect(days.data?.length).toBe(0);

    const weeks = await client
      .from("provider_weekly_menus")
      .select("id")
      .eq("provider_id", providerId);
    expect(weeks.data?.length).toBe(0);

    await signOut(client);
  });

  test("an active customer can read the published menu (positive control)", async ({
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("rls-active-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Active Member Kitchen",
    });
    const seed = await providerTeam.seedMenuDay(providerId, owner);
    const active = await providerTeam.createUser("rls-active-cust");
    await providerTeam.addCustomer(providerId, active, "approved");

    const client = await createAuthedClient(active.email, E2E_PASSWORD);

    const days = await client
      .from("provider_menu_days")
      .select("id")
      .eq("provider_id", providerId);
    expect(days.error).toBeNull();
    expect(days.data?.length).toBe(1);

    const comps = await client
      .from("provider_menu_components")
      .select("id")
      .eq("menu_day_id", seed.menuDayId);
    expect(comps.data?.length).toBe(2); // dal + bread

    const alts = await client
      .from("provider_menu_alternatives")
      .select("id")
      .eq("menu_component_id", seed.dalComponentId);
    expect(alts.data?.length).toBe(1); // Chana

    await signOut(client);
  });

  test("a customer cannot read preparation batches, their lines, the catalog, the audit log, or other members", async ({
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("rls-deny-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Customer Deny Kitchen",
    });
    const { batchId } = await buildBatch(providerTeam, owner, providerId);

    const custA = await providerTeam.createUser("rls-deny-a");
    const custB = await providerTeam.createUser("rls-deny-b");
    await providerTeam.addCustomer(providerId, custA, "approved");
    await providerTeam.addCustomer(providerId, custB, "approved");

    const a = await createAuthedClient(custA.email, E2E_PASSWORD);

    const batches = await a
      .from("provider_preparation_batches")
      .select("id")
      .eq("provider_id", providerId);
    expect(batches.error).toBeNull();
    expect(batches.data?.length).toBe(0);

    const lines = await a
      .from("provider_preparation_batch_lines")
      .select("id")
      .eq("batch_id", batchId);
    expect(lines.data?.length).toBe(0);

    const catalog = await a
      .from("provider_catalog_items")
      .select("id")
      .eq("provider_id", providerId);
    expect(catalog.data?.length).toBe(0);

    const events = await a
      .from("provider_activity_events")
      .select("id")
      .eq("provider_id", providerId);
    expect(events.data?.length).toBe(0);

    // The member list is owner-only: a customer sees only their own membership row.
    const members = await a
      .from("provider_memberships")
      .select("id, user_id")
      .eq("provider_id", providerId);
    expect(members.data?.length).toBe(1);
    expect(members.data?.[0]?.user_id).toBe(custA.id);

    // Sanity: the owner DOES see the batch + its lines (the policy isn't a blanket deny).
    const ownerClient = await createAuthedClient(owner.email, E2E_PASSWORD);
    const ownerBatch = await ownerClient
      .from("provider_preparation_batches")
      .select("id")
      .eq("id", batchId);
    expect(ownerBatch.data?.length).toBe(1);
    const ownerLines = await ownerClient
      .from("provider_preparation_batch_lines")
      .select("id")
      .eq("batch_id", batchId);
    expect(ownerLines.data?.length ?? 0).toBeGreaterThan(0);

    await signOut(a);
    await signOut(ownerClient);
  });
});

test.describe("Provider RLS — cross-provider denial (UC-SECURITY-001/006)", () => {
  test("provider B's owner cannot read provider A's menu, responses, batch, catalog, or members", async ({
    providerTeam,
  }) => {
    const ownerA = await providerTeam.createUser("rls-xprov-a-owner");
    const providerA = await providerTeam.createProvider(ownerA, {
      name: "Provider A Kitchen",
    });
    const { seed, batchId } = await buildBatch(providerTeam, ownerA, providerA);

    const ownerB = await providerTeam.createUser("rls-xprov-b-owner");
    await providerTeam.createProvider(ownerB, { name: "Provider B Kitchen" });

    const b = await createAuthedClient(ownerB.email, E2E_PASSWORD);

    const days = await b
      .from("provider_menu_days")
      .select("id")
      .eq("provider_id", providerA);
    expect(days.error).toBeNull();
    expect(days.data?.length).toBe(0);

    const responses = await b
      .from("provider_member_responses")
      .select("id")
      .eq("provider_id", providerA);
    expect(responses.data?.length).toBe(0);

    const batches = await b
      .from("provider_preparation_batches")
      .select("id")
      .eq("id", batchId);
    expect(batches.data?.length).toBe(0);

    const catalog = await b
      .from("provider_catalog_items")
      .select("id")
      .eq("provider_id", providerA);
    expect(catalog.data?.length).toBe(0);

    const members = await b
      .from("provider_memberships")
      .select("id")
      .eq("provider_id", providerA);
    expect(members.data?.length).toBe(0);

    // Provider B's owner cannot read a component on provider A's menu day either.
    const comps = await b
      .from("provider_menu_components")
      .select("id")
      .eq("menu_day_id", seed.menuDayId);
    expect(comps.data?.length).toBe(0);

    await signOut(b);
  });
});

test.describe("Provider RLS — response mutation gating (UC-RESPONSE-009)", () => {
  test("a pre-cutoff save succeeds but a post-cutoff (locked) save is rejected with PRLCK", async ({
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("rls-mutate-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Mutation Gate Kitchen",
    });
    const openSeed = await providerTeam.seedMenuDay(providerId, owner, {
      status: "published",
      cutoffHoursFromNow: 8,
    });
    const customer = await providerTeam.createUser("rls-mutate-cust");
    await providerTeam.addCustomer(providerId, customer, "approved");

    const client = await createAuthedClient(customer.email, E2E_PASSWORD);

    // Pre-cutoff: the RPC creates the response (server-derives quantities).
    const ok = await client.rpc("save_provider_response", {
      p_menu_day_id: openSeed.menuDayId,
      p_expected_version: null,
      p_member_note: "rls pre-cutoff",
      p_items: [
        {
          menuComponentId: openSeed.dalComponentId,
          selectedCatalogItemId: openSeed.rajmaCatalogId,
        },
      ],
    });
    expect(ok.error).toBeNull();
    expect(typeof ok.data).toBe("string");

    // Post-cutoff: a locked day rejects any save with PRLCK.
    const lockedSeed = await providerTeam.seedMenuDay(providerId, owner, {
      status: "locked",
      cutoffHoursFromNow: -1,
    });
    const denied = await client.rpc("save_provider_response", {
      p_menu_day_id: lockedSeed.menuDayId,
      p_expected_version: null,
      p_member_note: "rls post-cutoff",
      p_items: [
        {
          menuComponentId: lockedSeed.dalComponentId,
          selectedCatalogItemId: lockedSeed.rajmaCatalogId,
        },
      ],
    });
    expect(denied.error).not.toBeNull();
    expect(denied.error?.code).toBe("PRLCK");

    await signOut(client);
  });

  test("an awaiting-approval customer's save is rejected with PRAPP", async ({
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("rls-apprv-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Approval Gate Kitchen",
    });
    const seed = await providerTeam.seedMenuDay(providerId, owner, {
      status: "published",
      cutoffHoursFromNow: 8,
    });
    const awaiting = await providerTeam.createUser("rls-apprv-cust");
    await providerTeam.addCustomer(providerId, awaiting, "awaiting_approval");

    const client = await createAuthedClient(awaiting.email, E2E_PASSWORD);
    const denied = await client.rpc("save_provider_response", {
      p_menu_day_id: seed.menuDayId,
      p_expected_version: null,
      p_member_note: "awaiting cannot save",
      p_items: [
        {
          menuComponentId: seed.dalComponentId,
          selectedCatalogItemId: seed.rajmaCatalogId,
        },
      ],
    });
    expect(denied.error).not.toBeNull();
    expect(denied.error?.code).toBe("PRAPP");

    await signOut(client);
  });
});

test.describe("Provider integration — cutoff idempotency (UC-CUTOFF-002)", () => {
  test("running process_provider_cutoff twice yields one batch and no duplicate lines", async ({
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("rls-idem-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Idempotent Cutoff Kitchen",
    });
    const seed = await providerTeam.seedMenuDay(providerId, owner, {
      status: "published",
      cutoffHoursFromNow: -1,
    });
    const customer = await providerTeam.createUser("rls-idem-cust");
    await providerTeam.addCustomer(providerId, customer, "approved");
    await seedConfirmedResponse(providerTeam, providerId, seed, customer);

    const first = await providerTeam.admin.rpc("process_provider_cutoff", {
      p_menu_day_id: seed.menuDayId,
    });
    expect(first.error).toBeNull();
    const batchId = first.data as string;
    expect(batchId).toBeTruthy();

    const linesAfterFirst = await providerTeam.admin
      .from("provider_preparation_batch_lines")
      .select("id")
      .eq("batch_id", batchId);
    const lineCount = linesAfterFirst.data?.length ?? 0;
    expect(lineCount).toBeGreaterThan(0);

    // Second run on an already-locked day is a no-op that returns the same batch.
    const second = await providerTeam.admin.rpc("process_provider_cutoff", {
      p_menu_day_id: seed.menuDayId,
    });
    expect(second.error).toBeNull();
    expect(second.data as string).toBe(batchId);

    // Exactly one current batch, and the line set is unchanged (no duplicates).
    const currents = await providerTeam.admin
      .from("provider_preparation_batches")
      .select("id")
      .eq("menu_day_id", seed.menuDayId)
      .eq("status", "current");
    expect(currents.data?.length).toBe(1);

    const linesAfterSecond = await providerTeam.admin
      .from("provider_preparation_batch_lines")
      .select("id")
      .eq("batch_id", batchId);
    expect(linesAfterSecond.data?.length).toBe(lineCount);
  });
});

test.describe("Provider integration — override + regenerate (UC-OVERRIDE-001..003)", () => {
  test("an override marks the batch stale; regenerate creates revision N+1 and retains the old revision", async ({
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("rls-ovr-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Override Kitchen",
    });
    const { seed, batchId, responseId } = await buildBatch(
      providerTeam,
      owner,
      providerId,
    );

    const ownerClient = await createAuthedClient(owner.email, E2E_PASSWORD);

    // Owner overrides the locked response (re-deriving the same default line). The
    // override marks the day's current batch stale (ADR-11).
    const override = await ownerClient.rpc("provider_override_response", {
      p_response_id: responseId,
      p_reason: "Customer called the kitchen for the default portion",
      p_items: [
        {
          menuComponentId: seed.dalComponentId,
          selectedCatalogItemId: seed.rajmaCatalogId,
        },
      ],
    });
    expect(override.error).toBeNull();

    const stale = await providerTeam.admin
      .from("provider_preparation_batches")
      .select("status, revision")
      .eq("id", batchId)
      .single();
    expect(stale.data?.status).toBe("stale");
    expect(stale.data?.revision).toBe(1);

    // Regenerate builds revision 2 as the new current.
    const regen = await ownerClient.rpc("regenerate_provider_batch", {
      p_batch_id: batchId,
    });
    expect(regen.error).toBeNull();

    const all = await providerTeam.admin
      .from("provider_preparation_batches")
      .select("id, revision, status")
      .eq("menu_day_id", seed.menuDayId);
    expect(all.data?.length).toBe(2);
    const currentRows = (all.data ?? []).filter((b) => b.status === "current");
    expect(currentRows.length).toBe(1);
    expect(currentRows[0]?.revision).toBe(2);

    // The old revision 1 is retained (immutable) and still stale.
    const rev1 = (all.data ?? []).find((b) => b.id === batchId);
    expect(rev1?.revision).toBe(1);
    expect(rev1?.status).toBe("stale");

    await signOut(ownerClient);
  });
});

test.describe("Provider integration — membership invariant", () => {
  test("the one-live-membership partial-unique constraint blocks a second live row", async ({
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("rls-uniq-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "One Live Membership Kitchen",
    });
    const customer = await providerTeam.createUser("rls-uniq-cust");
    await providerTeam.addCustomer(providerId, customer, "approved"); // active

    // A second LIVE (active) membership for the same (provider, user) violates
    // uq_one_live_provider_membership. Inserted via the service-role client so it's
    // the DB constraint — not RLS — that rejects it.
    const dup = await providerTeam.admin.from("provider_memberships").insert({
      provider_id: providerId,
      user_id: customer.id,
      role: "customer",
      status: "active",
      joined_at: new Date().toISOString(),
      approved_at: new Date().toISOString(),
    });
    expect(dup.error).not.toBeNull();
    expect(dup.error?.code).toBe("23505");
  });
});

export {};
