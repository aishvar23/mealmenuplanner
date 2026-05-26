import Link from "next/link";
import { redirect } from "next/navigation";

import { PrepReminders } from "@/components/meal-plan/prep-reminders";
import { TodayBoard } from "@/components/meal-plan/today-board";
import { buttonVariants } from "@/components/ui/button";
import {
  getHousehold,
  resolveCurrentHousehold,
} from "@/lib/services/household";
import {
  ensureDaySuggestions,
  getDayPlan,
  type MealSlot,
} from "@/lib/services/meal-plan";
import { getUpcomingPrepTasks } from "@/lib/services/prep";

export const metadata = { title: "Today" };

// Resolves the session + household membership per request; never cached.
export const dynamic = "force-dynamic";

/**
 * Today screen (P5-1/P5-2, design/08 section 2). Resolves the caller's
 * household, loads today's planned items, and hands them to the interactive
 * board where each slot can be generated, accepted, re-suggested, rejected,
 * swapped, marked eating out, or locked. A caller with no household is routed
 * to onboarding.
 */
export default async function TodayPage() {
  const current = await resolveCurrentHousehold();
  if (!current) redirect("/onboarding");

  const household = await getHousehold(current.householdId);
  const today = new Date().toISOString().slice(0, 10);
  const [dayPlan, prepReminders] = await Promise.all([
    getDayPlan(current.householdId, today),
    getUpcomingPrepTasks(current.householdId),
  ]);

  const slots = household.preferences?.mealsToPlan ?? [];
  const canChange = current.currentUserPermissions.canChangeTodayMenu;

  // Never open Today with a blank slot: any planned slot with no dish yet (and
  // not deliberately marked eating-out) gets the engine's top pick, persisted as
  // a `suggested` item the user can approve or swap. Gated on the menu-change
  // permission; pre-fill is best-effort, so a glitch falls back to the manual
  // "Suggest a meal" action rather than failing the screen.
  let items = dayPlan.items;
  const emptySlots = slots.filter((slot) => {
    const item = items.find((entry) => entry.mealSlot === slot);
    return !item || (!item.dishId && item.status !== "eating_out");
  });
  if (canChange && emptySlots.length > 0) {
    try {
      await ensureDaySuggestions(
        current.householdId,
        today,
        emptySlots as MealSlot[],
      );
    } catch {
      // Pre-fill is best-effort; the board still offers manual generation.
    }
    items = (await getDayPlan(current.householdId, today)).items;
  }

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 lg:px-8">
      <header className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">
            {formatToday(today)}
          </p>
          <h1 className="mt-2 font-heading text-4xl font-bold tracking-tight text-balance">
            Today&apos;s meal decisions
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{current.name}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm font-semibold">
          <span className="rounded-lg border bg-card px-3 py-2 shadow-xs">
            {slots.length} meal slots
          </span>
          <span className="rounded-lg border bg-card px-3 py-2 shadow-xs">
            {items.filter((item) => item.dishId).length} planned
          </span>
        </div>
      </header>

      {prepReminders.length > 0 ? (
        <PrepReminders items={prepReminders} />
      ) : null}

      {slots.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-10 text-center shadow-xs">
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
