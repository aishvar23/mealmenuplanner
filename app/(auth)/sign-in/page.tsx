import { DevSignInButton } from "@/components/auth/dev-sign-in-button";
import { EmailSignIn } from "@/components/auth/email-sign-in";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { isDevLoginEnabled } from "@/lib/auth/dev-login";

export const metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const devLogin = isDevLoginEnabled();

  return (
    <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-xl shadow-foreground/5">
      <h1 className="font-heading text-3xl font-bold tracking-tight">
        Sign in
      </h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Continue to Home Meal Planner to plan meals with your household.
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-6">
        <GoogleSignInButton next={next} />
      </div>

      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <EmailSignIn next={next} />

      {devLogin ? (
        <>
          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">dev only</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <DevSignInButton next={next} />
        </>
      ) : null}
    </div>
  );
}
