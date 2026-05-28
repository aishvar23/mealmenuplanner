import { CalendarCheck, ChefHat, ShoppingCart } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { DemoVideo } from "@/components/demo-video";
import { InviteLanding } from "@/components/invite/invite-landing";
import { buttonVariants } from "@/components/ui/button";
import { memberRoleLabel, membershipTypeLabel } from "@/lib/household/labels";
import { getInvitePreview, type InvitePreviewDto } from "@/lib/services/invite";

export const metadata = { title: "You're invited" };

// Reads the invite preview per request (token-addressed); never cached.
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ token: string }> };

/**
 * Public invite landing page (P6-2/3). Renders outside the `(app)` nav shell —
 * the visitor may not be a member or even signed in. It fetches the safe,
 * unauthenticated preview (via the `get_invite_preview` RPC) and offers accept /
 * decline. Any non-redeemable token (unknown, expired, already used) renders a
 * single generic "invalid" state, matching the no-oracle policy (design/03 § 7).
 */
export default async function InvitePage({ params }: PageProps) {
  const { token } = await params;

  let preview: InvitePreviewDto;
  try {
    preview = await getInvitePreview(token);
  } catch {
    return <InvalidInvite />;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-6 px-4 py-10">
      <div className="rounded-xl border p-6 text-center">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          You&apos;re invited
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {preview.invitedBy ?? "Someone"} invited you to join{" "}
          <strong className="text-foreground">{preview.householdName}</strong>{" "}
          as a {memberRoleLabel(preview.role)} (
          {membershipTypeLabel(preview.membershipType)}).
        </p>
        <InviteLanding token={token} />
      </div>

      <AppIntro />
    </main>
  );
}

/**
 * A short "what you're joining" intro for a freshly-invited visitor who may have
 * never seen the app — the same hero image and looping product demo as the public
 * landing page, so accepting an invite isn't a leap of faith.
 */
function AppIntro() {
  return (
    <section className="overflow-hidden rounded-xl border bg-card text-card-foreground">
      <div className="relative aspect-[16/9] w-full">
        <Image
          src="/images/meal-hero.png"
          alt="A spread of home-cooked meals"
          fill
          sizes="(max-width: 672px) 100vw, 42rem"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
        <div className="absolute bottom-0 left-0 p-5 text-white">
          <span className="inline-flex items-center gap-2 text-sm font-semibold">
            <ChefHat className="size-4" />
            Home Meal Planner
          </span>
          <p className="mt-1 font-heading text-xl font-bold tracking-tight">
            What should we eat today?
          </p>
        </div>
      </div>

      <div className="p-6">
        <p className="text-sm leading-6 text-muted-foreground">
          Home Meal Planner helps your household decide what to eat — practical
          meal suggestions from the way you actually cook, a planned week, and a
          grocery list built from your plan. Joining lets you see today&apos;s
          meal, weigh in on suggestions, and stay in sync with everyone at home.
        </p>

        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          <IntroPoint
            icon={<CalendarCheck className="size-4" />}
            title="Decide today fast"
            text="One clear recommendation, with the reasoning."
          />
          <IntroPoint
            icon={<ChefHat className="size-4" />}
            title="Plan the week"
            text="A practical week shaped around your household."
          />
          <IntroPoint
            icon={<ShoppingCart className="size-4" />}
            title="Shop the list"
            text="Groceries grouped and checkable on your phone."
          />
        </ul>

        <div className="mt-6 flex flex-col items-center">
          <div className="relative w-[230px] rounded-[2rem] border border-border bg-neutral-900 p-2 shadow-xl">
            <DemoVideo className="block aspect-[43/92] w-full rounded-[1.5rem] bg-background object-cover" />
          </div>
          <p className="mt-3 text-center text-sm font-medium text-muted-foreground">
            Set up once, then decide dinner in seconds
          </p>
        </div>
      </div>
    </section>
  );
}

/** One labeled benefit in the invite intro. */
function IntroPoint({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <li className="rounded-lg border bg-background p-3">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </span>
      <p className="mt-2 text-sm font-semibold">{title}</p>
      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{text}</p>
    </li>
  );
}

function InvalidInvite() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-xl border p-6 text-center">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Invite not available
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This invite link is invalid or has expired. Ask whoever invited you to
          send a new one.
        </p>
        <Link href="/" className={buttonVariants({ className: "mt-6" })}>
          Go home
        </Link>
      </div>
    </main>
  );
}
