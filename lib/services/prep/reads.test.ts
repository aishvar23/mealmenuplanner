import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotFoundError } from "@/lib/errors";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getActiveMembership: vi.fn() }));

import { getActiveMembership } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { createSupabaseStub } from "@/lib/services/recommendation/query-stub";

import { getUpcomingPrepTasks } from "./reads";

const HH = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getActiveMembership).mockResolvedValue({} as never);
});

describe("getUpcomingPrepTasks", () => {
  it("404s a malformed household id", async () => {
    await expect(getUpcomingPrepTasks("nope")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("404s a non-member (existence-hiding)", async () => {
    vi.mocked(getActiveMembership).mockResolvedValue(null);
    await expect(getUpcomingPrepTasks(HH)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("returns [] when no upcoming items have prep tasks", async () => {
    const stub = createSupabaseStub({
      tables: { meal_plan_items: { data: [], error: null } },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      stub.client as never,
    );
    expect(await getUpcomingPrepTasks(HH)).toEqual([]);
  });

  it("joins items to prep tasks and computes deadlines", async () => {
    const stub = createSupabaseStub({
      tables: {
        meal_plan_items: {
          data: [
            {
              id: "item-1",
              date: "2026-05-25",
              meal_slot: "lunch",
              dish_id: "d1",
              dishes: { name: "Chole Rice" },
            },
          ],
          error: null,
        },
        dish_prep_tasks: {
          data: [
            {
              dish_id: "d1",
              task_name: "Soak chickpeas",
              required_before_minutes: 480,
              description: null,
            },
          ],
          error: null,
        },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      stub.client as never,
    );

    const reminders = await getUpcomingPrepTasks(HH, {
      now: new Date("2026-05-24T00:00:00Z"),
    });
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({
      dishName: "Chole Rice",
      taskName: "Soak chickpeas",
      // lunch 12:30 UTC − 480 min = 04:30 UTC the same day.
      prepDeadline: "2026-05-25T04:30:00.000Z",
      overdue: false,
    });
  });

  it("drops items whose dish has no prep tasks", async () => {
    const stub = createSupabaseStub({
      tables: {
        meal_plan_items: {
          data: [
            {
              id: "item-1",
              date: "2026-05-25",
              meal_slot: "dinner",
              dish_id: "d1",
              dishes: { name: "Salad" },
            },
          ],
          error: null,
        },
        dish_prep_tasks: { data: [], error: null },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      stub.client as never,
    );
    expect(await getUpcomingPrepTasks(HH)).toEqual([]);
  });
});
