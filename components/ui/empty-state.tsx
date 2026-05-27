import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Empty-state panel — replaces the bare text-in-a-dashed-box placeholders with
 * a consistent icon + heading + supporting line (+ optional CTA). Used where a
 * list/board has nothing to show yet (no grocery list, no planned meals, etc.).
 */
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl border border-dashed bg-card p-10 text-center",
        className,
      )}
    >
      {Icon ? (
        <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-6" />
        </span>
      ) : null}
      <p className="font-heading text-lg font-bold tracking-tight text-balance">
        {title}
      </p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export { EmptyState };
