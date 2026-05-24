import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveOrCreateDayPlan, resolveOrCreateRangePlan } from "./plans";

interface Result {
  data: unknown;
  error: unknown;
}

/**
 * A small stateful supabase stub that distinguishes the select / insert / update
 * chains plans.ts uses (each ends in `maybeSingle`). The mode is set by the first
 * mutating call so the right configured result comes back.
 */
function makeClient(opts: {
  select?: Result;
  insert?: Result;
  update?: Result;
}) {
  const calls: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function builder(mode: "select" | "insert" | "update"): any {
    const b = {
      select: () => b,
      eq: () => b,
      lte: () => b,
      gte: () => b,
      order: () => b,
      limit: () => b,
      insert: () => {
        calls.push("insert");
        return builder("insert");
      },
      update: () => {
        calls.push("update");
        return builder("update");
      },
      maybeSingle: () =>
        Promise.resolve(
          mode === "insert"
            ? (opts.insert ?? { data: null, error: null })
            : mode === "update"
              ? (opts.update ?? { data: null, error: null })
              : (opts.select ?? { data: null, error: null }),
        ),
    };
    return b;
  }
  return {
    calls,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: { from: () => builder("select") } as any,
  };
}

const HH = "hh-1";
const USER = "user-1";
const plan = (overrides: Record<string, unknown> = {}) => ({
  id: "plan-1",
  status: "active",
  start_date: "2026-05-25",
  end_date: "2026-05-25",
  ...overrides,
});

describe("resolveOrCreateDayPlan", () => {
  it("reuses an active plan covering the date", async () => {
    const stub = makeClient({ select: { data: plan(), error: null } });
    const result = await resolveOrCreateDayPlan(
      stub.client,
      HH,
      "2026-05-25",
      USER,
    );
    expect(result.id).toBe("plan-1");
    expect(stub.calls).not.toContain("insert");
  });

  it("creates a one-day plan when none covers the date", async () => {
    const created = plan({ id: "new-plan" });
    const stub = makeClient({
      select: { data: null, error: null },
      insert: { data: created, error: null },
    });
    const result = await resolveOrCreateDayPlan(
      stub.client,
      HH,
      "2026-05-25",
      USER,
    );
    expect(result.id).toBe("new-plan");
    expect(stub.calls).toContain("insert");
  });
});

describe("resolveOrCreateRangePlan", () => {
  it("reuses a plan that already covers the range", async () => {
    const stub = makeClient({
      select: { data: plan({ end_date: "2026-05-31" }), error: null },
    });
    const result = await resolveOrCreateRangePlan(
      stub.client,
      HH,
      "2026-05-25",
      "2026-05-31",
      USER,
    );
    expect(result.end_date).toBe("2026-05-31");
    expect(stub.calls).not.toContain("update");
    expect(stub.calls).not.toContain("insert");
  });

  it("extends a plan whose end_date falls short of the range", async () => {
    const stub = makeClient({
      select: { data: plan({ end_date: "2026-05-27" }), error: null },
      update: { data: plan({ end_date: "2026-05-31" }), error: null },
    });
    const result = await resolveOrCreateRangePlan(
      stub.client,
      HH,
      "2026-05-25",
      "2026-05-31",
      USER,
    );
    expect(result.end_date).toBe("2026-05-31");
    expect(stub.calls).toContain("update");
  });

  it("creates a plan when none starts on the date", async () => {
    const stub = makeClient({
      select: { data: null, error: null },
      insert: {
        data: plan({ id: "new", end_date: "2026-05-31" }),
        error: null,
      },
    });
    const result = await resolveOrCreateRangePlan(
      stub.client,
      HH,
      "2026-05-25",
      "2026-05-31",
      USER,
    );
    expect(result.id).toBe("new");
    expect(stub.calls).toContain("insert");
  });
});
