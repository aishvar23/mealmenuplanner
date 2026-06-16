import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";

import {
  providerFixtures,
  type CatalogItemDto,
  type MenuDayDto,
} from "@mmp/shared/provider";

import { MenuManagerScreen } from "./menu-manager-screen";
import { useMenuManager } from "./use-menu-manager";

// The screen is presentational over its data hook; mock it so the test renders the
// list + builder without a network or a QueryClient. Mobile UI E2E is deferred
// (ADR-17/Q-8) — this is the unit/hook bar (MP-C-030).
jest.mock("./use-menu-manager", () => ({ useMenuManager: jest.fn() }));

const mockUseMenuManager = jest.mocked(useMenuManager);

const CATALOG: CatalogItemDto[] = providerFixtures.catalogItems;

function makeDay(overrides: Partial<MenuDayDto> = {}): MenuDayDto {
  const item = CATALOG[0]!;
  return {
    menuDayId: "d1",
    providerId: "p1",
    weeklyMenuId: "w1",
    menuDate: "2026-06-16",
    cutoffAt: "2999-01-01T00:00:00Z",
    status: "draft",
    note: null,
    publishedAt: null,
    lockedAt: null,
    revision: 1,
    supersedesMenuDayId: null,
    supersededAt: null,
    components: [
      {
        menuComponentId: "mc1",
        componentGroup: item.componentGroup,
        defaultCatalogItemId: item.catalogItemId,
        defaultItemName: item.name,
        defaultQuantity: item.defaultQuantity,
        canonicalUnit: item.canonicalUnit,
        isRequired: true,
        sortOrder: 0,
        alternatives: [],
        customizationGroups: [],
        supportsSpiceLevel: item.supportsSpiceLevel,
        supportsSaltLevel: item.supportsSaltLevel,
      },
    ],
    ...overrides,
  };
}

function query<T>(
  data: T | undefined,
  overrides: Record<string, unknown> = {},
) {
  return {
    data,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
    ...overrides,
  };
}

function mutation(overrides: Record<string, unknown> = {}) {
  return {
    mutate: jest.fn(),
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    isPending: false,
    error: null,
    variables: undefined,
    ...overrides,
  };
}

function value(
  overrides: Record<string, unknown> = {},
): ReturnType<typeof useMenuManager> {
  return {
    weeklyMenu: query<MenuDayDto[]>([makeDay()]),
    catalog: query<CatalogItemDto[]>(CATALOG),
    create: mutation(),
    publish: mutation(),
    revise: mutation(),
    updateNote: mutation(),
    ...overrides,
  } as unknown as ReturnType<typeof useMenuManager>;
}

beforeEach(() => mockUseMenuManager.mockReset());

describe("MenuManagerScreen (MP-C-030)", () => {
  it("shows a spinner while loading", () => {
    mockUseMenuManager.mockReturnValue(
      value({
        weeklyMenu: query<MenuDayDto[]>(undefined, { isLoading: true }),
      }),
    );
    render(<MenuManagerScreen providerId="p1" />);
    expect(screen.queryByText("Weekly menu")).toBeNull();
  });

  it("shows an error state with retry", () => {
    const refetch = jest.fn();
    mockUseMenuManager.mockReturnValue(
      value({
        weeklyMenu: query<MenuDayDto[]>(undefined, {
          error: new Error("boom"),
          refetch,
        }),
      }),
    );
    render(<MenuManagerScreen providerId="p1" />);
    expect(screen.getByText("Couldn't load the menu.")).toBeOnTheScreen();
    fireEvent.press(screen.getByText("Try again"));
    expect(refetch).toHaveBeenCalled();
  });

  it("lists the week's days with status + dish count and a publishable draft", () => {
    mockUseMenuManager.mockReturnValue(value());
    render(<MenuManagerScreen providerId="p1" />);
    expect(screen.getByText("Weekly menu")).toBeOnTheScreen();
    expect(screen.getByText("2026-06-16")).toBeOnTheScreen();
    expect(screen.getByText("Draft")).toBeOnTheScreen();
    expect(screen.getByText("1 dish")).toBeOnTheScreen();
    expect(screen.getByText("Publish")).toBeOnTheScreen();
  });

  it("publishes a complete draft", () => {
    const publish = mutation();
    mockUseMenuManager.mockReturnValue(value({ publish }));
    render(<MenuManagerScreen providerId="p1" />);
    fireEvent.press(screen.getByText("Publish"));
    expect(publish.mutate).toHaveBeenCalledWith("d1");
  });

  it("blocks publish for an incomplete (past-cutoff) draft and explains why", () => {
    mockUseMenuManager.mockReturnValue(
      value({
        weeklyMenu: query<MenuDayDto[]>([
          makeDay({ cutoffAt: "2000-01-01T00:00:00Z" }),
        ]),
      }),
    );
    render(<MenuManagerScreen providerId="p1" />);
    expect(
      screen.getByText("• The cutoff time must be in the future."),
    ).toBeOnTheScreen();
    const publishBtn = screen.getByRole("button", { name: "Publish" });
    expect(publishBtn.props.accessibilityState?.disabled).toBe(true);
  });

  it("shows the empty-catalog state and hides the New button", () => {
    mockUseMenuManager.mockReturnValue(
      value({
        catalog: query<CatalogItemDto[]>([]),
        weeklyMenu: query<MenuDayDto[]>([]),
      }),
    );
    render(<MenuManagerScreen providerId="p1" />);
    expect(screen.getByText("Add catalog items first")).toBeOnTheScreen();
    expect(screen.queryByText("New")).toBeNull();
  });

  it("opens the builder and authors a draft via the create mutation", async () => {
    const create = mutation();
    mockUseMenuManager.mockReturnValue(
      value({ create, weeklyMenu: query<MenuDayDto[]>([]) }),
    );
    render(<MenuManagerScreen providerId="p1" />);

    fireEvent.press(screen.getByText("New"));
    expect(screen.getByText("New menu day")).toBeOnTheScreen();

    // Add a component (defaults to the first catalog item) so the draft is creatable.
    fireEvent.press(screen.getByText("Add"));
    fireEvent.press(screen.getByText("Save draft"));
    await waitFor(() => expect(create.mutateAsync).toHaveBeenCalledTimes(1));
    const input = create.mutateAsync.mock.calls[0]![0];
    expect(input.components).toHaveLength(1);
    expect(input.components[0].defaultCatalogItemId).toBe(
      CATALOG[0]!.catalogItemId,
    );
  });

  it("edits a published day via the revise mutation, warning about re-confirmation", async () => {
    const revise = mutation();
    const published = makeDay({
      status: "published",
      publishedAt: "2026-06-10T00:00:00Z",
      cutoffAt: "2999-01-01T00:00:00Z",
    });
    mockUseMenuManager.mockReturnValue(
      value({ revise, weeklyMenu: query<MenuDayDto[]>([published]) }),
    );
    render(<MenuManagerScreen providerId="p1" />);

    // A published, before-cutoff day offers Edit (not Publish).
    fireEvent.press(screen.getByText("Edit"));
    expect(screen.getByText(/Edit menu/)).toBeOnTheScreen();
    // The owner is warned that editing a published day may spawn a revision.
    expect(screen.getByText(/may create a new revision/)).toBeOnTheScreen();

    fireEvent.press(screen.getByText("Save changes"));
    await waitFor(() => expect(revise.mutateAsync).toHaveBeenCalledTimes(1));
    const arg = revise.mutateAsync.mock.calls[0]![0];
    expect(arg.menuDayId).toBe("d1");
    expect(arg.input.components).toHaveLength(1);
    expect(arg.input.components[0].defaultCatalogItemId).toBe(
      CATALOG[0]!.catalogItemId,
    );
    // The immutable date is not part of the edit payload.
    expect("menuDate" in arg.input).toBe(false);
  });

  it("saves an incomplete DRAFT edit (draft gate is creatable, not publishable)", async () => {
    const revise = mutation();
    // A draft with a past cutoff is NOT publishable, but a draft edit may still be saved.
    const draft = makeDay({
      status: "draft",
      cutoffAt: "2000-01-01T00:00:00Z",
    });
    mockUseMenuManager.mockReturnValue(
      value({ revise, weeklyMenu: query<MenuDayDto[]>([draft]) }),
    );
    render(<MenuManagerScreen providerId="p1" />);

    fireEvent.press(screen.getByText("Edit"));
    expect(screen.getByText(/Edit menu/)).toBeOnTheScreen();
    const saveBtn = screen.getByRole("button", { name: "Save changes" });
    expect(saveBtn.props.accessibilityState?.disabled).toBeFalsy();
    fireEvent.press(saveBtn);
    await waitFor(() => expect(revise.mutateAsync).toHaveBeenCalledTimes(1));
  });

  it("authors a customization group on a component and sends it in the create payload", async () => {
    const create = mutation();
    mockUseMenuManager.mockReturnValue(
      value({ create, weeklyMenu: query<MenuDayDto[]>([]) }),
    );
    render(<MenuManagerScreen providerId="p1" />);

    fireEvent.press(screen.getByText("New"));
    fireEvent.press(screen.getByText("Add")); // a component (first catalog item)

    // Add a customization group — it starts unnamed, so the save is blocked with a reason.
    fireEvent.press(screen.getByText("Add customization"));
    expect(
      screen.getByText("Fix these customizations before saving"),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Save draft" }).props
        .accessibilityState?.disabled,
    ).toBe(true);

    // Name the group + add and label one option → now insertable.
    fireEvent.changeText(
      screen.getByPlaceholderText("e.g. Sauce, Extra roti"),
      "Sauce",
    );
    fireEvent.press(screen.getByText("Add option"));
    fireEvent.changeText(
      screen.getByPlaceholderText("Label (e.g. Mint chutney)"),
      "Mint chutney",
    );

    const saveBtn = screen.getByRole("button", { name: "Save draft" });
    expect(saveBtn.props.accessibilityState?.disabled).toBeFalsy();
    fireEvent.press(saveBtn);

    await waitFor(() => expect(create.mutateAsync).toHaveBeenCalledTimes(1));
    const input = create.mutateAsync.mock.calls[0]![0];
    const group = input.components[0].customizationGroups[0];
    expect(group.name).toBe("Sauce");
    expect(group.customizationType).toBe("single_select");
    expect(group.maximumSelections).toBe(1); // single-select normalized to one
    expect(group.options[0].label).toBe("Mint chutney");
  });

  it("keeps an archived default + alternative visible and blocks save until replaced", async () => {
    const revise = mutation();
    const rajma = CATALOG.find((c) => c.componentGroup === "dal_or_legume")!;
    const published: MenuDayDto = {
      ...makeDay({
        status: "published",
        publishedAt: "2026-06-10T00:00:00Z",
        cutoffAt: "2999-01-01T00:00:00Z",
      }),
      components: [
        {
          menuComponentId: "mc-dal",
          componentGroup: "dal_or_legume",
          defaultCatalogItemId: "archived-dal", // archived after authoring
          defaultItemName: "Old Rajma",
          defaultQuantity: 16,
          canonicalUnit: "oz",
          isRequired: true,
          sortOrder: 0,
          alternatives: [
            {
              alternativeId: "alt-1",
              catalogItemId: "archived-alt", // also archived
              itemName: "Old Chana",
              quantity: 16,
              canonicalUnit: "oz",
            },
          ],
          customizationGroups: [],
          supportsSpiceLevel: false,
          supportsSaltLevel: false,
        },
      ],
    };
    mockUseMenuManager.mockReturnValue(
      value({ revise, weeklyMenu: query<MenuDayDto[]>([published]) }),
    );
    render(<MenuManagerScreen providerId="p1" />);

    fireEvent.press(screen.getByText("Edit"));
    // The archived default + alternative stay VISIBLE (flagged), never silently dropped.
    expect(screen.getByText("Old Rajma (unavailable)")).toBeOnTheScreen();
    expect(screen.getByText("Old Chana (unavailable)")).toBeOnTheScreen();
    // They block saving until replaced.
    expect(screen.getByText(/no longer available/)).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Save changes" }).props
        .accessibilityState?.disabled,
    ).toBe(true);

    // Replacing the default with an active dish (which clears the archived alt) saves.
    fireEvent.press(
      screen.getByText(
        `${rajma.name} · ${rajma.defaultQuantity} ${rajma.canonicalUnit}`,
      ),
    );
    expect(screen.queryByText(/no longer available/)).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(revise.mutateAsync).toHaveBeenCalledTimes(1));
    const arg = revise.mutateAsync.mock.calls[0]![0];
    expect(arg.input.components[0].defaultCatalogItemId).toBe(
      rajma.catalogItemId,
    );
    expect(arg.input.components[0].alternativeCatalogItemIds).toEqual([]);
  });

  it("edits just the day note in place via the updateNote (PATCH) mutation", async () => {
    const updateNote = mutation();
    // A locked day: the structural editor is closed (no Edit/Publish) but a note is allowed.
    const locked = makeDay({
      status: "locked",
      lockedAt: "2026-06-15T14:00:00Z",
      cutoffAt: "2026-06-15T14:00:00Z",
      note: "Old note",
    });
    mockUseMenuManager.mockReturnValue(
      value({ updateNote, weeklyMenu: query<MenuDayDto[]>([locked]) }),
    );
    render(<MenuManagerScreen providerId="p1" />);

    // No structural Edit affordance on a locked day, but the note one is present.
    expect(screen.queryByText("Edit")).toBeNull();
    fireEvent.press(screen.getByText("Edit note"));

    const field = screen.getByLabelText("Menu day note");
    fireEvent.changeText(field, "  Updated note  ");
    fireEvent.press(screen.getByText("Save note"));

    await waitFor(() =>
      expect(updateNote.mutateAsync).toHaveBeenCalledTimes(1),
    );
    expect(updateNote.mutateAsync).toHaveBeenCalledWith({
      menuDayId: "d1",
      input: { note: "Updated note" }, // trimmed
    });
  });

  it("disables Save note until the note actually changes (no-op guard)", () => {
    const updateNote = mutation();
    const published = makeDay({
      status: "published",
      publishedAt: "2026-06-10T00:00:00Z",
      cutoffAt: "2999-01-01T00:00:00Z",
      note: "Festive thali",
    });
    mockUseMenuManager.mockReturnValue(
      value({ updateNote, weeklyMenu: query<MenuDayDto[]>([published]) }),
    );
    render(<MenuManagerScreen providerId="p1" />);

    fireEvent.press(screen.getByText("Edit note"));
    // Pre-filled with the current note → unchanged → Save disabled.
    expect(
      screen.getByRole("button", { name: "Save note" }).props.accessibilityState
        ?.disabled,
    ).toBe(true);

    fireEvent.changeText(screen.getByLabelText("Menu day note"), "Changed");
    expect(
      screen.getByRole("button", { name: "Save note" }).props.accessibilityState
        ?.disabled,
    ).toBeFalsy();
  });
});
