import { Clock } from "lucide-react";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/ui/empty-state";

import { requireMember } from "../member-access";

export const metadata = { title: "Awaiting approval" };

/**
 * Awaiting-approval holding screen (MP-B-012, spec §14.4). Where a customer who
 * has accepted an invite but not yet been approved lands — they can see the
 * provider's name (identity reads are granted to awaiting members) but no menu
 * data. An already-approved customer who somehow reaches this URL is sent on to
 * their Today's Menu, so the page reflects the member's true state.
 */
export default async function ProviderAwaitingApprovalPage({
  params,
}: {
  params: Promise<{ providerId: string }>;
}) {
  const { providerId } = await params;
  const membership = await requireMember(providerId);

  if (membership.membershipStatus === "active") {
    redirect(`/providers/${providerId}/today`);
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 lg:px-8">
      <EmptyState
        icon={Clock}
        title="Awaiting approval"
        description={
          <>
            You&apos;ve joined{" "}
            <span className="font-semibold">{membership.name}</span>. The
            provider needs to approve your membership before you can see the
            menu and place orders. We&apos;ll let you know once you&apos;re in.
          </>
        }
      />
    </div>
  );
}
