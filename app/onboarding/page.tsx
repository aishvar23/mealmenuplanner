import { ChefHat } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { OnboardingExperience } from "@/components/onboarding/onboarding-experience";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { getAuthUser } from "@/lib/auth";
import { preferencesToDraftData } from "@/lib/onboarding";
import {
  getHousehold,
  resolveCurrentHousehold,
} from "@/lib/services/household";
import { getDraft } from "@/lib/services/onboarding";

export const dynamic = "force-dynamic";

export const metadata = { title: "Set up your household" };

/**
 * Onboarding route — the household-setup wizard (design/06). Rendered outside
 * the `(app)` nav shell: a new user has no household yet, so the Today/Plan/etc.
 * nav would go nowhere.
 *
 * Auth is gated by the edge proxy (`/onboarding` is a protected prefix); this
 * server component re-resolves the verified user as a defense-in-depth backstop,
 * matching the `(app)` layout.
 *
 * Two flows share this route:
 *  - **Create** (no household yet) loads the caller's in-progress draft so the
 *    client can show the resume prompt vs. start fresh (P2-4) without a flash.
 *  - **Edit** (already in a household) re-runs the wizard seeded from the live
 *    preferences; saving PATCHes them instead of creating a household. Gated on
 *    `can_edit_household_preferences`.
 */
export default async function OnboardingPage() {
  const user = await getAuthUser();
  if (!user) {
    redirect("/sign-in");
  }

  const current = await resolveCurrentHousehold();
  if (current) {
    // A member who can't edit preferences has nothing to do here.
    if (!current.currentUserPermissions.canEditHouseholdPreferences) {
      redirect("/today");
    }
    const household = await getHousehold(current.householdId);
    if (household.preferences) {
      const initialData = preferencesToDraftData(
        household.name,
        household.preferences,
      );
      return (
        <OnboardingShell
          title="Edit your preferences"
          subtitle="Update how we suggest meals for your household."
        >
          <OnboardingWizard
            mode="edit"
            householdId={current.householdId}
            initialData={initialData}
          />
        </OnboardingShell>
      );
    }
    // In a household but with no preferences row (a raw-created household that
    // never ran onboarding). Nothing to edit, and the create flow would spawn a
    // second household — send them to the app.
    redirect("/today");
  }

  const draft = await getDraft();

  return (
    <OnboardingShell
      title="Build your taste profile"
      subtitle="A few focused choices help the planner suggest meals that fit your people, time, and budget."
    >
      <OnboardingExperience initialDraft={draft} />
    </OnboardingShell>
  );
}

/** Shared page chrome for both the create and edit flows. */
function OnboardingShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(24rem,0.8fr)_minmax(0,1.2fr)]">
      <section className="relative hidden overflow-hidden border-r lg:block">
        <Image
          src="/images/meal-hero.png"
          alt=""
          fill
          loading="eager"
          fetchPriority="high"
          sizes="40vw"
          className="absolute inset-0 object-cover"
        />
        <div className="absolute inset-0 bg-[linear-gradient(0deg,oklch(0.12_0.035_145/0.74),oklch(0.12_0.035_145/0.18)_58%,transparent)]" />
        <div className="relative flex h-full flex-col justify-between p-8 text-white">
          <Link href="/" className="flex items-center gap-3 font-bold">
            <span className="flex size-10 items-center justify-center rounded-lg bg-white text-primary">
              <ChefHat className="size-5" />
            </span>
            Home Meal Planner
          </Link>
          <div className="max-w-sm">
            <p className="text-sm font-semibold tracking-[0.18em] text-white/70 uppercase">
              Taste profile
            </p>
            <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-balance">
              Set the rules once. Decide dinner faster.
            </h1>
            <p className="mt-4 text-sm leading-6 text-white/80">
              Pick meals, cuisine, time, allergies, and budget with guided
              controls instead of a long blank form.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-3xl flex-col px-4 py-6 sm:px-6 lg:py-10">
        <Link
          href="/"
          className="mb-8 flex items-center gap-2 font-heading text-lg font-bold tracking-tight lg:hidden"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ChefHat className="size-5" />
          </span>
          Home Meal Planner
        </Link>
        <div className="mb-8">
          <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">
            Household setup
          </p>
          <h1 className="mt-2 font-heading text-4xl font-bold tracking-tight text-balance">
            {title}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {subtitle}
          </p>
        </div>
        {children}
      </section>
    </main>
  );
}
