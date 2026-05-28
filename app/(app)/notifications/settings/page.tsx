import { redirect } from "next/navigation";

import { NotificationSettingsForm } from "@/components/notifications/notification-settings-form";
import { resolveCurrentHousehold } from "@/lib/services/household";
import { getMyEmailPreferences } from "@/lib/services/notification-preferences";

export const metadata = { title: "Notification settings" };

// Resolves the session + household per request; never statically cached.
export const dynamic = "force-dynamic";

/**
 * Notification settings (P9). Lets the signed-in member pick which household
 * events email them — opt-in, all off by default. The in-app inbox is unaffected
 * (it always shows everything); this page only governs email. Preferences are
 * per-household, scoped to the caller by RLS.
 */
export default async function NotificationSettingsPage() {
  const current = await resolveCurrentHousehold();
  if (!current) redirect("/onboarding");

  const prefs = await getMyEmailPreferences(current.householdId);

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8">
      <header>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Notification settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose which updates in{" "}
          <strong className="text-foreground">{current.name}</strong> send you
          an email. Everything still appears in your in-app inbox — email is
          opt-in, and off by default.
        </p>
      </header>

      <div className="mt-6">
        <NotificationSettingsForm
          householdId={current.householdId}
          initial={prefs}
        />
      </div>
    </section>
  );
}
