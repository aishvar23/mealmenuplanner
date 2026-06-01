import { Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { HouseholdSwitcher } from "@/components/household/household-switcher";
import { buttonVariants } from "@/components/ui/button";
import { listUserHouseholds } from "@/lib/services/household";

export const metadata = { title: "Households" };

// Resolves the session + memberships per request; never cached.
export const dynamic = "force-dynamic";

/**
 * Households management screen (BETA). Lists every household the caller belongs
 * to and lets them switch the one they're viewing and set a default. A caller
 * with no household is routed into onboarding (same gate as the other screens).
 */
export default async function HouseholdsPage() {
  const households = await listUserHouseholds();
  if (households.length === 0) redirect("/onboarding");

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">
            {households.length} household{households.length === 1 ? "" : "s"}
          </p>
          <h1 className="mt-2 font-heading text-4xl font-bold tracking-tight text-balance">
            Your households
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Switch the household you&apos;re planning for, or star the one to
            open by default. Your choice follows you across devices.
          </p>
        </div>
        <Link
          href="/onboarding?new=1"
          className={buttonVariants({ size: "sm", className: "shrink-0" })}
        >
          <Plus data-icon="inline-start" />
          Create a household
        </Link>
      </header>

      <HouseholdSwitcher initialHouseholds={households} />
    </section>
  );
}
