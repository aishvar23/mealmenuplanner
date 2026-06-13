// Provider Workspace — shared browser-side fetch helpers (contract 03 § 8).
//
// The single place that reads the uniform `{ error: { message } }` envelope off a
// failed `fetch` Response, so the web provider clients (members, onboarding,
// invite-accept) don't each hand-roll the same parse and drift. Pure — depends
// only on a minimal `{ json(): Promise<unknown> }` shape (not the DOM `Response`
// type), so it stays portable across the web bundle.

/** The minimal slice of `fetch`'s Response this helper needs. */
interface JsonResponse {
  json(): Promise<unknown>;
}

/**
 * Read the human-readable message from a failed API response's `{ error }`
 * envelope, falling back to `fallback` when the body is absent or unparseable.
 */
export async function readApiErrorMessage(
  res: JsonResponse,
  fallback: string,
): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}
