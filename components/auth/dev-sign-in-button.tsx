"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { resolvePostAuthRedirect } from "@/lib/auth/route-access";

/**
 * "Dev: sign in as test user" — local-only convenience, rendered by the sign-in
 * page only when {@link isDevLoginEnabled} is true (never in production). Posts
 * to `/api/dev/sign-in`, which provisions + signs in the test account
 * server-side and sets the session cookies; we then do a full navigation so the
 * proxy + server layouts pick up the new session.
 *
 * Credentials live entirely server-side (`DEV_LOGIN_*`) — this button never
 * sees them.
 */
export function DevSignInButton({ next }: { next?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/dev/sign-in", { method: "POST" });
      if (!res.ok) throw new Error(`Dev sign-in failed (${res.status})`);
      window.location.assign(resolvePostAuthRedirect(next));
    } catch {
      setError(
        "Dev sign-in failed. Check the dev server logs and your DEV_LOGIN_* env vars.",
      );
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="w-full"
        onClick={signIn}
        disabled={pending}
      >
        {pending ? "Signing in…" : "Dev: sign in as test user"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
