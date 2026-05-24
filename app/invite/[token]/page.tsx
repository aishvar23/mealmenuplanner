import Link from "next/link";

import { InviteLanding } from "@/components/invite/invite-landing";
import { buttonVariants } from "@/components/ui/button";
import { memberRoleLabel, membershipTypeLabel } from "@/lib/household/labels";
import { getInvitePreview, type InvitePreviewDto } from "@/lib/services/invite";

export const metadata = { title: "You're invited" };

// Reads the invite preview per request (token-addressed); never cached.
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ token: string }> };

/**
 * Public invite landing page (P6-2/3). Renders outside the `(app)` nav shell —
 * the visitor may not be a member or even signed in. It fetches the safe,
 * unauthenticated preview (via the `get_invite_preview` RPC) and offers accept /
 * decline. Any non-redeemable token (unknown, expired, already used) renders a
 * single generic "invalid" state, matching the no-oracle policy (design/03 § 7).
 */
export default async function InvitePage({ params }: PageProps) {
  const { token } = await params;

  let preview: InvitePreviewDto;
  try {
    preview = await getInvitePreview(token);
  } catch {
    return <InvalidInvite />;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-xl border p-6 text-center">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          You&apos;re invited
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {preview.invitedBy ?? "Someone"} invited you to join{" "}
          <strong className="text-foreground">{preview.householdName}</strong>{" "}
          as a {memberRoleLabel(preview.role)} (
          {membershipTypeLabel(preview.membershipType)}).
        </p>
        <InviteLanding token={token} />
      </div>
    </main>
  );
}

function InvalidInvite() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-xl border p-6 text-center">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Invite not available
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This invite link is invalid or has expired. Ask whoever invited you to
          send a new one.
        </p>
        <Link href="/" className={buttonVariants({ className: "mt-6" })}>
          Go home
        </Link>
      </div>
    </main>
  );
}
