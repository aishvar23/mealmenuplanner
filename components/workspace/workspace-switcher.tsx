"use client";

import { Menu } from "@base-ui/react/menu";
import { Check, ChefHat, Store } from "lucide-react";
import { useState } from "react";

import type { WorkspaceRef } from "@/packages/shared/provider";

/**
 * A single switchable workspace, the serializable shape the server layouts hand
 * to the client switcher. `WorkspaceRef` carries no display name, so the name +
 * subtitle are joined in server-side (`resolveWorkspaceOptions`); `defaultPath` is
 * where switching lands and `isActive` marks the one currently entered.
 */
export interface WorkspaceOption {
  type: WorkspaceRef["type"];
  id: string;
  name: string;
  subtitle: string;
  defaultPath: string;
  isActive: boolean;
}

/**
 * Switch the active workspace, then hard-navigate to its home.
 *
 * `POST /api/workspace/active` persists the pointer (so the next post-login
 * resolution lands here); the full-page navigation — like sign-out — makes every
 * server layout re-resolve membership from scratch, with no stale-workspace
 * window. Returns `pending` so the trigger can disable while the switch is in
 * flight. A failed POST still navigates: the destination's own server guard is
 * the real gate, and the pointer is a convenience, not an authorization.
 */
export function useWorkspaceSwitch() {
  const [pending, setPending] = useState(false);

  async function switchTo(option: WorkspaceOption) {
    if (option.isActive) return;
    setPending(true);
    try {
      await fetch("/api/workspace/active", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: option.type, id: option.id }),
      });
    } catch {
      // The destination re-verifies access server-side; navigate regardless.
    }
    window.location.assign(option.defaultPath);
  }

  return { switchTo, pending };
}

function WorkspaceIcon({ type }: { type: WorkspaceRef["type"] }) {
  const Icon = type === "household" ? ChefHat : Store;
  return <Icon className="size-4" />;
}

/**
 * The "Switch workspace" section rendered inside the account menu (MP-B-012). A
 * fragment of Base UI `Menu.Item`s — it must be a child of a `Menu.Root`, which
 * the account menu provides. Only meaningful when the user belongs to more than
 * one workspace; callers omit it otherwise.
 */
export function WorkspaceSwitcherSection({
  options,
}: {
  options: WorkspaceOption[];
}) {
  const { switchTo, pending } = useWorkspaceSwitch();

  return (
    <>
      <Menu.Separator className="my-1 h-px bg-border" />
      <div className="px-2 py-1.5">
        <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          Switch workspace
        </p>
      </div>
      {options.map((option) => (
        <Menu.Item
          key={`${option.type}:${option.id}`}
          closeOnClick={false}
          disabled={pending || option.isActive}
          onClick={() => switchTo(option)}
          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-foreground outline-none select-none data-highlighted:bg-primary/10 data-highlighted:text-primary data-disabled:cursor-default data-disabled:opacity-100"
        >
          <WorkspaceIcon type={option.type} />
          <span className="min-w-0 flex-1">
            <span className="block truncate">{option.name}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">
              {option.subtitle}
            </span>
          </span>
          {option.isActive ? (
            <Check className="size-4 shrink-0 text-primary" />
          ) : null}
        </Menu.Item>
      ))}
    </>
  );
}
