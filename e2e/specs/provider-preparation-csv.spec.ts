import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures/provider";
import type { ProviderUser } from "../fixtures/provider";
import { signInWithPassword } from "../helpers/auth";

/**
 * Owner preparation CSV exports (MP-A-160, UC-BATCH-003/004; contract 03 § 11).
 *
 * A real, post-cutoff batch is built via the live `process_provider_cutoff` RPC
 * over service-role-seeded responses, then the owner downloads the aggregate and
 * individual CSVs through the real `/api/*` routes. Asserts the contract headers,
 * the UTF-8 BOM, deterministic content, reconciliation (the per-member portions
 * sum to the aggregate), and the owner-only gate (a customer is forbidden).
 */

const BOM = "\uFEFF";

async function signIn(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await signInWithPassword(page, email, password);
  await page.waitForURL((url) => !url.pathname.includes("/sign-in"), {
    timeout: 30_000,
  });
}

/** Seed a locked, cut-off menu day with one confirmed (+extra) + one auto-accepted
 * member, run the cutoff, and return the current batch id. */
async function seedBatch(
  providerTeam: import("../fixtures/provider").ProviderTeam,
  owner: ProviderUser,
  providerId: string,
): Promise<string> {
  const admin = providerTeam.admin;
  const seed = await providerTeam.seedMenuDay(providerId, owner, {
    status: "published",
    cutoffHoursFromNow: -1, // cutoff already passed → eligible for the sweep
  });

  // The bread default (Roti) catalog id + the dal extra-portion option id aren't
  // in the seed return — look them up to build a realistic confirmed response.
  const breadComp = await admin
    .from("provider_menu_components")
    .select("default_catalog_item_id")
    .eq("id", seed.breadComponentId)
    .single();
  const rotiCatalogId = breadComp.data!.default_catalog_item_id as string;
  // Scope the extra-portion option to THIS menu day's dal component — never look it
  // up by code alone, or a parallel test's identically-coded option could be picked,
  // creating a cross-org customization reference that breaks teardown ordering.
  const group = await admin
    .from("provider_customization_groups")
    .select("id")
    .eq("menu_component_id", seed.dalComponentId)
    .single();
  const option = await admin
    .from("provider_customization_options")
    .select("id")
    .eq("customization_group_id", group.data!.id as string)
    .single();
  const optionId = option.data!.id as string;

  // A confirmed customer: spicy/low-salt rajma (+ one extra portion) and roti.
  const confirmed = await providerTeam.createUser("csv-confirmed");
  await providerTeam.addCustomer(providerId, confirmed, "approved");
  const resp = await admin
    .from("provider_member_responses")
    .insert({
      provider_id: providerId,
      menu_day_id: seed.menuDayId,
      member_user_id: confirmed.id,
      status: "confirmed",
      version: 1,
      confirmed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  const responseId = resp.data!.id as string;
  const dalItem = await admin
    .from("provider_member_response_items")
    .insert({
      response_id: responseId,
      menu_component_id: seed.dalComponentId,
      selected_catalog_item_id: seed.rajmaCatalogId,
      quantity: 16,
      canonical_unit: "oz",
      spice_level: "spicy",
      salt_level: "low_salt",
    })
    .select("id")
    .single();
  await admin.from("provider_member_response_items").insert({
    response_id: responseId,
    menu_component_id: seed.breadComponentId,
    selected_catalog_item_id: rotiCatalogId,
    quantity: 2,
    canonical_unit: "piece",
    spice_level: null,
    salt_level: null,
  });
  // One extra portion (+8 oz) on the dal line.
  await admin.from("provider_member_response_customizations").insert({
    response_item_id: dalItem.data!.id as string,
    customization_option_id: optionId,
    quantity: 1,
  });

  // An auto-accept subscriber: the cutoff fills the default package on their behalf.
  const subscriber = await providerTeam.createUser("csv-auto");
  await providerTeam.addCustomer(providerId, subscriber, "approved");
  await providerTeam.addSubscription(providerId, subscriber);

  // Run the real cutoff to lock the day + persist batch revision 1.
  const cutoff = await admin.rpc("process_provider_cutoff", {
    p_menu_day_id: seed.menuDayId,
  });
  if (cutoff.error) {
    throw new Error(
      `E2E: process_provider_cutoff failed: ${cutoff.error.message}`,
    );
  }
  return providerTeam.currentBatchId(seed.menuDayId);
}

/**
 * Parse a CSV body (BOM-stripped) into records of fields, RFC-4180 aware: a quoted
 * field may contain commas, quotes (doubled), and CR/LF. A naive `split(",")` would
 * mis-shift columns the moment a real item name or display name contained a comma and
 * silently weaken every column assertion below, so parse properly instead.
 */
function rows(body: string): string[][] {
  const text = body.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += ch;
        i += 1;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
    } else if (ch === ",") {
      record.push(field);
      field = "";
      i += 1;
    } else if (ch === "\r" && text[i + 1] === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      i += 2;
    } else if (ch === "\n" || ch === "\r") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      i += 1;
    } else {
      field += ch;
      i += 1;
    }
  }
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  // Drop a trailing empty record (renderers end every record with CRLF).
  return records.filter((r) => r.length > 1 || r[0]!.length > 0);
}

test.describe("Provider preparation CSV export (MP-A-160)", () => {
  test("owner downloads the aggregate + individual CSVs; they reconcile", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("csv-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "CSV Kitchen",
    });
    const batchId = await seedBatch(providerTeam, owner, providerId);

    await signIn(page, owner.email, owner.password);

    // ── Aggregate CSV ──
    const aggRes = await page.request.get(
      `/api/provider-preparation-batches/${batchId}/aggregate.csv`,
    );
    expect(aggRes.status()).toBe(200);
    expect(aggRes.headers()["content-type"]).toContain("text/csv");
    expect(aggRes.headers()["content-disposition"]).toContain(
      "preparation-aggregate-",
    );
    const aggBody = await aggRes.text();
    expect(aggBody.startsWith(BOM)).toBe(true);
    const aggRows = rows(aggBody);
    expect(aggRows[0]).toEqual([
      "component_group",
      "item_name",
      "spice_level",
      "salt_level",
      "included_quantity",
      "extra_quantity",
      "total_quantity",
      "canonical_unit",
    ]);
    // The spicy/low-salt rajma line carries the +8 oz extra from the confirmed member.
    const spicyRajma = aggRows.find(
      (r) => r[2] === "spicy" && r[3] === "low_salt",
    );
    expect(spicyRajma).toBeDefined();
    expect(spicyRajma![5]).toBe("8"); // extra_quantity

    // ── Individual CSV ──
    const indRes = await page.request.get(
      `/api/provider-preparation-batches/${batchId}/individual.csv`,
    );
    expect(indRes.status()).toBe(200);
    const indBody = await indRes.text();
    const indRows = rows(indBody);
    expect(indRows[0]).toEqual([
      "member_name",
      "component_group",
      "item_name",
      "spice_level",
      "salt_level",
      "quantity",
      "canonical_unit",
      "is_extra",
    ]);
    // The confirmed member's extra portion appears as a dedicated is_extra=true row.
    const extraRow = indRows.find((r) => r[7] === "true");
    expect(extraRow).toBeDefined();
    expect(extraRow![5]).toBe("8");

    // Reconciliation: summed per-member extras equal the aggregate extras total.
    const indExtraTotal = indRows
      .slice(1)
      .filter((r) => r[7] === "true")
      .reduce((sum, r) => sum + Number(r[5]), 0);
    const aggExtraTotal = aggRows
      .slice(1)
      .reduce((sum, r) => sum + Number(r[5]), 0);
    expect(indExtraTotal).toBe(aggExtraTotal);
  });

  test("a non-owner customer is forbidden from the export", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("csv-forbid-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Forbid Kitchen",
    });
    const batchId = await seedBatch(providerTeam, owner, providerId);

    const outsider = await providerTeam.createUser("csv-outsider");
    await providerTeam.addCustomer(providerId, outsider, "approved");
    await signIn(page, outsider.email, outsider.password);

    const res = await page.request.get(
      `/api/provider-preparation-batches/${batchId}/aggregate.csv`,
    );
    expect(res.status()).toBe(403);
  });

  test("an unknown batch id is a 404 for the owner", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("csv-404-owner");
    await providerTeam.createProvider(owner, { name: "404 Kitchen" });
    await signIn(page, owner.email, owner.password);

    const res = await page.request.get(
      `/api/provider-preparation-batches/00000000-0000-0000-0000-000000000000/aggregate.csv`,
    );
    expect(res.status()).toBe(404);
  });
});
