import { withErrorBoundary } from "@/lib/errors";
import { boundedCollection, readJsonObject } from "@/lib/http";
import { addPrepTask, listPrepTasks } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ dishId: string }> };

/** `GET /api/admin/dishes/{dishId}/prep-tasks` — the dish's prep tasks (P3-6). */
export const GET = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { dishId } = await context.params;
    const tasks = await listPrepTasks(dishId);
    return Response.json(boundedCollection(tasks), { status: 200 });
  },
);

/** `POST /api/admin/dishes/{dishId}/prep-tasks` — add a prep task (P3-6). */
export const POST = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { dishId } = await context.params;
    const body = await readJsonObject(request);
    const task = await addPrepTask(dishId, body);
    return Response.json(task, { status: 201 });
  },
);
