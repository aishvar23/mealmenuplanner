import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";

import { sendMagicLink, signInWithEmail } from "@/auth/actions";
import { signInWithGoogle } from "@/auth/oauth";

import { SignInScreen } from "./sign-in-screen";

// The screen talks to Supabase through the auth action/oauth seams; mock them so
// the unit test asserts the dual-audience framing (ADO #86) and that the SHARED
// form still drives the same auth, without a real network round-trip. Mirrors the
// web two-panel sign-in (auth.spec AUTH-008).
jest.mock("@/auth/actions", () => ({
  signInWithEmail: jest.fn(),
  signUpWithEmail: jest.fn(),
  sendMagicLink: jest.fn(),
}));
jest.mock("@/auth/oauth", () => ({ signInWithGoogle: jest.fn() }));

const mockSignInWithEmail = jest.mocked(signInWithEmail);
const mockSendMagicLink = jest.mocked(sendMagicLink);
const mockGoogle = jest.mocked(signInWithGoogle);

beforeEach(() => {
  mockSignInWithEmail
    .mockReset()
    .mockResolvedValue({ ok: true, needsEmailConfirmation: false });
  mockSendMagicLink
    .mockReset()
    .mockResolvedValue({ ok: true, needsEmailConfirmation: true });
  mockGoogle
    .mockReset()
    .mockResolvedValue({ ok: true, needsEmailConfirmation: false });
});

describe("SignInScreen", () => {
  it("frames the same account for both households and meal providers", () => {
    render(<SignInScreen />);

    expect(screen.getByText("For households")).toBeOnTheScreen();
    expect(screen.getByText("For meal providers")).toBeOnTheScreen();
    // Provider audiences are guided to the workspace after the shared sign-in.
    expect(
      screen.getByText(/open or set up your provider workspace/i),
    ).toBeOnTheScreen();
  });

  it("drives the shared Supabase auth from the single email/password form", async () => {
    render(<SignInScreen />);

    fireEvent.changeText(
      screen.getByPlaceholderText("you@example.com"),
      "owner@example.com",
    );
    fireEvent.changeText(
      screen.getByPlaceholderText("••••••••"),
      "supersecret",
    );
    fireEvent.press(screen.getByText("Sign in"));

    await waitFor(() =>
      expect(mockSignInWithEmail).toHaveBeenCalledWith(
        "owner@example.com",
        "supersecret",
      ),
    );
  });

  it("validates the email before calling the auth backend", () => {
    render(<SignInScreen />);

    fireEvent.changeText(
      screen.getByPlaceholderText("you@example.com"),
      "not-an-email",
    );
    fireEvent.changeText(
      screen.getByPlaceholderText("••••••••"),
      "supersecret",
    );
    fireEvent.press(screen.getByText("Sign in"));

    expect(mockSignInWithEmail).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a valid email address.")).toBeOnTheScreen();
  });
});
