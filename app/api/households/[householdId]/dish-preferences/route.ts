import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import { saveHouseholdDishPreferences } from "@/lib/services/household";
import {
  buildPreferredDishesPayload,
  type PreferredDishesSlice,
} from "@/lib/services/onboarding/validate-completion";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ householdId: string }> };

/**
 * `PATCH /api/households/{householdId}/dish-preferences` — rewrite the household's
 * per-dish meal preferences (`household_dish_preferences` + accompaniments) from
 * the edit wizard's Step-3 picks. The body is the preferred-dishes slice
 * (`mode` + `selectedCombinations` / `builtDishes` / `dishNames`); it's validated
 * with the same rules as onboarding completion, then the resolved combinations +
 * built dishes are persisted (a full replace). Gated by
 * `can_edit_household_preferences` in the service (RLS is the backstop). Lets a
 * household retune the dishes their combinations expanded into after onboarding.
 */
export const PATCH = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { householdId } = await context.params;
    const body = await readJsonObject(request);
    const { combinationPrefs } = buildPreferredDishesPayload(
      body as unknown as PreferredDishesSlice,
    );
    await saveHouseholdDishPreferences(householdId, combinationPrefs);
    return Response.json({ ok: true }, { status: 200 });
  },
);
