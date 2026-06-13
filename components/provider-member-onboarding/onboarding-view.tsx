"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PROVIDER_SPICE_OPTIONS } from "@/packages/shared/provider";
import type {
  MyProviderMembershipDto,
  ProviderSpiceLevel,
} from "@/packages/shared/provider";

import { completeMemberOnboarding } from "./onboarding-client";

/**
 * Minimal member onboarding (MP-B-021, spec §14.1 / UC-MEMBER-ONBOARD-001). Asks
 * ONLY for provider-interaction data — name, phone, default spice, allergy + terms
 * acknowledgments, and (when subscription-eligible) auto-accept consent. It shows
 * NO household field (size, cuisine, variety, grocery, cooking time, dishes).
 * On submit it routes to Today's Menu.
 */

export function MemberOnboardingView({
  providerId,
  providerName,
  membership,
}: {
  providerId: string;
  providerName: string;
  membership: MyProviderMembershipDto;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(membership.displayName ?? "");
  const [phone, setPhone] = useState(membership.phone ?? "");
  const [spice, setSpice] = useState<ProviderSpiceLevel | "">(
    membership.defaultSpiceLevel ?? "",
  );
  const [allergyAck, setAllergyAck] = useState(false);
  const [termsAck, setTermsAck] = useState(false);
  const [autoAccept, setAutoAccept] = useState(membership.autoAcceptConsented);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    displayName.trim().length > 0 && allergyAck && termsAck && !busy;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await completeMemberOnboarding(providerId, {
        displayName: displayName.trim(),
        phone: phone.trim() || null,
        defaultSpiceLevel: spice === "" ? null : spice,
        allergyAck,
        termsAck,
        autoAcceptConsent: membership.autoAcceptEligible ? autoAccept : false,
      });
      router.replace(`/providers/${providerId}/today`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10 lg:px-8">
      <header className="mb-6">
        <p className="text-xs font-semibold tracking-widest text-emerald-700 uppercase">
          Welcome
        </p>
        <h1 className="mt-1 text-2xl font-semibold">
          A few details for {providerName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Just what we need to prepare your meals — nothing about your
          household.
        </p>
      </header>

      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="member-name">
            Your name<span className="text-destructive">*</span>
          </Label>
          <Input
            id="member-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Chitra"
            autoComplete="name"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="member-phone">Phone</Label>
          <Input
            id="member-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 555 555 0100"
            autoComplete="tel"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="member-spice">Default spice level</Label>
          <select
            id="member-spice"
            value={spice}
            onChange={(e) =>
              setSpice(e.target.value as ProviderSpiceLevel | "")
            }
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">No preference</option>
            {PROVIDER_SPICE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={allergyAck}
            onChange={(e) => setAllergyAck(e.target.checked)}
            className="mt-1 size-4"
          />
          <span>
            I understand allergy information is a <strong>warning only</strong>{" "}
            — the provider can&apos;t guarantee allergen-free preparation.
          </span>
        </label>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={termsAck}
            onChange={(e) => setTermsAck(e.target.checked)}
            className="mt-1 size-4"
          />
          <span>I agree to the provider&apos;s ordering terms.</span>
        </label>

        {membership.autoAcceptEligible ? (
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={autoAccept}
              onChange={(e) => setAutoAccept(e.target.checked)}
              className="mt-1 size-4"
            />
            <span>
              Auto-accept the default meal at cutoff when I haven&apos;t
              responded (you can change this anytime).
            </span>
          </label>
        ) : null}

        <Button type="submit" disabled={!canSubmit}>
          {busy ? "Saving…" : "Continue to today's menu"}
        </Button>
      </form>
    </div>
  );
}
