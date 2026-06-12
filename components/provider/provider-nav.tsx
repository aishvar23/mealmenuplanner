"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/** One primary-nav destination within a provider shell. */
export interface ProviderNavLink {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

/**
 * Primary navigation for a provider shell (MP-B-011 owner, MP-B-012 member), the
 * provider-side analogue of `AppNav`. It is deliberately link-driven rather than
 * hard-coded: the owner and member shells share the exact same sidebar/mobile
 * chrome and only differ in their link set, so each passes its own `links`. There
 * is intentionally no grocery/household/preferences destination here — a provider
 * shell never shows household navigation (spec §13.1).
 */
export function ProviderNav({
  links,
  variant = "sidebar",
}: {
  links: readonly ProviderNavLink[];
  variant?: "sidebar" | "mobile";
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  if (variant === "mobile") {
    return (
      <nav
        aria-label="Provider"
        className="grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))`,
        }}
      >
        {links.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
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
    <nav aria-label="Provider" className="flex flex-col gap-1">
      {links.map(({ href, label, description, icon: Icon }) => {
        const active = isActive(href);
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
