import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata = { title: "Ingredients" };

export default function AdminIngredientsPage() {
  return (
    <PagePlaceholder
      title="Ingredients"
      description="The ingredient catalog: categories, units, allergens, common names, substitutes."
      note="Ingredient management arrives in Phase 3 (P3-4)."
    />
  );
}
