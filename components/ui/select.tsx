import { cn } from "@/lib/utils";

/**
 * Styled native `<select>` — the single-choice form primitive (shadcn base-nova
 * tokens, matching {@link Input}). A native select keeps the operator console
 * lightweight and accessible without a popover dependency; callers provide
 * `<option>` children and control `value`/`onChange`.
 */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "flex h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-xs transition-[color,box-shadow,border-color] outline-none",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Select };
