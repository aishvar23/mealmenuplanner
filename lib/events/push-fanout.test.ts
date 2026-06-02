import { beforeEach, describe, expect, it, vi } from "vitest";

// push-fanout.ts is server-only and delegates configured-check + send to the
// notifier; stub the marker and the notifier so we can drive both arms.
vi.mock("server-only", () => ({}));
vi.mock("./notifier", () => ({
  isPushConfigured: vi.fn(),
  sendEventPush: vi.fn(),
}));

import { isPushConfigured, sendEventPush } from "./notifier";
import { sendEventPushes } from "./push-fanout";
import type { EmitEventInput } from "./types";

const HOUSEHOLD = "11111111-1111-1111-1111-111111111111";

const INPUT: EmitEventInput = {
  householdId: HOUSEHOLD,
  eventType: "meal_marked_eating_out",
  entityType: "meal_plan_item",
  vars: { actorName: "Riya", slotLabel: "Saturday dinner" },
};

function fakeClient(rpc: ReturnType<typeof vi.fn>) {
  return { rpc } as unknown as Parameters<typeof sendEventPushes>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendEventPushes", () => {
  it("is a no-op (no DB round-trip) when no push transport is configured", async () => {
    vi.mocked(isPushConfigured).mockReturnValue(false);
    const rpc = vi.fn();

    await sendEventPushes(fakeClient(rpc), INPUT);

    expect(rpc).not.toHaveBeenCalled();
    expect(sendEventPush).not.toHaveBeenCalled();
  });

  it("resolves device tokens by household + extra ids and pushes to them", async () => {
    vi.mocked(isPushConfigured).mockReturnValue(true);
    vi.mocked(sendEventPush).mockResolvedValue("sent");
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { user_id: "u1", token: "ExponentPushToken[a]", platform: "ios" },
        { user_id: "u2", token: "ExponentPushToken[b]", platform: "android" },
      ],
      error: null,
    });

    await sendEventPushes(fakeClient(rpc), {
      ...INPUT,
      extraRecipientIds: ["33333333-3333-3333-3333-333333333333"],
    });

    expect(rpc).toHaveBeenCalledWith("get_event_push_tokens", {
      p_household_id: HOUSEHOLD,
      p_extra_recipient_ids: ["33333333-3333-3333-3333-333333333333"],
    });
    expect(sendEventPush).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEventPush).mock.calls[0]![0]).toMatchObject({
      targets: [
        { token: "ExponentPushToken[a]", platform: "ios" },
        { token: "ExponentPushToken[b]", platform: "android" },
      ],
      data: { householdId: HOUSEHOLD, eventType: "meal_marked_eating_out" },
    });
  });

  it("sends nothing when no recipient has a device token", async () => {
    vi.mocked(isPushConfigured).mockReturnValue(true);
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });

    await sendEventPushes(fakeClient(rpc), INPUT);

    expect(sendEventPush).not.toHaveBeenCalled();
  });

  it("swallows an RPC error without throwing or sending", async () => {
    vi.mocked(isPushConfigured).mockReturnValue(true);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(
      sendEventPushes(fakeClient(rpc), INPUT),
    ).resolves.toBeUndefined();
    expect(sendEventPush).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
  });
});
