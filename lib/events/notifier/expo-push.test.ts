import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ExpoPushNotifier } from "./expo-push";
import type { ExpoPushTransport } from "./expo-push-transport";

function fakeTransport() {
  return { send: vi.fn().mockResolvedValue(undefined) } as ExpoPushTransport & {
    send: ReturnType<typeof vi.fn>;
  };
}

const TARGETS = [
  { token: "ExponentPushToken[a]", platform: "ios" },
  { token: "ExponentPushToken[b]", platform: "android" },
];

beforeEach(() => vi.clearAllMocks());

describe("ExpoPushNotifier", () => {
  it("reports unconfigured with no transport and is a no-op", async () => {
    const notifier = new ExpoPushNotifier(null);
    expect(notifier.isConfigured).toBe(false);
    await expect(
      notifier.sendEvent({ targets: TARGETS, title: "t", message: "m" }),
    ).resolves.toBeUndefined();
  });

  it("maps targets to Expo messages and sends them when configured", async () => {
    const transport = fakeTransport();
    const notifier = new ExpoPushNotifier(transport);

    expect(notifier.isConfigured).toBe(true);
    await notifier.sendEvent({
      targets: TARGETS,
      title: "Dinner changed",
      message: "Riya swapped tonight's dish",
      data: { householdId: "h1" },
    });

    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(transport.send).toHaveBeenCalledWith([
      {
        to: "ExponentPushToken[a]",
        title: "Dinner changed",
        body: "Riya swapped tonight's dish",
        data: { householdId: "h1" },
      },
      {
        to: "ExponentPushToken[b]",
        title: "Dinner changed",
        body: "Riya swapped tonight's dish",
        data: { householdId: "h1" },
      },
    ]);
  });

  it("does not call the transport when there are no targets", async () => {
    const transport = fakeTransport();
    const notifier = new ExpoPushNotifier(transport);

    await notifier.sendEvent({ targets: [], title: "t", message: "m" });

    expect(transport.send).not.toHaveBeenCalled();
  });
});
