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
  it("dispatches through the registry's email adapter", async () => {
    const notifier = new EmailNotifier({ send: vi.fn() });
    const sendInvite = vi.spyOn(notifier, "sendInvite").mockResolvedValue();
    const registry = new NotifierRegistry().register(notifier);

    await sendInviteEmail(INVITE, registry);
    expect(sendInvite).toHaveBeenCalledWith(INVITE);
  });

  it("swallows a transport failure (best-effort — never fails invite creation)", async () => {
    const notifier = new EmailNotifier({
      send: vi.fn().mockRejectedValue(new Error("down")),
    });
    const registry = new NotifierRegistry().register(notifier);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(sendInviteEmail(INVITE, registry)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("is a no-op when no email adapter is registered", async () => {
    const registry = new NotifierRegistry();
    await expect(sendInviteEmail(INVITE, registry)).resolves.toBeUndefined();
  });
});
