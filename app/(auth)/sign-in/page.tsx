import { Store, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { DevSignInButton } from "@/components/auth/dev-sign-in-button";
import { EmailSignIn } from "@/components/auth/email-sign-in";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { isDevLoginEnabled } from "@/lib/auth/dev-login";

export const metadata = { title: "Sign in" };

/**
 * A single sign-in panel. Both panels share the SAME Supabase auth and controls
 * (Google + email/magic-link); they differ only in copy and the post-login
 * `next` destination (ADR-86 / ADO #86). Each renders as a labelled landmark so
 * the two panels are distinguishable to assistive tech and E2E.
 */
function SignInPanel({
  id,
  icon,
  title,
  subtitle,
  next,
  idPrefix,
  footer,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  next?: string;
  idPrefix: string;
  footer?: ReactNode;
}) {
  const headingId = `${id}-heading`;
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col rounded-lg border bg-card p-6 text-card-foreground shadow-xl shadow-foreground/5"
    >
      <div className="flex items-center gap-2 text-primary">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
          {icon}
        </span>
        <h2
          id={headingId}
          className="font-heading text-2xl font-bold tracking-tight text-foreground"
        >
          {title}
        </h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{subtitle}</p>

      <div className="mt-6">
        <GoogleSignInButton next={next} />
      </div>

      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <EmailSignIn next={next} idPrefix={idPrefix} />

      {footer}
    </section>
  );
}

/**
 * Two-panel sign-in (ADO #86). Households and meal providers enter side by side
 * on desktop and stacked on mobile. Auth is unified — both panels post to the
 * same Supabase auth and provider-vs-household is only known after login — so the
 * panels differ purely in their post-login `next`: a household lands on `/today`
 * (the form default), a provider on `/provider/dashboard`. A truly-new provider
 * uses the "Set up a provider workspace" link, which (being auth-gated) bounces
 * an anonymous visitor to `/sign-in?next=/provider-onboarding` and lands them on
 * onboarding after they sign in via either panel.
 *
 * Any inbound `?next=` (e.g. a deep link, or the provider-onboarding bounce
 * above) is honored by both panels; the provider panel otherwise defaults to the
 * provider dashboard. The shared error banner sits above both panels.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const devLogin = isDevLoginEnabled();

  // The provider panel defaults to the provider dashboard, but an explicit
  // inbound `next` (e.g. the provider-onboarding bounce) takes precedence.
  const providerNext = next ?? "/provider/dashboard";

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Sign in
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          One account for planning meals at home and running a meal service.
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <SignInPanel
          id="household-panel"
          icon={<Users className="size-5" />}
          title="For households"
          subtitle="Plan meals with your household and answer “what should we eat today?”"
          next={next}
          idPrefix="household"
          footer={
            devLogin ? (
              <>
                <div className="my-6 flex items-center gap-3">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">
                    dev only
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <DevSignInButton next={next} />
              </>
            ) : null
          }
        />

        <SignInPanel
          id="provider-panel"
          icon={<Store className="size-5" />}
          title="For meal providers"
          subtitle="Run your meal service: publish menus, collect responses, and plan prep."
          next={providerNext}
          idPrefix="provider"
          footer={
            <p className="mt-6 text-sm text-muted-foreground">
              New here?{" "}
              <Link
                href="/provider-onboarding"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Set up a provider workspace
              </Link>
            </p>
          }
        />
      </div>
    </div>
  );
}
