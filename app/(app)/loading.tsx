import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level loading skeleton for the authenticated app screens (Today, Week,
 * Grocery, Household, Notifications). These pages are `force-dynamic` and fetch
 * household data per request, so navigation shows this shaped placeholder
 * instead of a blank flash. The pulse is disabled under reduced-motion.
 */
export default function AppLoading() {
  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 lg:px-8">
      <header className="flex flex-col gap-2.5">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-9 w-80 max-w-full" />
        <Skeleton className="h-4 w-44" />
      </header>
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
        <Skeleton className="h-80 rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-1">
          <Skeleton className="h-[14.5rem] rounded-xl" />
          <Skeleton className="h-[14.5rem] rounded-xl" />
        </div>
      </div>
    </section>
  );
}
