import Link from "next/link";
import type { ReactNode } from "react";

import { AdminNav } from "@/components/admin-nav";

/**
 * Operator console shell (dish/ingredient content tooling, Phase 3).
 *
 * Visual shell only — admin role gating is added in P3-1 (the `app_role=admin`
 * JWT claim drives both the console and the content-table RLS, design/03 § 5).
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
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
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
