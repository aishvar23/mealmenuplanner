"use client";

/**
 * Browser-side fetch helpers for the minimal member-onboarding page (MP-B-021).
 * Same-origin `fetch` (auth rides the cookies), typed against the shared
 * `ProviderApiClient` so a contract change is a compile error here.
 */

import { readApiErrorMessage } from "@/packages/shared/provider";
import type {
  CompleteMemberOnboardingRequest,
  MyProviderMembershipDto,
} from "@/packages/shared/provider";

/** `POST /api/providers/{id}/complete-member-onboarding`. */
export async function completeMemberOnboarding(
  providerId: string,
  input: CompleteMemberOnboardingRequest,
): Promise<MyProviderMembershipDto> {
  const res = await fetch(
    `/api/providers/${providerId}/complete-member-onboarding`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!res.ok) {
    throw new Error(
      await readApiErrorMessage(res, "Couldn't save your details."),
    );
  }
  return res.json();
}
