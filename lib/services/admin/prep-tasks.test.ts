import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAdmin } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/db/service-role";
import { NotFoundError, ValidationError } from "@/lib/errors";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/service-role", () => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn() }));

import {
  addPrepTask,
  listPrepTasks,
  removePrepTask,
} from "@/lib/services/admin/prep-tasks";

import { createSupabaseStub, type QueryPlan } from "./supabase-stub";

const DISH_ID = "11111111-1111-1111-1111-111111111111";
const TASK_ID = "33333333-3333-3333-3333-333333333333";

function taskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TASK_ID,
    dish_id: DISH_ID,
    task_name: "Soak chickpeas",
    required_before_minutes: 480,
    description: "Soak overnight",
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

describe("listPrepTasks", () => {
  it("returns mapped prep tasks", async () => {
    useStub({ dish_prep_tasks: { data: [taskRow()], error: null } });
    const tasks = await listPrepTasks(DISH_ID);
    expect(tasks[0]?.requiredBeforeMinutes).toBe(480);
  });
});

describe("addPrepTask", () => {
  it("adds and returns the task", async () => {
    useStub({
      dishes: { data: { id: DISH_ID }, error: null },
      dish_prep_tasks: { data: taskRow(), error: null },
    });
    const task = await addPrepTask(DISH_ID, {
      taskName: "Soak chickpeas",
      requiredBeforeMinutes: 480,
    });
    expect(task.taskName).toBe("Soak chickpeas");
  });

  it("404s a missing parent dish", async () => {
    useStub({ dishes: { data: null, error: null } });
    await expect(
      addPrepTask(DISH_ID, { taskName: "X", requiredBeforeMinutes: 1 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects an invalid body", async () => {
    await expect(addPrepTask(DISH_ID, {})).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("removePrepTask", () => {
  it("404s when the task is absent", async () => {
    useStub({ dish_prep_tasks: { data: null, error: null } });
    await expect(removePrepTask(DISH_ID, TASK_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
