"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProviderDto } from "@/packages/shared/provider";

import {
  completeOnboarding,
  createProvider,
  setActiveProviderWorkspace,
  updateProvider,
} from "./onboarding-client";

/**
 * Provider owner onboarding wizard (MP-B-020, UC-PROVIDER-001/002). A two-step,
 * resumable setup that mints the caller's provider workspace:
 *   • Step 1 (Identity) — name + timezone (required) and optional contact. On
 *     "Continue" it creates the draft (`POST /api/providers`) if one doesn't
 *     exist yet, then PATCHes the identity fields, so progress is persisted
 *     server-side (the draft org IS the resumable store, ADR-6).
 *   • Step 2 (Service defaults) — optional default cutoff + summary recipients.
 *     "Finish setup" PATCHes them, completes onboarding (draft → active), records
 *     the active-workspace pointer, and lands on the owner dashboard.
 *
 * Required-field gating: "Continue"/"Finish" stay disabled until name + timezone
 * are present (the server re-validates as the authoritative backstop).
 */

/** The full IANA zone list from the runtime, with a small fallback. */
function useTimezones(): string[] {
  return useMemo(() => {
    const intl = Intl as typeof Intl & {
      supportedValuesOf?: (key: string) => string[];
    };
    if (typeof intl.supportedValuesOf === "function") {
      try {
        return intl.supportedValuesOf("timeZone");
      } catch {
        // fall through to the static list
      }
    }
    return [
      "UTC",
      "Asia/Kolkata",
      "America/New_York",
      "America/Los_Angeles",
      "Europe/London",
      "Australia/Sydney",
    ];
  }, []);
}

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

interface FormState {
  name: string;
  timezone: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  country: string;
  defaultCutoffLocalTime: string;
  summaryEmailRecipients: string;
}

function initialForm(provider: ProviderDto | null): FormState {
  return {
    name: provider?.name ?? "",
    // Resume a draft's stored zone; for a fresh provider seed the detected one
    // (the draft's placeholder default is "UTC" until the owner chooses).
    timezone: provider?.timezone ?? detectTimezone(),
    email: provider?.email ?? "",
    phone: provider?.phone ?? "",
    city: provider?.city ?? "",
    state: provider?.state ?? "",
    country: provider?.country ?? "",
    defaultCutoffLocalTime: provider?.defaultCutoffLocalTime ?? "",
    summaryEmailRecipients: (provider?.summaryEmailRecipients ?? []).join(", "),
  };
}

/** Map blank → null for an optional text field. */
function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function ProviderOnboardingWizard({
  initialProvider,
}: {
  initialProvider: ProviderDto | null;
}) {
  const timezones = useTimezones();
  const [form, setForm] = useState<FormState>(() =>
    initialForm(initialProvider),
  );
  const [step, setStep] = useState(0);
  const [providerId, setProviderId] = useState<string | null>(
    initialProvider?.providerId ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiredOk = form.name.trim().length > 0 && form.timezone.length > 0;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function identityPatch() {
    return {
      timezone: form.timezone,
      email: orNull(form.email),
      phone: orNull(form.phone),
      city: orNull(form.city),
      state: orNull(form.state),
      country: orNull(form.country),
    };
  }

  async function onContinue() {
    if (!requiredOk || busy) return;
    setBusy(true);
    setError(null);
    try {
      let id = providerId;
      if (!id) {
        const created = await createProvider(form.name.trim());
        id = created.providerId;
        setProviderId(id);
      }
      await updateProvider(id, { name: form.name.trim(), ...identityPatch() });
      setStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function onFinish() {
    if (!requiredOk || busy || !providerId) return;
    setBusy(true);
    setError(null);
    try {
      const recipients = form.summaryEmailRecipients
        .split(",")
        .map((r) => r.trim())
        .filter((r) => r.length > 0);
      await updateProvider(providerId, {
        defaultCutoffLocalTime: orNull(form.defaultCutoffLocalTime),
        summaryEmailRecipients: recipients,
      });
      await completeOnboarding(providerId);
      await setActiveProviderWorkspace(providerId);
      window.location.assign("/provider/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
    // On success we navigate away, so no need to clear `busy`.
  }

  return (
    <div className="w-full max-w-xl">
      <ol className="mb-6 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <li aria-current={step === 0 ? "step" : undefined}>
          <span className={step === 0 ? "text-primary" : ""}>1. Identity</span>
        </li>
        <li aria-hidden>→</li>
        <li aria-current={step === 1 ? "step" : undefined}>
          <span className={step === 1 ? "text-primary" : ""}>
            2. Service defaults
          </span>
        </li>
      </ol>

      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      {step === 0 ? (
        <div className="space-y-4">
          <Field label="Provider name" htmlFor="name" required>
            <Input
              id="name"
              name="name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Anna's Kitchen"
              autoFocus
            />
          </Field>

          <Field label="Timezone" htmlFor="timezone" required>
            <select
              id="timezone"
              name="timezone"
              value={form.timezone}
              onChange={(e) => set("timezone", e.target.value)}
              className="flex h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
            >
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                name="email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="hello@annaskitchen.com"
              />
            </Field>
            <Field label="Phone" htmlFor="phone">
              <Input
                id="phone"
                name="phone"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </Field>
            <Field label="City" htmlFor="city">
              <Input
                id="city"
                name="city"
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
              />
            </Field>
            <Field label="State" htmlFor="state">
              <Input
                id="state"
                name="state"
                value={form.state}
                onChange={(e) => set("state", e.target.value)}
              />
            </Field>
            <Field label="Country" htmlFor="country">
              <Input
                id="country"
                name="country"
                value={form.country}
                onChange={(e) => set("country", e.target.value)}
              />
            </Field>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              onClick={onContinue}
              disabled={!requiredOk || busy}
            >
              {busy ? "Saving…" : "Continue"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Default order cutoff (local time)" htmlFor="cutoff">
            <Input
              id="cutoff"
              name="defaultCutoffLocalTime"
              type="time"
              value={form.defaultCutoffLocalTime}
              onChange={(e) => set("defaultCutoffLocalTime", e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              The daily deadline for customers to respond. You can change this
              per menu later.
            </p>
          </Field>

          <Field label="Preparation summary recipients" htmlFor="recipients">
            <Input
              id="recipients"
              name="summaryEmailRecipients"
              value={form.summaryEmailRecipients}
              onChange={(e) => set("summaryEmailRecipients", e.target.value)}
              placeholder="kitchen@annaskitchen.com, prep@annaskitchen.com"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Comma-separated emails that receive the daily preparation summary.
              Optional.
            </p>
          </Field>

          <div className="flex justify-between pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(0)}
              disabled={busy}
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={onFinish}
              disabled={!requiredOk || busy}
            >
              {busy ? "Finishing…" : "Finish setup"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </Label>
      {children}
    </div>
  );
}
