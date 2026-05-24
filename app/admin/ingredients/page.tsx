import { IngredientManager } from "@/components/admin/ingredient-manager";
import { listIngredients } from "@/lib/services/admin";

export const metadata = { title: "Ingredients" };

// Reads the operator session + catalog; never statically cached.
export const dynamic = "force-dynamic";

/**
 * Ingredient catalog manager (docs/06, P3-4). Loads the catalog server-side and
 * hands it to the client manager for create / edit / delete. Operator-gated in
 * the service.
 */
export default async function AdminIngredientsPage() {
  const ingredients = await listIngredients();

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        Ingredients
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {ingredients.length} ingredient{ingredients.length === 1 ? "" : "s"} in
        the catalog. Categories, units, allergens, and common names power dish
        ingredients and the grocery list.
      </p>
      <div className="mt-6">
        <IngredientManager initial={ingredients} />
      </div>
    </section>
  );
}
