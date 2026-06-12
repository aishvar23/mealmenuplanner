import {
  blankToNull,
  detectTimezone,
  type ProviderUpdateInput,
} from "@mmp/shared/provider";
import { useState } from "react";

import { providerClient } from "./client";
import { useWorkspaceSwitch } from "./use-workspace-switch";

/**
 * Provider owner onboarding controller (MP-C-020, the mobile twin of the web
 * `ProviderOnboardingWizard`). Drives the same `/api/*` routes through the shared
 * `providerClient` seam: create the draft org, PATCH identity + service defaults,
 * complete (draft → active), then enter the owner shell via the shared
 * `useWorkspaceSwitch` (which records the active-workspace pointer first).
 *
 * Two steps mirror web — identity (name + timezone required) then service
 * defaults — with the same required-field gating (`canAdvance`). Resume is
 * server-side: `create_provider_draft` returns an existing open draft instead of a
 * duplicate, so a re-entered wizard never spawns a second org.
 *
 * Pure UI state + the three network calls, so it unit-tests against the mocked
 * client without a renderer.
 */

/** A pragmatic, mobile-friendly shortlist of zones; the detected zone is added. */
export const COMMON_TIMEZONES = [
  "UTC",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
] as const;

/** The timezone options to offer: the detected zone first, then the shortlist. */
export function timezoneOptions(): string[] {
  const detected = detectTimezone();
  return [detected, ...COMMON_TIMEZONES.filter((tz) => tz !== detected)];
}

export interface OnboardingForm {
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

function blankForm(): OnboardingForm {
  return {
    name: "",
    timezone: detectTimezone(),
    email: "",
    phone: "",
    city: "",
    state: "",
    country: "",
    defaultCutoffLocalTime: "",
    summaryEmailRecipients: "",
  };
}

export interface ProviderOnboardingController {
  form: OnboardingForm;
  step: 0 | 1;
  busy: boolean;
  error: string | null;
  canAdvance: boolean;
  setField: (key: keyof OnboardingForm, value: string) => void;
  goNext: () => Promise<void>;
  goBack: () => void;
  finish: () => Promise<void>;
}

export function useProviderOnboarding(): ProviderOnboardingController {
  const { switchTo } = useWorkspaceSwitch();
  const [form, setForm] = useState<OnboardingForm>(blankForm);
  const [step, setStep] = useState<0 | 1>(0);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAdvance =
    form.name.trim().length > 0 && form.timezone.trim().length > 0;

  function setField(key: keyof OnboardingForm, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function identityPatch(): ProviderUpdateInput {
    return {
      name: form.name.trim(),
      timezone: form.timezone,
      email: blankToNull(form.email),
      phone: blankToNull(form.phone),
      city: blankToNull(form.city),
      state: blankToNull(form.state),
      country: blankToNull(form.country),
    };
  }

  async function goNext() {
    if (!canAdvance || busy) return;
    setBusy(true);
    setError(null);
    try {
      let id = providerId;
      if (!id) {
        const created = await providerClient.createProvider({
          name: form.name.trim(),
        });
        id = created.providerId;
        setProviderId(id);
      }
      await providerClient.updateProvider(id, identityPatch());
      setStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function goBack() {
    setStep(0);
  }

  async function finish() {
    if (!canAdvance || busy || !providerId) return;
    setBusy(true);
    setError(null);
    try {
      const recipients = form.summaryEmailRecipients
        .split(",")
        .map((r) => r.trim())
        .filter((r) => r.length > 0);
      await providerClient.updateProvider(providerId, {
        defaultCutoffLocalTime: blankToNull(form.defaultCutoffLocalTime),
        summaryEmailRecipients: recipients,
      });
      await providerClient.completeProviderOnboarding(providerId);
      await switchTo({
        type: "provider_owner",
        id: providerId,
        route: `/(provider-owner)/${providerId}/dashboard`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
    // On success `switchTo` navigates away (router.replace), tearing this down.
  }

  return {
    form,
    step,
    busy,
    error,
    canAdvance,
    setField,
    goNext,
    goBack,
    finish,
  };
}
