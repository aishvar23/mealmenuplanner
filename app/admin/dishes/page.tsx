import Link from "next/link";

import { DishListControls } from "@/components/admin/dish-list-controls";
import { DishStatusBadge } from "@/components/admin/dish-status-badge";
import { buttonVariants } from "@/components/ui/button";
import { dietTypeLabel, mealSlotLabel } from "@/lib/admin/options";
import { listDishes, parseDishListFilters } from "@/lib/services/admin";

export const metadata = { title: "Dishes" };

// Reads the operator session + filter query params; never statically cached.
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

/** Build a URLSearchParams from Next's resolved searchParams object. */
function toSearchParams(input: SearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") params.set(key, value);
  }
  return params;
}

/**
 * Dish list — search, filter (status/diet/slot/missing-metadata), newest first
 * (docs/06, P3-2). Server-rendered: filters live in the URL and the service
 * re-runs per request. The catalog is operator-only (gated in `listDishes`).
 */
export default async function AdminDishesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = parseDishListFilters(toSearchParams(await searchParams));
  const dishes = await listDishes(filters);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Dishes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dishes.length} dish{dishes.length === 1 ? "" : "es"} shown
          </p>
        </div>
        <Link
          href="/admin/dishes/new"
          className={buttonVariants({ size: "lg" })}
        >
          New dish
        </Link>
      </div>

      <div className="mt-6">
        <DishListControls />
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Cuisine</th>
              <th className="px-4 py-2 font-medium">Meal slots</th>
              <th className="px-4 py-2 font-medium">Diet</th>
              <th className="px-4 py-2 font-medium">Time</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {dishes.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  No dishes match these filters.
                </td>
              </tr>
            ) : (
              dishes.map((dish) => (
                <tr key={dish.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/dishes/${dish.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {dish.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {dish.cuisine ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {dish.mealSlots.length > 0
                      ? dish.mealSlots.map(mealSlotLabel).join(", ")
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {dietTypeLabel(dish.dietType)}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {dish.totalTimeMinutes
                      ? `${dish.totalTimeMinutes} min`
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <DishStatusBadge status={dish.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
