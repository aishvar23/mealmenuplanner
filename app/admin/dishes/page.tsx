import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata = { title: "Dishes" };

export default function AdminDishesPage() {
  return (
    <PagePlaceholder
      title="Dishes"
      description="Search, filter, and edit dishes; manage ingredients, prep tasks, and pairings."
      note="Dish management arrives in Phase 3 (P3-2 … P3-8)."
    />
  );
}
