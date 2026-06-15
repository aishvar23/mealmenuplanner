import { Share } from "react-native";

/**
 * Mobile export/share of a persisted batch revision (MP-C-051, the mobile twin of the
 * web `@media print` page — spec §17). The web surface prints; mobile parity is the
 * native share sheet. We share the already-rendered CSV (the same bytes the owner CSV
 * routes return, via `@mmp/shared/provider`'s renderers) as the message body, so the
 * roster can be sent to email/notes/files from the system sheet. Uses React Native's
 * built-in `Share` — no extra native module, so it runs in Expo Go and is unit-testable.
 *
 * Returns true when the user completed a share, false when they dismissed the sheet.
 * Rejects only on a real platform error (surfaced to the caller as an error banner).
 */
export async function shareProviderCsv(
  content: string,
  title: string,
): Promise<boolean> {
  const result = await Share.share(
    { message: content, title },
    { subject: title },
  );
  return result.action === Share.sharedAction;
}
