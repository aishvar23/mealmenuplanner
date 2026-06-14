import { describe, expect, it } from "vitest";

import type { ProviderSummaryEmailParams } from "./dtos";
import { renderProviderSummaryEmail } from "./summary-email";

const BASE: ProviderSummaryEmailParams = {
  toEmail: "owner@example.com",
  providerName: "Tiffins by Asha",
  menuDate: "2026-06-13",
  revision: 2,
  generatedAt: "2026-06-13T18:00:00Z",
  totals: { confirmed: 5, autoAccepted: 2, cancelled: 1, noResponse: 3 },
  aggregateLines: [
    {
      catalogItemId: "c1",
      itemName: "Paneer Butter Masala",
      componentGroup: "main",
      spiceLevel: "spicy",
      saltLevel: "low_salt",
      includedQuantity: 5,
      extraQuantity: 2,
      totalQuantity: 7,
      canonicalUnit: "portion",
    },
    {
      catalogItemId: "c2",
      itemName: "Jeera Rice",
      componentGroup: "side",
      spiceLevel: null,
      saltLevel: null,
      includedQuantity: 5,
      extraQuantity: 0,
      totalQuantity: 5,
      canonicalUnit: "portion",
    },
  ],
  individuals: [
    { memberUserId: "m1", displayName: "Ravi", lines: [] },
    { memberUserId: "m2", displayName: null, lines: [] },
  ],
  csvAggregateUrl:
    "https://app.test/api/provider-preparation-batches/b1/aggregate.csv",
  csvIndividualUrl:
    "https://app.test/api/provider-preparation-batches/b1/individual.csv",
  printUrl: "https://app.test/provider/preparation/b1/print",
  batchUrl: "https://app.test/provider/preparation/b1",
};

describe("renderProviderSummaryEmail", () => {
  it("uses the § 13 subject format", () => {
    const { subject } = renderProviderSummaryEmail(BASE);
    expect(subject).toBe("Preparation summary — 2026-06-13 — Tiffins by Asha");
  });

  it("includes the totals, customer count, and all four links in the text body", () => {
    const { text } = renderProviderSummaryEmail(BASE);
    expect(text).toContain(
      "Confirmed 5 · Auto-accepted 2 · Cancelled 1 · No response 3",
    );
    expect(text).toContain("Customers to prepare for: 2");
    expect(text).toContain(BASE.csvAggregateUrl);
    expect(text).toContain(BASE.csvIndividualUrl);
    expect(text).toContain(BASE.printUrl);
    expect(text).toContain(BASE.batchUrl);
  });

  it("renders spice/salt variants and extra quantities in the text roster", () => {
    const { text } = renderProviderSummaryEmail(BASE);
    expect(text).toContain(
      "Main: Paneer Butter Masala (Spicy, Low salt) — 7 portion (incl. 2 extra)",
    );
    // No variant suffix and no extra note when neither is set.
    expect(text).toContain("Side: Jeera Rice — 5 portion");
    expect(text).not.toContain("Jeera Rice (");
  });

  it("escapes HTML in the provider and item names", () => {
    const { html } = renderProviderSummaryEmail({
      ...BASE,
      providerName: 'Asha & "Co" <x>',
      aggregateLines: [
        { ...BASE.aggregateLines[0]!, itemName: "Tikka <script>" },
      ],
    });
    expect(html).toContain("Asha &amp; &quot;Co&quot; &lt;x&gt;");
    expect(html).toContain("Tikka &lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("shows an empty-roster placeholder when there are no aggregate lines", () => {
    const { text, html } = renderProviderSummaryEmail({
      ...BASE,
      aggregateLines: [],
    });
    expect(text).toContain("(no items to prepare)");
    expect(html).toContain("No items to prepare.");
  });
});
