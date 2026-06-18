"use client";

import {
  CalendarRange,
  ClipboardList,
  LayoutDashboard,
  Settings,
  Soup,
  UtensilsCrossed,
  Users,
} from "lucide-react";

import {
  ProviderNav,
  type ProviderNavLink,
} from "@/components/provider/provider-nav";

/**
 * Provider owner navigation (MP-B-011, spec §13.1): Dashboard, Today's Responses,
 * Weekly Menu, Members, Preparation, Settings. No grocery or household preference
 * destinations — an owner shell never shows household navigation.
 */
const OWNER_LINKS: readonly ProviderNavLink[] = [
  {
    href: "/provider/dashboard",
    label: "Dashboard",
    description: "Today at a glance",
    icon: LayoutDashboard,
  },
  {
    href: "/provider/responses",
    label: "Responses",
    description: "Today's responses",
    icon: ClipboardList,
  },
  {
    href: "/provider/menu",
    label: "Menu",
    description: "Weekly menu",
    icon: CalendarRange,
  },
  {
    href: "/provider/catalog",
    label: "Catalog",
    description: "Dish library",
    icon: UtensilsCrossed,
  },
  {
    href: "/provider/members",
    label: "Members",
    description: "Invite & approve",
    icon: Users,
  },
  {
    href: "/provider/preparation",
    label: "Preparation",
    description: "Cook & pack",
    icon: Soup,
  },
  {
    href: "/provider/settings",
    label: "Settings",
    description: "Provider settings",
    icon: Settings,
  },
] as const;

export function ProviderOwnerNav({
  variant = "sidebar",
}: {
  variant?: "sidebar" | "mobile";
}) {
  return <ProviderNav links={OWNER_LINKS} variant={variant} />;
}
