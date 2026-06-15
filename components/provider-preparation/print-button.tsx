"use client";

import { Printer } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

/**
 * The print trigger for the server-rendered preparation print page (MP-B-051). The
 * only interactive control on the page — and it is hidden in print media
 * (`print:hidden`) so the printed roster carries no controls (UC-BATCH-005, § 17).
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={
        buttonVariants({ variant: "default", size: "sm" }) + " print:hidden"
      }
    >
      <Printer className="size-4" /> Print
    </button>
  );
}
