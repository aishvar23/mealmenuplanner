import { fireEvent, render, screen } from "@testing-library/react-native";

import { useWorkspaceOptions } from "./use-workspace-options";
import { useWorkspaceSwitch } from "./use-workspace-switch";
import { WorkspaceSwitcher } from "./workspace-switcher";

// The switcher renders from `useWorkspaceOptions` and acts through
// `useWorkspaceSwitch`; the test mocks both to assert the list and the switch
// action without a real query or navigation.
jest.mock("./use-workspace-options", () => ({
  useWorkspaceOptions: jest.fn(),
}));
jest.mock("./use-workspace-switch", () => ({ useWorkspaceSwitch: jest.fn() }));

const mockOptions = jest.mocked(useWorkspaceOptions);
const mockSwitch = jest.mocked(useWorkspaceSwitch);
const switchTo = jest.fn();

beforeEach(() => {
  mockOptions.mockReset();
  switchTo.mockReset();
  mockSwitch.mockReturnValue({ switchTo, pending: false });
});

describe("WorkspaceSwitcher", () => {
  it("shows the empty state when there are no workspaces", () => {
    mockOptions.mockReturnValue({
      options: [],
      isLoading: false,
      isError: false,
    });
    render(<WorkspaceSwitcher />);
    expect(screen.getByText("No workspaces yet")).toBeOnTheScreen();
  });

  it("lists each workspace and switches on press", () => {
    mockOptions.mockReturnValue({
      isLoading: false,
      isError: false,
      options: [
        {
          type: "household",
          id: "hh-1",
          route: "/(tabs)/today",
          name: "Suhane Household",
          subtitle: "Household · owner",
          kind: "household",
        },
        {
          type: "provider_owner",
          id: "prov-a",
          route: "/(provider-owner)/prov-a/dashboard",
          name: "Anna's Tiffins",
          subtitle: "Meal provider · owner",
          kind: "provider",
        },
      ],
    });

    render(<WorkspaceSwitcher />);

    expect(screen.getByText("Suhane Household")).toBeOnTheScreen();
    expect(screen.getByText("Anna's Tiffins")).toBeOnTheScreen();

    fireEvent.press(screen.getByText("Anna's Tiffins"));
    expect(switchTo).toHaveBeenCalledWith(
      expect.objectContaining({ type: "provider_owner", id: "prov-a" }),
    );
  });
});
