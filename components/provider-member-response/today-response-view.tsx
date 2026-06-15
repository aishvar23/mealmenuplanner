"use client";

import { CheckCircle2, Clock, Lock } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  componentChoices,
  cutoffRemainingMs,
  DEFAULT_INCREMENT_MAX,
  formatCountdown,
  initialFormState,
  isResponseLocked,
  isResponseReadOnly,
  providerComponentGroupLabel,
  PROVIDER_RESPONSE_STATUS_BADGE_VARIANT,
  PROVIDER_RESPONSE_STATUS_LABELS,
  PROVIDER_SALT_OPTIONS,
  PROVIDER_SPICE_OPTIONS,
  selectChoice,
  selectSingle,
  setIncrement,
  setSaltLevel,
  setSpiceLevel,
  toggleMulti,
  toSaveRequest,
  type ComponentSelection,
  type ResponseFormState,
} from "@/packages/shared/provider";
import type {
  CustomizationGroupDto,
  MemberResponseDto,
  MenuComponentDto,
  MenuDayDto,
} from "@/packages/shared/provider";

import {
  cancelResponse,
  confirmResponse,
  getMyResponse,
  saveMyResponse,
  StaleResponseError,
} from "./response-client";

/** setTimeout's max 32-bit delay (~24.8 days); longer delays overflow and fire at once. */
const MAX_TIMER_DELAY_MS = 2_147_483_647;

/**
 * Member Today's Menu + response (MP-B-040 read-only display fused with MP-B-041
 * interactive response, spec §14.2/§14.3). Renders the day's components — default
 * package, alternatives, spice/salt, and customization extras — and lets an
 * approved member confirm / update / cancel before the cutoff. After the cutoff
 * (or once the menu/response locks) everything is read-only with a clear badge,
 * since changes happen outside the app then (BR-001).
 *
 * The server is authoritative: `saveMyResponse` derives quantities and re-validates
 * every selection (MP-A-130), and a stale optimistic-concurrency save reloads the
 * authoritative response (UC-RESPONSE-008). Lock state is computed deterministically
 * (`isResponseLocked`) so SSR and the client agree; only the live cutoff *countdown*
 * uses the clock, after mount, to avoid a hydration mismatch.
 */
export function TodayResponseView({
  providerName,
  menu,
  initialResponse,
}: {
  providerName: string;
  menu: MenuDayDto;
  initialResponse: MemberResponseDto;
}) {
  const [response, setResponse] = useState<MemberResponseDto>(initialResponse);
  const [form, setForm] = useState<ResponseFormState>(() =>
    initialFormState(menu, initialResponse),
  );
  const [memberNote, setMemberNote] = useState(
    initialResponse.memberNote ?? "",
  );
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Read-only flips once at the cutoff via a single timer (not a per-second clock), so
  // the form subtree doesn't re-render every second — only the <Countdown/> does. Lock
  // state is clock-free and matches SSR; `cutoffReached` starts false (same on server +
  // first client render) and the timer flips it after mount, so no hydration mismatch.
  const lockedByState = isResponseLocked(menu, response);
  const [cutoffReached, setCutoffReached] = useState(false);
  useEffect(() => {
    if (lockedByState) return;
    // One timer that fires at the cutoff (re-armed in ≤24.8d hops so a far-future
    // cutoff doesn't overflow setTimeout's 32-bit delay and fire immediately). Starts
    // false so SSR and the first client render agree; the timer flips it after mount.
    let id: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const remaining = cutoffRemainingMs(menu, new Date());
      if (remaining <= 0) {
        setCutoffReached(true);
        return;
      }
      id = setTimeout(schedule, Math.min(remaining, MAX_TIMER_DELAY_MS));
    };
    schedule();
    return () => clearTimeout(id);
  }, [menu, lockedByState]);

  const readOnly = lockedByState || cutoffReached;

  /**
   * Re-check read-only with a fresh clock before any mutation. In the window before the
   * cutoff timer fires (e.g. SSR rendered the form open for a menu whose cutoff has just
   * passed but hasn't locked yet), `readOnly` can lag the real cutoff, so guard the
   * action itself — not just the disabled state of the buttons.
   */
  function ensureOpen(): boolean {
    if (isResponseReadOnly(menu, response, new Date())) {
      setError("Responses are closed for today.");
      return false;
    }
    return true;
  }

  function edit(next: ResponseFormState) {
    setForm(next);
    setDirty(true);
    setNotice(null);
  }

  /** Reset the working form + note from an authoritative response. */
  function adopt(updated: MemberResponseDto) {
    setResponse(updated);
    setForm(initialFormState(menu, updated));
    setMemberNote(updated.memberNote ?? "");
    setDirty(false);
  }

  const noteDirty = (response.memberNote ?? "") !== memberNote;
  const canSave = !readOnly && (dirty || noteDirty);

  /** Save the working form, returning the authoritative response (or null on error). */
  async function save(): Promise<MemberResponseDto | null> {
    const expectedVersion = response.responseId ? response.version : null;
    try {
      const updated = await saveMyResponse(
        menu.menuDayId,
        toSaveRequest(menu, form, expectedVersion, memberNote),
      );
      adopt(updated);
      return updated;
    } catch (err) {
      if (err instanceof StaleResponseError) {
        const fresh = await getMyResponse(menu.menuDayId);
        adopt(fresh);
        setError(
          "Your response changed in another place, so we reloaded it. Review and try again.",
        );
        return null;
      }
      setError(err instanceof Error ? err.message : "Something went wrong.");
      return null;
    }
  }

  async function onSaveDraft() {
    if (busy || !canSave) return;
    if (!ensureOpen()) return;
    setBusy(true);
    setError(null);
    const updated = await save();
    if (updated) setNotice("Saved.");
    setBusy(false);
  }

  async function onConfirm() {
    if (busy) return;
    if (!ensureOpen()) return;
    setBusy(true);
    setError(null);
    try {
      // Confirm needs a persisted response; a new/edited/cancelled one is saved
      // first (a save revives a cancelled response to draft — UC-RESPONSE-006).
      let current = response;
      if (canSave || !response.responseId || response.status === "cancelled") {
        const saved = await save();
        if (!saved) {
          setBusy(false);
          return;
        }
        current = saved;
      }
      if (current.responseId) {
        const confirmed = await confirmResponse(current.responseId);
        adopt(confirmed);
        setNotice("Order confirmed.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function onCancel() {
    if (busy || !response.responseId) return;
    if (!ensureOpen()) return;
    setBusy(true);
    setError(null);
    try {
      const cancelled = await cancelResponse(response.responseId);
      adopt(cancelled);
      setNotice("Order cancelled.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const canCancel =
    !readOnly &&
    response.responseId !== null &&
    (response.status === "draft" || response.status === "confirmed");

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 lg:px-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">Today&rsquo;s menu</h1>
          <Badge
            variant={PROVIDER_RESPONSE_STATUS_BADGE_VARIANT[response.status]}
          >
            {PROVIDER_RESPONSE_STATUS_LABELS[response.status]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {providerName} · {menu.menuDate}
        </p>
        <div className="flex items-center gap-2 text-sm">
          <Clock className="size-4 text-muted-foreground" aria-hidden />
          {readOnly ? (
            <span className="font-medium text-muted-foreground">
              Responses are closed for today.
            </span>
          ) : (
            <Countdown menu={menu} />
          )}
        </div>
        {menu.note ? (
          <p className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            {menu.note}
          </p>
        ) : null}
      </header>

      {readOnly ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
        >
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          This menu is locked. To change your order now, contact {
            providerName
          }{" "}
          outside the app.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary"
        >
          <CheckCircle2 className="size-4" aria-hidden /> {notice}
        </p>
      ) : null}

      <div className="space-y-4">
        {menu.components.map((component) => {
          const selection = form[component.menuComponentId];
          if (!selection) return null;
          return (
            <ComponentCard
              key={component.menuComponentId}
              component={component}
              selection={selection}
              readOnly={readOnly}
              onSelectChoice={(catalogItemId) =>
                edit(selectChoice(form, component, catalogItemId))
              }
              onSpice={(level) =>
                edit(setSpiceLevel(form, component.menuComponentId, level))
              }
              onSalt={(level) =>
                edit(setSaltLevel(form, component.menuComponentId, level))
              }
              onSingle={(groupOptionIds, optionId) =>
                edit(
                  selectSingle(
                    form,
                    component.menuComponentId,
                    groupOptionIds,
                    optionId,
                  ),
                )
              }
              onMulti={(groupOptionIds, optionId, max) =>
                edit(
                  toggleMulti(
                    form,
                    component.menuComponentId,
                    groupOptionIds,
                    optionId,
                    max,
                  ),
                )
              }
              onIncrement={(optionId, quantity) =>
                edit(
                  setIncrement(
                    form,
                    component.menuComponentId,
                    optionId,
                    quantity,
                  ),
                )
              }
            />
          );
        })}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="member-note" className="text-sm font-medium">
          Note for {providerName} (optional)
        </label>
        <Textarea
          id="member-note"
          value={memberNote}
          onChange={(e) => {
            setMemberNote(e.target.value);
            setNotice(null);
          }}
          disabled={readOnly}
          rows={2}
          placeholder="Any preferences for today?"
        />
      </div>

      {!readOnly ? (
        <div className="flex flex-wrap gap-3">
          {response.status === "confirmed" ? (
            <Button onClick={onSaveDraft} disabled={busy || !canSave}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
          ) : (
            <>
              <Button onClick={onConfirm} disabled={busy}>
                {busy ? "Working…" : "Confirm order"}
              </Button>
              <Button
                variant="outline"
                onClick={onSaveDraft}
                disabled={busy || !canSave}
              >
                Save draft
              </Button>
            </>
          )}
          {canCancel ? (
            <Button variant="destructive" onClick={onCancel} disabled={busy}>
              Cancel order
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** The live cutoff countdown — its own 1s clock so only this text re-renders each tick. */
function Countdown({ menu }: { menu: MenuDayDto }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // Deferred first tick (not synchronous) so the first client render still matches
    // SSR's "—" before the countdown starts moving — no hydration mismatch.
    const tick = () => setNow(new Date());
    const initial = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(initial);
      clearInterval(id);
    };
  }, []);
  const remaining = now ? formatCountdown(cutoffRemainingMs(menu, now)) : null;
  return (
    <span data-testid="cutoff-countdown">
      Closes in <span className="font-medium">{remaining ?? "—"}</span>
    </span>
  );
}

/** One menu component: choice picker + spice/salt + customizations (or read-only). */
function ComponentCard({
  component,
  selection,
  readOnly,
  onSelectChoice,
  onSpice,
  onSalt,
  onSingle,
  onMulti,
  onIncrement,
}: {
  component: MenuComponentDto;
  selection: ComponentSelection;
  readOnly: boolean;
  onSelectChoice: (catalogItemId: string) => void;
  onSpice: (level: ComponentSelection["spiceLevel"]) => void;
  onSalt: (level: ComponentSelection["saltLevel"]) => void;
  onSingle: (groupOptionIds: string[], optionId: string) => void;
  onMulti: (
    groupOptionIds: string[],
    optionId: string,
    max: number | null,
  ) => void;
  onIncrement: (optionId: string, quantity: number) => void;
}) {
  const choices = componentChoices(component);
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-medium">
          {providerComponentGroupLabel(component.componentGroup)}
        </h2>
        {component.isRequired ? (
          <span className="text-xs text-muted-foreground">Required</span>
        ) : null}
      </div>

      {/* Choice picker (default + alternatives), labelled by dish name (ADO #39).
          One option = nothing to switch. */}
      {choices.length > 1 ? (
        <div role="radiogroup" className="flex flex-wrap gap-2">
          {choices.map((choice) => {
            const active =
              selection.selectedCatalogItemId === choice.catalogItemId;
            return (
              <button
                key={choice.catalogItemId}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={readOnly}
                onClick={() => onSelectChoice(choice.catalogItemId)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-60 ${
                  active
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "border-border bg-card hover:border-primary/30"
                }`}
              >
                {choice.itemName} · {choice.quantity} {choice.canonicalUnit}
                {choice.isDefault ? (
                  <span className="ml-1 text-xs text-muted-foreground">
                    Default
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {choices[0]!.itemName} · {choices[0]!.quantity}{" "}
          {choices[0]!.canonicalUnit}
        </p>
      )}

      {component.supportsSpiceLevel ? (
        <LevelPicker
          label="Spice"
          options={PROVIDER_SPICE_OPTIONS}
          value={selection.spiceLevel}
          readOnly={readOnly}
          onChange={onSpice}
        />
      ) : null}
      {component.supportsSaltLevel ? (
        <LevelPicker
          label="Salt"
          options={PROVIDER_SALT_OPTIONS}
          value={selection.saltLevel}
          readOnly={readOnly}
          onChange={onSalt}
        />
      ) : null}

      {component.customizationGroups.map((group) => (
        <CustomizationGroup
          key={group.customizationGroupId}
          group={group}
          selection={selection}
          readOnly={readOnly}
          onSingle={onSingle}
          onMulti={onMulti}
          onIncrement={onIncrement}
        />
      ))}
    </section>
  );
}

/** A spice/salt level chip row (deselectable). */
function LevelPicker<T extends string>({
  label,
  options,
  value,
  readOnly,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  readOnly: boolean;
  onChange: (next: T | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              disabled={readOnly}
              onClick={() => onChange(active ? null : opt.value)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-60 ${
                active
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border bg-card hover:border-primary/30"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Render one customization group by its type. `text_note` groups are display-only. */
function CustomizationGroup({
  group,
  selection,
  readOnly,
  onSingle,
  onMulti,
  onIncrement,
}: {
  group: CustomizationGroupDto;
  selection: ComponentSelection;
  readOnly: boolean;
  onSingle: (groupOptionIds: string[], optionId: string) => void;
  onMulti: (
    groupOptionIds: string[],
    optionId: string,
    max: number | null,
  ) => void;
  onIncrement: (optionId: string, quantity: number) => void;
}) {
  const optionIds = group.options.map((o) => o.optionId);
  const isSelected = (optionId: string) =>
    selection.customizations.some((c) => c.optionId === optionId);

  return (
    <div className="space-y-1.5 rounded-md bg-muted/30 p-3">
      <p className="text-xs font-medium">
        {group.name}
        {group.isRequired ? " *" : ""}
        {!group.includedInPrice ? (
          <span className="ml-1 text-muted-foreground">(extra)</span>
        ) : null}
      </p>
      <div className="flex flex-col gap-2">
        {group.options.map((option) => {
          const priceLabel = option.externalPriceLabel
            ? ` ${option.externalPriceLabel}`
            : "";
          if (group.customizationType === "quantity_increment") {
            const qty = selection.customizations.find(
              (c) => c.optionId === option.optionId,
            )?.quantity;
            const max = option.maximumQuantity ?? DEFAULT_INCREMENT_MAX;
            const current = qty ?? 0;
            return (
              <div
                key={option.optionId}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span>
                  {option.label}
                  {priceLabel ? (
                    <span className="text-muted-foreground">{priceLabel}</span>
                  ) : null}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Decrease ${option.label}`}
                    disabled={readOnly || current <= 0}
                    onClick={() =>
                      onIncrement(option.optionId, Math.max(0, current - 1))
                    }
                  >
                    −
                  </Button>
                  <span className="w-5 text-center tabular-nums">
                    {current}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Increase ${option.label}`}
                    disabled={readOnly || current >= max}
                    onClick={() =>
                      onIncrement(option.optionId, Math.min(max, current + 1))
                    }
                  >
                    +
                  </Button>
                </div>
              </div>
            );
          }
          if (group.customizationType === "text_note") {
            return (
              <p
                key={option.optionId}
                className="text-xs text-muted-foreground"
              >
                {option.label}
              </p>
            );
          }
          // single_select / boolean / multi_select — toggle chips.
          const multi = group.customizationType === "multi_select";
          const active = isSelected(option.optionId);
          return (
            <button
              key={option.optionId}
              type="button"
              role={multi ? "checkbox" : "radio"}
              aria-checked={active}
              disabled={readOnly}
              onClick={() =>
                multi
                  ? onMulti(optionIds, option.optionId, group.maximumSelections)
                  : onSingle(optionIds, option.optionId)
              }
              className={`flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-left text-sm transition-colors disabled:opacity-60 ${
                active
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border bg-card hover:border-primary/30"
              }`}
            >
              <span>{option.label}</span>
              {priceLabel ? (
                <span className="text-xs text-muted-foreground">
                  {priceLabel}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
