"use client";

import { Toaster as SonnerToaster } from "sonner";

/**
 * App-wide toast host (Sonner), themed to the Forest & Ember tokens. Mounted
 * once in the root layout. Top-centre suits the mobile-first shell (the bottom
 * tab bar owns the bottom edge). Success/error icons pick up the brand and
 * destructive colours; `font-sans` keeps copy on Geist (toasts aren't headings).
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      toastOptions={{
        classNames: {
          toast:
            "group font-sans rounded-xl border border-border bg-card text-card-foreground shadow-lg",
          title: "text-sm font-semibold",
          description: "text-sm text-muted-foreground",
          actionButton:
            "rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground",
          cancelButton:
            "rounded-lg bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground",
          success: "[&_[data-icon]]:text-primary",
          error: "[&_[data-icon]]:text-destructive",
          warning: "[&_[data-icon]]:text-saffron",
        },
      }}
    />
  );
}
