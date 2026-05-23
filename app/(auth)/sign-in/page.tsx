export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <div className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
      <h1 className="font-heading text-xl font-semibold tracking-tight">
        Sign in
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Google, email/password, and magic-link sign-in are wired up in Phase 1.
      </p>
      <div className="mt-6 space-y-2" aria-hidden>
        <div className="h-9 rounded-md border border-dashed" />
        <div className="h-9 rounded-md border border-dashed" />
      </div>
    </div>
  );
}
