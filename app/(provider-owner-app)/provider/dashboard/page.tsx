import { redirect } from "next/navigation";

import { DashboardView } from "@/components/provider-dashboard/dashboard-view";
import { getProviderDashboard } from "@/lib/services/provider";
import { resolveOwnerProvider } from "@/lib/services/workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "Provider dashboard" };

/**
 * Owner landing — day at a glance (MP-B-060, spec §12.4 / §13.2). Resolves the owner's
 * active provider (id-less `/provider/*` convention), reads the composed dashboard
 * summary under RLS, and renders it. A user who owns no provider is bounced to the
 * workspace chooser (defense-in-depth on the shell).
 */
export default async function ProviderDashboardPage() {
  const provider = await resolveOwnerProvider();
  if (!provider) {
    redirect("/workspace");
  }

  const dashboard = await getProviderDashboard(provider.providerId);
  return <DashboardView dashboard={dashboard} />;
}
