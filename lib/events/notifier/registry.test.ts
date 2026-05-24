import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { EmailNotifier } from "./email";
import { createNoopNotifier } from "./noop";
import type { NotificationPayload } from "./port";
import { buildDefaultRegistry, NotifierRegistry } from "./registry";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("NotifierRegistry", () => {
  it("registers and resolves adapters by channel", () => {
    const registry = new NotifierRegistry().register(
      createNoopNotifier("push"),
    );
    expect(registry.has("push")).toBe(true);
    expect(registry.get("push")?.channel).toBe("push");
    expect(registry.has("sms")).toBe(false);
    expect(registry.get("sms")).toBeUndefined();
  });

  it("the default registry wires all five channels with email being the EmailNotifier", () => {
    const registry = buildDefaultRegistry();
    expect(new Set(registry.channels)).toEqual(
      new Set(["inApp", "email", "push", "whatsapp", "sms"]),
    );
    expect(registry.get("email")).toBeInstanceOf(EmailNotifier);
  });
});

describe("no-op adapters", () => {
  it("succeed without doing anything", async () => {
    const payload: NotificationPayload = {
      householdId: "h",
      recipientUserId: "r",
      actorUserId: null,
      eventType: "x",
      title: "t",
      message: "m",
    };
    await expect(
      createNoopNotifier("whatsapp").send(payload),
    ).resolves.toBeUndefined();
  });
});
