import { Store } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The authenticated provider shell chrome (MP-B-011 / MP-B-012) — the provider-
 * side analogue of the `(app)` household shell. Presentational: it lays out the
 * sticky mobile header, the desktop sidebar (brand + nav + footer), the desktop
 * header (account menu), and a bottom mobile nav bar. The owner and member
 * layouts share it and differ only in the nav, brand href, and footer they pass
 * in — so the two provider surfaces stay visually identical.
 *
 * `accountMenu` is supplied by the layout (it carries the per-user switcher
 * options), keeping this component free of data concerns.
 */
export function ProviderShell({
  brandName,
  brandHref,
  sidebarNav,
  mobileNav,
  accountMenu,
  footerEyebrow,
  footerLabel,
  children,
}: {
  brandName: string;
  brandHref: string;
  /** Primary nav; omitted for the awaiting-approval shell, which shows no menu. */
  sidebarNav?: ReactNode;
  mobileNav?: ReactNode;
  accountMenu: ReactNode;
  footerEyebrow: string;
  footerLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-full flex-1 bg-canvas text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden">
        <div className="flex h-16 items-center gap-3 px-4">
          <Link
            href={brandHref}
            className="flex min-w-0 items-center gap-2 font-heading font-bold tracking-tight"
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Store className="size-5" />
            </span>
            <span className="truncate">{brandName}</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">{accountMenu}</div>
        </div>
      </header>

      <div className="mx-auto flex min-h-dvh w-full max-w-[1500px]">
        <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 text-sidebar-foreground lg:flex">
          <Link href={brandHref} className="flex items-center gap-3 px-2">
            <span className="flex size-11 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
              <Store className="size-6" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-heading text-lg font-bold tracking-tight">
                {brandName}
              </span>
              <span className="block truncate text-xs font-medium text-sidebar-foreground/50">
                Meal provider
              </span>
            </span>
          </Link>
          {sidebarNav ? <div className="mt-8">{sidebarNav}</div> : null}
          <div className="mt-auto rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3">
            <p className="text-xs font-semibold tracking-[0.16em] text-sidebar-foreground/50 uppercase">
              {footerEyebrow}
            </p>
            <p className="mt-1 truncate text-sm font-semibold">{footerLabel}</p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="hidden h-16 items-center justify-end gap-2 px-6 lg:flex">
            {accountMenu}
          </header>
          <main className="flex-1 pb-24 lg:pb-0">{children}</main>
        </div>
      </div>

      {mobileNav ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/94 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-12px_28px_oklch(0_0_0/0.08)] backdrop-blur lg:hidden">
          {mobileNav}
        </div>
      ) : null}
    </div>
  );
}
