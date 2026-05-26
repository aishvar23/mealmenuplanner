import Link from "next/link";

import { CombinationReviewActions } from "@/components/admin/combination-review-actions";
import { dietTypeLabel } from "@/lib/admin/options";
import { Constants } from "@/lib/db/database.types";
import { listCombinations } from "@/lib/services/admin";

export const metadata = { title: "Combinations" };

// Reads the operator session + status query param; never statically cached.
export const dynamic = "force-dynamic";

type CombinationStatus =
  (typeof Constants.public.Enums.combination_status)[number];
type SearchParams = Record<string, string | string[] | undefined>;

/** The status tabs across the top of the review queue, in lifecycle order. */
const STATUS_TABS: { value: CombinationStatus; label: string }[] = [
  { value: "proposed", label: "Pending review" },
  { value: "active", label: "Active" },
  { value: "rejected", label: "Rejected" },
  { value: "archived", label: "Archived" },
];

function resolveStatus(
  value: string | string[] | undefined,
): CombinationStatus {
  const statuses = Constants.public.Enums
    .combination_status as readonly string[];
  return typeof value === "string" && statuses.includes(value)
    ? (value as CombinationStatus)
    : "proposed";
}

/**
 * Meal-combination review queue (P10-5). Households promote self-built plates via
 * the daily-approval hook; the operator approves (→ active) or rejects each one
 * here. Server-rendered, with the status tab in the URL so views are shareable
 * and the list re-runs per request. Operator-only (gated in `listCombinations`).
 */
export default async function AdminCombinationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const status = resolveStatus((await searchParams).status);
  const combinations = await listCombinations(status);

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Meal combinations
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review household-proposed plates and curate the global combination
          catalog used by onboarding and the recommendation engine.
        </p>
      </div>

      <nav
        aria-label="Combination status"
        className="mt-6 flex flex-wrap items-center gap-2"
      >
        {STATUS_TABS.map((tab) => {
          const active = tab.value === status;
          return (
            <Link
              key={tab.value}
              href={`/admin/combinations?status=${tab.value}`}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
                  : "rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <p className="mt-4 text-sm text-muted-foreground">
        {combinations.length} combination
        {combinations.length === 1 ? "" : "s"}
      </p>

      <div className="mt-3 grid gap-4">
        {combinations.length === 0 ? (
          <div className="rounded-lg border px-4 py-10 text-center text-muted-foreground">
            No{" "}
            {STATUS_TABS.find((t) => t.value === status)?.label.toLowerCase()}{" "}
            combinations.
          </div>
        ) : (
          combinations.map((combo) => (
            <article key={combo.id} className="rounded-lg border p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-heading text-lg font-semibold">
                    {combo.name}
                  </h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {dietTypeLabel(combo.dietType)}
                    {combo.cuisine ? ` · ${combo.cuisine}` : ""}
                    {combo.source === "user_proposed"
                      ? ` · proposed by ${combo.proposedByUserName ?? "a member"}${
                          combo.proposedByHouseholdName
                            ? ` (${combo.proposedByHouseholdName})`
                            : ""
                        }`
                      : " · admin-curated"}
                    {` · ${combo.popularityCount} selection${
                      combo.popularityCount === 1 ? "" : "s"
                    }`}
                  </p>
                </div>
                {status === "proposed" ? (
                  <CombinationReviewActions combinationId={combo.id} />
                ) : null}
              </div>

              {combo.description ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {combo.description}
                </p>
              ) : null}

              <ul className="mt-3 flex flex-wrap gap-2">
                {combo.items.map((item) => (
                  <li
                    key={item.dishId}
                    className="rounded-full border bg-muted/40 px-3 py-1 text-sm"
                  >
                    {item.dishName ?? "Unknown dish"}
                    {item.roleInCombo ? (
                      <span className="text-muted-foreground">
                        {" "}
                        — {item.roleInCombo}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
