"use client";

import { Field, OptionGroup } from "@/components/onboarding/fields";
import { BUDGET_OPTIONS, type BudgetSection } from "@/lib/onboarding";

/**
 * Step 5 — budget (design/06 § 2). Optional; defaults to `medium` at completion
 * when left unset.
 */
export function BudgetStep({
  value,
  onChange,
}: {
  value: BudgetSection;
  onChange: (patch: Partial<BudgetSection>) => void;
}) {
  return (
    <div className="space-y-5">
      <Field label="Budget preference">
        <OptionGroup
          ariaLabel="Budget preference"
          options={BUDGET_OPTIONS}
          value={value.budgetPreference}
          onChange={(budgetPreference) => onChange({ budgetPreference })}
        />
      </Field>
    </div>
  );
}
