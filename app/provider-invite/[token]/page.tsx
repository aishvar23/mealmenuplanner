import { AlertCircle } from "lucide-react";

import { AcceptInviteView } from "@/components/provider-invite/accept-view";
import { EmptyState } from "@/components/ui/empty-state";
import { getAuthUser } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { previewProviderInvite } from "@/lib/services/provider";

export const dynamic = "force-dynamic";
export const metadata = { title: "Provider invitation" };

/**
 * Provider invite landing (`/provider-invite/{token}`). Public — the preview is
 * the anon-safe projection (provider + inviter name, role, expiry). Accepting is
 * auth-gated (the accept route), so a signed-out visitor sees a sign-in prompt
 * that returns here. An unknown/expired/used token renders an invalid state.
 */
export default async function ProviderInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let preview;
  try {
    preview = await previewProviderInvite(token);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return (
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12">
          <EmptyState
            icon={AlertCircle}
            title="Invitation not available"
            description="This invitation link is invalid or has expired. Ask the provider to send you a new one."
          />
        </div>
      );
    }
    throw error;
  }

  const user = await getAuthUser();

  return (
    <AcceptInviteView
      token={token}
      preview={preview}
      isSignedIn={user !== null}
    />
  );
}
