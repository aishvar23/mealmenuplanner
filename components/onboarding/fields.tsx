"use client";

import { X } from "lucide-react";
import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Option } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

/**
 * Reusable form controls for the onboarding wizard (P2-1). Presentational and
 * controlled — each takes a `value` and an `onChange`, holds no draft state of
 * its own, and is styled with the same shadcn base-nova tokens as the `Button`
 * / `Input` primitives.
 */

/** Labeled field wrapper: label (with optional required marker) + hint + control. */
export function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        ) : null}
      </Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const chipBase =
  "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50";
const chipSelected = "border-primary bg-primary text-primary-foreground";
const chipUnselected =
  "border-border bg-background text-foreground hover:bg-muted";

/**
 * Single-select set of pill toggles. Exactly one value is active; clicking the
 * active pill leaves it selected (a required choice can't be un-set by tapping).
 */
export function OptionGroup<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly Option<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex flex-wrap gap-2"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(chipBase, selected ? chipSelected : chipUnselected)}
            title={option.description}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Multi-select set of pill toggles backed by a string array. Clicking a pill
 * adds or removes its value; order follows the option list, not click order.
 */
export function OptionChips<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly Option<T>[];
  value: readonly T[] | undefined;
  onChange: (value: T[]) => void;
  ariaLabel: string;
}) {
  const selectedSet = new Set(value ?? []);
  return (
    <div aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = selectedSet.has(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() =>
              onChange(
                options
                  .map((o) => o.value)
                  .filter((v) =>
                    v === option.value ? !selected : selectedSet.has(v),
                  ),
              )
            }
            className={cn(chipBase, selected ? chipSelected : chipUnselected)}
            title={option.description}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Free-text tag entry backed by a string array: type a value and press Enter
 * (or comma) to add it; each tag has a remove control. Used for allergies and
 * disliked ingredients, which have no fixed vocabulary.
 */
export function TagInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: readonly string[] | undefined;
  onChange: (value: string[]) => void;
  placeholder?: string;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState("");
  const tags = value ?? [];

  function addTag() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    // Case-insensitive de-dupe; keep the existing casing.
    const exists = tags.some((t) => t.toLowerCase() === trimmed.toLowerCase());
    if (!exists) onChange([...tags, trimmed]);
    setDraft("");
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  return (
    <div className="space-y-2">
      <Input
        type="text"
        value={draft}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            addTag();
          }
        }}
        onBlur={addTag}
      />
      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li key={tag}>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-sm">
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  aria-label={`Remove ${tag}`}
                  className="rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Yes/No pill toggle backed by a boolean. */
export function BooleanToggle({
  value,
  onChange,
  ariaLabel,
}: {
  value: boolean | undefined;
  onChange: (value: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex gap-2">
      {[
        { label: "Yes", on: true },
        { label: "No", on: false },
      ].map((choice) => {
        const selected = value === choice.on;
        return (
          <button
            key={choice.label}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(choice.on)}
            className={cn(chipBase, selected ? chipSelected : chipUnselected)}
          >
            {choice.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Integer input that maps the empty string to `undefined` (field unset) rather
 * than `NaN`, so a cleared optional number reads as "not provided" in the draft.
 */
export function NumberInput({
  value,
  onChange,
  id,
  min,
  max,
  placeholder,
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  id?: string;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  const fallbackId = useId();
  return (
    <Input
      id={id ?? fallbackId}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(event) => {
        const raw = event.target.value;
        onChange(raw === "" ? undefined : Number(raw));
      }}
    />
  );
}
