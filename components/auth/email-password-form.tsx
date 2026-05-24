"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolvePostAuthRedirect } from "@/lib/auth/route-access";
import { createBrowserSupabaseClient } from "@/lib/db/browser";

type Mode = "sign-in" | "sign-up";

/**
 * Email + password sign-in and account creation (design/03 § 1, `auth_provider`
 * = `email`). Runs entirely against the browser (anon) Supabase client, which
 * persists the session in cookies the server can read; on success we do a full
 * navigation so the proxy + server layouts resolve the new session
 * (design/03 § 1). Mirrors {@link GoogleSignInButton}'s client-only shape.
 *
 * `next` (a validated same-origin path from the sign-in screen) is honored only
 * for the synchronous paths — password sign-in and an immediately-active
 * sign-up. When the project requires email confirmation, the link lands on
 * `/auth/callback`, which redirects to the default app route.
 */
export function EmailPasswordForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSignIn = mode === "sign-in";

  function switchMode() {
    setMode(isSignIn ? "sign-up" : "sign-in");
    setError(null);
    setNotice(null);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);

    const supabase = createBrowserSupabaseClient();

    if (isSignIn) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(signInError.message);
        setPending(false);
        return;
      }
      window.location.assign(resolvePostAuthRedirect(next));
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (signUpError) {
      setError(signUpError.message);
      setPending(false);
      return;
    }
    // Email confirmation off → a session is returned immediately; on → no
    // session until the emailed link is clicked.
    if (data.session) {
      window.location.assign(resolvePostAuthRedirect(next));
      return;
    }
    setNotice(
      "Check your email to confirm your account, then sign in. The link may take a minute to arrive.",
    );
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
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

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={isSignIn ? "current-password" : "new-password"}
          required
          minLength={8}
          value={password}
          placeholder={isSignIn ? "Your password" : "At least 8 characters"}
          onChange={(event) => setPassword(event.target.value)}
          disabled={pending}
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {notice ? (
        <p
          role="status"
          className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
        >
          {notice}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending
          ? isSignIn
            ? "Signing in…"
            : "Creating account…"
          : isSignIn
            ? "Sign in"
            : "Create account"}
      </Button>

      <p className="text-sm text-muted-foreground">
        {isSignIn ? "New here? " : "Already have an account? "}
        <button
          type="button"
          onClick={switchMode}
          disabled={pending}
          className="font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50"
        >
          {isSignIn ? "Create an account" : "Sign in"}
        </button>
      </p>
    </form>
  );
}
