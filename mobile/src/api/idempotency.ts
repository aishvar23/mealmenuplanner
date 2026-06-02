/**
 * Idempotency-Key generation for the generation endpoints (design/04 § 3,
 * design/10 § 4). The client sends a UUID v4 per logical operation and **reuses
 * the same key on retry**, so a flaky-connection retry replays the stored
 * response instead of creating a duplicate plan/list.
 *
 * Uses the platform CSPRNG (`crypto.getRandomValues`, present in Hermes /
 * react-native-get-random-values) when available, falling back to `Math.random`
 * — uniqueness, not cryptographic strength, is what matters for an idempotency
 * key.
 */
export function newIdempotencyKey(): string {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  if (typeof cryptoObj?.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }
  return uuidV4Fallback();
}

function uuidV4Fallback(): string {
  const getRandom = (
    globalThis as {
      crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array };
    }
  ).crypto?.getRandomValues;

  const bytes = new Uint8Array(16);
  if (getRandom) {
    getRandom(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  // Per RFC 4122 §4.4: set version (4) and variant (10xx) bits.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex: string[] = [];
  for (let i = 0; i < 256; i += 1) {
    hex.push((i + 0x100).toString(16).slice(1));
  }
  const b = bytes;
  return (
    hex[b[0]!] +
    hex[b[1]!] +
    hex[b[2]!] +
    hex[b[3]!] +
    "-" +
    hex[b[4]!] +
    hex[b[5]!] +
    "-" +
    hex[b[6]!] +
    hex[b[7]!] +
    "-" +
    hex[b[8]!] +
    hex[b[9]!] +
    "-" +
    hex[b[10]!] +
    hex[b[11]!] +
    hex[b[12]!] +
    hex[b[13]!] +
    hex[b[14]!] +
    hex[b[15]!]
  );
}
