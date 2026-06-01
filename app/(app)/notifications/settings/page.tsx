import { redirect } from "next/navigation";

import { NotificationHouseholdPicker } from "@/components/notifications/notification-household-picker";
import { NotificationSettingsForm } from "@/components/notifications/notification-settings-form";
import {
  listUserHouseholds,
  resolveCurrentHousehold,
} from "@/lib/services/household";
import { getMyEmailPreferences } from "@/lib/services/notification-preferences";

export const metadata = { title: "Notification settings" };

// Resolves the session + household per request; never statically cached.
export const dynamic = "force-dynamic";

/**
 * Notification settings (P9). Lets the signed-in member pick which household
 * events email them — opt-in, all off by default. The in-app inbox is unaffected
 * (it always shows everything); this page only governs email. Preferences are
 * per-household; a multi-household user picks which household to configure via
 * `?householdId=` (BETA), defaulting to the one they're currently viewing.
 */
export default async function NotificationSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ householdId?: string }>;
}) {
  const [{ householdId: requested }, households, current] = await Promise.all([
    searchParams,
    listUserHouseholds(),
    resolveCurrentHousehold(),
  ]);
  if (!current) redirect("/onboarding");

  // Honour `?householdId=` only for a household the caller belongs to; otherwise
  // fall back to the household they're currently viewing.
  const selectedId =
    requested && households.some((h) => h.householdId === requested)
      ? requested
      : current.householdId;
  const selectedName =
    households.find((h) => h.householdId === selectedId)?.name ?? current.name;

  const prefs = await getMyEmailPreferences(selectedId);

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Notification settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose which updates in{" "}
            <strong className="text-foreground">{selectedName}</strong> send you
            an email. Everything still appears in your in-app inbox — email is
            opt-in, and off by default.
          </p>
        </div>
        {households.length > 1 ? (
          <NotificationHouseholdPicker
            households={households}
            selected={selectedId}
            includeAll={false}
          />
        ) : null}
      </header>

      <div className="mt-6">
        <NotificationSettingsForm
          key={selectedId}
          householdId={selectedId}
          initial={prefs}
        />
      </div>
    </section>
  );
}
