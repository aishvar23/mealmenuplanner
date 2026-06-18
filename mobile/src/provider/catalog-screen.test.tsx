import { fireEvent, render, screen } from "@testing-library/react-native";

import type { CatalogItemDto } from "@mmp/shared/provider";

import { CatalogScreen } from "./catalog-screen";
import { useCatalog, useCatalogActions } from "./use-catalog";

// The screen is presentational over the data hooks; mock them so the test renders
// the list + form without a network or a QueryClient. UI E2E is deferred.
jest.mock("./use-catalog", () => ({
  useCatalog: jest.fn(),
  useCatalogActions: jest.fn(),
}));

const mockUseCatalog = jest.mocked(useCatalog);
const mockUseCatalogActions = jest.mocked(useCatalogActions);

const RAJMA: CatalogItemDto = {
  catalogItemId: "c-rajma",
  name: "Rajma",
  componentGroup: "dal_or_legume",
  canonicalUnit: "oz",
  defaultQuantity: 16,
  imageUrl: null,
  isActive: true,
  supportsSpiceLevel: true,
  supportsSaltLevel: false,
  allergyWarning: null,
  sourceDishId: null,
};
const ROTI: CatalogItemDto = {
  ...RAJMA,
  catalogItemId: "c-roti",
  name: "Roti",
  componentGroup: "bread",
  canonicalUnit: "piece",
  defaultQuantity: 2,
  supportsSpiceLevel: false,
};
const ARCHIVED: CatalogItemDto = {
  ...RAJMA,
  catalogItemId: "c-old",
  name: "Old Dish",
  isActive: false,
};

function mutation() {
  return {
    mutate: jest.fn(),
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn(),
    isPending: false,
    error: null as unknown,
  };
}

function setCatalog(data: CatalogItemDto[]) {
  mockUseCatalog.mockReturnValue({
    data,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useCatalog>);
}

let create: ReturnType<typeof mutation>;
let update: ReturnType<typeof mutation>;

beforeEach(() => {
  mockUseCatalog.mockReset();
  mockUseCatalogActions.mockReset();
  create = mutation();
  update = mutation();
  mockUseCatalogActions.mockReturnValue({ create, update } as never);
});

describe("CatalogScreen", () => {
  it("renders a loading state (no list) while the catalog loads", () => {
    mockUseCatalog.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useCatalog>);
    render(<CatalogScreen providerId="p1" />);
    expect(screen.queryByText("Catalog")).toBeNull();
  });

  it("lists active dishes grouped by component, plus an archived section", () => {
    setCatalog([RAJMA, ROTI, ARCHIVED]);
    render(<CatalogScreen providerId="p1" />);
    expect(screen.getByText("Rajma")).toBeOnTheScreen();
    expect(screen.getByText("Roti")).toBeOnTheScreen();
    expect(screen.getByText("Dal / legume")).toBeOnTheScreen();
    expect(screen.getByText("Bread")).toBeOnTheScreen();
    expect(screen.getByText("Archived")).toBeOnTheScreen();
    expect(screen.getByText("Old Dish")).toBeOnTheScreen();
  });

  it("shows an empty hint when there are no active dishes", () => {
    setCatalog([]);
    render(<CatalogScreen providerId="p1" />);
    expect(screen.getByText(/No dishes yet/)).toBeOnTheScreen();
  });

  it("archives an active dish by toggling isActive to false", () => {
    setCatalog([RAJMA]);
    render(<CatalogScreen providerId="p1" />);
    fireEvent.press(screen.getByText("Archive"));
    expect(update.mutateAsync).toHaveBeenCalledWith({
      catalogItemId: "c-rajma",
      patch: { isActive: false },
    });
  });

  it("restores an archived dish by toggling isActive to true", () => {
    setCatalog([ARCHIVED]);
    render(<CatalogScreen providerId="p1" />);
    fireEvent.press(screen.getByText("Restore"));
    expect(update.mutateAsync).toHaveBeenCalledWith({
      catalogItemId: "c-old",
      patch: { isActive: true },
    });
  });

  it("opens the add form and blocks an empty submit (no request)", () => {
    setCatalog([RAJMA]);
    render(<CatalogScreen providerId="p1" />);
    fireEvent.press(screen.getByText("Add dish"));
    // The form's submit button is also labeled "Add dish"; pressing it with a blank
    // form must not call create — the client gate flags the missing fields instead.
    fireEvent.press(screen.getByText("Add dish"));
    expect(create.mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a dish name.")).toBeOnTheScreen();
  });

  it("submits a valid new dish through the create mutation", () => {
    setCatalog([]);
    render(<CatalogScreen providerId="p1" />);
    fireEvent.press(screen.getByText("Add dish"));
    fireEvent.changeText(screen.getByPlaceholderText("e.g. Rajma"), "Chana");
    fireEvent.changeText(screen.getByPlaceholderText("e.g. oz, piece"), "oz");
    fireEvent.changeText(screen.getByPlaceholderText("e.g. 16"), "16");
    fireEvent.press(screen.getByText("Add dish"));
    expect(create.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Chana",
        canonicalUnit: "oz",
        defaultQuantity: 16,
        componentGroup: "main",
      }),
    );
  });

  it("opens the edit form prefilled with the dish name", () => {
    setCatalog([RAJMA]);
    render(<CatalogScreen providerId="p1" />);
    fireEvent.press(screen.getByText("Edit"));
    expect(screen.getByText("Edit dish")).toBeOnTheScreen();
    expect(screen.getByDisplayValue("Rajma")).toBeOnTheScreen();
  });

  it("clears stale mutation errors when opening the add form (no banner leak)", () => {
    // A prior archive failed, so update.error is set and the banner shows it.
    update.error = new Error("Couldn't archive the dish.");
    setCatalog([RAJMA]);
    render(<CatalogScreen providerId="p1" />);
    expect(screen.getByText("Couldn't archive the dish.")).toBeOnTheScreen();

    // Opening an unrelated add form must reset both mutations so the stale archive
    // error doesn't leak onto the fresh form.
    fireEvent.press(screen.getByText("Add dish"));
    expect(create.reset).toHaveBeenCalled();
    expect(update.reset).toHaveBeenCalled();
  });

  it("clears stale mutation errors when opening the edit form", () => {
    create.error = new Error("Couldn't add the dish.");
    setCatalog([RAJMA]);
    render(<CatalogScreen providerId="p1" />);
    fireEvent.press(screen.getByText("Edit"));
    expect(create.reset).toHaveBeenCalled();
    expect(update.reset).toHaveBeenCalled();
  });

  it("clears stale mutation errors when cancelling the form", () => {
    setCatalog([RAJMA]);
    render(<CatalogScreen providerId="p1" />);
    fireEvent.press(screen.getByText("Add dish"));
    create.reset.mockClear();
    update.reset.mockClear();
    fireEvent.press(screen.getByText("Cancel"));
    expect(create.reset).toHaveBeenCalled();
    expect(update.reset).toHaveBeenCalled();
  });

  it("resets prior errors before an archive toggle", () => {
    create.error = new Error("Couldn't add the dish.");
    setCatalog([RAJMA]);
    render(<CatalogScreen providerId="p1" />);
    fireEvent.press(screen.getByText("Archive"));
    expect(create.reset).toHaveBeenCalled();
    expect(update.reset).toHaveBeenCalled();
  });
});
