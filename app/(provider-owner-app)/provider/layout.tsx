import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AccountMenu } from "@/components/auth/account-menu";
import { ProviderShell } from "@/components/provider/provider-shell";
import { ProviderOwnerNav } from "@/components/provider-owner/nav";
import { getAuthUser } from "@/lib/auth";
import {
  resolveOwnerProvider,
  resolveWorkspaceOptions,
} from "@/lib/services/workspace";

export const dynamic = "force-dynamic";

/**
 * Provider owner shell (MP-B-011, spec §13). Lives in its own route group, outside
 * the `(app)` household shell — so a provider-only owner is never funneled through
 * household onboarding (that gate is `(app)`-only). The id-less `/provider/*`
 * routes resolve the owner's active provider (pointer-preferred) here; a caller
 * who owns no provider is bounced to the workspace chooser (which itself routes a
 * truly-empty user to onboarding).
 *
 * Auth is gated by the edge proxy (`/provider` is a protected prefix); this server
 * component re-resolves the verified user as defense-in-depth, matching `(app)`.
 */
export default async function ProviderOwnerLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getAuthUser();
  if (!user) {
    redirect("/sign-in");
  }

  const provider = await resolveOwnerProvider();
  if (!provider) {
    redirect("/workspace");
  }

  const workspaces = await resolveWorkspaceOptions();

  const accountMenu = (
    <AccountMenu
      email={user.email ?? null}
      initial={(user.email ?? "?").charAt(0).toUpperCase()}
      name={provider.name}
      workspaces={workspaces}
    />
  );

  return (
    <ProviderShell
      brandName={provider.name}
      brandHref="/provider/dashboard"
      sidebarNav={<ProviderOwnerNav />}
      mobileNav={<ProviderOwnerNav variant="mobile" />}
      accountMenu={accountMenu}
      footerEyebrow="Provider"
      footerLabel={user.email ?? "Owner"}
    >
      {children}
    </ProviderShell>
  );
}
