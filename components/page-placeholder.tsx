import type { ReactNode } from "react";

/**
 * Scaffold placeholder for app-shell routes whose real screens land in later
 * phases. Keeps the navigation functional and the layouts demonstrable.
 */
export function PagePlaceholder({
  title,
  description,
  note,
}: {
  title: string;
  description: string;
  note?: ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-10">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        {title}
      </h1>
      <p className="mt-1 text-muted-foreground">{description}</p>
      <div className="mt-8 rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        {note ??
          "Part of the app-shell scaffold — the full experience lands in a later phase."}
      </div>
    </section>
  );
}
