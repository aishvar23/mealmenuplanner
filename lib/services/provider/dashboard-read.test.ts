import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotFoundError } from "@/lib/errors";
import { providerFixtures } from "@/packages/shared/provider";

vi.mock("server-only", () => ({}));
vi.mock("./access", () => ({ requireOwnedProvider: vi.fn() }));
vi.mock("./onboarding", () => ({ getProvider: vi.fn() }));
vi.mock("./menu-read", () => ({ getTodayMenu: vi.fn() }));
vi.mock("./batch-read", () => ({ listProviderBatches: vi.fn() }));

import { requireOwnedProvider } from "./access";
import { listProviderBatches } from "./batch-read";
import { getProviderDashboard } from "./dashboard-read";
import { getTodayMenu } from "./menu-read";
import { getProvider } from "./onboarding";

const f = providerFixtures;
const PROVIDER = f.PROVIDER_A_ID;

describe("getProviderDashboard (MP-B-060)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOwnedProvider).mockResolvedValue(undefined);
    vi.mocked(getProvider).mockResolvedValue(f.providerA);
  });

  it("composes today's menu state with today's matching batch census", async () => {
    vi.mocked(getTodayMenu).mockResolvedValue(f.publishedMenuDay);
    vi.mocked(listProviderBatches).mockResolvedValue(f.batchSummaries);

    const result = await getProviderDashboard(PROVIDER);

    expect(requireOwnedProvider).toHaveBeenCalledWith(PROVIDER);
    expect(result.providerName).toBe(f.providerA.name);
    expect(result.timezone).toBe(f.providerA.timezone);
    expect(result.today).toEqual({
      menuDayId: f.publishedMenuDay.menuDayId,
      menuDate: f.publishedMenuDay.menuDate,
      cutoffAt: f.publishedMenuDay.cutoffAt,
      status: f.publishedMenuDay.status,
      componentCount: f.publishedMenuDay.components.length,
    });
    // The batch index row for today's menu day is selected as the census.
    expect(result.batch).toEqual(f.batchSummaries[0]);
  });

  it("returns a null batch and never reads the index when there is no menu today", async () => {
    vi.mocked(getTodayMenu).mockResolvedValue(null);

    const result = await getProviderDashboard(PROVIDER);

    expect(result.today).toBeNull();
    expect(result.batch).toBeNull();
    // No menu day ⇒ no batch can exist; skip the index read entirely.
    expect(listProviderBatches).not.toHaveBeenCalled();
  });

  it("returns a null batch when today's menu has no batch yet (pre-cutoff)", async () => {
    vi.mocked(getTodayMenu).mockResolvedValue(f.publishedMenuDay);
    // An index that contains only OTHER days' batches — today's is not present yet.
    vi.mocked(listProviderBatches).mockResolvedValue([
      { ...f.batchSummaries[0]!, menuDayId: "some-other-day" },
    ]);

    const result = await getProviderDashboard(PROVIDER);

    expect(listProviderBatches).toHaveBeenCalledWith(PROVIDER);
    expect(result.today).not.toBeNull();
    expect(result.batch).toBeNull();
  });

  it("propagates the owner gate (a non-owner is existence-hidden) and reads nothing", async () => {
    vi.mocked(requireOwnedProvider).mockRejectedValue(
      new NotFoundError("Provider not found."),
    );

    await expect(getProviderDashboard(PROVIDER)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(getProvider).not.toHaveBeenCalled();
    expect(getTodayMenu).not.toHaveBeenCalled();
    expect(listProviderBatches).not.toHaveBeenCalled();
  });
});
