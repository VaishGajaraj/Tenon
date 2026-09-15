import { createHash } from "node:crypto";
import type { FactRow, RawWorkbook } from "./schema";

/**
 * Column maps: each source workbook onto the canonical RCM fact schema.
 * No mapper UI in this PR — maps are code.
 */
export const IA_MAP = {
  recordId: "System Key",
  displayId: "Control ID",
  crosswalkId: "GRC Key",
  title: "Control Title",
  description: "Control Description",
  owner: "Owner",
  frequency: "Frequency",
  riskIds: "Risk ID",
  status: "Status",
  tested: "Tested",
  lastReviewedOn: "Last Reviewed",
  sourceModifiedOn: "Source Modified",
  issueId: "Issue ID",
  issueStatus: "Issue Status",
} as const;

export const SOX_MAP = {
  recordId: "Record UUID",
  displayId: "Ctrl#",
  crosswalkId: "GRC Key",
  title: "Name",
  description: "Control Language",
  owner: "Control Owner",
  frequency: "Frequency",
  riskIds: "Risk Ref",
  status: "Active Flag",
  tested: "In Scope Testing",
  lastReviewedOn: "Last Test Date",
  sourceModifiedOn: "File Modified",
  issueId: "Open Issue",
  issueStatus: "Issue State",
} as const;

export type ColumnMap = typeof IA_MAP | typeof SOX_MAP;

const CANONICAL_HASH_FIELDS = [
  "displayId",
  "title",
  "description",
  "owner",
  "frequency",
  "riskIds",
  "status",
  "tested",
  "lastReviewedOn",
  "sourceModifiedOn",
  "issueId",
  "issueStatus",
] as const;

export function rowHashOf(fields: Record<string, unknown>): string {
  const payload = CANONICAL_HASH_FIELDS.map((k) => {
    const v = fields[k];
    return `${k}=${Array.isArray(v) ? v.join(",") : String(v ?? "")}`;
  }).join("|");
  return createHash("sha256").update(payload).digest("hex");
}

function cell(raw: Record<string, string>, header: string): string {
  return (raw[header] ?? "").trim();
}

function parseStatus(raw: string): FactRow["status"] {
  const s = raw.toLowerCase();
  if (s === "withdrawn" || s === "n" || s === "inactive") return "withdrawn";
  if (s === "retired") return "retired";
  return "active";
}

function parseTested(raw: string): boolean {
  const s = raw.toLowerCase();
  return s === "y" || s === "yes" || s === "true" || s === "1";
}

function parseRisks(raw: string): string[] {
  return raw
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Map one source workbook onto the fact table. Row numbers are Excel-style
 * (header = 1, first data row = 2). The import clock is the row hash, not now().
 */
export function ingestWorkbook(book: RawWorkbook, map: ColumnMap): FactRow[] {
  return book.rows.map((raw, i) => {
    const excelRow = i + 2;
    const riskIds = parseRisks(cell(raw, map.riskIds));
    const fields = {
      copy: book.copyName,
      sheet: book.sheet,
      excelRow,
      recordId: cell(raw, map.recordId),
      displayId: cell(raw, map.displayId),
      crosswalkId: cell(raw, map.crosswalkId) || null,
      title: cell(raw, map.title),
      description: cell(raw, map.description),
      owner: cell(raw, map.owner),
      frequency: cell(raw, map.frequency),
      riskIds,
      status: parseStatus(cell(raw, map.status)),
      tested: parseTested(cell(raw, map.tested)),
      lastReviewedOn: cell(raw, map.lastReviewedOn),
      sourceModifiedOn: cell(raw, map.sourceModifiedOn),
      issueId: cell(raw, map.issueId) || null,
      issueStatus: cell(raw, map.issueStatus) || null,
      columns: raw,
    };
    return { ...fields, rowHash: rowHashOf(fields) };
  });
}

export function locator(
  row: FactRow,
  columnHeader: string,
  quote: string | null,
  resolved = true,
  note?: string,
): {
  copy: string;
  sheet: string;
  row: number;
  column: string;
  quote: string | null;
  resolved: boolean;
  note?: string;
} {
  const colIndex = Object.keys(row.columns).indexOf(columnHeader);
  const column = colIndex >= 0 ? excelCol(colIndex) : columnHeader;
  return {
    copy: row.copy,
    sheet: row.sheet,
    row: row.excelRow,
    column,
    quote,
    resolved,
    note,
  };
}

export function missingLocator(
  copy: string,
  sheet: string,
  column: string,
  note: string,
): {
  copy: string;
  sheet: string;
  row: number;
  column: string;
  quote: string | null;
  resolved: boolean;
  note: string;
} {
  return { copy, sheet, row: 1, column, quote: null, resolved: true, note };
}

function excelCol(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
