import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <span className="text-sm font-medium text-muted-foreground">
        Home Meal Planner
      </span>
      <h1 className="mt-4 max-w-2xl font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
        What should we eat today?
      </h1>
      <p className="mt-4 max-w-xl text-lg text-pretty text-muted-foreground">
        A shared, household-first meal planner: practical suggestions from your
        preferences, weekly plans, grocery lists, and prep reminders — together.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link href="/sign-in" className={buttonVariants({ size: "lg" })}>
          Get started
        </Link>
        <Link
          href="/today"
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          Open the app
        </Link>
      </div>
    </main>
  );
}
