import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";

export const metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <div className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
      <h1 className="font-heading text-xl font-semibold tracking-tight">
        Sign in
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Continue to Home Meal Planner to plan meals with your household.
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
        <GoogleSignInButton next={next} />
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Email/password and magic-link sign-in arrive next (P1-2).
      </p>
    </div>
  );
}
