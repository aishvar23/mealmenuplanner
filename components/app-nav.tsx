"use client";

import { CalendarDays, CalendarRange, ShoppingCart, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const LINKS = [
  {
    href: "/today",
    label: "Today",
    description: "Approve tonight",
    icon: CalendarDays,
  },
  {
    href: "/plan",
    label: "Week",
    description: "Shape the plan",
    icon: CalendarRange,
  },
  {
    href: "/grocery",
    label: "Grocery",
    description: "Shop the list",
    icon: ShoppingCart,
  },
  {
    href: "/household",
    label: "Household",
    description: "People and taste",
    icon: Users,
  },
] as const;

/** Primary navigation for the authenticated app shell, with active highlighting. */
export function AppNav({
  variant = "sidebar",
}: {
  variant?: "sidebar" | "mobile";
}) {
  const pathname = usePathname();

  if (variant === "mobile") {
    return (
      <nav aria-label="Primary" className="grid grid-cols-4 gap-1">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-2 text-[0.7rem] font-semibold transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-primary/10 hover:text-primary",
              )}
            >
              <Icon className="size-4" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      {LINKS.map(({ href, label, description, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold transition-colors",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-lg border transition-colors",
                active
                  ? "border-sidebar-primary-foreground/20 bg-sidebar-primary-foreground/10"
                  : "border-sidebar-border bg-sidebar-accent/50 group-hover:border-sidebar-primary/30",
              )}
            >
              <Icon className="size-4" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span>{label}</span>
              <span
                className={cn(
                  "truncate text-xs font-medium",
                  active
                    ? "text-sidebar-primary-foreground/75"
                    : "text-sidebar-foreground/50 group-hover:text-sidebar-accent-foreground/70",
                )}
              >
                {description}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
