import type { ReactNode } from "react";

import { AccountMenu } from "@/components/auth/account-menu";
import { ProviderShell } from "@/components/provider/provider-shell";
import { ProviderMemberNav } from "@/components/provider-member/nav";
import { getAuthUser } from "@/lib/auth";
import { resolveWorkspaceOptions } from "@/lib/services/workspace";

import { requireMember } from "./member-access";

export const dynamic = "force-dynamic";

/**
 * Provider member (customer) shell (MP-B-012, spec §14). One shell per provider,
 * scoped by the `[providerId]` segment, so a customer of several providers never
 * sees one provider's data inside another's workspace (§14.4) — `requireMember`
 * resolves the membership through the RLS client, which only returns rows for
 * providers this user actually belongs to.
 *
 * An awaiting-approval customer has no menu access yet, so the shell drops the
 * primary nav for them and shows only the holding screen (the menu-bearing pages
 * redirect awaiting members to `/awaiting-approval` via `requireActiveMember`).
 * Lives outside the `(app)` household shell so a provider-only customer is never
 * funneled through household onboarding.
 */
export default async function ProviderMemberLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ providerId: string }>;
}) {
  const { providerId } = await params;
  const user = await getAuthUser();

  const [membership, workspaces] = await Promise.all([
    requireMember(providerId),
    resolveWorkspaceOptions(),
  ]);

  const isActive = membership.membershipStatus === "active";

  const accountMenu = (
    <AccountMenu
      email={user?.email ?? null}
      initial={(user?.email ?? "?").charAt(0).toUpperCase()}
      name={membership.name}
      workspaces={workspaces}
    />
  );

  return (
    <ProviderShell
      brandName={membership.name}
      brandHref={
        isActive
          ? `/providers/${providerId}/today`
          : `/providers/${providerId}/awaiting-approval`
      }
      sidebarNav={
        isActive ? <ProviderMemberNav providerId={providerId} /> : undefined
      }
      mobileNav={
        isActive ? (
          <ProviderMemberNav providerId={providerId} variant="mobile" />
        ) : undefined
      }
      accountMenu={accountMenu}
      footerEyebrow="Signed in"
      footerLabel={user?.email ?? "Customer"}
    >
      {children}
    </ProviderShell>
  );
}
