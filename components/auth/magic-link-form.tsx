"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserSupabaseClient } from "@/lib/db/browser";

/**
 * Passwordless magic-link sign-in (design/03 § 1, `auth_provider` =
 * `magic_link`). `signInWithOtp` emails a one-time link that returns to
 * `/auth/callback` for the PKCE code exchange. We pass `data.magic_link` so a
 * brand-new user's profile is provisioned with `auth_provider = 'magic_link'`
 * by the `handle_new_auth_user` trigger (P0-13); the key is ignored for
 * existing users, whose provider was fixed at first signup.
 *
 * The link round-trips through email, so it always lands on the default app
 * route — there is no in-session `next` to preserve here.
 */
export function MagicLinkForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const supabase = createBrowserSupabaseClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { magic_link: true },
      },
    });

    if (otpError) {
      setError(otpError.message);
      setPending(false);
      return;
    }
    setSent(true);
    setPending(false);
  }

  if (sent) {
    return (
      <p
        role="status"
        className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
      >
        Check <span className="font-medium text-foreground">{email}</span> for a
        sign-in link. It may take a minute to arrive.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="magic-link-email">Email</Label>
        <Input
          id="magic-link-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          placeholder="you@example.com"
          onChange={(event) => setEmail(event.target.value)}
          disabled={pending}
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Sending link…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
