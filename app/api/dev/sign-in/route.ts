import { NextResponse } from "next/server";

import {
  getDevLoginCredentials,
  isDevLoginEnabled,
} from "@/lib/auth/dev-login";
import { createServerSupabaseClient } from "@/lib/db/server";
import { createServiceRoleClient } from "@/lib/db/service-role";

// Reads/sets the session cookie; never statically cached.
export const dynamic = "force-dynamic";

/**
 * `POST /api/dev/sign-in` — local-only quick sign-in (design note in
 * `lib/auth/dev-login.ts`).
 *
 * Disabled outside `next dev`: when {@link isDevLoginEnabled} is false (always so
 * in a production build) the route 404s, so it's indistinguishable from a route
 * that doesn't exist. When enabled it (1) idempotently provisions a confirmed
 * test user via the service-role client, then (2) signs in with that account
 * through the per-request RLS client, which writes the real auth cookies onto
 * this response — exactly the same session a normal password sign-in produces,
 * so onboarding autosave/completion and every RLS-backed flow then work.
 */
export async function POST(): Promise<Response> {
  if (!isDevLoginEnabled()) {
    return new NextResponse(null, { status: 404 });
  }

  const { email, password } = getDevLoginCredentials();

  // Idempotently ensure the test account exists and is confirmed (so it can sign
  // in without an email round-trip). A repeat run reports the email already
  // exists, which is the success path here.
  const admin = createServiceRoleClient();
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError && !isAlreadyRegisteredError(createError)) {
    return NextResponse.json(
      { error: "Could not provision the dev test user." },
      { status: 500 },
    );
  }

  // Sign in via the per-request (anon) client so the session cookies land on the
  // response, exactly as the normal password flow does.
  const supabase = await createServerSupabaseClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) {
    return NextResponse.json({ error: "Dev sign-in failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/** Distinguish "the test account already exists" (fine) from a real failure. */
function isAlreadyRegisteredError(error: {
  code?: string;
  status?: number;
  message?: string;
}): boolean {
  return (
    error.code === "email_exists" ||
    error.status === 422 ||
    /already.*registered|already been registered|already exists/i.test(
      error.message ?? "",
    )
  );
}
