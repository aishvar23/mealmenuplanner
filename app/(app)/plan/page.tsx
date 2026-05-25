import Link from "next/link";
import { redirect } from "next/navigation";

import { MealHistory } from "@/components/meal-plan/meal-history";
import { WeekBoard } from "@/components/meal-plan/week-board";
import { buttonVariants } from "@/components/ui/button";
import {
  getHousehold,
  resolveCurrentHousehold,
} from "@/lib/services/household";
import { getWeekPlan, listMealHistory } from "@/lib/services/meal-plan";

export const metadata = { title: "Plan" };

// Resolves the session + household membership per request; never cached.
export const dynamic = "force-dynamic";

/** Number of days the weekly plan view spans (today through +6). */
const WEEK_SPAN_DAYS = 7;

/**
 * Weekly Plan screen plus meal history (P5-3..P5-7, design/08 sections 3 and
 * 8). Resolves the caller's household, loads the upcoming week's items and
 * recent history, and renders the interactive week board.
 */
export default async function PlanPage() {
  const current = await resolveCurrentHousehold();
  if (!current) redirect("/onboarding");

  const household = await getHousehold(current.householdId);
  const today = new Date().toISOString().slice(0, 10);
  const endDate = addDays(today, WEEK_SPAN_DAYS - 1);

  const [{ items }, history] = await Promise.all([
    getWeekPlan(current.householdId, today, endDate),
    listMealHistory(current.householdId, { before: today }),
  ]);

  const slots = household.preferences?.mealsToPlan ?? [];
  const canChange = current.currentUserPermissions.canChangeWeeklySchedule;

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 lg:px-8">
      <header>
        <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">
          {current.name}
        </p>
        <h1 className="mt-2 font-heading text-4xl font-bold tracking-tight text-balance">
          Weekly planner
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Scan the week, keep the meals you like, and regenerate the gaps before
          your grocery list is built.
        </p>
      </header>

      {slots.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-10 text-center shadow-xs">
          <p className="text-sm text-muted-foreground">
            Set up which meals you plan to generate a weekly plan.
          </p>
          <Link
            href="/onboarding"
            className={buttonVariants({ className: "mt-4" })}
          >
            Finish setup
          </Link>
        </div>
      ) : (
        <WeekBoard
          householdId={current.householdId}
          startDate={today}
          endDate={endDate}
          slots={slots}
          items={items}
          canChange={canChange}
        />
      )}

      <section className="rounded-lg border bg-card p-5 shadow-xs">
        <h2 className="font-heading text-xl font-bold tracking-tight">
          Meal history
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Planned and cooked meals feed variety so the planner avoids repeats.
        </p>
        <div className="mt-4">
          {/* Marking a past meal cooked gates on can_change_today_menu. */}
          <MealHistory
            initialItems={history}
            canChange={current.currentUserPermissions.canChangeTodayMenu}
          />
        </div>
      </section>
    </section>
  );
}

/** date + days calendar days, as YYYY-MM-DD (UTC). */
function addDays(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}
