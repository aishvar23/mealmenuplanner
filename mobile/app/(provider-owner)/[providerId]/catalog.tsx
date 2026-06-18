import { useLocalSearchParams } from "expo-router";

import { CatalogScreen } from "@/provider/catalog-screen";

/** Owner Catalog screen route (ADO #88). */
export default function OwnerCatalogScreen() {
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  return <CatalogScreen providerId={providerId} />;
}
