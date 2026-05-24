import { beforeEach, describe, expect, it, vi } from "vitest";

import { InternalError } from "@/lib/errors";

// emit.ts is server-only; stub the marker (the RPC client is passed in).
vi.mock("server-only", () => ({}));

import { emitHouseholdEvent, safeEmitHouseholdEvent } from "./emit";
import type { EmitEventInput } from "./types";

const HOUSEHOLD = "11111111-1111-1111-1111-111111111111";

function fakeClient(rpc: ReturnType<typeof vi.fn>) {
  return { rpc } as unknown as Parameters<typeof emitHouseholdEvent>[0];
}

const BASE: EmitEventInput = {
  householdId: HOUSEHOLD,
  eventType: "meal_marked_eating_out",
  entityType: "meal_plan_item",
  entityId: "22222222-2222-2222-2222-222222222222",
  vars: { actorName: "Riya", slotLabel: "Saturday dinner" },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("emitHouseholdEvent", () => {
  it("renders the template and calls the RPC with the audit + fan-out args", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    await emitHouseholdEvent(fakeClient(rpc), BASE);

    expect(rpc).toHaveBeenCalledWith("emit_household_event", {
      p_household_id: HOUSEHOLD,
      p_event_type: "meal_marked_eating_out",
      p_entity_type: "meal_plan_item",
      p_entity_id: "22222222-2222-2222-2222-222222222222",
      p_old_value: null,
      p_new_value: null,
      p_title: "Meal marked as eating out",
      p_message: "Riya marked Saturday dinner as eating out.",
      p_extra_recipient_ids: null,
    });
  });

  it("passes through extra recipients and value snapshots", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    await emitHouseholdEvent(fakeClient(rpc), {
      ...BASE,
      eventType: "member_removed",
      entityType: "household_member",
      oldValue: { status: "active" },
      newValue: { status: "removed" },
      vars: { actorName: "Owner", memberName: "Dee" },
      extraRecipientIds: ["33333333-3333-3333-3333-333333333333"],
    });

    const args = rpc.mock.calls[0]![1];
    expect(args.p_extra_recipient_ids).toEqual([
      "33333333-3333-3333-3333-333333333333",
    ]);
    expect(args.p_old_value).toEqual({ status: "active" });
    expect(args.p_new_value).toEqual({ status: "removed" });
    expect(args.p_message).toBe("Owner removed Dee from the household.");
  });

  it("throws InternalError when the RPC errors", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(
      emitHouseholdEvent(fakeClient(rpc), BASE),
    ).rejects.toBeInstanceOf(InternalError);
  });
});

describe("safeEmitHouseholdEvent", () => {
  it("swallows a failure so the caller's action is never rolled back", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "boom" } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      safeEmitHouseholdEvent(fakeClient(rpc), BASE),
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
  });
});
