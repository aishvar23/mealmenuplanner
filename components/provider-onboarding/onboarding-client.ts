"use client";

/**
 * Browser-side fetch helpers for the provider onboarding endpoints (MP-A-101 /
 * MP-B-020). Thin wrappers over `fetch` so the wizard shares one place that knows
 * the URLs and the request/response shapes. The session travels in the HTTP-only
 * auth cookies the proxy refreshes — plain same-origin requests, no auth header.
 *
 * The three mutation helpers are typed against the shared `ProviderApiClient`
 * contract (the same interface the mobile client implements), so a contract change
 * to a request/response shape is a compile error here too — the web onboarding
 * flow can't silently drift from the frozen `/api/*` contract.
 */

import { readApiErrorMessage } from "@/packages/shared/provider";
import type { ProviderApiClient } from "@/packages/shared/provider";

/** `POST /api/providers` — create (or resume) the caller's draft provider org. */
export const createProvider: ProviderApiClient["createProvider"] = async (
  input,
) => {
  const res = await fetch("/api/providers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(
      await readApiErrorMessage(res, "Couldn't create the provider."),
    );
  }
  return res.json();
};

/** `PATCH /api/providers/{id}` — partial settings update. */
export const updateProvider: ProviderApiClient["updateProvider"] = async (
  providerId,
  patch,
) => {
  const res = await fetch(`/api/providers/${providerId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new Error(
      await readApiErrorMessage(res, "Couldn't save your changes."),
    );
  }
  return res.json();
};

/** `POST /api/providers/{id}/complete-onboarding` — finish setup (draft → active). */
export const completeProviderOnboarding: ProviderApiClient["completeProviderOnboarding"] =
  async (providerId) => {
    const res = await fetch(
      `/api/providers/${providerId}/complete-onboarding`,
      { method: "POST" },
    );
    if (!res.ok) {
      throw new Error(await readApiErrorMessage(res, "Couldn't finish setup."));
    }
    return res.json();
  };

/** Record the active-workspace pointer so the next resolution lands here. */
export async function setActiveProviderWorkspace(
  providerId: string,
): Promise<void> {
  try {
    await fetch("/api/workspace/active", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "provider_owner", id: providerId }),
    });
  } catch {
    // The destination re-verifies access server-side; navigate regardless.
  }
}
