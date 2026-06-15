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
