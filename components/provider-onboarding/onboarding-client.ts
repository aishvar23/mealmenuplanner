"use client";

/**
 * Browser-side fetch helpers for the provider onboarding endpoints (MP-A-101 /
 * MP-B-020). Thin wrappers over `fetch` so the wizard shares one place that knows
 * the URLs and the request/response shapes. The session travels in the HTTP-only
 * auth cookies the proxy refreshes — plain same-origin requests, no auth header.
 */

import type {
  ProviderDto,
  ProviderUpdateInput,
} from "@/packages/shared/provider";

/** Pull the human-readable message out of the uniform `{ error }` envelope. */
async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

/** `POST /api/providers` — create (or resume) the caller's draft provider org. */
export async function createProvider(name: string): Promise<ProviderDto> {
  const res = await fetch("/api/providers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Couldn't create the provider."));
  }
  return (await res.json()) as ProviderDto;
}

/** `PATCH /api/providers/{id}` — partial settings update. */
export async function updateProvider(
  providerId: string,
  patch: ProviderUpdateInput,
): Promise<ProviderDto> {
  const res = await fetch(`/api/providers/${providerId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Couldn't save your changes."));
  }
  return (await res.json()) as ProviderDto;
}

/** `POST /api/providers/{id}/complete-onboarding` — finish setup (draft → active). */
export async function completeOnboarding(
  providerId: string,
): Promise<ProviderDto> {
  const res = await fetch(`/api/providers/${providerId}/complete-onboarding`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Couldn't finish setup."));
  }
  return (await res.json()) as ProviderDto;
}

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
