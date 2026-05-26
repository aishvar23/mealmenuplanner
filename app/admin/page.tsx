import Link from "next/link";

export const metadata = { title: "Operator Console" };

const CARDS = [
  {
    href: "/admin/dishes",
    title: "Dishes",
    description:
      "Search and filter the catalog, edit dishes, manage ingredients, prep tasks, and pairings, and activate dishes once they pass the quality checklist.",
  },
  {
    href: "/admin/ingredients",
    title: "Ingredients",
    description:
      "Maintain the ingredient catalog: categories, default units, allergen types, and common names.",
  },
  {
    href: "/admin/combinations",
    title: "Combinations",
    description:
      "Review household-proposed meal combinations and curate the global plate catalog used by onboarding and the recommendation engine.",
  },
] as const;

/** Operator console landing — entry points into the content tooling (docs/06). */
export default function AdminHomePage() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-10">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        Operator Console
      </h1>
      <p className="mt-1 text-muted-foreground">
        Maintain the global dish and ingredient catalog used by the
        recommendation engine.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group rounded-lg border p-5 transition-colors hover:border-ring hover:bg-muted/30"
          >
            <h2 className="font-heading text-lg font-semibold group-hover:text-foreground">
              {card.title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {card.description}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
