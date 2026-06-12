"use client";

import { ChefHat, ChevronRight, Store } from "lucide-react";

import {
  useWorkspaceSwitch,
  type WorkspaceOption,
} from "@/components/workspace/workspace-switcher";

/**
 * The `/workspace` chooser's selectable list (MP-B-012). Every row records the
 * active-workspace pointer (`POST /api/workspace/active`) and then navigates to
 * that workspace's home, so the next post-login resolution lands there. Provider
 * rows are now navigable — the shells they point at (MP-B-011/012) exist — which
 * is why the chooser moved from server-rendered links to this client list that
 * shares the account-menu switcher's switch action.
 */
export function WorkspaceChooserList({
  options,
}: {
  options: WorkspaceOption[];
}) {
  const { switchTo, pending } = useWorkspaceSwitch();

  return (
    <ul className="overflow-hidden rounded-xl border bg-background shadow-sm">
      {options.map((option) => {
        const Icon = option.type === "household" ? ChefHat : Store;
        return (
          <li key={`${option.type}:${option.id}`}>
            <button
              type="button"
              disabled={pending}
              onClick={() => switchTo(option)}
              className="flex w-full items-center gap-3 border-b px-4 py-4 text-left last:border-b-0 hover:bg-muted/50 disabled:opacity-60"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {option.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {option.subtitle}
                </span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
