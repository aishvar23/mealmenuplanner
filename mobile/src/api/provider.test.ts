import { apiRequest, getCollection } from "./client";
import { providerApiClient } from "./provider";

// Unit-test the provider HTTP client (MP-C-000) at the transport seam: it must
// hit the contract-fixed `/api/*` route, method, and body for each call, and
// thread the collection envelope through `getCollection`. We mock `./client`
// (already unit-tested for auth/refresh/error-mapping) so these assertions are
// about the provider routing alone, not fetch.

jest.mock("./client", () => ({
  apiRequest: jest.fn(),
  getCollection: jest.fn(),
}));

const mockApiRequest = jest.mocked(apiRequest);
const mockGetCollection = jest.mocked(getCollection);

beforeEach(() => {
  mockApiRequest.mockReset();
  mockGetCollection.mockReset();
});

describe("providerApiClient — discovery / provider", () => {
  it("listProviders unwraps the collection envelope from GET /api/providers", async () => {
    mockGetCollection.mockResolvedValue({
      data: [{ providerId: "prov-a" }],
      page: { nextCursor: null, hasMore: false },
    });

    const result = await providerApiClient.listProviders();

    expect(mockGetCollection).toHaveBeenCalledWith("/api/providers");
    expect(result).toEqual([{ providerId: "prov-a" }]);
  });

  it("getProvider GETs the provider by id", async () => {
    mockApiRequest.mockResolvedValue({ providerId: "prov-a" });

    await providerApiClient.getProvider("prov-a");

    expect(mockApiRequest).toHaveBeenCalledWith("/api/providers/prov-a");
  });

  it("createProvider POSTs the create body", async () => {
    mockApiRequest.mockResolvedValue({ providerId: "prov-a" });

    await providerApiClient.createProvider({ name: "Anna's Tiffins" });

    expect(mockApiRequest).toHaveBeenCalledWith("/api/providers", {
      method: "POST",
      body: { name: "Anna's Tiffins" },
    });
  });

  it("updateProvider PATCHes the settings patch", async () => {
    mockApiRequest.mockResolvedValue({ providerId: "prov-a" });

    await providerApiClient.updateProvider("prov-a", { name: "New name" });

    expect(mockApiRequest).toHaveBeenCalledWith("/api/providers/prov-a", {
      method: "PATCH",
      body: { name: "New name" },
    });
  });

  it("completeProviderOnboarding POSTs the complete-onboarding route", async () => {
    mockApiRequest.mockResolvedValue({ providerId: "prov-a" });

    await providerApiClient.completeProviderOnboarding("prov-a");

    expect(mockApiRequest).toHaveBeenCalledWith(
      "/api/providers/prov-a/complete-onboarding",
      { method: "POST" },
    );
  });
});

describe("providerApiClient — members", () => {
  it("listMembers returns the paginated roster envelope", async () => {
    const envelope = {
      data: [{ memberId: "m1" }],
      page: { nextCursor: null, hasMore: false },
    };
    mockGetCollection.mockResolvedValue(envelope);

    const result = await providerApiClient.listMembers("prov-a");

    expect(mockGetCollection).toHaveBeenCalledWith(
      "/api/providers/prov-a/members",
    );
    expect(result).toBe(envelope);
  });

  it("approve/reject/remove POST the member lifecycle routes", async () => {
    mockApiRequest.mockResolvedValue({ memberId: "m1" });

    await providerApiClient.approveMember("prov-a", "m1");
    await providerApiClient.rejectMember("prov-a", "m1");
    await providerApiClient.removeMember("prov-a", "m1");

    expect(mockApiRequest).toHaveBeenNthCalledWith(
      1,
      "/api/providers/prov-a/members/m1/approve",
      { method: "POST" },
    );
    expect(mockApiRequest).toHaveBeenNthCalledWith(
      2,
      "/api/providers/prov-a/members/m1/reject",
      { method: "POST" },
    );
    expect(mockApiRequest).toHaveBeenNthCalledWith(
      3,
      "/api/providers/prov-a/members/m1/remove",
      { method: "POST" },
    );
  });
});

describe("providerApiClient — menus & response", () => {
  it("getMenuDay / today / weekly hit the menu read routes", async () => {
    mockApiRequest.mockResolvedValue(null);

    await providerApiClient.getMenuDay("md1");
    await providerApiClient.getTodayMenu("prov-a");
    await providerApiClient.getWeeklyMenu("prov-a");

    expect(mockApiRequest).toHaveBeenNthCalledWith(
      1,
      "/api/provider-menu-days/md1",
    );
    expect(mockApiRequest).toHaveBeenNthCalledWith(
      2,
      "/api/providers/prov-a/today-menu",
    );
    expect(mockApiRequest).toHaveBeenNthCalledWith(
      3,
      "/api/providers/prov-a/weekly-menu",
    );
  });

  it("saveMyResponse PUTs the body to the menu-day response route", async () => {
    mockApiRequest.mockResolvedValue({ responseId: "r1" });
    const body = {
      expectedVersion: 1,
      items: [],
      memberNote: null,
    };

    await providerApiClient.saveMyResponse("md1", body);

    expect(mockApiRequest).toHaveBeenCalledWith(
      "/api/provider-menu-days/md1/my-response",
      { method: "PUT", body },
    );
  });

  it("confirm/cancel POST the response lifecycle routes", async () => {
    mockApiRequest.mockResolvedValue({ responseId: "r1" });

    await providerApiClient.confirmResponse("r1");
    await providerApiClient.cancelResponse("r1");

    expect(mockApiRequest).toHaveBeenNthCalledWith(
      1,
      "/api/provider-responses/r1/confirm",
      { method: "POST" },
    );
    expect(mockApiRequest).toHaveBeenNthCalledWith(
      2,
      "/api/provider-responses/r1/cancel",
      { method: "POST" },
    );
  });

  it("getPreparationBatch GETs the batch route for the menu day", async () => {
    mockApiRequest.mockResolvedValue({ batchId: "b1" });

    await providerApiClient.getPreparationBatch("md1");

    expect(mockApiRequest).toHaveBeenCalledWith(
      "/api/provider-menu-days/md1/preparation-batch",
    );
  });
});
