"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  ASSIGNABLE_ROLES,
  GUEST_DURATION_DAYS,
  memberRoleLabel,
  memberStatusLabel,
  membershipTypeLabel,
} from "@/lib/household/labels";
import type {
  CurrentUserPermissionsDto,
  MemberDto,
} from "@/lib/services/household/dto";
import type {
  InviteEmailStatus,
  PendingInviteDto,
} from "@/lib/services/invite/dto";

import * as api from "./household-client";

/**
 * Household members screen (P6-4, design/07 § 8). Shows the active roster and, for
 * a caller with the right permissions, the management affordances: invite (link),
 * change a member's role/permissions, transfer ownership, remove a member, and
 * leave the household. Which controls render is driven by `currentUserPermissions`
 * (the same flags the server re-checks on every mutating call).
 *
 * Mutations re-sync via `router.refresh()` (the page is server-rendered from
 * `listMembers`), so the roster always reflects the authoritative state.
 */
export function HouseholdMembers({
  householdId,
  currentUserId,
  currentUserPermissions,
  members,
  pendingInvites,
}: {
  householdId: string;
  householdName: string;
  currentUserId: string;
  currentUserPermissions: CurrentUserPermissionsDto;
  members: MemberDto[];
  pendingInvites: PendingInviteDto[];
}) {
  const isOwner = currentUserPermissions.role === "owner";

  return (
    <div className="flex flex-col gap-6">
      {currentUserPermissions.canInviteMembers && (
        <InvitePanel householdId={householdId} />
      )}

      {currentUserPermissions.canInviteMembers && pendingInvites.length > 0 && (
        <section>
          <h2 className="font-heading text-xl font-bold tracking-tight">
            Pending invites
          </h2>
          <ul className="mt-3 divide-y rounded-lg border bg-card shadow-xs">
            {pendingInvites.map((invite) => (
              <PendingInviteRow key={invite.inviteId} invite={invite} />
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="font-heading text-xl font-bold tracking-tight">
          Members
        </h2>
        <ul className="mt-3 divide-y rounded-lg border bg-card shadow-xs">
          {members.map((member) => (
            <MemberRow
              key={member.memberId}
              householdId={householdId}
              member={member}
              isSelf={member.userId === currentUserId}
              canManage={currentUserPermissions.canRemoveMembers}
              callerIsOwner={isOwner}
            />
          ))}
        </ul>
      </section>

      {!isOwner && <LeaveSection householdId={householdId} />}
    </div>
  );
}

/** A created-but-not-yet-accepted invite shown to inviters (BUG-012). */
function PendingInviteRow({ invite }: { invite: PendingInviteDto }) {
  const target =
    invite.invitedEmail ?? invite.invitedPhone ?? "Invited contact";
  return (
    <li className="flex flex-col gap-1 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold">{target}</p>
        <p className="text-xs text-muted-foreground">
          {memberRoleLabel(invite.role)} ·{" "}
          {membershipTypeLabel(invite.membershipType)} · Pending · expires{" "}
          {formatDate(invite.expiresAt)}
        </p>
      </div>
      <span className="inline-flex w-fit items-center rounded-full bg-saffron/15 px-2.5 py-0.5 text-xs font-semibold text-saffron-foreground ring-1 ring-saffron/30 ring-inset">
        Awaiting acceptance
      </span>
    </li>
  );
}

function InvitePanel({ householdId }: { householdId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [membershipType, setMembershipType] = useState("permanent");
  const [days, setDays] = useState(7);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<InviteEmailStatus | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setLink(null);
    setEmailStatus(null);
    try {
      const trimmedEmail = email.trim();
      const input: api.CreateInviteInput = {
        email: trimmedEmail,
        role,
        membershipType,
      };
      if (membershipType === "temporary_guest") {
        input.expiresAt = new Date(
          Date.now() + days * 86_400_000,
        ).toISOString();
      }
      const result = await api.createInvite(householdId, input);
      setLink(result.inviteLink);
      setEmailStatus(result.emailStatus);
      setInvitedEmail(trimmedEmail);
      setEmail("");
      // Surface the new invite in the "Pending invites" section immediately.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the invite.");
    } finally {
      setPending(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the link is selectable in the box.
    }
  }

  return (
    <section className="rounded-lg border bg-card p-5 shadow-xs">
      <h2 className="font-heading text-xl font-bold tracking-tight">
        Invite someone
      </h2>
      <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-role">Role</Label>
          <Select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {memberRoleLabel(r)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-type">Access</Label>
          <Select
            id="invite-type"
            value={membershipType}
            onChange={(e) => setMembershipType(e.target.value)}
          >
            <option value="permanent">Permanent member</option>
            <option value="temporary_guest">Temporary guest</option>
          </Select>
        </div>
        {membershipType === "temporary_guest" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-days">Guest access for</Label>
            <Select
              id="invite-days"
              value={String(days)}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              {GUEST_DURATION_DAYS.map((d) => (
                <option key={d} value={d}>
                  {d} day{d > 1 ? "s" : ""}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create invite link"}
          </Button>
        </div>
      </form>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {link && emailStatus === "sent" && (
        <p className="mt-2 text-sm font-medium text-primary">
          Invitation emailed{invitedEmail ? ` to ${invitedEmail}` : ""}. You can
          also share the link below.
        </p>
      )}
      {link && emailStatus === "not_configured" && (
        <p className="mt-2 text-sm text-muted-foreground">
          Email delivery isn&apos;t set up yet, so share the link below
          manually.
        </p>
      )}
      {link && emailStatus === "failed" && (
        <p className="mt-2 text-sm text-destructive">
          We couldn&apos;t send the invitation email — share the link below
          manually.
        </p>
      )}

      {link && (
        <div className="mt-3 rounded-lg border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">
            Share this link — it can be used once and expires.
          </p>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 truncate text-xs">{link}</code>
            <Button type="button" size="sm" variant="outline" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function MemberRow({
  householdId,
  member,
  isSelf,
  canManage,
  callerIsOwner,
}: {
  householdId: string;
  member: MemberDto;
  isSelf: boolean;
  canManage: boolean;
  callerIsOwner: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The owner can't be managed via these controls (transfer instead), and you
  // can't manage yourself here (use Leave).
  const manageable = canManage && !isSelf && member.role !== "owner";
  // Per-member meal-change grants are an owner-only call (BUG-017): the role
  // defaults leave members at `false`, so the owner opts a member in here.
  const canGrantPermissions =
    callerIsOwner && !isSelf && member.role !== "owner";

  async function run(fn: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
      setPending(false);
    }
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">
            {member.displayName ?? (isSelf ? "You" : "Member")}
            {isSelf && member.displayName && (
              <span className="ml-1 text-xs text-muted-foreground">(You)</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {memberRoleLabel(member.role)} ·{" "}
            {membershipTypeLabel(member.membershipType)} ·{" "}
            {memberStatusLabel(member.status)}
            {member.expiresAt
              ? ` · expires ${formatDate(member.expiresAt)}`
              : ""}
          </p>
          {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
        </div>

        {manageable && (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="Change role"
              className="h-8 w-auto"
              value={member.role}
              disabled={pending}
              onChange={(e) =>
                run(() =>
                  api.updateMember(householdId, member.memberId, {
                    role: e.target.value,
                  }),
                )
              }
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {memberRoleLabel(r)}
                </option>
              ))}
            </Select>
            {callerIsOwner && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Make ${member.displayName ?? "this member"} the owner? You'll become an admin.`,
                    )
                  ) {
                    run(() =>
                      api.updateMember(householdId, member.memberId, {
                        role: "owner",
                      }),
                    );
                  }
                }}
              >
                Make owner
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (
                  window.confirm(
                    `Remove ${member.displayName ?? "this member"} from the household?`,
                  )
                ) {
                  run(() => api.removeMember(householdId, member.memberId));
                }
              }}
            >
              Remove
            </Button>
          </div>
        )}
      </div>

      {canGrantPermissions && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md bg-muted/40 px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">
            Can change meals
          </span>
          <PermissionCheckbox
            label="Today's menu"
            checked={member.permissions.canChangeTodayMenu}
            disabled={pending}
            onChange={(next) =>
              run(() =>
                api.updateMember(householdId, member.memberId, {
                  canChangeTodayMenu: next,
                }),
              )
            }
          />
          <PermissionCheckbox
            label="Weekly plan"
            checked={member.permissions.canChangeWeeklySchedule}
            disabled={pending}
            onChange={(next) =>
              run(() =>
                api.updateMember(householdId, member.memberId, {
                  canChangeWeeklySchedule: next,
                }),
              )
            }
          />
        </div>
      )}
    </li>
  );
}

/** A small labelled checkbox for an owner's per-member permission grant (BUG-017). */
function PermissionCheckbox({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs">
      <input
        type="checkbox"
        className="size-4 rounded border-border accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function LeaveSection({ householdId }: { householdId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leave() {
    if (
      !window.confirm(
        "Leave this household? You'll lose access to its plans and grocery lists.",
      )
    ) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.leaveHousehold(householdId);
      router.replace("/today");
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Couldn't leave the household.",
      );
      setPending(false);
    }
  }

  return (
    <section className="rounded-lg border border-destructive/30 bg-card p-5 shadow-xs">
      <h2 className="font-heading text-xl font-bold tracking-tight">
        Leave household
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        You&apos;ll lose access to this household&apos;s plans and grocery
        lists. An owner must transfer ownership before leaving.
      </p>
      <Button
        variant="outline"
        className="mt-3"
        disabled={pending}
        onClick={leave}
      >
        {pending ? "Leaving…" : "Leave household"}
      </Button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </section>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
