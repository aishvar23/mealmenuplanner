import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { EmailNotifier } from "./email";
import type { InviteEmailParams } from "./invite-email";
import { NotifierRegistry } from "./registry";
import { sendInviteEmail } from "./router";

const INVITE: InviteEmailParams = {
  toEmail: "guest@test.local",
  inviteLink: "https://app.test/invite/secret",
  householdName: "HH",
  inviterName: "Owner",
  expiresAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendInviteEmail", () => {
  it("dispatches through the registry's email adapter and reports 'sent'", async () => {
    const notifier = new EmailNotifier({ send: vi.fn() });
    const sendInvite = vi.spyOn(notifier, "sendInvite").mockResolvedValue();
    const registry = new NotifierRegistry().register(notifier);

    await expect(sendInviteEmail(INVITE, registry)).resolves.toBe("sent");
    expect(sendInvite).toHaveBeenCalledWith(INVITE);
  });

  it("reports 'failed' on a transport failure (best-effort — never throws)", async () => {
    const notifier = new EmailNotifier({
      send: vi.fn().mockRejectedValue(new Error("down")),
    });
    const registry = new NotifierRegistry().register(notifier);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(sendInviteEmail(INVITE, registry)).resolves.toBe("failed");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("reports 'not_configured' when no email adapter is registered", async () => {
    const registry = new NotifierRegistry();
    await expect(sendInviteEmail(INVITE, registry)).resolves.toBe(
      "not_configured",
    );
  });

  it("reports 'not_configured' when the adapter has no transport", async () => {
    const notifier = new EmailNotifier(null);
    const registry = new NotifierRegistry().register(notifier);
    await expect(sendInviteEmail(INVITE, registry)).resolves.toBe(
      "not_configured",
    );
  });
});
