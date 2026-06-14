import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import {
  ConflictError,
  NotFoundError,
  RateLimitedError,
  ValidationError,
} from "@/lib/errors";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAuthUser: vi.fn() }));

import {
  acceptSuggestionAsOption,
  createSuggestion,
  rejectSuggestion,
  SUGGESTION_RATE_MAX,
} from "./suggestions";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const PROVIDER_ID = "22222222-2222-2222-2222-222222222222";
const MENU_DAY_ID = "33333333-3333-3333-3333-333333333333";
const SUGGESTION_ID = "44444444-4444-4444-4444-444444444444";

const ROW = {
  id: SUGGESTION_ID,
  menu_day_id: MENU_DAY_ID,
  member_user_id: USER_ID,
  suggestion_text: "Add a millet roti option",
  status: "pending",
  provider_response: null,
  created_at: "2026-06-11T09:00:00Z",
  updated_at: "2026-06-11T09:00:00Z",
};

const DTO = {
  suggestionId: SUGGESTION_ID,
  menuDayId: MENU_DAY_ID,
  memberUserId: USER_ID,
  suggestionText: "Add a millet roti option",
  status: "pending",
  providerResponse: null,
  createdAt: "2026-06-11T09:00:00Z",
  updatedAt: "2026-06-11T09:00:00Z",
};

/**
 * A Supabase client mock backed by a per-table FIFO queue: every builder method
 * returns the chain (recording its args), and each terminal (`then`/`single`/
 * `maybeSingle`) shifts the next queued result for that table. So a service method
 * issuing several queries against one table (read day → count → insert) gets each
 * staged result in call order, whatever terminal it awaits with.
 */
function makeClient(
  queues: Record<
    string,
    Array<{ data?: unknown; error?: unknown; count?: number }>
  >,
  owner: { data: unknown; error: unknown } = { data: true, error: null },
) {
  const calls: Record<string, unknown[][]> = {};
  const from = vi.fn((table: string) => {
    const q = queues[table] ?? [];
    const pop = () => Promise.resolve(q.shift() ?? { data: null, error: null });
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "order", "insert", "update"]) {
      chain[m] = (...args: unknown[]) => {
        (calls[`${table}.${m}`] ??= []).push(args);
        return chain;
      };
    }
    chain.single = () => pop();
    chain.maybeSingle = () => pop();
    chain.then = (
      onF: (v: unknown) => unknown,
      onR?: (e: unknown) => unknown,
    ) => pop().then(onF, onR);
    return chain;
  });
  // `is_provider_owner` — the draft-safe ownership gate used by the resolve path.
  const rpc = vi.fn(() => Promise.resolve(owner));
  vi.mocked(createServerSupabaseClient).mockResolvedValue({
    from,
    rpc,
  } as never);
  return { from, rpc, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthUser).mockResolvedValue({ id: USER_ID } as never);
});

describe("createSuggestion", () => {
  it("derives the provider, passes the rate limit, and inserts the suggestion", async () => {
    const { from, calls } = makeClient({
      provider_menu_days: [{ data: { provider_id: PROVIDER_ID }, error: null }],
      provider_meal_suggestions: [
        { count: 0, error: null }, // rate-limit count
        { data: ROW, error: null }, // insert .single()
      ],
    });

    const result = await createSuggestion(MENU_DAY_ID, {
      suggestionText: "Add a millet roti option",
    });

    expect(result).toEqual(DTO);
    expect(from).toHaveBeenCalledWith("provider_menu_days");
    expect(from).toHaveBeenCalledWith("provider_meal_suggestions");
    // The insert carries the route's menu day, the derived provider, and the caller.
    expect(calls["provider_meal_suggestions.insert"]?.[0]?.[0]).toEqual({
      provider_id: PROVIDER_ID,
      menu_day_id: MENU_DAY_ID,
      member_user_id: USER_ID,
      suggestion_text: "Add a millet roti option",
    });
    // The rate-limit count is scoped per provider (tenant isolation), not just member.
    const rlEq = calls["provider_meal_suggestions.eq"] ?? [];
    expect(rlEq).toContainEqual(["member_user_id", USER_ID]);
    expect(rlEq).toContainEqual(["provider_id", PROVIDER_ID]);
  });

  it("rejects a malformed menu-day id with a 404 (no round trip)", async () => {
    const { from } = makeClient({});
    await expect(
      createSuggestion("not-a-uuid", { suggestionText: "hi" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects a blank suggestion before any DB call", async () => {
    const { from } = makeClient({});
    await expect(
      createSuggestion(MENU_DAY_ID, { suggestionText: "   " }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(from).not.toHaveBeenCalled();
  });

  it("404s when the menu day is not readable (existence-hiding)", async () => {
    makeClient({ provider_menu_days: [{ data: null, error: null }] });
    await expect(
      createSuggestion(MENU_DAY_ID, { suggestionText: "hi" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rate-limits once the rolling-window cap is reached", async () => {
    makeClient({
      provider_menu_days: [{ data: { provider_id: PROVIDER_ID }, error: null }],
      provider_meal_suggestions: [{ count: SUGGESTION_RATE_MAX, error: null }],
    });
    await expect(
      createSuggestion(MENU_DAY_ID, { suggestionText: "one more" }),
    ).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("maps an RLS insert rejection (42501) to an existence-hiding 404", async () => {
    makeClient({
      provider_menu_days: [{ data: { provider_id: PROVIDER_ID }, error: null }],
      provider_meal_suggestions: [
        { count: 0, error: null },
        { data: null, error: { code: "42501" } },
      ],
    });
    await expect(
      createSuggestion(MENU_DAY_ID, { suggestionText: "hi" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("acceptSuggestionAsOption / rejectSuggestion", () => {
  it("accepts a pending suggestion and records the owner note", async () => {
    const { calls } = makeClient({
      provider_meal_suggestions: [
        { data: { status: "pending", provider_id: PROVIDER_ID }, error: null }, // existence read
        {
          data: {
            ...ROW,
            status: "accepted_as_option",
            provider_response: "Adding next week",
          },
          error: null,
        }, // update .maybeSingle()
      ],
    });

    const result = await acceptSuggestionAsOption(SUGGESTION_ID, {
      providerResponse: "Adding next week",
    });

    expect(result.status).toBe("accepted_as_option");
    expect(result.providerResponse).toBe("Adding next week");
    expect(calls["provider_meal_suggestions.update"]?.[0]?.[0]).toEqual({
      status: "accepted_as_option",
      provider_response: "Adding next week",
    });
    // The UPDATE is guarded on the pending status (atomic transition).
    const eqArgs = calls["provider_meal_suggestions.eq"] ?? [];
    expect(eqArgs).toContainEqual(["status", "pending"]);
  });

  it("rejects a pending suggestion", async () => {
    makeClient({
      provider_meal_suggestions: [
        { data: { status: "pending", provider_id: PROVIDER_ID }, error: null },
        { data: { ...ROW, status: "rejected" }, error: null },
      ],
    });
    const result = await rejectSuggestion(SUGGESTION_ID, {});
    expect(result.status).toBe("rejected");
  });

  it("omits the note from the patch when not supplied", async () => {
    const { calls } = makeClient({
      provider_meal_suggestions: [
        { data: { status: "pending", provider_id: PROVIDER_ID }, error: null },
        { data: { ...ROW, status: "rejected" }, error: null },
      ],
    });
    await rejectSuggestion(SUGGESTION_ID, {});
    expect(calls["provider_meal_suggestions.update"]?.[0]?.[0]).toEqual({
      status: "rejected",
    });
  });

  it("404s when the caller can read the row but is not the provider owner", async () => {
    // The author-member can SELECT their own suggestion (pms_select) but must not
    // resolve it — the ownership gate yields an existence-hiding 404, not a 409.
    makeClient(
      {
        provider_meal_suggestions: [
          {
            data: { status: "pending", provider_id: PROVIDER_ID },
            error: null,
          },
        ],
      },
      { data: false, error: null },
    );
    await expect(rejectSuggestion(SUGGESTION_ID, {})).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("409s with suggestion_not_pending when already resolved", async () => {
    // The pre-read status check was removed: an already-resolved suggestion is now
    // detected solely by the guarded UPDATE matching no pending row → null → 409.
    // Each call consumes a provider_id read + a null update; two calls → two pairs.
    const read = { data: { provider_id: PROVIDER_ID }, error: null };
    const updateMiss = { data: null, error: null };
    makeClient({
      provider_meal_suggestions: [read, updateMiss, read, updateMiss],
    });
    await expect(
      acceptSuggestionAsOption(SUGGESTION_ID, {}),
    ).rejects.toMatchObject({
      details: { reason: "suggestion_not_pending" },
    });
    await expect(
      acceptSuggestionAsOption(SUGGESTION_ID, {}),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("404s when the suggestion is not readable (unknown / not owner)", async () => {
    makeClient({
      provider_meal_suggestions: [{ data: null, error: null }],
    });
    await expect(rejectSuggestion(SUGGESTION_ID, {})).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("409s when a concurrent resolve wins the race (update hits no pending row)", async () => {
    makeClient({
      provider_meal_suggestions: [
        { data: { status: "pending", provider_id: PROVIDER_ID }, error: null },
        { data: null, error: null }, // update matched nothing
      ],
    });
    await expect(
      acceptSuggestionAsOption(SUGGESTION_ID, {}),
    ).rejects.toMatchObject({ details: { reason: "suggestion_not_pending" } });
  });

  it("rejects a malformed suggestion id with a 404 (no round trip)", async () => {
    const { from } = makeClient({});
    await expect(rejectSuggestion("nope", {})).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(from).not.toHaveBeenCalled();
  });
});
