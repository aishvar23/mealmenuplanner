import {
  formatQuantity,
  providerComponentGroupLabel,
  providerVariantSuffix,
} from "@/packages/shared/provider";
import type { PreparationLine } from "@/packages/shared/provider";

/**
 * The single preparation-roster table, shared by the on-screen detail view
 * (`variant="screen"`, MP-B-050) and the server-rendered print page
 * (`variant="print"`, MP-B-051). Both render the identical six columns — Item,
 * Group, Included, Extra, Total, Unit — in the identical order; only the chrome
 * differs (the print variant adds repeating-header / break-inside-avoid print
 * rules and a paper palette). Keeping it in one place means a column or formatting
 * change moves both surfaces together instead of one silently drifting.
 */

export function lineLabel(line: PreparationLine): string {
  return `${line.itemName}${providerVariantSuffix(line.spiceLevel, line.saltLevel)}`;
}

type RosterVariant = "screen" | "print";

const ROSTER_STYLES: Record<
  RosterVariant,
  {
    table: string;
    headRow: string;
    pad: string;
    thFont: string;
    row: string;
    muted: string;
    empty: string;
  }
> = {
  screen: {
    table: "w-full text-sm",
    headRow: "border-b text-left text-xs text-muted-foreground",
    pad: "py-2",
    thFont: "font-medium",
    row: "border-b",
    muted: "text-muted-foreground",
    empty: "text-sm text-muted-foreground",
  },
  print: {
    table: "w-full border-collapse text-sm",
    headRow:
      "border-b border-gray-400 text-left text-xs tracking-wide text-gray-600 uppercase",
    pad: "py-1.5",
    thFont: "font-semibold",
    row: "break-inside-avoid border-b border-gray-200",
    muted: "text-gray-600",
    empty: "text-sm text-gray-500",
  },
};

export function RosterTable({
  lines,
  variant = "screen",
}: {
  lines: PreparationLine[];
  variant?: RosterVariant;
}) {
  const s = ROSTER_STYLES[variant];
  if (lines.length === 0) {
    return <p className={s.empty}>No items in this batch.</p>;
  }
  const table = (
    <table className={s.table}>
      <thead>
        <tr className={s.headRow}>
          <th className={`${s.pad} pr-3 ${s.thFont}`}>Item</th>
          <th className={`${s.pad} pr-3 ${s.thFont}`}>Group</th>
          <th className={`${s.pad} pr-3 text-right ${s.thFont}`}>Included</th>
          <th className={`${s.pad} pr-3 text-right ${s.thFont}`}>Extra</th>
          <th className={`${s.pad} pr-3 text-right ${s.thFont}`}>Total</th>
          <th className={`${s.pad} ${s.thFont}`}>Unit</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line, i) => (
          <tr key={`${line.catalogItemId}-${i}`} className={s.row}>
            <td className={`${s.pad} pr-3 font-medium`}>{lineLabel(line)}</td>
            <td className={`${s.pad} pr-3 ${s.muted}`}>
              {providerComponentGroupLabel(line.componentGroup)}
            </td>
            <td className={`${s.pad} pr-3 text-right tabular-nums`}>
              {formatQuantity(line.includedQuantity)}
            </td>
            <td className={`${s.pad} pr-3 text-right tabular-nums`}>
              {formatQuantity(line.extraQuantity)}
            </td>
            <td
              className={`${s.pad} pr-3 text-right font-semibold tabular-nums`}
            >
              {formatQuantity(line.totalQuantity)}
            </td>
            <td className={`${s.pad} ${s.muted}`}>{line.canonicalUnit}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return variant === "screen" ? (
    <div className="overflow-x-auto">{table}</div>
  ) : (
    table
  );
}
