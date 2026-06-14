import { ClipboardList } from "lucide-react";
import Link from "next/link";

import { ProviderComingSoon } from "@/components/provider/provider-coming-soon";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getMyResponse, getTodayMenu } from "@/lib/services/provider";
import {
  isResponseLocked,
  PROVIDER_RESPONSE_STATUS_LABELS,
} from "@/packages/shared/provider";

import { requireActiveMember } from "../member-access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your responses" };

/**
 * Customer's response summary (MP-B-041, spec §14.3): a read-only recap of where
 * today's order stands, with a CTA back to Today's Menu where the order is actually
 * confirmed / updated / cancelled. Keeping the interactive controls on one page
 * (Today) avoids two diverging response forms; this page is the at-a-glance status.
 */
export default async function ProviderMemberResponsesPage({
  params,
}: {
  params: Promise<{ providerId: string }>;
}) {
  const { providerId } = await params;
  await requireActiveMember(providerId);
  const menu = await getTodayMenu(providerId);

  if (!menu) {
    return (
      <ProviderComingSoon
        icon={ClipboardList}
        title="No menu published for today"
        description="When your provider publishes today's menu, your response status will show here."
      />
    );
  }

  const response = await getMyResponse(menu.menuDayId);
  const locked = isResponseLocked(menu, response);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8 lg:px-8">
      <header>
        <h1 className="text-2xl font-semibold">Your response</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Today&rsquo;s menu · {menu.menuDate}
        </p>
      </header>

      <section className="space-y-3 rounded-lg border p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">Status</span>
          <Badge
            variant={
              response.status === "confirmed"
                ? "emerald"
                : response.status === "cancelled"
                  ? "ember"
                  : "neutral"
            }
          >
            {PROVIDER_RESPONSE_STATUS_LABELS[response.status]}
          </Badge>
        </div>
        {response.memberNote ? (
          <p className="rounded-md bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Your note: </span>
            {response.memberNote}
          </p>
        ) : null}
        <Link
          href={`/providers/${providerId}/today`}
          className={buttonVariants()}
        >
          {locked ? "View today's menu" : "Review & respond"}
        </Link>
      </section>
    </div>
  );
}
