import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { ForbiddenError, InternalError, NotFoundError } from "@/lib/errors";
import { getEmailTransport } from "@/lib/events/notifier";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAuthUser: vi.fn() }));
vi.mock("@/lib/events/notifier", () => ({ getEmailTransport: vi.fn() }));
vi.mock("./batch-read", () => ({ getProviderBatch: vi.fn() }));

import { getProviderBatch } from "./batch-read";
import { sendProviderSummaryEmail } from "./summary-email";

const BATCH = "66666666-6666-6666-6666-666666666666";
const PROVIDER = "11111111-1111-1111-1111-111111111111";
const APP = "https://app.test";

const BATCH_READ = {
  batchId: BATCH,
  menuDayId: "44444444-4444-4444-4444-444444444444",
  revision: 1,
  status: "current",
  generatedAt: "2026-06-13T18:00:00Z",
  emailStatus: null,
  providerName: "Tiffins by Asha",
  menuDate: "2026-06-13",
  cutoffAt: "2026-06-13T10:00:00Z",
  totals: { confirmed: 2, autoAccepted: 1, cancelled: 0, noResponse: 1 },
  aggregateLines: [],
  individualLines: [],
};

/**
 * Stub the per-request client: `from(table)` resolves a `.select().eq().single()`
 * chain off a per-table fixture, and `rpc` is a spy. Returns the rpc spy.
 */
function stubClient(opts: {
  recipients?: string[] | null;
  batchRowError?: unknown;
  orgError?: unknown;
  rpcError?: unknown;
}) {
  const rpc = vi.fn().mockResolvedValue({ error: opts.rpcError ?? null });
  const single = (table: string) => {
    if (table === "provider_preparation_batches") {
      return Promise.resolve({
        data: opts.batchRowError ? null : { provider_id: PROVIDER },
        error: opts.batchRowError ?? null,
      });
    }
    return Promise.resolve({
      data: opts.orgError
        ? null
        : { summary_email_recipients: opts.recipients ?? [] },
      error: opts.orgError ?? null,
    });
  };
  const from = vi.fn((table: string) => ({
    select: () => ({ eq: () => ({ single: () => single(table) }) }),
  }));
  vi.mocked(createServerSupabaseClient).mockResolvedValue({
    from,
    rpc,
  } as never);
  return rpc;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthUser).mockResolvedValue({ id: "owner" } as never);
  vi.mocked(getProviderBatch).mockResolvedValue(BATCH_READ as never);
});

describe("sendProviderSummaryEmail", () => {
  it("404s a non-uuid batch id without reading the batch", async () => {
    await expect(
      sendProviderSummaryEmail("not-a-uuid", APP),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(getProviderBatch).not.toHaveBeenCalled();
  });

  it("propagates the owner gate from getProviderBatch (non-owner → 403)", async () => {
    vi.mocked(getProviderBatch).mockRejectedValue(
      new ForbiddenError("Only the provider owner can do that."),
    );
    stubClient({ recipients: ["owner@x.com"] });
    await expect(sendProviderSummaryEmail(BATCH, APP)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("returns no_recipient and does NOT touch email_status when none configured", async () => {
    const rpc = stubClient({ recipients: [] });
    const result = await sendProviderSummaryEmail(BATCH, APP);
    expect(result).toEqual({ emailStatus: "no_recipient", recipientCount: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sends to every recipient and records 'sent'", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getEmailTransport).mockReturnValue({ send } as never);
    const rpc = stubClient({ recipients: ["a@x.com", "b@x.com"] });

    const result = await sendProviderSummaryEmail(BATCH, APP);

    expect(send).toHaveBeenCalledTimes(2);
    // Subject + links built from the persisted revision.
    const firstSend = send.mock.calls[0]![0] as {
      subject: string;
      html: string;
    };
    expect(firstSend.subject).toBe(
      "Preparation summary — 2026-06-13 — Tiffins by Asha",
    );
    expect(firstSend.html).toContain(`${APP}/provider/preparation/${BATCH}`);
    expect(rpc).toHaveBeenCalledWith("set_provider_batch_email_status", {
      p_batch_id: BATCH,
      p_status: "sent",
    });
    expect(result).toEqual({ emailStatus: "sent", recipientCount: 2 });
  });

  it("records 'failed' when the transport is unconfigured (null)", async () => {
    vi.mocked(getEmailTransport).mockReturnValue(null);
    const rpc = stubClient({ recipients: ["a@x.com"] });

    const result = await sendProviderSummaryEmail(BATCH, APP);

    expect(rpc).toHaveBeenCalledWith("set_provider_batch_email_status", {
      p_batch_id: BATCH,
      p_status: "failed",
    });
    expect(result).toEqual({ emailStatus: "failed", recipientCount: 1 });
  });

  it("records 'failed' when a send throws (does not reject — best-effort)", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("smtp down"));
    vi.mocked(getEmailTransport).mockReturnValue({ send } as never);
    const rpc = stubClient({ recipients: ["a@x.com", "b@x.com"] });

    const result = await sendProviderSummaryEmail(BATCH, APP);

    expect(result.emailStatus).toBe("failed");
    expect(rpc).toHaveBeenCalledWith("set_provider_batch_email_status", {
      p_batch_id: BATCH,
      p_status: "failed",
    });
  });

  it("surfaces a failure to persist the email status as an internal error", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getEmailTransport).mockReturnValue({ send } as never);
    stubClient({
      recipients: ["a@x.com"],
      rpcError: { code: "XX999", message: "boom" },
    });
    await expect(sendProviderSummaryEmail(BATCH, APP)).rejects.toBeInstanceOf(
      InternalError,
    );
  });
});
