import { ChefHat, Store } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ProviderOnboardingWizard } from "@/components/provider-onboarding/provider-onboarding-wizard";
import { getAuthUser } from "@/lib/auth";
import { getProvider } from "@/lib/services/provider";
import { listProviderSummaries } from "@/lib/services/workspace";
import type { ProviderDto } from "@/packages/shared/provider";

export const dynamic = "force-dynamic";

export const metadata = { title: "Set up your meal provider" };

/**
 * Provider owner onboarding route (MP-B-020). Standalone, outside both the `(app)`
 * household shell and the `(provider-owner-app)` owner shell: a creating owner has
 * no active provider yet, so the owner shell (which bounces non-owners to
 * `/workspace`) can't host this, and the household nav would go nowhere.
 *
 * Auth is gated by the edge proxy (`/provider-onboarding` is a protected prefix);
 * this server component re-resolves the verified user as a defense-in-depth
 * backstop. Resume is server-side: if the caller already owns a provider we either
 * send them to their dashboard (already set up) or seed the wizard from their open
 * draft (the draft org is the resumable store, ADR-6).
 */
export default async function ProviderOnboardingPage() {
  const user = await getAuthUser();
  if (!user) {
    redirect("/sign-in");
  }

  const summaries = await listProviderSummaries();
  const owned = summaries.filter((s) => s.role === "owner");

  let initialProvider: ProviderDto | null = null;
  if (owned.length > 0) {
    const existing = await getProvider(owned[0]!.providerId);
    if (existing.status === "active") {
      // Already onboarded — nothing to set up here.
      redirect("/provider/dashboard");
    }
    initialProvider = existing;
  }

  return (
    <main className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(22rem,0.8fr)_minmax(0,1.2fr)]">
      <section className="relative hidden overflow-hidden border-r bg-primary/5 lg:block">
        <div className="relative flex h-full flex-col justify-between p-8">
          <Link href="/" className="flex items-center gap-3 font-bold">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ChefHat className="size-5" />
            </span>
            Home Meal Planner
          </Link>
          <div className="max-w-sm">
            <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Store className="size-6" />
            </span>
            <h1 className="mt-4 font-heading text-4xl font-bold tracking-tight text-balance">
              Run your kitchen as a meal provider.
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Publish daily menus, collect orders before your cutoff, and get a
              consolidated preparation list — all from one workspace.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-3xl flex-col px-4 py-8 sm:px-6 lg:py-12">
        <div className="mb-8">
          <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">
            Provider setup
          </p>
          <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight text-balance">
            {initialProvider ? "Finish setting up" : "Create your provider"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Tell us about your kitchen. You can change any of this later in
            settings.
          </p>
        </div>

        <ProviderOnboardingWizard initialProvider={initialProvider} />
      </section>
    </main>
  );
}
