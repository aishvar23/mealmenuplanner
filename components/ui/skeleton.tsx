import { cn } from "@/lib/utils";

/**
 * Loading placeholder — a muted, pulsing block used to scaffold the shape of
 * content while it loads (see the route-level `loading.tsx` skeletons). The
 * pulse is disabled under `prefers-reduced-motion`.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-pulse rounded-md bg-muted motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
