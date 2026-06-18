import { ChefHat } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/** Minimal centered layout for the auth screens. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative isolate flex min-h-full flex-1 items-center justify-center overflow-hidden bg-canvas px-4 py-12">
      <Image
        src="/images/meal-hero.png"
        alt=""
        fill
        loading="eager"
        fetchPriority="high"
        sizes="100vw"
        className="absolute inset-0 -z-20 object-cover opacity-30"
      />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,oklch(0.985_0.012_92/0.98),oklch(0.985_0.012_92/0.86))]" />
      <div className="w-full max-w-md lg:max-w-4xl">
        <Link
          href="/"
          className="mb-8 flex items-center justify-center gap-2 font-heading text-lg font-bold tracking-tight"
        >
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <ChefHat className="size-5" />
          </span>
          Home Meal Planner
        </Link>
        {children}
      </div>
    </main>
  );
}
