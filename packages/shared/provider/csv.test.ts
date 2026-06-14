import { describe, expect, it } from "vitest";

import {
  CSV_BOM,
  escapeCsvCell,
  formatQuantity,
  renderAggregateCsv,
  renderIndividualCsv,
} from "./csv";
import type { BatchDto, PreparationLine } from "./dtos";
import { currentBatch } from "./fixtures";

/** Strip the BOM and split into records (renderers end every record with CRLF). */
function records(csv: string): string[] {
  expect(csv.startsWith(CSV_BOM)).toBe(true);
  return csv
    .slice(CSV_BOM.length)
    .split("\r\n")
    .filter((line) => line.length > 0);
}

function line(overrides: Partial<PreparationLine>): PreparationLine {
  return {
    catalogItemId: "cat-1",
    itemName: "Rajma",
    componentGroup: "dal_or_legume",
    spiceLevel: null,
    saltLevel: null,
    includedQuantity: 1,
    extraQuantity: 0,
    totalQuantity: 1,
    canonicalUnit: "oz",
    ...overrides,
  };
}

describe("escapeCsvCell", () => {
  it("leaves a plain value untouched", () => {
    expect(escapeCsvCell("Rajma")).toBe("Rajma");
  });

  it("RFC-4180 quotes commas, quotes, and newlines, doubling internal quotes", () => {
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell('a"b')).toBe('"a""b"');
    expect(escapeCsvCell("a\nb")).toBe('"a\nb"');
    expect(escapeCsvCell("a\r\nb")).toBe('"a\r\nb"');
  });

  it("neutralises formula lead-ins (= + - @ tab CR) with a leading quote", () => {
    expect(escapeCsvCell("=1+1")).toBe("'=1+1");
    expect(escapeCsvCell("+1")).toBe("'+1");
    expect(escapeCsvCell("-1")).toBe("'-1");
    expect(escapeCsvCell("@SUM")).toBe("'@SUM");
    expect(escapeCsvCell("\t=x")).toBe("'\t=x");
  });

  it("quotes a formula cell that also contains a delimiter", () => {
    // Guarded ('=) then RFC-4180-quoted because of the comma.
    expect(escapeCsvCell("=cmd(),x")).toBe('"\'=cmd(),x"');
  });
});

describe("formatQuantity", () => {
  it("trims trailing zeros from the numeric(10,3) scale", () => {
    expect(formatQuantity(32)).toBe("32");
    expect(formatQuantity(24.5)).toBe("24.5");
    expect(formatQuantity(0.25)).toBe("0.25");
    expect(formatQuantity(1.2)).toBe("1.2");
  });
});

describe("renderAggregateCsv", () => {
  it("emits the contract header in order with a BOM and CRLF records", () => {
    const csv = renderAggregateCsv(currentBatch.aggregateLines);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    const rows = records(csv);
    expect(rows[0]).toBe(
      "component_group,item_name,spice_level,salt_level,included_quantity,extra_quantity,total_quantity,canonical_unit",
    );
    // One row per aggregate line (3 in the fixture).
    expect(rows).toHaveLength(1 + currentBatch.aggregateLines.length);
  });

  it("sorts deterministically (component group, item name, …) regardless of input order", () => {
    const a = renderAggregateCsv(currentBatch.aggregateLines);
    const b = renderAggregateCsv([...currentBatch.aggregateLines].reverse());
    expect(a).toBe(b);
  });

  it("renders null spice/salt as empty cells and splits included/extra/total", () => {
    const csv = renderAggregateCsv([
      line({
        itemName: "Chana",
        spiceLevel: "spicy",
        saltLevel: "low_salt",
        includedQuantity: 16,
        extraQuantity: 8,
        totalQuantity: 24,
      }),
      line({
        itemName: "Roti",
        componentGroup: "bread",
        canonicalUnit: "piece",
      }),
    ]);
    const rows = records(csv);
    expect(rows).toContain("dal_or_legume,Chana,spicy,low_salt,16,8,24,oz");
    expect(rows).toContain("bread,Roti,,,1,0,1,piece");
  });
});

describe("renderIndividualCsv", () => {
  it("emits the contract header and one row per included/extra portion", () => {
    const individuals: BatchDto["individualLines"] = [
      {
        memberUserId: "u-1",
        displayName: "Zara",
        lines: [
          line({
            itemName: "Chana",
            includedQuantity: 16,
            extraQuantity: 8,
            totalQuantity: 24,
          }),
        ],
      },
      {
        memberUserId: "u-2",
        displayName: "Adam",
        lines: [line({ includedQuantity: 16, totalQuantity: 16 })],
      },
    ];
    const rows = records(renderIndividualCsv(individuals));
    expect(rows[0]).toBe(
      "member_name,component_group,item_name,spice_level,salt_level,quantity,canonical_unit,is_extra",
    );
    // Members sorted by display name: Adam before Zara.
    expect(rows[1]).toBe("Adam,dal_or_legume,Rajma,,,16,oz,false");
    // Zara's single line splits into an included row + an extra row.
    expect(rows[2]).toBe("Zara,dal_or_legume,Chana,,,16,oz,false");
    expect(rows[3]).toBe("Zara,dal_or_legume,Chana,,,8,oz,true");
    expect(rows).toHaveLength(4);
  });

  it("renders a null display name as an empty member cell", () => {
    const rows = records(
      renderIndividualCsv([
        { memberUserId: "u-x", displayName: null, lines: [line({})] },
      ]),
    );
    expect(rows[1]).toBe(",dal_or_legume,Rajma,,,1,oz,false");
  });

  it("reconciles with the aggregate: summed per-member portions equal the aggregate", () => {
    // Fold every individual line back to the aggregation key and sum; it must
    // match the persisted aggregate the export's other half renders.
    const keyOf = (l: PreparationLine) =>
      `${l.catalogItemId}|${l.canonicalUnit}|${l.spiceLevel ?? ""}|${l.saltLevel ?? ""}`;
    const summed = new Map<string, { included: number; extra: number }>();
    for (const member of currentBatch.individualLines) {
      for (const l of member.lines) {
        const acc = summed.get(keyOf(l)) ?? { included: 0, extra: 0 };
        acc.included += l.includedQuantity;
        acc.extra += l.extraQuantity;
        summed.set(keyOf(l), acc);
      }
    }
    for (const agg of currentBatch.aggregateLines) {
      const got = summed.get(keyOf(agg));
      expect(got).toBeDefined();
      expect(got!.included).toBe(agg.includedQuantity);
      expect(got!.extra).toBe(agg.extraQuantity);
    }
  });
});
