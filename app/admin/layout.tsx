import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AdminNav } from "@/components/admin-nav";
import { getAuthUser, isAdminUser } from "@/lib/auth";

/**
 * Operator console shell (dish/ingredient content tooling, Phase 3).
 *
 * Gated at two layers (design/03 § 1, § 5, P3-1): the edge proxy (`proxy.ts`)
 * redirects unauthenticated visitors to /sign-in and signed-in non-operators to
 * the app before the request reaches here; this server component re-resolves
 * the verified user and re-checks the admin `app_role` as a defense-in-depth
 * backstop. Nothing in the console trusts the cookie without `getAuthUser()`,
 * and the content-write services run behind `requireAdmin()` regardless.
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getAuthUser();
  if (!user) {
    redirect("/sign-in");
  }
  if (!isAdminUser(user)) {
    redirect("/today");
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b bg-background">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="font-heading font-semibold tracking-tight">
              Operator Console
            </span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
              Admin
            </span>
          </Link>
          <div className="ml-2">
            <AdminNav />
          </div>
          <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/today" className="hover:text-foreground">
              Back to app
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
