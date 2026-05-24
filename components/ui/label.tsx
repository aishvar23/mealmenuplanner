import { cn } from "@/lib/utils";

/**
 * Form label primitive. Associate it with a control via `htmlFor` so clicks and
 * assistive tech move focus to the right input.
 */
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-1 text-sm leading-none font-medium select-none",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
