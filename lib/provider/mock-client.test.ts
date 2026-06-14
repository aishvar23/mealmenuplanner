import { describe, expect, it } from "vitest";

import { providerFixtures as f } from "@/packages/shared/provider";

import { mockProviderClient } from "./mock-client";

/**
 * MP-B-001: the mock client must return the canonical fixtures (so screens
 * render identically to live data) and honour the optimistic-concurrency
 * contract on save. Implementing `ProviderApiClient` is enforced at compile time
 * by the `mock-client.ts` type annotation.
 */

describe("mockProviderClient (MP-B-001)", () => {
  it("lists the multi-provider fixture set", async () => {
    await expect(mockProviderClient.listProviders()).resolves.toEqual(
      f.multiProviderSummaries,
    );
  });

  it("resolves a provider by id (A vs B)", async () => {
    await expect(mockProviderClient.getProvider(f.PROVIDER_A_ID)).resolves.toBe(
      f.providerA,
    );
    await expect(mockProviderClient.getProvider(f.PROVIDER_B_ID)).resolves.toBe(
      f.providerB,
    );
  });

  it("createProvider echoes the name as a draft org", async () => {
    const created = await mockProviderClient.createProvider({ name: "New Co" });
    expect(created.name).toBe("New Co");
    expect(created.status).toBe("draft");
  });

  it("returns members in the bounded collection envelope", async () => {
    const collection = await mockProviderClient.listMembers(f.PROVIDER_A_ID);
    expect(collection.data).toEqual(f.members);
    expect(collection.page.hasMore).toBe(false);
    expect(collection.page.nextCursor).toBeNull();
  });

  it("returns the published menu for today / week / day", async () => {
    await expect(
      mockProviderClient.getTodayMenu(f.PROVIDER_A_ID),
    ).resolves.toBe(f.publishedMenuDay);
    await expect(
      mockProviderClient.getWeeklyMenu(f.PROVIDER_A_ID),
    ).resolves.toEqual([f.publishedMenuDay]);
  });

  it("saveMyResponse bumps version from expectedVersion and keeps the note", async () => {
    const saved = await mockProviderClient.saveMyResponse("menu-day", {
      expectedVersion: 4,
      items: [],
      memberNote: "extra spicy",
    });
    expect(saved.version).toBe(5);
    expect(saved.memberNote).toBe("extra spicy");
  });

  it("confirm / cancel return the matching response states", async () => {
    await expect(
      mockProviderClient.confirmResponse("resp"),
    ).resolves.toHaveProperty("status", "confirmed");
    await expect(
      mockProviderClient.cancelResponse("resp"),
    ).resolves.toHaveProperty("status", "cancelled");
  });

  it("returns the current preparation batch", async () => {
    await expect(
      mockProviderClient.getPreparationBatch("menu-day"),
    ).resolves.toBe(f.currentBatch);
  });

  it("returns the suggestion fixtures for create / accept / reject", async () => {
    await expect(
      mockProviderClient.createSuggestion("menu-day", {
        suggestionText: "add millet",
      }),
    ).resolves.toBe(f.pendingSuggestion);
    await expect(
      mockProviderClient.acceptSuggestionAsOption("s1"),
    ).resolves.toHaveProperty("status", "accepted_as_option");
    await expect(
      mockProviderClient.rejectSuggestion("s1"),
    ).resolves.toHaveProperty("status", "rejected");
  });
});
