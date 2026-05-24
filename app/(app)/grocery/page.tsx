import Link from "next/link";
import { redirect } from "next/navigation";

import { GroceryBoard } from "@/components/grocery/grocery-board";
import { buttonVariants } from "@/components/ui/button";
import { getGroceryScreen } from "@/lib/services/grocery";
import { resolveCurrentHousehold } from "@/lib/services/household";

export const metadata = { title: "Grocery" };

// Resolves the session + household membership per request; never cached.
export const dynamic = "force-dynamic";

/**
 * Grocery list screen (P7-2/P7-3, design/08 § 9). Resolves the caller's household
 * and the plan its grocery list belongs to, then renders the interactive board
 * (check-off + regenerate). A caller with no household goes to onboarding; one
 * with no plan yet is pointed at the weekly plan.
 */
export default async function GroceryPage() {
  const current = await resolveCurrentHousehold();
  if (!current) redirect("/onboarding");

  const { plan, list } = await getGroceryScreen(current.householdId);
  const canManage = current.currentUserPermissions.canManageGroceryList;

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Grocery list
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {current.name}
          {plan ? ` · ${formatPlanRange(plan.startDate, plan.endDate)}` : ""}
        </p>
      </div>

      <div className="mt-6">
        {!plan ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Generate a meal plan first — your grocery list is built from it.
            </p>
            <Link
              href="/plan"
              className={buttonVariants({ className: "mt-4" })}
            >
              Go to plan
            </Link>
          </div>
        ) : (
          <GroceryBoard
            householdId={current.householdId}
            mealPlanId={plan.mealPlanId}
            initialList={list}
            canManage={canManage}
          />
        )}
      </div>
    </section>
  );
}

/** "May 25" for a single day, or "May 25 – May 31" for a range (UTC). */
function formatPlanRange(startDate: string, endDate: string): string {
  const start = formatDay(startDate);
  if (startDate === endDate) return start;
  return `${start} – ${formatDay(endDate)}`;
}

function formatDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
