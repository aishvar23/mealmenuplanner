/**
 * Minimal HTML escaping for the email adapter (design/09 § 6 — "HTML-escaping for
 * the email adapter only"). The in-app client renders plain text and needs no
 * escaping. Pure + client-safe.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
