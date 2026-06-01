import { Settings2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { HouseholdMembers } from "@/components/household/household-members";
import { buttonVariants } from "@/components/ui/button";
import { getAuthUser } from "@/lib/auth";
import { listMembers, resolveCurrentHousehold } from "@/lib/services/household";
import { listPendingInvites } from "@/lib/services/invite";

export const metadata = { title: "Household" };

// Resolves the session + membership per request; never cached.
export const dynamic = "force-dynamic";

/**
 * Household members and collaboration screen. Resolves the caller's household
 * and active roster, then hands them to the interactive members panel.
 */
export default async function HouseholdPage() {
  const current = await resolveCurrentHousehold();
  if (!current) redirect("/onboarding");

  const [user, members, pendingInvites] = await Promise.all([
    getAuthUser(),
    listMembers(current.householdId),
    listPendingInvites(current.householdId),
  ]);

  const count = members.data.length;

  const canEditPreferences =
    current.currentUserPermissions.canEditHouseholdPreferences;

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">
            {count} member{count === 1 ? "" : "s"}
          </p>
          <h1 className="mt-2 font-heading text-4xl font-bold tracking-tight text-balance">
            {current.name}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Invite members, manage roles, and keep the household meal plan
            shared.
          </p>
          <Link
            href="/households"
            className="mt-2 inline-block text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            Switch or manage your households
          </Link>
        </div>
        {canEditPreferences ? (
          <Link
            href="/preferences"
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "shrink-0",
            })}
          >
            <Settings2 data-icon="inline-start" />
            Preferences
          </Link>
        ) : null}
      </header>

      <HouseholdMembers
        householdId={current.householdId}
        householdName={current.name}
        currentUserId={user?.id ?? ""}
        currentUserPermissions={current.currentUserPermissions}
        members={members.data}
        pendingInvites={pendingInvites.data}
      />
    </section>
  );
}
