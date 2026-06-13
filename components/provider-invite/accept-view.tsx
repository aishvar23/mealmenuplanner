"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { readApiErrorMessage } from "@/packages/shared/provider";
import type { ProviderInvitePreviewDto } from "@/packages/shared/provider";

/**
 * Provider invite acceptance landing (MP-A-102 / MP-B-022 flow). Shows the safe
 * preview to anyone with the link; accepting requires a signed-in user (the
 * accept route is auth-gated) and lands them in `awaiting_approval`, so we route
 * to the holding screen afterwards. A signed-out visitor is sent to sign-in with
 * a `next` back here.
 */
export function AcceptInviteView({
  token,
  preview,
  isSignedIn,
}: {
  token: string;
  preview: ProviderInvitePreviewDto;
  isSignedIn: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAccept() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/provider-invites/${token}/accept`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(res, "Couldn't accept this invite."),
        );
      }
      const result = (await res.json()) as { providerId: string };
      router.replace(`/providers/${result.providerId}/awaiting-approval`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12">
      <div className="rounded-lg border p-6 text-center">
        <p className="text-xs font-semibold tracking-widest text-emerald-700 uppercase">
          Invitation
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{preview.providerName}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {preview.invitedByName
            ? `${preview.invitedByName} invited you to order meals through Home Meal Planner.`
            : "You've been invited to order meals through Home Meal Planner."}
        </p>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-6">
          {isSignedIn ? (
            <Button onClick={onAccept} disabled={busy} className="w-full">
              {busy ? "Accepting…" : "Accept invitation"}
            </Button>
          ) : (
            <Link
              href={`/sign-in?next=/provider-invite/${token}`}
              className={buttonVariants({ className: "w-full" })}
            >
              Sign in to accept
            </Link>
          )}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          After you accept, the provider approves your membership before you can
          see the menu.
        </p>
      </div>
    </div>
  );
}
