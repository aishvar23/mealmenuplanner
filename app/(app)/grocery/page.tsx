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
 * Grocery list screen (P7-2/P7-3, design/08 section 9). Resolves the caller's
 * household and the plan its grocery list belongs to, then renders the
 * interactive board.
 */
export default async function GroceryPage() {
  const current = await resolveCurrentHousehold();
  if (!current) redirect("/onboarding");

  const { plan, list } = await getGroceryScreen(current.householdId);
  const canManage = current.currentUserPermissions.canManageGroceryList;

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 lg:px-8">
      <header>
        <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">
          {current.name}
          {plan ? ` / ${formatPlanRange(plan.startDate, plan.endDate)}` : ""}
        </p>
        <h1 className="mt-2 font-heading text-4xl font-bold tracking-tight text-balance">
          Grocery shopping
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          A grouped list built from the current plan, optimized for quick
          checking while you shop.
        </p>
      </header>

      {!plan ? (
        <div className="rounded-lg border border-dashed bg-card p-10 text-center shadow-xs">
          <p className="text-sm text-muted-foreground">
            Generate a meal plan first. Your grocery list is built from it.
          </p>
          <Link href="/plan" className={buttonVariants({ className: "mt-4" })}>
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
    </section>
  );
}

/** "May 25" for a single day, or "May 25 - May 31" for a range (UTC). */
function formatPlanRange(startDate: string, endDate: string): string {
  const start = formatDay(startDate);
  if (startDate === endDate) return start;
  return `${start} - ${formatDay(endDate)}`;
}

function formatDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
