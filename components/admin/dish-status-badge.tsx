import type { Database } from "@/lib/db/database.types";
import { dishStatusLabel } from "@/lib/admin/options";
import { cn } from "@/lib/utils";

type DishStatus = Database["public"]["Enums"]["dish_status"];

const STATUS_STYLES: Record<DishStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-primary/10 text-primary",
  archived: "bg-destructive/10 text-destructive",
};

/** Small colored pill for a dish's publication status (draft/active/archived). */
export function DishStatusBadge({ status }: { status: DishStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
      )}
    >
      {dishStatusLabel(status)}
    </span>
  );
}
