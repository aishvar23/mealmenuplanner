import { Skeleton } from "@/components/ui/skeleton";

/** Loading skeleton for the internal admin tooling (dishes, ingredients, etc.). */
export default function AdminLoading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:px-8">
      <header className="flex flex-col gap-2.5">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-8 w-64 max-w-full" />
      </header>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}
