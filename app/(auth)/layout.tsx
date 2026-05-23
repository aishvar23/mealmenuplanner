import Link from "next/link";
import type { ReactNode } from "react";

/** Minimal centered layout for the auth screens (sign-in, callback handling). */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4 py-12">
      <Link
        href="/"
        className="mb-8 font-heading text-lg font-semibold tracking-tight"
      >
        Home Meal Planner
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
