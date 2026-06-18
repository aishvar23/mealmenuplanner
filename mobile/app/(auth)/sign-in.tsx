import { SignInScreen } from "@/auth/sign-in-screen";

/**
 * Sign-in route (M1-1). The screen itself lives in `src/auth/sign-in-screen.tsx`
 * so Jest (which only matches `src/**`) can unit-test it; this route is a thin
 * re-export, matching the rest of the app's screen convention.
 */
export default function SignIn() {
  return <SignInScreen />;
}
