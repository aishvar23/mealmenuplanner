import { expect, test } from "../fixtures/provider";

/**
 * Provider integration / RLS suite (MP-A-180; 07_test_strategy.md § 1.4–1.7;
 * UC-SECURITY-001..006, UC-RESPONSE-009, UC-CUTOFF-002, UC-OVERRIDE-001..003).
 *
 * The other provider specs prove the **API-route** authorization layer (they sign
 * in via a browser and call `/api/*` with `page.request`). This suite proves the
 * layer underneath: the actual **Postgres RLS policies + SECURITY DEFINER RPCs**,
 * exercised with a real anon-key client signed in as each actor (`providerTeam.signInAs`)
 * so every `.from()/.rpc()` runs under that user's row-level context — the
 * repeatable, CI-runnable form of the manual rolled-back MCP probes used while the
 * provider schema was built. It runs against cloud dev (no Docker); the `providerTeam`
 * fixture mints + tears down ephemeral users/orgs and signs out the authed clients.
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
 *
 * The confirmed-response / post-cutoff-batch seeding lives on the `providerTeam`
 * fixture (`seedConfirmedResponse`, `seedBatch`, `currentBatchId`) so this suite and
 * the events/CSV specs share one definition of those shapes.
 */

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
    await providerTeam.seedConfirmedResponse(providerId, seed, custA);
    await providerTeam.seedConfirmedResponse(providerId, seed, custB);

    const ownerClient = await providerTeam.signInAs(owner);

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
    const respA = await providerTeam.seedConfirmedResponse(
      providerId,
      seed,
      custA,
    );
    const respB = await providerTeam.seedConfirmedResponse(
      providerId,
      seed,
      custB,
    );

    const a = await providerTeam.signInAs(custA);

    const mine = await a
      .from("provider_member_responses")
      .select("id, member_user_id")
      .eq("provider_id", providerId);
    expect(mine.error).toBeNull();
    expect(mine.data?.length).toBe(1);
    expect(mine.data?.[0]?.member_user_id).toBe(custA.id);

    // Positive control: customer A CAN read their OWN response's items — so the deny
    // below proves per-customer scoping, not a blanket deny of the items table.
    const myItems = await a
      .from("provider_member_response_items")
      .select("id")
      .eq("response_id", respA);
    expect(myItems.error).toBeNull();
    expect(myItems.data?.length).toBe(1);

    // Customer A cannot read customer B's response items (chained RLS).
    const bItems = await a
      .from("provider_member_response_items")
      .select("id")
      .eq("response_id", respB);
    expect(bItems.data?.length).toBe(0);
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

    const client = await providerTeam.signInAs(awaiting);

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

    const client = await providerTeam.signInAs(active);

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
  });

  test("a customer cannot read preparation batches, their lines, the catalog, the audit log, or other members", async ({
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("rls-deny-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Customer Deny Kitchen",
    });
    const { batchId } = await providerTeam.seedBatch(owner, providerId);

    // The cutoff path writes no audit row, so seed one real activity event — without
    // it the customer-deny assertion below would pass trivially (empty table) and the
    // owner-only `pae_select` policy would never actually be exercised.
    const auditEvent = await providerTeam.admin
      .from("provider_activity_events")
      .insert({
        provider_id: providerId,
        actor_user_id: owner.id,
        event_type: "provider_member_approved",
        entity_type: "provider_membership",
      });
    expect(auditEvent.error).toBeNull();

    const custA = await providerTeam.createUser("rls-deny-a");
    const custB = await providerTeam.createUser("rls-deny-b");
    await providerTeam.addCustomer(providerId, custA, "approved");
    await providerTeam.addCustomer(providerId, custB, "approved");

    const a = await providerTeam.signInAs(custA);

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

    // Sanity (positive control): the owner DOES see the batch, its lines, AND the
    // audit row — so each policy above is per-actor scoping, not a blanket deny.
    const ownerClient = await providerTeam.signInAs(owner);
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
    const ownerEvents = await ownerClient
      .from("provider_activity_events")
      .select("id")
      .eq("provider_id", providerId);
    expect(ownerEvents.data?.length ?? 0).toBeGreaterThan(0);
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
    const { seed, batchId } = await providerTeam.seedBatch(ownerA, providerA);

    const ownerB = await providerTeam.createUser("rls-xprov-b-owner");
    await providerTeam.createProvider(ownerB, { name: "Provider B Kitchen" });

    const b = await providerTeam.signInAs(ownerB);

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

    const client = await providerTeam.signInAs(customer);

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

    const client = await providerTeam.signInAs(awaiting);
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
    await providerTeam.seedConfirmedResponse(providerId, seed, customer);

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
    const { seed, batchId, responseId } = await providerTeam.seedBatch(
      owner,
      providerId,
    );

    const ownerClient = await providerTeam.signInAs(owner);

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
  });

  // Locks in the pmp_16 consolidation (ADO #38): override re-derives the response
  // tree via the shared derive_provider_response_items routine, and regenerate's
  // census via the shared census_provider_responses routine folds the
  // provider_overridden response into the confirmed total. (The cutoff + regenerate
  // census equivalence is exercised by every override/idempotency spec here; this
  // test asserts the one census nuance the shared routine centralises.)
  test("the consolidated routines re-derive the overridden line and fold it into the regenerated confirmed total", async ({
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("rls-consol-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Consolidation Kitchen",
    });
    // seedBatch: one active customer with a confirmed response, cutoff run → rev 1.
    const { seed, batchId, responseId } = await providerTeam.seedBatch(
      owner,
      providerId,
    );
    const ownerClient = await providerTeam.signInAs(owner);

    // Override sends only the component selection; quantity/unit are SERVER-DERIVED by
    // the shared derive_provider_response_items routine (the owner's payload carries
    // no quantity). A correct derivation rebuilds exactly one default dal line.
    const override = await ownerClient.rpc("provider_override_response", {
      p_response_id: responseId,
      p_reason: "Re-derive the default portion via the shared routine",
      p_items: [
        {
          menuComponentId: seed.dalComponentId,
          selectedCatalogItemId: seed.rajmaCatalogId,
        },
      ],
    });
    expect(override.error).toBeNull();

    const items = await providerTeam.admin
      .from("provider_member_response_items")
      .select("selected_catalog_item_id, quantity, canonical_unit")
      .eq("response_id", responseId);
    expect(items.data?.length).toBe(1);
    // The default dal quantity (16 oz) — derived from the menu component, not the
    // empty client payload — proving the shared §11.6 derivation ran.
    expect(Number(items.data?.[0]?.quantity)).toBe(16);
    expect(items.data?.[0]?.canonical_unit).toBe("oz");
    expect(items.data?.[0]?.selected_catalog_item_id).toBe(seed.rajmaCatalogId);

    // Regenerate: the single active customer is now provider_overridden. The shared
    // census folds it into confirmed, so the regenerated batch reports confirmed = 1
    // (not 0) with no separate overridden bucket.
    const regen = await ownerClient.rpc("regenerate_provider_batch", {
      p_batch_id: batchId,
    });
    expect(regen.error).toBeNull();
    const totals = (regen.data as { totals: Record<string, number> }).totals;
    expect(totals.confirmed).toBe(1);
    expect(totals.autoAccepted).toBe(0);
    expect(totals.cancelled).toBe(0);
    expect(totals.noResponse).toBe(0);

    // The regenerated current batch's persisted total matches the folded census.
    const current = await providerTeam.admin
      .from("provider_preparation_batches")
      .select("revision, total_confirmed")
      .eq("menu_day_id", seed.menuDayId)
      .eq("status", "current")
      .single();
    expect(current.data?.revision).toBe(2);
    expect(current.data?.total_confirmed).toBe(1);
  });
});

test.describe("Provider integration — menu publish (MP-A-121)", () => {
  test("the owner publishes a complete draft: day + weekly go published and active customers are notified", async ({
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("pub-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Publish Kitchen",
    });
    const seed = await providerTeam.seedMenuDay(providerId, owner, {
      status: "draft",
      cutoffHoursFromNow: 8,
    });
    const customer = await providerTeam.createUser("pub-cust");
    await providerTeam.addCustomer(providerId, customer, "approved");
    const awaiting = await providerTeam.createUser("pub-await");
    await providerTeam.addCustomer(providerId, awaiting, "awaiting_approval");

    // Before publish, the active customer cannot read the draft day (RLS).
    const customerClient = await providerTeam.signInAs(customer);
    const beforePublish = await customerClient
      .from("provider_menu_days")
      .select("id")
      .eq("id", seed.menuDayId);
    expect(beforePublish.data?.length).toBe(0);

    const ownerClient = await providerTeam.signInAs(owner);
    const publish = await ownerClient.rpc("publish_provider_menu_day", {
      p_menu_day_id: seed.menuDayId,
    });
    expect(publish.error).toBeNull();
    // The RPC returns the day's published_at timestamp (so the service patches its
    // already-read DTO instead of a second full-tree read).
    expect(typeof publish.data).toBe("string");
    expect(Number.isNaN(Date.parse(publish.data as string))).toBe(false);

    // The day AND its weekly container are now published, and the RPC's returned
    // timestamp matches the persisted published_at.
    const day = await providerTeam.admin
      .from("provider_menu_days")
      .select("status, published_at, weekly_menu_id")
      .eq("id", seed.menuDayId)
      .single();
    expect(day.data?.status).toBe("published");
    expect(day.data?.published_at).not.toBeNull();
    expect(Date.parse(day.data?.published_at as string)).toBe(
      Date.parse(publish.data as string),
    );
    const week = await providerTeam.admin
      .from("provider_weekly_menus")
      .select("status")
      .eq("id", day.data?.weekly_menu_id as string)
      .single();
    expect(week.data?.status).toBe("published");

    // The active customer can now read it.
    const afterPublish = await customerClient
      .from("provider_menu_days")
      .select("id")
      .eq("id", seed.menuDayId);
    expect(afterPublish.data?.length).toBe(1);

    // The active customer was notified; the awaiting one was NOT (UC-NOTIFY-001/002).
    const notes = await providerTeam.admin
      .from("provider_notifications")
      .select("recipient_user_id")
      .eq("provider_id", providerId)
      .eq("event_type", "provider_menu_published");
    const recipients = (notes.data ?? []).map((n) => n.recipient_user_id);
    expect(recipients).toContain(customer.id);
    expect(recipients).not.toContain(awaiting.id);
    expect(recipients).not.toContain(owner.id);

    // Re-publishing the now-published day is an idempotent no-op (no second fan-out).
    const again = await ownerClient.rpc("publish_provider_menu_day", {
      p_menu_day_id: seed.menuDayId,
    });
    expect(again.error).toBeNull();
    const notesAfter = await providerTeam.admin
      .from("provider_notifications")
      .select("id")
      .eq("provider_id", providerId)
      .eq("event_type", "provider_menu_published");
    expect(notesAfter.data?.length).toBe(recipients.length);
  });

  test("a customer cannot publish a draft (PMOWN owner-gate)", async ({
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("pub-deny-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Publish Deny Kitchen",
    });
    const seed = await providerTeam.seedMenuDay(providerId, owner, {
      status: "draft",
      cutoffHoursFromNow: 8,
    });
    const customer = await providerTeam.createUser("pub-deny-cust");
    await providerTeam.addCustomer(providerId, customer, "approved");

    const customerClient = await providerTeam.signInAs(customer);
    const denied = await customerClient.rpc("publish_provider_menu_day", {
      p_menu_day_id: seed.menuDayId,
    });
    expect(denied.error).not.toBeNull();
    expect(denied.error?.code).toBe("PMOWN");

    // The draft is untouched.
    const day = await providerTeam.admin
      .from("provider_menu_days")
      .select("status")
      .eq("id", seed.menuDayId)
      .single();
    expect(day.data?.status).toBe("draft");
  });

  test("publishing a draft whose default item is archived is rejected with PMINC", async ({
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("pub-inc-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Publish Incomplete Kitchen",
    });
    const seed = await providerTeam.seedMenuDay(providerId, owner, {
      status: "draft",
      cutoffHoursFromNow: 8,
    });

    // Archive the dal default's catalog item — a published menu may not reference an
    // inactive item (contract § 5, DB-context axis).
    const archive = await providerTeam.admin
      .from("provider_catalog_items")
      .update({ is_active: false })
      .eq("id", seed.rajmaCatalogId);
    expect(archive.error).toBeNull();

    const ownerClient = await providerTeam.signInAs(owner);
    const denied = await ownerClient.rpc("publish_provider_menu_day", {
      p_menu_day_id: seed.menuDayId,
    });
    expect(denied.error).not.toBeNull();
    expect(denied.error?.code).toBe("PMINC");

    // Still a draft — the failed publish is atomic.
    const day = await providerTeam.admin
      .from("provider_menu_days")
      .select("status")
      .eq("id", seed.menuDayId)
      .single();
    expect(day.data?.status).toBe("draft");
  });

  test("the RPC itself rejects a draft whose cutoff has already passed (PMINC backstop)", async ({
    providerTeam,
  }) => {
    // Finding #2: a direct PostgREST RPC call bypasses the service's structural gate,
    // so the future-cutoff rule is re-enforced in-RPC (mirroring save_provider_response).
    const owner = await providerTeam.createUser("pub-cut-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Publish Past-Cutoff Kitchen",
    });
    const seed = await providerTeam.seedMenuDay(providerId, owner, {
      status: "draft",
      cutoffHoursFromNow: -1, // cutoff already in the past
    });

    const ownerClient = await providerTeam.signInAs(owner);
    const denied = await ownerClient.rpc("publish_provider_menu_day", {
      p_menu_day_id: seed.menuDayId,
    });
    expect(denied.error).not.toBeNull();
    expect(denied.error?.code).toBe("PMINC");

    // The draft is untouched — a past-cutoff menu cannot go live even via the RPC.
    const day = await providerTeam.admin
      .from("provider_menu_days")
      .select("status")
      .eq("id", seed.menuDayId)
      .single();
    expect(day.data?.status).toBe("draft");
  });
});

test.describe("Provider integration — menu authoring (MP-A-121)", () => {
  /** Insert catalog items for a provider via the service-role client; returns ids by name. */
  async function seedCatalog(
    admin: import("@supabase/supabase-js").SupabaseClient,
    providerId: string,
    rows: Array<{
      name: string;
      group?: string;
      unit?: string;
      qty?: number;
      spice?: boolean;
      salt?: boolean;
      active?: boolean;
    }>,
  ): Promise<Record<string, string>> {
    const ins = await admin
      .from("provider_catalog_items")
      .insert(
        rows.map((r) => ({
          provider_id: providerId,
          name: r.name,
          component_group: r.group ?? "main",
          canonical_unit: r.unit ?? "g",
          default_quantity: r.qty ?? 200,
          supports_spice_level: r.spice ?? false,
          supports_salt_level: r.salt ?? false,
          is_active: r.active ?? true,
        })),
      )
      .select("id, name");
    if (ins.error || !ins.data) {
      throw new Error(`E2E: seedCatalog failed: ${ins.error?.message}`);
    }
    return Object.fromEntries(ins.data.map((r) => [r.name, r.id as string]));
  }

  test("the owner authors a draft day; the tree denormalizes display fields off the catalog", async ({
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("auth-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Authoring Kitchen",
    });
    const cat = await seedCatalog(providerTeam.admin, providerId, [
      { name: "Paneer Masala", spice: true, salt: true },
      { name: "Tofu Bhurji", spice: false, salt: false },
    ]);

    const ownerClient = await providerTeam.signInAs(owner);
    const created = await ownerClient.rpc("create_provider_menu_day", {
      p_provider_id: providerId,
      p_payload: {
        menuDate: "2030-03-15",
        cutoffAt: "2030-03-15T10:00:00.000Z",
        note: "Chef special",
        components: [
          {
            componentGroup: "main",
            defaultCatalogItemId: cat["Paneer Masala"],
            isRequired: true,
            alternativeCatalogItemIds: [cat["Tofu Bhurji"]],
            customizationGroups: [
              {
                name: "Extra gravy",
                customizationType: "quantity_increment",
                includedInPrice: false,
                minimumSelections: 0,
                maximumSelections: 2,
                options: [
                  {
                    code: "gravy",
                    label: "Extra gravy",
                    quantityDelta: 50,
                    canonicalUnit: "g",
                    maximumQuantity: 2,
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    expect(created.error).toBeNull();
    const menuDayId = created.data as string;
    expect(typeof menuDayId).toBe("string");

    // The day is a DRAFT (publishing is a separate step) with the authored metadata.
    const day = await providerTeam.admin
      .from("provider_menu_days")
      .select("status, menu_date, note, provider_id, weekly_menu_id")
      .eq("id", menuDayId)
      .single();
    expect(day.data?.status).toBe("draft");
    expect(day.data?.menu_date).toBe("2030-03-15");
    expect(day.data?.note).toBe("Chef special");
    expect(day.data?.provider_id).toBe(providerId);

    // Its weekly container exists and is a draft too.
    const week = await providerTeam.admin
      .from("provider_weekly_menus")
      .select("status")
      .eq("id", day.data?.weekly_menu_id as string)
      .single();
    expect(week.data?.status).toBe("draft");

    // The component copied name/quantity/unit/spice-salt off the OWNER-PRIVATE catalog.
    const comp = await providerTeam.admin
      .from("provider_menu_components")
      .select(
        "default_item_name, default_quantity, canonical_unit, supports_spice_level, supports_salt_level, is_required",
      )
      .eq("menu_day_id", menuDayId)
      .single();
    expect(comp.data?.default_item_name).toBe("Paneer Masala");
    expect(Number(comp.data?.default_quantity)).toBe(200);
    expect(comp.data?.canonical_unit).toBe("g");
    expect(comp.data?.supports_spice_level).toBe(true);
    expect(comp.data?.supports_salt_level).toBe(true);
    expect(comp.data?.is_required).toBe(true);

    // The alternative copied its display name/quantity/unit off the catalog too.
    const compRow = await providerTeam.admin
      .from("provider_menu_components")
      .select("id")
      .eq("menu_day_id", menuDayId)
      .single();
    const alts = await providerTeam.admin
      .from("provider_menu_alternatives")
      .select("item_name, quantity, canonical_unit")
      .eq("menu_component_id", compRow.data?.id as string);
    expect(alts.data?.length).toBe(1);
    expect(alts.data?.[0]?.item_name).toBe("Tofu Bhurji");
    expect(Number(alts.data?.[0]?.quantity)).toBe(200);

    // The customization group + its option were created with the authored bounds.
    const grp = await providerTeam.admin
      .from("provider_customization_groups")
      .select("id, name, customization_type, maximum_selections")
      .eq("menu_component_id", compRow.data?.id as string)
      .single();
    expect(grp.data?.name).toBe("Extra gravy");
    expect(grp.data?.customization_type).toBe("quantity_increment");
    expect(grp.data?.maximum_selections).toBe(2);
    const opts = await providerTeam.admin
      .from("provider_customization_options")
      .select("code, label, quantity_delta")
      .eq("customization_group_id", grp.data?.id as string);
    expect(opts.data?.length).toBe(1);
    expect(opts.data?.[0]?.code).toBe("gravy");
    expect(Number(opts.data?.[0]?.quantity_delta)).toBe(50);
  });

  test("a non-owner cannot author a menu (MAOWN owner-gate)", async ({
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("auth-deny-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Authoring Deny Kitchen",
    });
    const cat = await seedCatalog(providerTeam.admin, providerId, [
      { name: "Paneer" },
    ]);
    const customer = await providerTeam.createUser("auth-deny-cust");
    await providerTeam.addCustomer(providerId, customer, "approved");

    const customerClient = await providerTeam.signInAs(customer);
    const denied = await customerClient.rpc("create_provider_menu_day", {
      p_provider_id: providerId,
      p_payload: {
        menuDate: "2030-03-16",
        cutoffAt: "2030-03-16T10:00:00.000Z",
        components: [
          { componentGroup: "main", defaultCatalogItemId: cat["Paneer"] },
        ],
      },
    });
    expect(denied.error).not.toBeNull();
    expect(denied.error?.code).toBe("MAOWN");

    // No day was created.
    const days = await providerTeam.admin
      .from("provider_menu_days")
      .select("id")
      .eq("provider_id", providerId);
    expect(days.data?.length).toBe(0);
  });

  test("authoring a component that references another provider's item is rejected (MAINC, atomic)", async ({
    providerTeam,
  }) => {
    const ownerA = await providerTeam.createUser("auth-xprov-a");
    const providerA = await providerTeam.createProvider(ownerA, {
      name: "Authoring X-Prov A",
    });
    const ownerB = await providerTeam.createUser("auth-xprov-b");
    const providerB = await providerTeam.createProvider(ownerB, {
      name: "Authoring X-Prov B",
    });
    const catB = await seedCatalog(providerTeam.admin, providerB, [
      { name: "B's Paneer" },
    ]);

    const ownerAClient = await providerTeam.signInAs(ownerA);
    const denied = await ownerAClient.rpc("create_provider_menu_day", {
      p_provider_id: providerA,
      p_payload: {
        menuDate: "2030-03-17",
        cutoffAt: "2030-03-17T10:00:00.000Z",
        components: [
          // A cross-provider item id is not active-and-owned by provider A.
          { componentGroup: "main", defaultCatalogItemId: catB["B's Paneer"] },
        ],
      },
    });
    expect(denied.error).not.toBeNull();
    expect(denied.error?.code).toBe("MAINC");

    // Atomic: no day (and no orphan weekly container) was left behind for provider A.
    const days = await providerTeam.admin
      .from("provider_menu_days")
      .select("id")
      .eq("provider_id", providerA);
    expect(days.data?.length).toBe(0);
    const weeks = await providerTeam.admin
      .from("provider_weekly_menus")
      .select("id")
      .eq("provider_id", providerA);
    expect(weeks.data?.length).toBe(0);
  });

  test("authoring a second active day for the same date is rejected (MADUP)", async ({
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("auth-dup-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Authoring Dup Kitchen",
    });
    const cat = await seedCatalog(providerTeam.admin, providerId, [
      { name: "Paneer" },
    ]);
    const ownerClient = await providerTeam.signInAs(owner);
    const payload = {
      menuDate: "2030-03-18",
      cutoffAt: "2030-03-18T10:00:00.000Z",
      components: [
        { componentGroup: "main", defaultCatalogItemId: cat["Paneer"] },
      ],
    };

    const first = await ownerClient.rpc("create_provider_menu_day", {
      p_provider_id: providerId,
      p_payload: payload,
    });
    expect(first.error).toBeNull();

    const second = await ownerClient.rpc("create_provider_menu_day", {
      p_provider_id: providerId,
      p_payload: payload,
    });
    expect(second.error).not.toBeNull();
    expect(second.error?.code).toBe("MADUP");

    // Exactly one day exists for the date.
    const days = await providerTeam.admin
      .from("provider_menu_days")
      .select("id")
      .eq("provider_id", providerId)
      .eq("menu_date", "2030-03-18");
    expect(days.data?.length).toBe(1);
  });
});

test.describe("Provider integration — menu edit/revision (MP-A-012E + MP-A-121, ADR-7)", () => {
  type SupabaseAdmin = import("@supabase/supabase-js").SupabaseClient;

  /** Insert active catalog items; returns name → id. */
  async function seedItems(
    admin: SupabaseAdmin,
    providerId: string,
    rows: Array<{ name: string; group: string; spice?: boolean }>,
  ): Promise<Record<string, string>> {
    const ins = await admin
      .from("provider_catalog_items")
      .insert(
        rows.map((r) => ({
          provider_id: providerId,
          name: r.name,
          component_group: r.group,
          canonical_unit: "oz",
          default_quantity: 16,
          supports_spice_level: r.spice ?? false,
          supports_salt_level: false,
          is_active: true,
        })),
      )
      .select("id, name");
    if (ins.error || !ins.data) {
      throw new Error(`edit-spec seedItems failed: ${ins.error?.message}`);
    }
    return Object.fromEntries(ins.data.map((r) => [r.name, r.id as string]));
  }

  /**
   * Insert a published day for `providerId` with the given components (each
   * denormalized like the authoring writer would). Returns the day id and the
   * component ids in payload order. cutoff is far-future so the day is editable.
   */
  async function seedPublishedDay(
    admin: SupabaseAdmin,
    providerId: string,
    owner: { id: string },
    comps: Array<{
      group: string;
      defaultCatalogItemId: string;
      defaultName: string;
      spice?: boolean;
      required?: boolean;
      sortOrder: number;
    }>,
  ): Promise<{ menuDayId: string; componentIds: string[] }> {
    const menuDate = "2030-04-01";
    const cutoffAt = "2030-04-01T10:00:00.000Z";
    const now = new Date().toISOString();
    const week = await admin
      .from("provider_weekly_menus")
      .insert({
        provider_id: providerId,
        week_start_date: menuDate,
        week_end_date: menuDate,
        status: "published",
        published_at: now,
        created_by_user_id: owner.id,
      })
      .select("id")
      .single();
    if (week.error || !week.data) {
      throw new Error(
        `edit-spec seedDay weekly failed: ${week.error?.message}`,
      );
    }
    const day = await admin
      .from("provider_menu_days")
      .insert({
        weekly_menu_id: week.data.id,
        provider_id: providerId,
        menu_date: menuDate,
        cutoff_at: cutoffAt,
        status: "published",
        published_at: now,
      })
      .select("id")
      .single();
    if (day.error || !day.data) {
      throw new Error(`edit-spec seedDay day failed: ${day.error?.message}`);
    }
    const menuDayId = day.data.id as string;
    const compRows = await admin
      .from("provider_menu_components")
      .insert(
        comps.map((c) => ({
          menu_day_id: menuDayId,
          component_group: c.group,
          default_catalog_item_id: c.defaultCatalogItemId,
          default_item_name: c.defaultName,
          default_quantity: 16,
          canonical_unit: "oz",
          is_required: c.required ?? true,
          supports_spice_level: c.spice ?? false,
          supports_salt_level: false,
          sort_order: c.sortOrder,
        })),
      )
      .select("id, sort_order");
    if (compRows.error || !compRows.data) {
      throw new Error(
        `edit-spec seedDay comps failed: ${compRows.error?.message}`,
      );
    }
    const componentIds = [...compRows.data]
      .sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
      .map((r) => r.id as string);
    return { menuDayId, componentIds };
  }

  /** Insert one response with the given lines; returns the response id. */
  async function seedResponse(
    admin: SupabaseAdmin,
    providerId: string,
    menuDayId: string,
    userId: string,
    opts: { status: "confirmed" | "cancelled"; confirmedAt?: string },
    items: Array<{ componentId: string; catalogId: string; spice?: string }>,
  ): Promise<string> {
    const resp = await admin
      .from("provider_member_responses")
      .insert({
        provider_id: providerId,
        menu_day_id: menuDayId,
        member_user_id: userId,
        status: opts.status,
        version: 1,
        confirmed_at:
          opts.status === "confirmed" ? (opts.confirmedAt ?? null) : null,
        cancelled_at:
          opts.status === "cancelled" ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    if (resp.error || !resp.data) {
      throw new Error(`edit-spec seedResponse failed: ${resp.error?.message}`);
    }
    const responseId = resp.data.id as string;
    if (items.length > 0) {
      const itemRows = await admin
        .from("provider_member_response_items")
        .insert(
          items.map((it) => ({
            response_id: responseId,
            menu_component_id: it.componentId,
            selected_catalog_item_id: it.catalogId,
            quantity: 16,
            canonical_unit: "oz",
            spice_level: it.spice ?? null,
          })),
        );
      if (itemRows.error) {
        throw new Error(
          `edit-spec seedResponse items failed: ${itemRows.error.message}`,
        );
      }
    }
    return responseId;
  }

  const FUTURE_CUTOFF = "2030-05-01T10:00:00.000Z";

  test("a repeated component_group carries BOTH lines onto distinct new components (no unique-violation collapse) and stays confirmed", async ({
    providerTeam,
  }) => {
    // Finding #1 + #5: two 'side' components, a confirmed member with a line in each.
    const owner = await providerTeam.createUser("edit-dup-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Repeated Group Kitchen",
    });
    const cat = await seedItems(providerTeam.admin, providerId, [
      { name: "Side A", group: "side" },
      { name: "Side B", group: "side" },
    ]);
    const { menuDayId, componentIds } = await seedPublishedDay(
      providerTeam.admin,
      providerId,
      owner,
      [
        {
          group: "side",
          defaultCatalogItemId: cat["Side A"]!,
          defaultName: "Side A",
          sortOrder: 0,
        },
        {
          group: "side",
          defaultCatalogItemId: cat["Side B"]!,
          defaultName: "Side B",
          sortOrder: 1,
        },
      ],
    );
    const customer = await providerTeam.createUser("edit-dup-cust");
    await providerTeam.addCustomer(providerId, customer, "approved");
    const confirmedAt = "2030-03-01T09:00:00.000Z";
    await seedResponse(
      providerTeam.admin,
      providerId,
      menuDayId,
      customer.id,
      { status: "confirmed", confirmedAt },
      [
        { componentId: componentIds[0]!, catalogId: cat["Side A"]! },
        { componentId: componentIds[1]!, catalogId: cat["Side B"]! },
      ],
    );

    // The owner edits, keeping the same two same-group components.
    const ownerClient = await providerTeam.signInAs(owner);
    const edit = await ownerClient.rpc("edit_provider_menu_day", {
      p_menu_day_id: menuDayId,
      p_payload: {
        cutoffAt: FUTURE_CUTOFF,
        components: [
          { componentGroup: "side", defaultCatalogItemId: cat["Side A"] },
          { componentGroup: "side", defaultCatalogItemId: cat["Side B"] },
        ],
      },
    });
    // The collapse bug would surface here as a 23505 unique violation.
    expect(edit.error).toBeNull();
    const newDayId = edit.data as string;
    expect(newDayId).not.toBe(menuDayId); // a revision was created (responses existed)

    // The carried response has TWO items on DISTINCT new components.
    const newResp = await providerTeam.admin
      .from("provider_member_responses")
      .select("id, status, confirmed_at")
      .eq("menu_day_id", newDayId)
      .single();
    expect(newResp.data?.status).toBe("confirmed"); // untouched
    // Finding #5: the ORIGINAL confirmation time is preserved (not re-stamped to now()).
    expect(Date.parse(newResp.data?.confirmed_at as string)).toBe(
      Date.parse(confirmedAt),
    );
    const items = await providerTeam.admin
      .from("provider_member_response_items")
      .select("menu_component_id")
      .eq("response_id", newResp.data?.id as string);
    expect(items.data?.length).toBe(2);
    const distinct = new Set(
      (items.data ?? []).map((r) => r.menu_component_id),
    );
    expect(distinct.size).toBe(2);

    // The old day is archived + superseded.
    const oldDay = await providerTeam.admin
      .from("provider_menu_days")
      .select("status, superseded_at")
      .eq("id", menuDayId)
      .single();
    expect(oldDay.data?.status).toBe("archived");
    expect(oldDay.data?.superseded_at).not.toBeNull();
  });

  test("a kept line whose new component no longer supports spice resets the response to draft + notifies (never silently dropped)", async ({
    providerTeam,
  }) => {
    // Finding #3: the default flips to a non-spice item; the member's prior spicy pick
    // stays valid as an alternative but its spice would be silently dropped.
    const owner = await providerTeam.createUser("edit-spice-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Spice Drop Kitchen",
    });
    const cat = await seedItems(providerTeam.admin, providerId, [
      { name: "Spicy Dal", group: "dal_or_legume", spice: true },
      { name: "Plain Dal", group: "dal_or_legume", spice: false },
    ]);
    const { menuDayId, componentIds } = await seedPublishedDay(
      providerTeam.admin,
      providerId,
      owner,
      [
        {
          group: "dal_or_legume",
          defaultCatalogItemId: cat["Spicy Dal"]!,
          defaultName: "Spicy Dal",
          spice: true,
          sortOrder: 0,
        },
      ],
    );
    const customer = await providerTeam.createUser("edit-spice-cust");
    await providerTeam.addCustomer(providerId, customer, "approved");
    await seedResponse(
      providerTeam.admin,
      providerId,
      menuDayId,
      customer.id,
      { status: "confirmed", confirmedAt: "2030-03-01T09:00:00.000Z" },
      [
        {
          componentId: componentIds[0]!,
          catalogId: cat["Spicy Dal"]!,
          spice: "spicy",
        },
      ],
    );

    // Edit: the dal default becomes the NON-spice item; the spicy item stays valid as an
    // alternative (so the prior selection is "kept" — but its spice can no longer carry).
    const ownerClient = await providerTeam.signInAs(owner);
    const edit = await ownerClient.rpc("edit_provider_menu_day", {
      p_menu_day_id: menuDayId,
      p_payload: {
        cutoffAt: FUTURE_CUTOFF,
        components: [
          {
            componentGroup: "dal_or_legume",
            defaultCatalogItemId: cat["Plain Dal"],
            alternativeCatalogItemIds: [cat["Spicy Dal"]],
          },
        ],
      },
    });
    expect(edit.error).toBeNull();
    const newDayId = edit.data as string;

    const newResp = await providerTeam.admin
      .from("provider_member_responses")
      .select("id, status")
      .eq("menu_day_id", newDayId)
      .single();
    // Touched → reset to draft (the member must re-confirm), NOT silently kept confirmed.
    expect(newResp.data?.status).toBe("draft");
    // The carried line dropped the now-unsupported spice (server-derived).
    const items = await providerTeam.admin
      .from("provider_member_response_items")
      .select("spice_level")
      .eq("response_id", newResp.data?.id as string);
    expect(items.data?.length).toBe(1);
    expect(items.data?.[0]?.spice_level).toBeNull();
    // The member was notified to re-confirm.
    const notes = await providerTeam.admin
      .from("provider_notifications")
      .select("recipient_user_id")
      .eq("provider_id", providerId)
      .eq("event_type", "provider_menu_revised");
    expect((notes.data ?? []).map((n) => n.recipient_user_id)).toContain(
      customer.id,
    );
  });

  test("a newly-duplicated required component with no carried line resets the response to draft + notifies", async ({
    providerTeam,
  }) => {
    // Finding #4: old day has one required 'side'; the edit adds a SECOND required 'side'
    // the member never picked — the group-only check used to call this "covered".
    const owner = await providerTeam.createUser("edit-req-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Duplicated Required Kitchen",
    });
    const cat = await seedItems(providerTeam.admin, providerId, [
      { name: "Side A", group: "side" },
      { name: "Side B", group: "side" },
    ]);
    const { menuDayId, componentIds } = await seedPublishedDay(
      providerTeam.admin,
      providerId,
      owner,
      [
        {
          group: "side",
          defaultCatalogItemId: cat["Side A"]!,
          defaultName: "Side A",
          required: true,
          sortOrder: 0,
        },
      ],
    );
    const customer = await providerTeam.createUser("edit-req-cust");
    await providerTeam.addCustomer(providerId, customer, "approved");
    await seedResponse(
      providerTeam.admin,
      providerId,
      menuDayId,
      customer.id,
      { status: "confirmed", confirmedAt: "2030-03-01T09:00:00.000Z" },
      [{ componentId: componentIds[0]!, catalogId: cat["Side A"]! }],
    );

    // Edit: TWO required 'side' components now; the member only covered the first.
    const ownerClient = await providerTeam.signInAs(owner);
    const edit = await ownerClient.rpc("edit_provider_menu_day", {
      p_menu_day_id: menuDayId,
      p_payload: {
        cutoffAt: FUTURE_CUTOFF,
        components: [
          {
            componentGroup: "side",
            defaultCatalogItemId: cat["Side A"],
            isRequired: true,
          },
          {
            componentGroup: "side",
            defaultCatalogItemId: cat["Side B"],
            isRequired: true,
          },
        ],
      },
    });
    expect(edit.error).toBeNull();
    const newDayId = edit.data as string;

    const newResp = await providerTeam.admin
      .from("provider_member_responses")
      .select("status")
      .eq("menu_day_id", newDayId)
      .single();
    expect(newResp.data?.status).toBe("draft"); // uncovered required slot → touched
    const notes = await providerTeam.admin
      .from("provider_notifications")
      .select("recipient_user_id")
      .eq("provider_id", providerId)
      .eq("event_type", "provider_menu_revised");
    expect((notes.data ?? []).map((n) => n.recipient_user_id)).toContain(
      customer.id,
    );
  });

  test("a day whose only responses are cancelled edits IN PLACE (no needless revision)", async ({
    providerTeam,
  }) => {
    // Finding #6: cancelled responses are not a live order, so the edit applies in place
    // (same day id, no archived predecessor), clearing the cancelled lines first so the
    // RESTRICT FK on response items doesn't block the component rebuild.
    const owner = await providerTeam.createUser("edit-canc-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Cancelled Only Kitchen",
    });
    const cat = await seedItems(providerTeam.admin, providerId, [
      { name: "Side A", group: "side" },
    ]);
    const { menuDayId, componentIds } = await seedPublishedDay(
      providerTeam.admin,
      providerId,
      owner,
      [
        {
          group: "side",
          defaultCatalogItemId: cat["Side A"]!,
          defaultName: "Side A",
          sortOrder: 0,
        },
      ],
    );
    const customer = await providerTeam.createUser("edit-canc-cust");
    await providerTeam.addCustomer(providerId, customer, "approved");
    // A cancelled response that still has a line (references the old component, RESTRICT).
    const cancelledId = await seedResponse(
      providerTeam.admin,
      providerId,
      menuDayId,
      customer.id,
      { status: "cancelled" },
      [{ componentId: componentIds[0]!, catalogId: cat["Side A"]! }],
    );

    const ownerClient = await providerTeam.signInAs(owner);
    const edit = await ownerClient.rpc("edit_provider_menu_day", {
      p_menu_day_id: menuDayId,
      p_payload: {
        cutoffAt: FUTURE_CUTOFF,
        components: [
          { componentGroup: "side", defaultCatalogItemId: cat["Side A"] },
        ],
      },
    });
    expect(edit.error).toBeNull();
    // In place: the SAME day id is returned (no revision).
    expect(edit.data as string).toBe(menuDayId);

    // Exactly one day for the date, still published, not superseded.
    const days = await providerTeam.admin
      .from("provider_menu_days")
      .select("id, status, superseded_at")
      .eq("provider_id", providerId);
    expect(days.data?.length).toBe(1);
    expect(days.data?.[0]?.status).toBe("published");
    expect(days.data?.[0]?.superseded_at).toBeNull();

    // The cancelled response row survives (roster) but its lines were cleared.
    const stillCancelled = await providerTeam.admin
      .from("provider_member_responses")
      .select("status")
      .eq("id", cancelledId)
      .single();
    expect(stillCancelled.data?.status).toBe("cancelled");
    const leftoverItems = await providerTeam.admin
      .from("provider_member_response_items")
      .select("id")
      .eq("response_id", cancelledId);
    expect(leftoverItems.data?.length).toBe(0);
  });
});

test.describe("Provider integration — member removal cancels pending responses (ADO #85 / decision #37)", () => {
  test("removing a member cancels their draft + confirmed responses on still-open days, leaves locked-day responses immutable, and notifies the member", async ({
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("rm-cancel-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Removal Cancel Kitchen",
    });
    const customer = await providerTeam.createUser("rm-cancel-cust");
    await providerTeam.addCustomer(providerId, customer, "approved");

    // An OPEN day (cutoff in the future) with a CONFIRMED response → must be cancelled.
    const openSeed = await providerTeam.seedMenuDay(providerId, owner, {
      status: "published",
      cutoffHoursFromNow: 8,
    });
    const confirmedId = await providerTeam.seedConfirmedResponse(
      providerId,
      openSeed,
      customer,
    );

    // A second OPEN day with a DRAFT response → must also be cancelled (draft is pending).
    const draftSeed = await providerTeam.seedMenuDay(providerId, owner, {
      status: "published",
      cutoffHoursFromNow: 8,
    });
    const draftResp = await providerTeam.admin
      .from("provider_member_responses")
      .insert({
        provider_id: providerId,
        menu_day_id: draftSeed.menuDayId,
        member_user_id: customer.id,
        status: "draft",
        version: 1,
      })
      .select("id")
      .single();
    expect(draftResp.error).toBeNull();
    const draftId = draftResp.data?.id as string;
    const draftItem = await providerTeam.admin
      .from("provider_member_response_items")
      .insert({
        response_id: draftId,
        menu_component_id: draftSeed.dalComponentId,
        selected_catalog_item_id: draftSeed.rajmaCatalogId,
        quantity: 16,
        canonical_unit: "oz",
      });
    expect(draftItem.error).toBeNull();

    // A LOCKED day (cutoff passed) with a CONFIRMED response → immutable, must be LEFT.
    const lockedSeed = await providerTeam.seedMenuDay(providerId, owner, {
      status: "locked",
      cutoffHoursFromNow: -1,
    });
    const lockedId = await providerTeam.seedConfirmedResponse(
      providerId,
      lockedSeed,
      customer,
    );

    // Resolve the customer's membership id (addCustomer doesn't return it).
    const membership = await providerTeam.admin
      .from("provider_memberships")
      .select("id")
      .eq("provider_id", providerId)
      .eq("user_id", customer.id)
      .eq("role", "customer")
      .single();
    expect(membership.error).toBeNull();
    const memberId = membership.data?.id as string;

    // The owner removes the member (the RPC self-gates on is_provider_owner).
    const ownerClient = await providerTeam.signInAs(owner);
    const removed = await ownerClient.rpc("remove_provider_member", {
      p_provider_id: providerId,
      p_member_id: memberId,
    });
    expect(removed.error).toBeNull();

    // Membership is removed.
    const after = await providerTeam.admin
      .from("provider_memberships")
      .select("status, removed_at")
      .eq("id", memberId)
      .single();
    expect(after.data?.status).toBe("removed");
    expect(after.data?.removed_at).not.toBeNull();

    // The two open-day responses (confirmed + draft) are now cancelled, version bumped.
    const open = await providerTeam.admin
      .from("provider_member_responses")
      .select("status, cancelled_at, version")
      .in("id", [confirmedId, draftId]);
    expect(open.data?.length).toBe(2);
    for (const r of open.data ?? []) {
      expect(r.status).toBe("cancelled");
      expect(r.cancelled_at).not.toBeNull();
      expect(r.version).toBe(2); // 1 → 2
    }

    // The locked-day response is untouched (past-cutoff days are immutable).
    const locked = await providerTeam.admin
      .from("provider_member_responses")
      .select("status, version")
      .eq("id", lockedId)
      .single();
    expect(locked.data?.status).toBe("confirmed");
    expect(locked.data?.version).toBe(1);

    // Both the removal audit AND the removal-driven cancellation event were written.
    const events = await providerTeam.admin
      .from("provider_activity_events")
      .select("event_type, new_value")
      .eq("provider_id", providerId)
      .eq("entity_id", memberId);
    const types = (events.data ?? []).map((e) => e.event_type);
    expect(types).toContain("provider_member_removed");
    expect(types).toContain("provider_member_responses_cancelled");
    const cancelEvent = (events.data ?? []).find(
      (e) => e.event_type === "provider_member_responses_cancelled",
    );
    expect(
      (cancelEvent?.new_value as { cancelledResponseCount: number })
        ?.cancelledResponseCount,
    ).toBe(2);

    // The removed member was notified about the cancelled orders (decision #37).
    const notes = await providerTeam.admin
      .from("provider_notifications")
      .select("recipient_user_id, title")
      .eq("provider_id", providerId)
      .eq("event_type", "provider_member_responses_cancelled");
    expect((notes.data ?? []).map((n) => n.recipient_user_id)).toContain(
      customer.id,
    );
    expect(notes.data?.[0]?.title).toBe("Orders cancelled");
  });

  test("removing a member with no open-day orders is audit-only — no cancellation event, no member notification", async ({
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("rm-noop-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Removal No-Op Kitchen",
    });
    const customer = await providerTeam.createUser("rm-noop-cust");
    await providerTeam.addCustomer(providerId, customer, "approved");

    // Only a LOCKED-day confirmed response exists — nothing cancellable.
    const lockedSeed = await providerTeam.seedMenuDay(providerId, owner, {
      status: "locked",
      cutoffHoursFromNow: -1,
    });
    await providerTeam.seedConfirmedResponse(providerId, lockedSeed, customer);

    const membership = await providerTeam.admin
      .from("provider_memberships")
      .select("id")
      .eq("provider_id", providerId)
      .eq("user_id", customer.id)
      .eq("role", "customer")
      .single();
    const memberId = membership.data?.id as string;

    const ownerClient = await providerTeam.signInAs(owner);
    const removed = await ownerClient.rpc("remove_provider_member", {
      p_provider_id: providerId,
      p_member_id: memberId,
    });
    expect(removed.error).toBeNull();

    // Removal audit was written, but NO cancellation event and NO member notification.
    const events = await providerTeam.admin
      .from("provider_activity_events")
      .select("event_type")
      .eq("provider_id", providerId)
      .eq("entity_id", memberId);
    const types = (events.data ?? []).map((e) => e.event_type);
    expect(types).toContain("provider_member_removed");
    expect(types).not.toContain("provider_member_responses_cancelled");

    const notes = await providerTeam.admin
      .from("provider_notifications")
      .select("id")
      .eq("provider_id", providerId)
      .eq("recipient_user_id", customer.id);
    expect(notes.data?.length).toBe(0);
  });

  test("after a menu REVISION, removal cancels only the LIVE response — the orphaned response on the archived/superseded prior day is left untouched (count = 1, not 2)", async ({
    providerTeam,
  }) => {
    // Regression for the over-cancellation bug: a revision (pmp_20) carries the live
    // response forward onto a new published day and stamps the PRIOR day
    // status='archived', superseded_at=now() while LEAVING the prior day's confirmed
    // response row in place (with the prior day's still-future cutoff). The removal
    // cancel gate must only ever touch the LIVE published day, never the superseded one.
    const owner = await providerTeam.createUser("rm-rev-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Removal Revision Kitchen",
    });
    const customer = await providerTeam.createUser("rm-rev-cust");
    await providerTeam.addCustomer(providerId, customer, "approved");

    // A published, open day (cutoff +8h) with a confirmed response.
    const seed = await providerTeam.seedMenuDay(providerId, owner, {
      status: "published",
      cutoffHoursFromNow: 8,
    });
    await providerTeam.seedConfirmedResponse(providerId, seed, customer);
    const priorDayId = seed.menuDayId;

    // Edit the published day through the production writer. A LIVE response exists, so
    // this takes the REVISION branch: a new published day is created (response carried
    // forward) and the prior day is archived + superseded.
    const ownerClient = await providerTeam.signInAs(owner);
    const futureCutoff = new Date(
      Date.now() + 8 * 60 * 60 * 1000,
    ).toISOString();
    const revised = await ownerClient.rpc("edit_provider_menu_day", {
      p_menu_day_id: priorDayId,
      p_payload: {
        cutoffAt: futureCutoff,
        note: null,
        components: [
          {
            componentGroup: "dal_or_legume",
            defaultCatalogItemId: seed.rajmaCatalogId,
            isRequired: true,
            sortOrder: 0,
            alternativeCatalogItemIds: [seed.chanaCatalogId],
            customizationGroups: [],
          },
        ],
      },
    });
    expect(revised.error).toBeNull();
    const liveDayId = revised.data as string;
    expect(liveDayId).not.toBe(priorDayId);

    // Sanity: the prior day is archived + superseded, the live day is the new published
    // revision, and BOTH carry a draft/confirmed response row for the customer.
    const priorDay = await providerTeam.admin
      .from("provider_menu_days")
      .select("status, superseded_at")
      .eq("id", priorDayId)
      .single();
    expect(priorDay.data?.status).toBe("archived");
    expect(priorDay.data?.superseded_at).not.toBeNull();

    const priorRespBefore = await providerTeam.admin
      .from("provider_member_responses")
      .select("id, status, version")
      .eq("menu_day_id", priorDayId)
      .eq("member_user_id", customer.id)
      .single();
    expect(["draft", "confirmed"]).toContain(priorRespBefore.data?.status);

    // Remove the member.
    const membership = await providerTeam.admin
      .from("provider_memberships")
      .select("id")
      .eq("provider_id", providerId)
      .eq("user_id", customer.id)
      .eq("role", "customer")
      .single();
    const memberId = membership.data?.id as string;
    const removed = await ownerClient.rpc("remove_provider_member", {
      p_provider_id: providerId,
      p_member_id: memberId,
    });
    expect(removed.error).toBeNull();

    // The LIVE day's response is cancelled.
    const liveResp = await providerTeam.admin
      .from("provider_member_responses")
      .select("status")
      .eq("menu_day_id", liveDayId)
      .eq("member_user_id", customer.id)
      .single();
    expect(liveResp.data?.status).toBe("cancelled");

    // The orphaned response on the ARCHIVED/SUPERSEDED prior day is UNTOUCHED — same
    // status and same version as before the removal (the buggy broad gate would have
    // cancelled it and bumped its version too).
    const priorRespAfter = await providerTeam.admin
      .from("provider_member_responses")
      .select("status, version")
      .eq("id", priorRespBefore.data?.id as string)
      .single();
    expect(priorRespAfter.data?.status).toBe(priorRespBefore.data?.status);
    expect(priorRespAfter.data?.version).toBe(priorRespBefore.data?.version);

    // Exactly ONE live order was cancelled — the count must not double-count the
    // superseded day, and menuDayIds must reference only the live day.
    const events = await providerTeam.admin
      .from("provider_activity_events")
      .select("event_type, new_value")
      .eq("provider_id", providerId)
      .eq("entity_id", memberId)
      .eq("event_type", "provider_member_responses_cancelled");
    const cancelEvent = events.data?.[0];
    expect(
      (cancelEvent?.new_value as { cancelledResponseCount: number })
        ?.cancelledResponseCount,
    ).toBe(1);
    const menuDayIds = (cancelEvent?.new_value as { menuDayIds: string[] })
      ?.menuDayIds;
    expect(menuDayIds).toContain(liveDayId);
    expect(menuDayIds).not.toContain(priorDayId);
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
