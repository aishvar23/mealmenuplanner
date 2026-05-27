import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Status pill — replaces the hand-rolled `inline-flex … rounded-… px-… text-xs`
 * badges scattered across the boards and member lists with one tokenised set.
 * Variants map to the Forest & Ember semantic colours: `emerald` (positive /
 * planned), `marigold` (attention / pending), `ember` (needs a decision —
 * solid for emphasis), plus `neutral`, `accent`, and `outline`.
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:pointer-events-none",
  {
    variants: {
      variant: {
        neutral: "bg-muted text-muted-foreground",
        emerald: "bg-primary/10 text-primary",
        marigold: "bg-saffron/20 text-saffron-foreground",
        ember: "bg-tomato text-tomato-foreground",
        accent: "bg-accent text-accent-foreground",
        outline: "border border-border text-foreground",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
