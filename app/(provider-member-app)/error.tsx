"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Error boundary for the member-facing provider pages (Today's Menu, Your response).
 * These pages fetch the published menu + the caller's response server-side
 * (`getTodayMenu`/`getMyResponse`), so a transient read failure now has a real path
 * here — without this boundary it would surface as the framework's default error
 * screen. Renders a friendly retry instead and lets the member recover in place.
 */
export default function ProviderMemberError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Provider member page error:", error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 lg:px-8">
      <EmptyState
        icon={TriangleAlert}
        title="Something went wrong"
        description="We couldn't load this page just now. Please try again in a moment."
        action={<Button onClick={reset}>Try again</Button>}
      />
    </div>
  );
}
