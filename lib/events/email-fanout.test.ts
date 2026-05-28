import { beforeEach, describe, expect, it, vi } from "vitest";

// email-fanout.ts is server-only and delegates configured-check + send to the
// notifier; stub the marker and the notifier so we can drive both arms.
vi.mock("server-only", () => ({}));
vi.mock("./notifier", () => ({
  isEmailConfigured: vi.fn(),
  sendEventEmail: vi.fn(),
}));

import { sendEventEmails } from "./email-fanout";
import { isEmailConfigured, sendEventEmail } from "./notifier";
import type { EmitEventInput } from "./types";

const HOUSEHOLD = "11111111-1111-1111-1111-111111111111";

const INPUT: EmitEventInput = {
  householdId: HOUSEHOLD,
  eventType: "meal_marked_eating_out",
  entityType: "meal_plan_item",
  vars: { actorName: "Riya", slotLabel: "Saturday dinner" },
};

function fakeClient(rpc: ReturnType<typeof vi.fn>) {
  return { rpc } as unknown as Parameters<typeof sendEventEmails>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendEventEmails", () => {
  it("is a no-op (no DB round-trip) when no email transport is configured", async () => {
    vi.mocked(isEmailConfigured).mockReturnValue(false);
    const rpc = vi.fn();

    await sendEventEmails(fakeClient(rpc), INPUT);

    expect(rpc).not.toHaveBeenCalled();
    expect(sendEventEmail).not.toHaveBeenCalled();
  });

  it("resolves recipients by the event's category + extra ids, and emails each", async () => {
    vi.mocked(isEmailConfigured).mockReturnValue(true);
    vi.mocked(sendEventEmail).mockResolvedValue("sent");
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { user_id: "u1", email: "a@example.com", display_name: "A" },
        { user_id: "u2", email: "c@example.com", display_name: null },
      ],
      error: null,
    });

    await sendEventEmails(fakeClient(rpc), {
      ...INPUT,
      extraRecipientIds: ["33333333-3333-3333-3333-333333333333"],
    });

    expect(rpc).toHaveBeenCalledWith("get_event_email_recipients", {
      p_household_id: HOUSEHOLD,
      p_event_category: "today_meal",
      p_extra_recipient_ids: ["33333333-3333-3333-3333-333333333333"],
    });
    expect(sendEventEmail).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendEventEmail).mock.calls[0]![0]).toMatchObject({
      toEmail: "a@example.com",
    });
  });

  it("sends nothing when no one opted in", async () => {
    vi.mocked(isEmailConfigured).mockReturnValue(true);
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });

    await sendEventEmails(fakeClient(rpc), INPUT);

    expect(sendEventEmail).not.toHaveBeenCalled();
  });

  it("swallows an RPC error without throwing or sending", async () => {
    vi.mocked(isEmailConfigured).mockReturnValue(true);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(
      sendEventEmails(fakeClient(rpc), INPUT),
    ).resolves.toBeUndefined();
    expect(sendEventEmail).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
  });
});
