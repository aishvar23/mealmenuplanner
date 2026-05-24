import Link from "next/link";

import { DishForm } from "@/components/admin/dish-form";

export const metadata = { title: "New dish" };

export const dynamic = "force-dynamic";

/**
 * Create a dish (P3-3). A new dish always starts as `draft`; ingredients, prep
 * tasks, pairings, and activation happen on the editor after it is created.
 */
export default function NewDishPage() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link
        href="/admin/dishes"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to dishes
      </Link>
      <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight">
        New dish
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Create the dish, then add ingredients, prep tasks, and pairings before
        activating it.
      </p>
      <div className="mt-6">
        <DishForm />
      </div>
    </section>
  );
}
