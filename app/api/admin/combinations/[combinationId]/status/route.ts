import { ValidationError, withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import { approveCombination, rejectCombination } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ combinationId: string }> };

/** The two operator decisions a proposed combination can receive (P10-5). */
const DECISIONS = ["active", "rejected"] as const;

/**
 * `POST /api/admin/combinations/{combinationId}/status` — approve or reject a
 * proposed meal combination (P10-5). Body: `{ "status": "active" | "rejected" }`.
 * `active` publishes the combo into the catalog (onboarding picker + engine);
 * `rejected` removes it from review. Returns the refreshed combination DTO.
 */
export const POST = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { combinationId } = await context.params;
    const body = await readJsonObject(request);

    const status = body.status;
    if (
      typeof status !== "string" ||
      !(DECISIONS as readonly string[]).includes(status)
    ) {
      throw new ValidationError("A valid status is required.", [
        { field: "status", rule: "enum", allowed: DECISIONS },
      ]);
    }

    const combination =
      status === "active"
        ? await approveCombination(combinationId)
        : await rejectCombination(combinationId);
    return Response.json(combination, { status: 200 });
  },
);
