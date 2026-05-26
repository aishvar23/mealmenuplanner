"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { AdminApiError, setCombinationStatus } from "./admin-api";

/**
 * Operator review controls for one proposed combination (P10-5): Approve
 * (→ `active`, published to the picker + engine) or Reject (→ `rejected`). On
 * success it refreshes the server-rendered list so the combo leaves the queue.
 */
export function CombinationReviewActions({
  combinationId,
}: {
  combinationId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(status: "active" | "rejected") {
    setBusy(true);
    setError(null);
    try {
      await setCombinationStatus(combinationId, status);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Something went wrong.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => decide("rejected")}
        >
          Reject
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => decide("active")}
        >
          Approve
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
