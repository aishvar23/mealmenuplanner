/**
 * A one-slot store for an invite token a signed-out visitor tried to accept
 * (M2-4). When the invite screen sends them to sign in, it parks the token here;
 * once a session lands, the `(auth)` layout redirects back to `/invite/{token}`
 * instead of dropping them on Today. Module-level (not persisted) — it only needs
 * to survive the in-process sign-in round-trip.
 */

let pendingInviteToken: string | null = null;

/** Remember the invite token to return to after authentication. */
export function setPendingInvite(token: string | null): void {
  pendingInviteToken = token;
}

/** The parked invite token, or null. Read-only — does not clear it. */
export function peekPendingInvite(): string | null {
  return pendingInviteToken;
}

/** Forget the parked invite token once we've returned to it. */
export function clearPendingInvite(): void {
  pendingInviteToken = null;
}
