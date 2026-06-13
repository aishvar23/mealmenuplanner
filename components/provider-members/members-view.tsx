"use client";

import { Check, Copy, Trash2, UserPlus, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MemberDto } from "@/packages/shared/provider";

import { createInvite, listMembers, memberAction } from "./members-client";

/**
 * Owner Members page (MP-B-022, spec §13.4): invite a customer by email/phone,
 * approve/reject the awaiting list, and remove active members. The created invite
 * link is shown once with a copy affordance — the share path when email isn't
 * configured or fails (`emailStatus !== "sent"`).
 */

interface InviteState {
  inviteLink: string;
  emailStatus: "sent" | "failed" | "no_recipient";
}

const STATUS_LABEL: Record<string, string> = {
  awaiting_approval: "Awaiting approval",
  active: "Active",
  rejected: "Rejected",
  removed: "Removed",
  invited: "Invited",
};

function StatusBadge({ status }: { status: MemberDto["status"] }) {
  const tone =
    status === "active"
      ? "bg-emerald-100 text-emerald-800"
      : status === "awaiting_approval"
        ? "bg-amber-100 text-amber-800"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function MembersView({
  providerId,
  initialMembers,
}: {
  providerId: string;
  initialMembers: MemberDto[];
}) {
  const [members, setMembers] = useState<MemberDto[]>(initialMembers);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<InviteState | null>(null);
  const [copied, setCopied] = useState(false);

  const pending = members.filter((m) => m.status === "awaiting_approval");
  const active = members.filter((m) => m.status === "active");

  async function refresh() {
    try {
      setMembers(await listMembers(providerId));
    } catch {
      // Keep the optimistic list; the next action surfaces any real error.
    }
  }

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setInvite(null);
    setCopied(false);
    try {
      const result = await createInvite(providerId, {
        email: email.trim() || null,
        phone: phone.trim() || null,
      });
      setInvite({
        inviteLink: result.inviteLink,
        emailStatus: result.emailStatus,
      });
      setEmail("");
      setPhone("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function onAction(
    memberId: string,
    action: "approve" | "reject" | "remove",
  ) {
    if (actingId) return;
    setActingId(memberId);
    setError(null);
    try {
      const updated = await memberAction(providerId, memberId, action);
      setMembers((list) =>
        list.map((m) => (m.memberId === memberId ? updated : m)),
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setActingId(null);
    }
  }

  async function onCopy() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.inviteLink);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8 lg:px-8">
      <header>
        <h1 className="text-2xl font-semibold">Members</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Invite customers, then approve, reject, or remove them as they join.
        </p>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {/* ── Invite a customer ── */}
      <section className="rounded-lg border p-5">
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <UserPlus className="size-4" aria-hidden /> Invite a customer
        </h2>
        <form onSubmit={onInvite} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="customer@example.com"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-phone">Phone</Label>
              <Input
                id="invite-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 555 0100"
                autoComplete="off"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Provide an email or phone. The invitee accepts the link, then you
            approve them.
          </p>
          <Button type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send invite"}
          </Button>
        </form>

        {invite ? (
          <div className="mt-4 space-y-2 rounded-md border bg-muted/40 p-3">
            <p className="text-sm font-medium">
              {invite.emailStatus === "sent"
                ? "Invite emailed. You can also share the link:"
                : "Invite created. Share this link with the customer:"}
            </p>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={invite.inviteLink}
                aria-label="Invite link"
                className="text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onCopy}
              >
                <Copy className="size-3.5" aria-hidden />
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      {/* ── Awaiting approval ── */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Awaiting approval</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No one is waiting for approval.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {pending.map((m) => (
              <li
                key={m.memberId}
                className="flex items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {m.displayName ?? m.email ?? m.phone ?? "New customer"}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {m.email ?? m.phone ?? ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    onClick={() => onAction(m.memberId, "approve")}
                    disabled={actingId === m.memberId}
                  >
                    <Check className="size-3.5" aria-hidden /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onAction(m.memberId, "reject")}
                    disabled={actingId === m.memberId}
                  >
                    <X className="size-3.5" aria-hidden /> Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Active members ── */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Active members</h2>
        <ul className="divide-y rounded-lg border">
          {active.map((m) => (
            <li
              key={m.memberId}
              className="flex items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {m.displayName ?? m.email ?? m.phone ?? "Member"}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {m.email ?? m.phone ?? ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <StatusBadge status={m.status} />
                {m.role === "owner" ? (
                  <span className="text-xs text-muted-foreground">Owner</span>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onAction(m.memberId, "remove")}
                    disabled={actingId === m.memberId}
                    aria-label={`Remove ${m.displayName ?? "member"}`}
                  >
                    <Trash2 className="size-3.5" aria-hidden /> Remove
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
