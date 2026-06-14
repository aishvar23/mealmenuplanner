import {
  PROVIDER_SALT_OPTIONS,
  PROVIDER_SPICE_OPTIONS,
  providerComponentGroupLabel,
} from "./labels";
import type { ProviderSaltLevel, ProviderSpiceLevel } from "./enums";
import type { ProviderSummaryEmailParams } from "./dtos";

/**
 * Provider preparation-summary email (MP-A-161, contract 03 § 13; UC-CUTOFF-003,
 * UC-OVERRIDE-003, UC-NOTIFY-004; ADR-12). Pure + client-safe — like the household
 * `renderEventEmail`/`renderInviteEmail`, the renderer builds the subject + HTML +
 * text bodies from a DTO so it is unit-testable without a transport, and the
 * `providerSummaryEmailService` is the only place that touches the wire.
 *
 * The DTO is ALWAYS built from a PERSISTED batch revision (never recomputed at
 * render time — ADR-12): the aggregate roster is the immutable batch lines, so a
 * resend reproduces the exact same email for that revision. The body carries no
 * member PII beyond the per-member display name the batch read already projected.
 */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Mirror `escapeHtml` (lib/events/notifier/html.ts) — kept local so this stays a
 * pure, dependency-free shared module consumable by both web and mobile. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SPICE_LABEL = new Map(
  PROVIDER_SPICE_OPTIONS.map((o) => [o.value, o.label]),
);
const SALT_LABEL = new Map(
  PROVIDER_SALT_OPTIONS.map((o) => [o.value, o.label]),
);

/** A spice/salt suffix like " (Spicy, Low salt)", or "" when neither is set. */
function variantSuffix(
  spiceLevel: ProviderSpiceLevel | null,
  saltLevel: ProviderSaltLevel | null,
): string {
  const parts: string[] = [];
  if (spiceLevel) parts.push(SPICE_LABEL.get(spiceLevel) ?? spiceLevel);
  if (saltLevel) parts.push(SALT_LABEL.get(saltLevel) ?? saltLevel);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

/** One aggregate roster line as plain text. */
function lineText(
  line: ProviderSummaryEmailParams["aggregateLines"][number],
): string {
  const variant = variantSuffix(line.spiceLevel, line.saltLevel);
  const group = providerComponentGroupLabel(line.componentGroup);
  const extra =
    line.extraQuantity > 0 ? ` (incl. ${line.extraQuantity} extra)` : "";
  return `- ${group}: ${line.itemName}${variant} — ${line.totalQuantity} ${line.canonicalUnit}${extra}`;
}

/**
 * Render the preparation-summary email (subject + HTML + text). Subject per § 13:
 * `Preparation summary — {menuDate} — {providerName}`.
 */
export function renderProviderSummaryEmail(
  params: ProviderSummaryEmailParams,
): RenderedEmail {
  const {
    providerName,
    menuDate,
    revision,
    totals,
    aggregateLines,
    individuals,
    csvAggregateUrl,
    csvIndividualUrl,
    printUrl,
    batchUrl,
  } = params;

  const subject = `Preparation summary — ${menuDate} — ${providerName}`;

  const totalsLine =
    `Confirmed ${totals.confirmed} · Auto-accepted ${totals.autoAccepted} · ` +
    `Cancelled ${totals.cancelled} · No response ${totals.noResponse}`;

  const text = [
    `Preparation summary for ${providerName}`,
    `Menu date: ${menuDate} (revision ${revision})`,
    "",
    totalsLine,
    `Customers to prepare for: ${individuals.length}`,
    "",
    "Aggregate roster:",
    ...(aggregateLines.length
      ? aggregateLines.map(lineText)
      : ["- (no items to prepare)"]),
    "",
    `Aggregate CSV: ${csvAggregateUrl}`,
    `Individual CSV: ${csvIndividualUrl}`,
    `Print view: ${printUrl}`,
    `Open in app: ${batchUrl}`,
  ].join("\n");

  const rows = aggregateLines.length
    ? aggregateLines
        .map((line) => {
          const variant = variantSuffix(line.spiceLevel, line.saltLevel);
          const group = providerComponentGroupLabel(line.componentGroup);
          return `<tr><td style="padding:4px 12px 4px 0;">${escapeHtml(group)}</td><td style="padding:4px 12px 4px 0;">${escapeHtml(line.itemName + variant)}</td><td style="padding:4px 0;text-align:right;">${escapeHtml(`${line.totalQuantity} ${line.canonicalUnit}`)}</td></tr>`;
        })
        .join("")
    : `<tr><td colspan="3" style="padding:4px 0;color:#666;">No items to prepare.</td></tr>`;

  const html = [
    `<div style="font-family: system-ui, sans-serif; line-height: 1.5;">`,
    `<p style="font-weight:600;margin:0 0 4px;">Preparation summary — ${escapeHtml(providerName)}</p>`,
    `<p style="margin:0 0 12px;">Menu date: ${escapeHtml(menuDate)} (revision ${revision})</p>`,
    `<p style="margin:0 0 8px;">${escapeHtml(totalsLine)}</p>`,
    `<p style="margin:0 0 12px;">Customers to prepare for: ${individuals.length}</p>`,
    `<table style="border-collapse:collapse;margin:0 0 16px;"><thead><tr><th style="text-align:left;padding:4px 12px 4px 0;">Group</th><th style="text-align:left;padding:4px 12px 4px 0;">Item</th><th style="text-align:right;padding:4px 0;">Total</th></tr></thead><tbody>${rows}</tbody></table>`,
    `<p style="margin:0 0 8px;"><a href="${escapeHtml(batchUrl)}" style="display:inline-block;padding:10px 16px;background:#16a34a;color:#fff;border-radius:6px;text-decoration:none;">Open preparation in app</a></p>`,
    `<p style="font-size:12px;color:#666;margin:0;">Downloads: <a href="${escapeHtml(csvAggregateUrl)}">aggregate CSV</a> · <a href="${escapeHtml(csvIndividualUrl)}">individual CSV</a> · <a href="${escapeHtml(printUrl)}">print view</a></p>`,
    `</div>`,
  ].join("");

  return { subject, html, text };
}
