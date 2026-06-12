import { providerFixtures } from "@mmp/shared/provider";

import { mockProviderClient } from "./mock-client";

// The fixture-backed mock is the substrate every pre-API mobile provider screen
// (and its tests) renders from, so it must faithfully return the canonical
// `@mmp/shared/provider` fixtures and honour the contract's mutation semantics.

const f = providerFixtures;

describe("mockProviderClient — reads return canonical fixtures", () => {
  it("listProviders returns the multi-provider summaries", async () => {
    await expect(mockProviderClient.listProviders()).resolves.toBe(
      f.multiProviderSummaries,
    );
  });

  it("getProvider selects by id, defaulting to provider A", async () => {
    await expect(mockProviderClient.getProvider(f.PROVIDER_B_ID)).resolves.toBe(
      f.providerB,
    );
    await expect(mockProviderClient.getProvider("unknown")).resolves.toBe(
      f.providerA,
    );
  });

  it("listMembers wraps the roster in a single-page collection envelope", async () => {
    const result = await mockProviderClient.listMembers(f.PROVIDER_A_ID);

    expect(result.data).toBe(f.members);
    expect(result.page).toEqual({ nextCursor: null, hasMore: false });
  });

  it("getTodayMenu / getPreparationBatch return the canonical fixtures", async () => {
    await expect(
      mockProviderClient.getTodayMenu(f.PROVIDER_A_ID),
    ).resolves.toBe(f.publishedMenuDay);
    await expect(mockProviderClient.getPreparationBatch("md1")).resolves.toBe(
      f.currentBatch,
    );
  });
});

describe("mockProviderClient — mutations echo contract semantics", () => {
  it("saveMyResponse bumps the version and echoes the submitted selections", async () => {
    const result = await mockProviderClient.saveMyResponse("md1", {
      expectedVersion: 3,
      items: [],
      memberNote: "no onions",
    });

    expect(result.version).toBe(4);
    expect(result.items).toEqual([]);
    expect(result.memberNote).toBe("no onions");
    expect(result.status).toBe("draft");
  });

  it("saveMyResponse treats a null expectedVersion as version 1", async () => {
    const result = await mockProviderClient.saveMyResponse("md1", {
      expectedVersion: null,
      items: [],
      memberNote: null,
    });

    expect(result.version).toBe(1);
  });

  it("approveMember marks the member active", async () => {
    const result = await mockProviderClient.approveMember(
      f.PROVIDER_A_ID,
      "m1",
    );

    expect(result.status).toBe("active");
    expect(result.approvedAt).toBeTruthy();
  });
});
