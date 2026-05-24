import Link from "next/link";
import { notFound } from "next/navigation";

import { DishEditor } from "@/components/admin/dish-editor";
import { DishStatusBadge } from "@/components/admin/dish-status-badge";
import { NotFoundError } from "@/lib/errors";
import {
  getDish,
  listDishes,
  listIngredients,
  type DishDetailDto,
} from "@/lib/services/admin";

export const metadata = { title: "Edit dish" };

// Reads the operator session + content; never statically cached.
export const dynamic = "force-dynamic";

/**
 * Dish editor (P3-3/5/6/7/8). Loads the dish detail plus the ingredient and dish
 * catalogs (for the ingredient + pairing pickers) server-side, then hands them
 * to the client `DishEditor`. All three reads are operator-gated in the service.
 */
export default async function EditDishPage({
  params,
}: {
  params: Promise<{ dishId: string }>;
}) {
  const { dishId } = await params;

  let detail: DishDetailDto;
  try {
    detail = await getDish(dishId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const [ingredientCatalog, dishCatalog] = await Promise.all([
    listIngredients(),
    listDishes(),
  ]);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8">
      <Link
        href="/admin/dishes"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to dishes
      </Link>
      <div className="mt-2 flex items-center gap-3">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {detail.name}
        </h1>
        <DishStatusBadge status={detail.status} />
      </div>

      <div className="mt-6">
        <DishEditor
          initialDetail={detail}
          ingredientCatalog={ingredientCatalog}
          dishCatalog={dishCatalog}
        />
      </div>
    </section>
  );
}
