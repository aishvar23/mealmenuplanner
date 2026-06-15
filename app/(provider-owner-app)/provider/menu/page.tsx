import { redirect } from "next/navigation";

import { MenuManagerView } from "@/components/provider-menu/menu-manager-view";
import { getWeeklyMenu, listProviderCatalog } from "@/lib/services/provider";
import { resolveOwnerProvider } from "@/lib/services/workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "Weekly menu" };

/**
 * Owner menu builder/manager (MP-B-030, spec §13.3). Resolves the owner's active
 * provider (id-less `/provider/*` convention), reads this week's menu days + the
 * owner's catalog under RLS, and hands both to the client manager — which lists the
 * days and authors/publishes drafts via the merged writers (PR #57/#58). A user who
 * owns no provider is bounced to the workspace chooser (defense-in-depth on the shell).
 */
export default async function ProviderMenuPage() {
  const provider = await resolveOwnerProvider();
  if (!provider) {
    redirect("/workspace");
  }

  const [weeklyMenu, catalog] = await Promise.all([
    getWeeklyMenu(provider.providerId),
    listProviderCatalog(provider.providerId),
  ]);

  return (
    <MenuManagerView
      providerId={provider.providerId}
      weeklyMenu={weeklyMenu}
      catalog={catalog}
      timezone={provider.timezone}
    />
  );
}
