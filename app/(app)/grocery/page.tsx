import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata = { title: "Grocery" };

export default function GroceryPage() {
  return (
    <PagePlaceholder
      title="Grocery list"
      description="Ingredients for your plan, aggregated and grouped by category."
      note="Grocery generation and check-off arrive in Phase 7."
    />
  );
}
