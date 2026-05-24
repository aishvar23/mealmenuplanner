"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import * as api from "./invite-client";
import { InviteRequestError } from "./invite-client";

/**
 * Accept / decline controls on the public invite landing page (P6-3). Accepting
 * redeems the invite and lands the new member on Today; declining marks it
 * declined. Both require a session — a `401` bounces the visitor to sign-in with
 * `next` pointing back here, so they return to finish after authenticating.
 */
export function InviteLanding({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);

  function goSignIn() {
    router.push(`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`);
  }

  async function accept() {
    setPending(true);
    setError(null);
    try {
      await api.acceptInvite(token);
      router.push("/today");
      router.refresh();
    } catch (e) {
      if (e instanceof InviteRequestError && e.status === 401) {
        goSignIn();
        return;
      }
      setError(e instanceof Error ? e.message : "Couldn't accept the invite.");
      setPending(false);
    }
  }

  async function decline() {
    setPending(true);
    setError(null);
    try {
      await api.declineInvite(token);
      setDeclined(true);
    } catch (e) {
      if (e instanceof InviteRequestError && e.status === 401) {
        goSignIn();
        return;
      }
      setError(e instanceof Error ? e.message : "Couldn't decline the invite.");
    } finally {
      setPending(false);
    }
  }

  if (declined) {
    return (
      <p className="mt-6 text-sm text-muted-foreground">
        You&apos;ve declined this invite.
      </p>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-2">
      <Button onClick={accept} disabled={pending}>
        {pending ? "Working…" : "Accept invite"}
      </Button>
      <Button variant="ghost" onClick={decline} disabled={pending}>
        Decline
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="mt-1 text-xs text-muted-foreground">
        You&apos;ll be asked to sign in if you haven&apos;t already.
      </p>
    </div>
  );
}
