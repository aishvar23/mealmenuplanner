"use client";

import { CalendarDays, CalendarRange, ShoppingCart, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/today", label: "Today", icon: CalendarDays },
  { href: "/plan", label: "Plan", icon: CalendarRange },
  { href: "/grocery", label: "Grocery", icon: ShoppingCart },
  { href: "/household", label: "Household", icon: Users },
] as const;

/** Primary navigation for the authenticated app shell, with active highlighting. */
export function AppNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="flex items-center gap-1">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
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
