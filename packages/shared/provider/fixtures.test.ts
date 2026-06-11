import { describe, expect, it } from "vitest";

import { providerFixtures as f } from "./index";

/**
 * Fixtures are typed by the DTOs, so shape conformance is enforced at compile
 * time (contract 03 § 14 — "cannot silently drift"). These runtime checks guard
 * the things types can't: internal referential consistency and that the § 14
 * required state set is actually present, so every provider screen has data.
 */

describe("provider fixtures (contract 03 § 14)", () => {
  it("provides the full required state set", () => {
    // Members: owner, awaiting-approval customer, approved customer.
    expect(f.ownerMember.status).toBe("active");
    expect(f.ownerMember.role).toBe("owner");
    expect(f.awaitingMember.status).toBe("awaiting_approval");
    expect(f.approvedMember.status).toBe("active");

    // Responses: draft, confirmed, cancelled, locked, auto-accepted.
    expect(f.draftResponse.status).toBe("draft");
    expect(f.confirmedResponse.status).toBe("confirmed");
    expect(f.cancelledResponse.status).toBe("cancelled");
    expect(f.lockedResponse.status).toBe("locked");
    expect(f.autoAcceptedResponse.status).toBe("auto_accepted");

    // Menu + batches: published menu day, current + stale batch.
    expect(f.publishedMenuDay.status).toBe("published");
    expect(f.currentBatch.status).toBe("current");
    expect(f.staleBatch.status).toBe("stale");
  });

  it("exposes a multi-provider membership set with distinct providers", () => {
    const ids = f.multiProviderSummaries.map((p) => p.providerId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    // An awaiting membership is included so the awaiting-approval state is covered.
    expect(
      f.multiProviderSummaries.some(
        (p) => p.membershipStatus === "awaiting_approval",
      ),
    ).toBe(true);
  });

  it("locked/auto-accepted responses carry a lockedAt; open ones do not", () => {
    expect(f.lockedResponse.lockedAt).not.toBeNull();
    expect(f.autoAcceptedResponse.lockedAt).not.toBeNull();
    expect(f.draftResponse.lockedAt ?? null).toBeNull();
    expect(f.confirmedResponse.lockedAt).toBeNull();
  });

  it("response items reference components that exist on the menu day", () => {
    const componentIds = new Set(
      f.publishedMenuDay.components.map((c) => c.menuComponentId),
    );
    for (const item of f.confirmedResponse.items) {
      expect(componentIds.has(item.menuComponentId)).toBe(true);
    }
  });

  it("response selections reference the component default or one of its alternatives", () => {
    const byComponent = new Map(
      f.publishedMenuDay.components.map((c) => [c.menuComponentId, c]),
    );
    for (const item of f.confirmedResponse.items) {
      const component = byComponent.get(item.menuComponentId);
      expect(component).toBeDefined();
      const allowed = new Set([
        component!.defaultCatalogItemId,
        ...component!.alternatives.map((a) => a.catalogItemId),
      ]);
      expect(allowed.has(item.selectedCatalogItemId)).toBe(true);
    }
  });

  it("every quantity_increment customization has a finite max (completeness rule § 5)", () => {
    for (const component of f.publishedMenuDay.components) {
      for (const group of component.customizationGroups) {
        if (group.customizationType === "quantity_increment") {
          expect(group.maximumSelections).not.toBeNull();
          for (const option of group.options) {
            expect(option.maximumQuantity).not.toBeNull();
          }
        }
      }
    }
  });

  it("batch lines reconcile: included + extra === total, all non-negative", () => {
    const allLines = [
      ...f.currentBatch.aggregateLines,
      ...f.currentBatch.individualLines.flatMap((m) => m.lines),
    ];
    for (const line of allLines) {
      expect(line.includedQuantity).toBeGreaterThanOrEqual(0);
      expect(line.extraQuantity).toBeGreaterThanOrEqual(0);
      expect(line.totalQuantity).toBe(
        line.includedQuantity + line.extraQuantity,
      );
    }
  });

  it("workspace discovery default paths match the contract § 2 destinations", () => {
    const byType = new Map(
      f.multiWorkspaceDiscovery.workspaces.map((w) => [`${w.type}:${w.id}`, w]),
    );
    expect(byType.get(`provider_owner:${f.PROVIDER_A_ID}`)?.defaultPath).toBe(
      "/provider/dashboard",
    );
    expect(
      byType.get(`provider_customer:${f.PROVIDER_B_ID}`)?.defaultPath,
    ).toBe(`/providers/${f.PROVIDER_B_ID}/today`);
  });
});
