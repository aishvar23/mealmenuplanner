import { redirect } from "next/navigation";

import { CatalogManagerView } from "@/components/provider-catalog/catalog-manager-view";
import { listProviderCatalog } from "@/lib/services/provider";
import { resolveOwnerProvider } from "@/lib/services/workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "Catalog" };

/**
 * Owner Catalog manager (ADO #88, spec §13.2). Resolves the owner's active provider
 * (id-less `/provider/*` convention), reads the owner's catalog under RLS, and hands
 * it to the client manager — which adds / edits / archives dishes via the existing
 * catalog backend (MP-A-110). A user who owns no provider is bounced to the workspace
 * chooser (defense-in-depth on the shell).
 */
export default async function ProviderCatalogPage() {
  const provider = await resolveOwnerProvider();
  if (!provider) {
    redirect("/workspace");
  }

  const catalog = await listProviderCatalog(provider.providerId);

  return (
    <CatalogManagerView
      providerId={provider.providerId}
      initialCatalog={catalog}
    />
  );
}
