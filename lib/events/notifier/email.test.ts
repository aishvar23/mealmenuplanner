import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { EmailNotifier } from "./email";
import type { EmailMessage, EmailTransport } from "./email-transport";
import type { InviteEmailParams } from "./invite-email";

const INVITE: InviteEmailParams = {
  toEmail: "guest@test.local",
  inviteLink: "https://app.test/invite/secret",
  householdName: "Suhane Household",
  inviterName: "Aishvarya",
  expiresAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EmailNotifier", () => {
  it("sends the rendered invite through the transport", async () => {
    const sent: EmailMessage[] = [];
    const transport: EmailTransport = {
      send: vi.fn(async (m) => {
        sent.push(m);
      }),
    };
    const notifier = new EmailNotifier(transport);

    expect(notifier.isConfigured).toBe(true);
    await notifier.sendInvite(INVITE);

    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(sent[0]!.to).toBe("guest@test.local");
    expect(sent[0]!.subject).toContain("Suhane Household");
    expect(sent[0]!.text).toContain("https://app.test/invite/secret");
  });

  it("is a no-op when no transport is configured (best-effort)", async () => {
    const notifier = new EmailNotifier(null);
    expect(notifier.isConfigured).toBe(false);
    await expect(notifier.sendInvite(INVITE)).resolves.toBeUndefined();
  });

  it("propagates a transport error so the router can swallow it", async () => {
    const transport: EmailTransport = {
      send: vi.fn().mockRejectedValue(new Error("smtp down")),
    };
    await expect(
      new EmailNotifier(transport).sendInvite(INVITE),
    ).rejects.toThrow("smtp down");
  });

  it("the port send() is a no-op in MVP routing", async () => {
    const transport: EmailTransport = { send: vi.fn() };
    await new EmailNotifier(transport).send({
      householdId: "h",
      recipientUserId: "r",
      actorUserId: null,
      eventType: "member_invited",
      title: "t",
      message: "m",
    });
    expect(transport.send).not.toHaveBeenCalled();
  });
});
