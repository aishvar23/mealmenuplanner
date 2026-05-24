import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import { removePrepTask, updatePrepTask } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ dishId: string; prepTaskId: string }>;
};

/** `PATCH /api/admin/dishes/{dishId}/prep-tasks/{prepTaskId}` — edit a prep task (P3-6). */
export const PATCH = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { dishId, prepTaskId } = await context.params;
    const body = await readJsonObject(request);
    const task = await updatePrepTask(dishId, prepTaskId, body);
    return Response.json(task, { status: 200 });
  },
);

/** `DELETE /api/admin/dishes/{dishId}/prep-tasks/{prepTaskId}` — remove a prep task (P3-6). */
export const DELETE = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { dishId, prepTaskId } = await context.params;
    const result = await removePrepTask(dishId, prepTaskId);
    return Response.json(result, { status: 200 });
  },
);
