import { redirect } from "next/navigation";

import { HouseholdMembers } from "@/components/household/household-members";
import { getAuthUser } from "@/lib/auth";
import { listMembers, resolveCurrentHousehold } from "@/lib/services/household";

export const metadata = { title: "Household" };

// Resolves the session + membership per request; never cached.
export const dynamic = "force-dynamic";

/**
 * Household members & collaboration screen (P6-4, design/07 § 8). Resolves the
 * caller's household and its active roster, then hands them to the interactive
 * members panel. The caller's permissions (from the resolved membership) decide
 * which management controls render; the server re-checks every mutation. A caller
 * with no household is routed into onboarding.
 */
export default async function HouseholdPage() {
  const current = await resolveCurrentHousehold();
  if (!current) redirect("/onboarding");

  const [user, members] = await Promise.all([
    getAuthUser(),
    listMembers(current.householdId),
  ]);

  const count = members.data.length;

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Household
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {current.name} · {count} member{count === 1 ? "" : "s"}
        </p>
      </div>

      <div className="mt-6">
        <HouseholdMembers
          householdId={current.householdId}
          householdName={current.name}
          currentUserId={user?.id ?? ""}
          currentUserPermissions={current.currentUserPermissions}
          members={members.data}
        />
      </div>
    </section>
  );
}
