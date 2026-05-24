import Link from "next/link";
import { redirect } from "next/navigation";

import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { getAuthUser } from "@/lib/auth";

export const metadata = { title: "Set up your household" };

/**
 * Onboarding route — the household-setup wizard (design/06). Rendered outside
 * the `(app)` nav shell: a new user has no household yet, so the Today/Plan/etc.
 * nav would go nowhere.
 *
 * Auth is gated by the edge proxy (`/onboarding` is a protected prefix); this
 * server component re-resolves the verified user as a defense-in-depth backstop,
 * matching the `(app)` layout. Resume detection (loading an existing draft to
 * deep-link the wizard) lands in P2-4; for now every visit starts a fresh
 * in-memory wizard.
 */
export default async function OnboardingPage() {
  const user = await getAuthUser();
  if (!user) {
    redirect("/sign-in");
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-10">
      <Link
        href="/"
        className="mb-8 font-heading text-lg font-semibold tracking-tight"
      >
        Home Meal Planner
      </Link>
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        Set up your household
      </h1>
      <p className="mt-1 mb-8 text-muted-foreground">
        A few quick questions so we can suggest meals that fit your home.
      </p>
      <OnboardingWizard />
    </div>
  );
}
