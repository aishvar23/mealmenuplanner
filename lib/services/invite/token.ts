import { createHash, randomBytes } from "node:crypto";

/**
 * Invite-token generation and hashing (design/03 § 7).
 *
 * An invite token is a **bearer secret**: whoever holds it can preview and redeem
 * the invite. So it is treated like a password — a high-entropy random value
 * shown to the inviter exactly once (in the invite link), and stored only as a
 * one-way hash. A database read (leak, backup, over-broad RLS) therefore never
 * yields a usable link.
 *
 * Both the plaintext generation (at create) and the hashing (at create + every
 * lookup/accept/decline) live here so the algorithm is defined once and the
 * `invite` service is the only thing that ever sees plaintext. Built on
 * `node:crypto`, so this is server-only by construction (it is never imported
 * into client code) yet still trivially unit-testable under the Node test runner.
 */

/** Random bytes of entropy in the token (256 bits ≫ the design's 128-bit floor). */
const TOKEN_BYTES = 32;

/**
 * Generate a fresh, opaque, URL-safe invite token (the plaintext). Returned to
 * the inviter once inside the invite link and never persisted in the clear.
 */
export function generateInviteToken(): string {
  // base64url is URL-safe (no +/=), so the token drops straight into the link.
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Hash a plaintext token for storage / lookup: `sha256(token)` as lowercase hex.
 * Deterministic, so the same plaintext always maps to the stored
 * `household_invites.invite_token` and can be matched via its unique index. A
 * pepper/HMAC is a possible hardening (design/03 § 7) but is out of MVP scope.
 */
export function hashInviteToken(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}
