"use client";

import { useState } from "react";

import { EmailPasswordForm } from "@/components/auth/email-password-form";
import { MagicLinkForm } from "@/components/auth/magic-link-form";

type Method = "password" | "magic-link";

/**
 * Email sign-in surface: switches between the password form (sign-in /
 * create-account) and the passwordless magic-link form. Kept as one small
 * client component so the sign-in page stays a server component and only this
 * island ships interactivity.
 *
 * `idPrefix` is forwarded to the inner forms so the two-panel sign-in (ADR-86)
 * can mount this island twice on one page without duplicate field ids.
 */
export function EmailSignIn({
  next,
  idPrefix,
}: {
  next?: string;
  idPrefix?: string;
}) {
  const [method, setMethod] = useState<Method>("password");

  return (
    <div className="space-y-3">
      {method === "password" ? (
        <EmailPasswordForm next={next} idPrefix={idPrefix} />
      ) : (
        <MagicLinkForm idPrefix={idPrefix} />
      )}

      <button
        type="button"
        onClick={() =>
          setMethod(method === "password" ? "magic-link" : "password")
        }
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        {method === "password"
          ? "Email me a magic link instead"
          : "Use email and password instead"}
      </button>
    </div>
  );
}
