import type { LucideIcon } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";

/**
 * Placeholder body for a provider destination whose feature lands in a later
 * checkpoint (MP-B-011/012 stand up the shells + nav at CP2; the dashboard, menu
 * builder, members, responses, preparation, etc. fill these in across CP3–CP5).
 * Keeping every nav target routable now means the shell is fully navigable and
 * testable without 404s, and each later item replaces the matching page.
 */
export function ProviderComingSoon({
  icon,
  title,
  description,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 lg:px-8">
      <EmptyState
        icon={icon}
        title={title}
        description={
          description ?? "This part of your provider workspace is coming soon."
        }
      />
    </div>
  );
}
