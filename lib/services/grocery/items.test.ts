import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, NotFoundError } from "@/lib/errors";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireAuthUser: vi.fn(),
  getActiveMembership: vi.fn(),
  hasPermission: vi.fn(),
}));

import {
  getActiveMembership,
  hasPermission,
  requireAuthUser,
} from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";

import { setGroceryItemChecked } from "./items";

const ITEM = "44444444-4444-4444-4444-444444444444";

/**
 * Minimal grocery_list_items client: a read builder (load) and an update builder
 * (write) — each `from()` returns a fresh builder, so the load returns the
 * parent-list row and the post-update read returns the new projection.
 */
function makeClient(loadRow: unknown, updatedRow: unknown) {
  return {
    from() {
      let mode: "read" | "update" = "read";
      const builder: Record<string, unknown> = {
        update() {
          mode = "update";
          return builder;
        },
        select: () => builder,
        eq: () => builder,
        maybeSingle: () =>
          Promise.resolve({
            data: mode === "update" ? updatedRow : loadRow,
            error: null,
          }),
      };
      return builder;
    },
  };
}

const updatedRow = {
  id: ITEM,
  ingredient_id: "i1",
  name: "Spinach",
  category: "vegetables",
  quantity: 400,
  unit: "g",
  checked: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthUser).mockResolvedValue({ id: "u1" } as never);
  vi.mocked(getActiveMembership).mockResolvedValue({} as never);
  vi.mocked(hasPermission).mockReturnValue(true);
});

describe("setGroceryItemChecked", () => {
  it("404s a malformed item id", async () => {
    await expect(setGroceryItemChecked("nope", true)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("404s an item hidden by RLS (load returns null)", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeClient(null, updatedRow) as never,
    );
    await expect(setGroceryItemChecked(ITEM, true)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("404s a non-member", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeClient(
        { id: ITEM, grocery_lists: { household_id: "hh" } },
        updatedRow,
      ) as never,
    );
    vi.mocked(getActiveMembership).mockResolvedValue(null);
    await expect(setGroceryItemChecked(ITEM, true)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("403s a member lacking can_manage_grocery_list", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeClient(
        { id: ITEM, grocery_lists: { household_id: "hh" } },
        updatedRow,
      ) as never,
    );
    vi.mocked(hasPermission).mockReturnValue(false);
    await expect(setGroceryItemChecked(ITEM, true)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("flips checked and returns the updated item", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeClient(
        { id: ITEM, grocery_lists: { household_id: "hh" } },
        updatedRow,
      ) as never,
    );
    const dto = await setGroceryItemChecked(ITEM, true);
    expect(dto).toMatchObject({
      groceryListItemId: ITEM,
      name: "Spinach",
      checked: true,
    });
  });
});
