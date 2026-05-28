import {
  CalendarCheck,
  ChefHat,
  ClipboardList,
  ShoppingCart,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DemoVideo } from "@/components/demo-video";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { getAuthUser } from "@/lib/auth";
import { resolveCurrentHousehold } from "@/lib/services/household";

// Reads the session to decide whether to route a signed-in visitor onward.
export const dynamic = "force-dynamic";

export default async function LandingPage() {
  // The marketing page is for signed-out visitors only. A signed-in user is
  // sent straight to Today once onboarding is done, or into onboarding until
  // they finish it — so their "landing page" is always today's decisions.
  const user = await getAuthUser();
  if (user) {
    const current = await resolveCurrentHousehold();
    redirect(current ? "/today" : "/onboarding");
  }

  return (
    <main className="flex-1 bg-background">
      <section className="relative isolate flex min-h-[86dvh] items-end overflow-hidden">
        <Image
          src="/images/meal-hero.png"
          alt=""
          fill
          loading="eager"
          fetchPriority="high"
          sizes="100vw"
          className="absolute inset-0 -z-20 object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,oklch(0.12_0.035_145/0.74),oklch(0.12_0.035_145/0.44)_42%,oklch(0.12_0.035_145/0.1)_74%),linear-gradient(0deg,oklch(0.12_0.035_145/0.65),transparent_48%)]" />

        <div className="mx-auto grid w-full max-w-6xl items-end gap-10 px-5 pt-8 pb-12 md:grid-cols-[1fr_25rem] lg:pb-16">
          <div className="max-w-2xl text-white">
            <Link
              href="/today"
              className="mb-8 inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white shadow-sm backdrop-blur transition-colors hover:bg-white/20"
            >
              <ChefHat className="size-4" />
              Home Meal Planner
            </Link>
            <h1 className="font-heading text-5xl leading-[0.96] font-bold tracking-tight text-balance sm:text-6xl lg:text-7xl">
              What should we eat today?
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-white/80">
              Approve today&apos;s meals, generate a practical week, and shop a
              grocery list built from the way your household actually eats.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/sign-in"
                className={buttonVariants({
                  size: "lg",
                  className: "shadow-lg shadow-black/15",
                })}
              >
                Plan my meals
              </Link>
              <Link
                href="/today"
                className={buttonVariants({
                  variant: "outline",
                  size: "lg",
                  className:
                    "border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white",
                })}
              >
                Open today
              </Link>
            </div>
          </div>

          {/* A looping product demo: household setup through to today's
              recommended meal, recorded from the real app (scripts/record-demo.mjs). */}
          <div className="hidden self-center justify-self-center md:block">
            <div className="relative w-[260px] rounded-[2rem] border border-white/15 bg-neutral-900/95 p-2 shadow-2xl ring-1 shadow-black/40 ring-white/10">
              <DemoVideo className="block aspect-[43/92] w-full rounded-[1.5rem] bg-background object-cover" />
            </div>
            <p className="mt-4 text-center text-sm font-medium text-white/85">
              Set up once, then decide dinner in seconds
            </p>
          </div>
        </div>
      </section>

      <Stagger className="mx-auto grid w-full max-w-6xl gap-4 px-5 py-8 md:grid-cols-3">
        {[
          {
            icon: CalendarCheck,
            title: "Decide today fast",
            text: "One primary recommendation, clear reasoning, fewer competing buttons.",
          },
          {
            icon: ClipboardList,
            title: "Shape the whole week",
            text: "A scan-friendly board makes empty slots, locks, and swaps obvious.",
          },
          {
            icon: ShoppingCart,
            title: "Shop without decoding",
            text: "Groceries are grouped, checkable, and optimized for phone-in-hand use.",
          },
        ].map(({ icon: Icon, title, text }) => (
          <StaggerItem key={title}>
            <Card interactive className="h-full p-6">
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
              <h2 className="mt-4 font-heading text-lg font-bold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {text}
              </p>
            </Card>
          </StaggerItem>
        ))}
      </Stagger>
    </main>
  );
}
