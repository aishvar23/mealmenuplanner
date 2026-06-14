import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures/provider";
import type { ProviderTeam, ProviderUser } from "../fixtures/provider";
import { signInWithPassword } from "../helpers/auth";

/**
 * Provider events + summary email (MP-A-170 + MP-A-161; UC-NOTIFY-003,
 * UC-OVERRIDE-003; contract 03 § 9/§ 13; spec § 19.4).
 *
 * MP-A-170: the member-lifecycle endpoints emit `provider_activity_events` and fan
 * out `provider_notifications` per `emit_provider_event` — approve notifies the
 * approved customer; reject writes the audit but never notifies the rejected
 * customer. MP-A-161: the owner sends/resends the preparation-summary email built
 * from a persisted batch revision; the route is owner-only and best-effort (returns
 * an honest `emailStatus`, persisted on the batch). All exercised through the real
 * `/api/*` routes, with service-role reads for the audit/notification assertions.
 */

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

/** The membership row id for `customer` in `providerId` (the API addresses members
 * by membership id). */
async function membershipId(
  team: ProviderTeam,
  providerId: string,
  customer: ProviderUser,
): Promise<string> {
  const row = await team.admin
    .from("provider_memberships")
    .select("id")
    .eq("provider_id", providerId)
    .eq("user_id", customer.id)
    .single();
  if (row.error || !row.data) {
    throw new Error(`E2E: membership lookup failed: ${row.error?.message}`);
  }
  return row.data.id as string;
}

test.describe("Provider events — member lifecycle (MP-A-170)", () => {
  test("approving a customer audits AND notifies them (UC-NOTIFY-003)", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("evt-approve-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Notify Kitchen",
    });
    const customer = await providerTeam.createUser("evt-approve-cust");
    await providerTeam.addCustomer(providerId, customer, "awaiting_approval");
    const memberId = await membershipId(providerTeam, providerId, customer);

    await signIn(page, owner.email, owner.password);
    const res = await page.request.post(
      `/api/providers/${providerId}/members/${memberId}/approve`,
    );
    expect(res.ok()).toBe(true);

    // Audit row written for the provider.
    const events = await providerTeam.admin
      .from("provider_activity_events")
      .select("event_type")
      .eq("provider_id", providerId)
      .eq("event_type", "provider_member_approved");
    expect(events.data?.length).toBe(1);

    // The approved customer received exactly one notification.
    const notifs = await providerTeam.admin
      .from("provider_notifications")
      .select("event_type, recipient_user_id")
      .eq("provider_id", providerId)
      .eq("recipient_user_id", customer.id);
    expect(notifs.data?.length).toBe(1);
    expect(notifs.data?.[0]?.event_type).toBe("provider_member_approved");
  });

  test("rejecting a customer audits but does NOT notify them", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("evt-reject-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Reject Kitchen",
    });
    const customer = await providerTeam.createUser("evt-reject-cust");
    await providerTeam.addCustomer(providerId, customer, "awaiting_approval");
    const memberId = await membershipId(providerTeam, providerId, customer);

    await signIn(page, owner.email, owner.password);
    const res = await page.request.post(
      `/api/providers/${providerId}/members/${memberId}/reject`,
    );
    expect(res.ok()).toBe(true);

    const events = await providerTeam.admin
      .from("provider_activity_events")
      .select("event_type")
      .eq("provider_id", providerId)
      .eq("event_type", "provider_member_rejected");
    expect(events.data?.length).toBe(1);

    // No notification fans out to a rejected customer.
    const notifs = await providerTeam.admin
      .from("provider_notifications")
      .select("id")
      .eq("provider_id", providerId)
      .eq("recipient_user_id", customer.id);
    expect(notifs.data?.length).toBe(0);
  });
});

test.describe("Provider summary email (MP-A-161)", () => {
  test("owner resends the summary; status is persisted + an event is logged", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("email-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Email Kitchen",
    });
    // Configure a recipient so this isn't the no_recipient path.
    await providerTeam.admin
      .from("provider_organizations")
      .update({ summary_email_recipients: ["kitchen@example.com"] })
      .eq("id", providerId);
    const { batchId } = await providerTeam.seedBatch(owner, providerId);

    await signIn(page, owner.email, owner.password);
    const res = await page.request.post(
      `/api/provider-preparation-batches/${batchId}/resend-email`,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    // No live transport in test → 'failed'; with one configured → 'sent'. Either way
    // it's a terminal status that gets persisted + audited (never 'no_recipient' here).
    expect(["sent", "failed"]).toContain(body.emailStatus);
    expect(body.recipientCount).toBe(1);

    const batch = await providerTeam.admin
      .from("provider_preparation_batches")
      .select("email_status")
      .eq("id", batchId)
      .single();
    expect(batch.data?.email_status).toBe(body.emailStatus);

    const events = await providerTeam.admin
      .from("provider_activity_events")
      .select("event_type")
      .eq("provider_id", providerId)
      .in("event_type", ["provider_email_sent", "provider_email_failed"]);
    expect(events.data?.length).toBeGreaterThanOrEqual(1);
  });

  test("returns no_recipient when the provider has no recipients configured", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("email-norecip-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "No Recipient Kitchen",
    });
    const { batchId } = await providerTeam.seedBatch(owner, providerId);

    await signIn(page, owner.email, owner.password);
    const res = await page.request.post(
      `/api/provider-preparation-batches/${batchId}/resend-email`,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ emailStatus: "no_recipient", recipientCount: 0 });

    // email_status stays untouched (NULL) when there was nothing to send.
    const batch = await providerTeam.admin
      .from("provider_preparation_batches")
      .select("email_status")
      .eq("id", batchId)
      .single();
    expect(batch.data?.email_status).toBeNull();
  });

  test("a non-owner is forbidden; an unknown batch is a 404", async ({
    page,
    providerTeam,
  }) => {
    const owner = await providerTeam.createUser("email-gate-owner");
    const providerId = await providerTeam.createProvider(owner, {
      name: "Gate Kitchen",
    });
    const { batchId } = await providerTeam.seedBatch(owner, providerId);

    const outsider = await providerTeam.createUser("email-outsider");
    await providerTeam.addCustomer(providerId, outsider, "approved");
    await signIn(page, outsider.email, outsider.password);

    const forbidden = await page.request.post(
      `/api/provider-preparation-batches/${batchId}/resend-email`,
    );
    expect(forbidden.status()).toBe(403);

    const missing = await page.request.post(
      `/api/provider-preparation-batches/00000000-0000-0000-0000-000000000000/resend-email`,
    );
    expect(missing.status()).toBe(404);
  });
});
