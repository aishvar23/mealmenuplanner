import Link from "next/link";
import { redirect } from "next/navigation";

import { PrepReminders } from "@/components/meal-plan/prep-reminders";
import { TodayBoard } from "@/components/meal-plan/today-board";
import { buttonVariants } from "@/components/ui/button";
import {
  getHousehold,
  resolveCurrentHousehold,
} from "@/lib/services/household";
import { getDayPlan } from "@/lib/services/meal-plan";
import { getUpcomingPrepTasks } from "@/lib/services/prep";

export const metadata = { title: "Today" };

// Resolves the session + household membership per request; never cached.
export const dynamic = "force-dynamic";

/**
 * Today screen (P5-1/P5-2, design/08 § 2). Resolves the caller's household,
 * loads today's planned items, and hands them to the interactive board where
 * each slot can be generated, accepted, re-suggested, rejected, swapped, marked
 * eating out, or locked. A caller with no household is routed to onboarding.
 */
export default async function TodayPage() {
  const current = await resolveCurrentHousehold();
  if (!current) redirect("/onboarding");

  const household = await getHousehold(current.householdId);
  const today = new Date().toISOString().slice(0, 10);
  const [{ items }, prepReminders] = await Promise.all([
    getDayPlan(current.householdId, today),
    getUpcomingPrepTasks(current.householdId),
  ]);

  const slots = household.preferences?.mealsToPlan ?? [];
  const canChange = current.currentUserPermissions.canChangeTodayMenu;

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Today
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatToday(today)} · {current.name}
        </p>
      </div>

      {prepReminders.length > 0 && (
        <div className="mt-6">
          <PrepReminders items={prepReminders} />
        </div>
      )}

      <div className="mt-6">
        {slots.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Set up which meals you plan to see suggestions here.
            </p>
            <Link
              href="/onboarding"
              className={buttonVariants({ className: "mt-4" })}
            >
              Finish setup
            </Link>
          </div>
        ) : (
          <TodayBoard
            householdId={current.householdId}
            date={today}
            slots={slots}
            initialItems={items}
            canChange={canChange}
          />
        )}
      </div>
    </section>
  );
}

function formatToday(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
