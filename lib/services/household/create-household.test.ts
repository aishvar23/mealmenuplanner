import { beforeEach, describe, expect, it, vi } from "vitest";

import { createServerSupabaseClient } from "@/lib/db/server";
import {
  InternalError,
  UnauthenticatedError,
  ValidationError,
} from "@/lib/errors";
import { requireAuthUser } from "@/lib/auth";

// create-household.ts is server-only and depends on the per-request Supabase
// client and the auth resolver. Stub the `server-only` marker and the two I/O
// dependencies so the service runs in a plain Node test.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAuthUser: vi.fn() }));

import {
  createHousehold,
  MAX_HOUSEHOLD_NAME_LENGTH,
  normalizeHouseholdName,
} from "@/lib/services/household";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const HOUSEHOLD_ID = "22222222-2222-2222-2222-222222222222";

/** Stub `supabase.rpc(...)` to resolve to the given result. */
function stubRpc(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(() => Promise.resolve(result));
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ rpc } as never);
  return rpc;
}

describe("normalizeHouseholdName", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeHouseholdName("  Suhane Household  ")).toBe(
      "Suhane Household",
    );
  });

  it("throws ValidationError for an empty or whitespace-only name", () => {
    for (const raw of ["", "   ", "\t\n"]) {
      expect(() => normalizeHouseholdName(raw)).toThrow(ValidationError);
    }
  });

  it("accepts a name at the maximum length", () => {
    const name = "a".repeat(MAX_HOUSEHOLD_NAME_LENGTH);
    expect(normalizeHouseholdName(name)).toBe(name);
  });

  it("throws ValidationError for an oversized name", () => {
    const tooLong = "a".repeat(MAX_HOUSEHOLD_NAME_LENGTH + 1);
    expect(() => normalizeHouseholdName(tooLong)).toThrow(ValidationError);
  });
});

describe("createHousehold", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuthUser).mockResolvedValue({ id: USER_ID } as never);
  });

  it("returns the new household id on success", async () => {
    stubRpc({ data: HOUSEHOLD_ID, error: null });
    const result = await createHousehold({ name: "Suhane Household" });
    expect(result).toEqual({ householdId: HOUSEHOLD_ID });
  });

  it("calls the create_household RPC with the trimmed name", async () => {
    const rpc = stubRpc({ data: HOUSEHOLD_ID, error: null });
    await createHousehold({ name: "  Suhane Household  " });
    expect(rpc).toHaveBeenCalledWith("create_household", {
      p_name: "Suhane Household",
    });
  });

  it("propagates UnauthenticatedError when there is no session", async () => {
    vi.mocked(requireAuthUser).mockRejectedValue(new UnauthenticatedError());
    const rpc = stubRpc({ data: HOUSEHOLD_ID, error: null });
    await expect(
      createHousehold({ name: "Suhane Household" }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("throws ValidationError for an empty name without calling the RPC", async () => {
    const rpc = stubRpc({ data: HOUSEHOLD_ID, error: null });
    await expect(createHousehold({ name: "   " })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("wraps an RPC error as InternalError", async () => {
    stubRpc({ data: null, error: { message: "boom" } });
    await expect(
      createHousehold({ name: "Suhane Household" }),
    ).rejects.toBeInstanceOf(InternalError);
  });

  it("throws InternalError when the RPC returns no id", async () => {
    stubRpc({ data: null, error: null });
    await expect(
      createHousehold({ name: "Suhane Household" }),
    ).rejects.toBeInstanceOf(InternalError);
  });
});
