import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAdmin } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/db/service-role";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/service-role", () => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn() }));

import {
  addPairing,
  listPairings,
  removePairing,
} from "@/lib/services/admin/pairings";

import { createSupabaseStub, type QueryPlan } from "./supabase-stub";

const PRIMARY = "11111111-1111-1111-1111-111111111111";
const PAIRED = "22222222-2222-2222-2222-222222222222";
const PAIRING_ID = "33333333-3333-3333-3333-333333333333";

function pairingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PAIRING_ID,
    primary_dish_id: PRIMARY,
    paired_dish_id: PAIRED,
    pairing_type: "rice_pairing",
    created_at: "t",
    updated_at: "t",
    ...overrides,
  };
}

function useStub(plan: QueryPlan) {
  const stub = createSupabaseStub(plan);
  vi.mocked(createServiceRoleClient).mockReturnValue(stub.client as never);
  return stub;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({ id: "admin" } as never);
});

describe("listPairings", () => {
  it("resolves paired-dish names", async () => {
    useStub({
      dish_pairings: { data: [pairingRow()], error: null },
      dishes: { data: [{ id: PAIRED, name: "Jeera Rice" }], error: null },
    });
    const pairings = await listPairings(PRIMARY);
    expect(pairings[0]?.pairedDishName).toBe("Jeera Rice");
  });
});

describe("addPairing", () => {
  it("adds and returns the pairing with the paired-dish name", async () => {
    useStub({
      // assertDishExists (primary), insert, then paired-name lookup all hit
      // "dishes" / "dish_pairings". The two "dishes" hits are queued in order.
      dishes: [
        { data: { id: PRIMARY }, error: null },
        { data: [{ id: PAIRED, name: "Jeera Rice" }], error: null },
      ],
      dish_pairings: { data: pairingRow(), error: null },
    });
    const pairing = await addPairing(PRIMARY, {
      pairedDishId: PAIRED,
      pairingType: "rice_pairing",
    });
    expect(pairing.pairedDishName).toBe("Jeera Rice");
  });

  it("maps a duplicate pairing to ConflictError", async () => {
    useStub({
      dishes: { data: { id: PRIMARY }, error: null },
      dish_pairings: { data: null, error: { code: "23505" } },
    });
    await expect(
      addPairing(PRIMARY, {
        pairedDishId: PAIRED,
        pairingType: "rice_pairing",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("maps a self-pair check violation to ValidationError", async () => {
    useStub({
      dishes: { data: { id: PRIMARY }, error: null },
      dish_pairings: { data: null, error: { code: "23514" } },
    });
    await expect(
      addPairing(PRIMARY, { pairedDishId: PAIRED, pairingType: "main_side" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a self-pair in validation before the DB", async () => {
    await expect(
      addPairing(PRIMARY, { pairedDishId: PRIMARY, pairingType: "main_side" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("removePairing", () => {
  it("404s when the pairing is absent", async () => {
    useStub({ dish_pairings: { data: null, error: null } });
    await expect(removePairing(PRIMARY, PAIRING_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
