import Link from "next/link";
import { redirect } from "next/navigation";

import { WorkspaceChooserList } from "@/components/workspace/workspace-chooser-list";
import { getAuthUser } from "@/lib/auth";
import { resolveWorkspaceOptions } from "@/lib/services/workspace";

export const dynamic = "force-dynamic";

export const metadata = { title: "Choose a workspace" };

/**
 * Workspace chooser (MP-B-010 / MP-B-012, ADR-1). A user can belong to a
 * household, own a provider, and be a customer of others at once; this is where
 * they pick which one to enter. Rendered outside the `(app)` nav shell — a
 * provider-only user has no household, so the Today/Plan/etc. nav would go nowhere
 * — and reached when the `(app)` onboarding gate finds no household but live
 * provider workspaces.
 *
 * Auth is gated by the edge proxy (`/workspace` is a protected prefix); this
 * server component re-resolves the verified user as a defense-in-depth backstop.
 *
 * Every row is now navigable: with the provider shells landed (#18), selecting a
 * workspace records the active-workspace pointer and routes to that workspace's
 * home (`WorkspaceChooserList` → `POST /api/workspace/active`). `WorkspaceRef`
 * carries no display name, so `resolveWorkspaceOptions` joins names in.
 */
export default async function WorkspacePage() {
  const user = await getAuthUser();
  if (!user) {
    redirect("/sign-in");
  }

  const options = await resolveWorkspaceOptions();

  // A user who belongs to nothing yet is a brand-new household signup.
  if (options.length === 0) {
    redirect("/onboarding");
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 py-12 text-foreground">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            Choose a workspace
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You belong to more than one place. Pick where you want to go.
          </p>
        </div>

        <WorkspaceChooserList options={options} />

        <div className="mt-6 text-center">
          <Link
            href="/provider-onboarding"
            className="text-sm font-medium text-primary hover:underline"
          >
            Set up a meal provider workspace →
          </Link>
        </div>
      </div>
    </main>
  );
}
