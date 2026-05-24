/**
 * Opaque keyset cursor for the notification inbox (design/09 § 7). The inbox is
 * ordered `(created_at desc, id desc)`; the cursor encodes the last row's
 * `(createdAt, id)` so the next page is everything strictly "after" it. Encoding
 * keeps the wire token opaque; pure + client-safe for unit testing.
 */

export interface NotificationCursor {
  createdAt: string;
  id: string;
}

const SEP = "|";

export function encodeCursor(cursor: NotificationCursor): string {
  return Buffer.from(`${cursor.createdAt}${SEP}${cursor.id}`, "utf8").toString(
    "base64url",
  );
}

/** Decode a cursor token, or `null` if it is malformed (treated as no cursor). */
export function decodeCursor(token: string): NotificationCursor | null {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const sepIndex = raw.indexOf(SEP);
    if (sepIndex <= 0) return null;
    const createdAt = raw.slice(0, sepIndex);
    const id = raw.slice(sepIndex + SEP.length);
    if (!createdAt || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}
