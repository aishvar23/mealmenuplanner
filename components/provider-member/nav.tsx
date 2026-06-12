"use client";

import { CalendarDays, CalendarRange, ClipboardList, User } from "lucide-react";

import {
  ProviderNav,
  type ProviderNavLink,
} from "@/components/provider/provider-nav";

/**
 * Provider member (customer) navigation (MP-B-012, spec §14): Today's Menu, Week,
 * Responses, Account — all scoped to one provider. No household navigation. The
 * hrefs embed `providerId` so a customer of several providers never crosses
 * workspaces: every link stays under `/providers/{providerId}/*`.
 */
function memberLinks(providerId: string): readonly ProviderNavLink[] {
  const base = `/providers/${providerId}`;
  return [
    {
      href: `${base}/today`,
      label: "Today",
      description: "Today's menu",
      icon: CalendarDays,
    },
    {
      href: `${base}/week`,
      label: "Week",
      description: "This week",
      icon: CalendarRange,
    },
    {
      href: `${base}/responses`,
      label: "Responses",
      description: "Your responses",
      icon: ClipboardList,
    },
    {
      href: `${base}/account`,
      label: "Account",
      description: "Your details",
      icon: User,
    },
  ];
}

export function ProviderMemberNav({
  providerId,
  variant = "sidebar",
}: {
  providerId: string;
  variant?: "sidebar" | "mobile";
}) {
  return <ProviderNav links={memberLinks(providerId)} variant={variant} />;
}
