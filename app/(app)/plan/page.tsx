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
 * Weekly Plan screen + meal history (P5-3..P5-7, design/08 § 3, § 8). Resolves
 * the caller's household, loads the upcoming week's items and recent history,
 * and renders the interactive week board (generate / swap / eating-out / lock)
 * plus the history list (with mark-cooked).
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
    <section className="mx-auto w-full max-w-6xl px-4 py-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Weekly plan
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{current.name}</p>
      </div>

      <div className="mt-6">
        {slots.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
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
      </div>

      <div className="mt-10">
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          Meal history
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          What you’ve planned and cooked — this feeds variety so dishes don’t
          repeat too soon.
        </p>
        <div className="mt-4">
          {/* Marking a past meal cooked gates on can_change_today_menu (design/08 § 5). */}
          <MealHistory
            initialItems={history}
            canChange={current.currentUserPermissions.canChangeTodayMenu}
          />
        </div>
      </div>
    </section>
  );
}

/** `date` + `days` calendar days, as `YYYY-MM-DD` (UTC). */
function addDays(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}
