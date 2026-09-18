import { createHash } from "node:crypto";
import type { FactRow, QuarantinedRow, RawWorkbook } from "./schema";

/**
 * Column maps: each source workbook onto the canonical RCM fact schema.
 * No mapper UI — maps are code. Reviewers pick a preset or we auto-detect
 * from headers. See docs/PRESET-COLUMN-MAPS.md for public-source column names.
 */
export const CANONICAL_FIELDS = [
  "recordId",
  "displayId",
  "crosswalkId",
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
export type CanonicalField = (typeof CANONICAL_FIELDS)[number];
export type ColumnMap = Record<CanonicalField, string>;

export const IA_MAP: ColumnMap = {
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
};

export const SOX_MAP: ColumnMap = {
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
};

/** Generic spreadsheet RCM (FloQast-style Excel templates + common IA exports). */
export const GENERIC_RCM_MAP: ColumnMap = {
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
};

/**
 * AuditBoard-ish export columns documented from public sources — not an official
 * AuditBoard schema and not an API connector. Headers collected from:
 * - Agency Insights AuditBoard implementation guide (Control ID, Control title,
 *   Control description, Control frequency, Control owner)
 * - Public community Excel-import thread (Control_ID, Status)
 * - Unofficial public API examples (name, frequency, lastTestedAt, designStatus)
 *
 * No mapper UI: if a bank's export uses different labels, rename columns to a
 * preset or use the generic map. Live AuditBoard ingest is out of scope.
 */
export const AUDITBOARDISH_MAP: ColumnMap = {
  recordId: "Unique ID",
  displayId: "Control ID",
  crosswalkId: "Framework Mapping",
  title: "Control Title",
  description: "Control Description",
  owner: "Control Owner",
  frequency: "Control Frequency",
  riskIds: "Associated Risks",
  status: "Control Status",
  tested: "Testing Status",
  lastReviewedOn: "Last Test Date",
  sourceModifiedOn: "Last Updated",
  issueId: "Issue ID",
  issueStatus: "Issue Status",
};

export const PRESET_MAPS = {
  ia: IA_MAP,
  sox: SOX_MAP,
  generic: GENERIC_RCM_MAP,
  auditboardish: AUDITBOARDISH_MAP,
} as const;
export type PresetMapName = keyof typeof PRESET_MAPS;

const FIELD_ALIASES: Record<CanonicalField, string[]> = {
  recordId: ["System Key", "Record UUID", "Unique ID", "Record ID", "Control_ID_System"],
  displayId: ["Control ID", "Ctrl#", "Control Code", "Control_ID", "Control Number"],
  crosswalkId: ["GRC Key", "Framework Mapping", "Crosswalk"],
  title: ["Control Title", "Name", "Control Name", "Control title"],
  description: ["Control Description", "Control Language", "Control description", "Objective"],
  owner: ["Owner", "Control Owner", "Control owner"],
  frequency: ["Frequency", "Control Frequency", "Control frequency", "Operating Frequency"],
  riskIds: ["Risk ID", "Risk Ref", "Associated Risks", "Risk"],
  status: ["Status", "Active Flag", "Control Status", "Design Status"],
  tested: ["Tested", "In Scope Testing", "Testing Status"],
  lastReviewedOn: ["Last Reviewed", "Last Test Date", "Last Tested Date", "Last Tested"],
  sourceModifiedOn: ["Source Modified", "File Modified", "Last Updated", "Updated At"],
  issueId: ["Issue ID", "Open Issue"],
  issueStatus: ["Issue Status", "Issue State"],
};

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

export function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[_#]+/g, " ").replace(/\s+/g, " ").trim();
}

function headerLookup(raw: Record<string, string>): Map<string, string> {
  const m = new Map<string, string>();
  for (const [k, v] of Object.entries(raw)) m.set(normalizeHeader(k), v);
  return m;
}

function cellFrom(raw: Record<string, string>, candidates: string[]): string {
  const lookup = headerLookup(raw);
  if (raw[candidates[0]] != null && String(raw[candidates[0]]).trim() !== "") {
    return String(raw[candidates[0]]).trim();
  }
  for (const c of candidates) {
    const hit = lookup.get(normalizeHeader(c));
    if (hit != null && String(hit).trim() !== "") return String(hit).trim();
  }
  return "";
}

function parseStatus(raw: string): FactRow["status"] {
  const s = raw.toLowerCase();
  if (s === "withdrawn" || s === "n" || s === "inactive" || s === "ineffective") return "withdrawn";
  if (s === "retired") return "retired";
  return "active";
}

function parseTested(raw: string): boolean {
  const s = raw.toLowerCase();
  if (!s) return false;
  if (s === "n" || s === "no" || s === "false" || s === "0" || s === "not started" || s === "untested") {
    return false;
  }
  return s === "y" || s === "yes" || s === "true" || s === "1" || s === "pass" || s === "complete" || s === "tested" || Boolean(s);
}

function parseRisks(raw: string): string[] {
  return raw
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function scoreMap(headers: string[], map: ColumnMap): number {
  const set = new Set(headers.map(normalizeHeader));
  let hits = 0;
  for (const field of CANONICAL_FIELDS) {
    if (set.has(normalizeHeader(map[field]))) hits++;
  }
  return hits;
}

export function detectColumnMap(headers: string[]): { name: PresetMapName; map: ColumnMap; score: number } {
  let best: { name: PresetMapName; map: ColumnMap; score: number } = {
    name: "generic",
    map: GENERIC_RCM_MAP,
    score: -1,
  };
  for (const [name, map] of Object.entries(PRESET_MAPS) as [PresetMapName, ColumnMap][]) {
    const score = scoreMap(headers, map);
    if (score > best.score) best = { name, map, score };
  }
  return best;
}

export interface IngestResult {
  rows: FactRow[];
  quarantined: QuarantinedRow[];
}

function candidatesFor(map: ColumnMap, field: CanonicalField): string[] {
  const extra = FIELD_ALIASES[field].filter((a) => a !== map[field]);
  return [map[field], ...extra];
}

function isEmptyRow(raw: Record<string, string>): boolean {
  return Object.values(raw).every((v) => !String(v ?? "").trim());
}

/**
 * Map one source workbook onto the fact table. Row numbers are Excel-style
 * (header = 1, first data row = 2). The import clock is the row hash, not now().
 * Rows missing a display id (and title) are quarantined, not rendered.
 */
export function ingestWorkbookDetailed(book: RawWorkbook, map: ColumnMap): IngestResult {
  const rows: FactRow[] = [];
  const quarantined: QuarantinedRow[] = [];
  book.rows.forEach((raw, i) => {
    const excelRow = i + 2;
    if (isEmptyRow(raw)) {
      quarantined.push({
        copy: book.copyName,
        sheet: book.sheet,
        excelRow,
        reason: "empty row",
        raw,
      });
      return;
    }
    const displayId = cellFrom(raw, candidatesFor(map, "displayId"));
    const title = cellFrom(raw, candidatesFor(map, "title"));
    if (!displayId && !title) {
      quarantined.push({
        copy: book.copyName,
        sheet: book.sheet,
        excelRow,
        reason: "missing Control ID and Control Title",
        raw,
      });
      return;
    }
    if (!displayId) {
      quarantined.push({
        copy: book.copyName,
        sheet: book.sheet,
        excelRow,
        reason: "missing Control ID (display id)",
        raw,
      });
      return;
    }
    const riskIds = parseRisks(cellFrom(raw, candidatesFor(map, "riskIds")));
    const recordId = cellFrom(raw, candidatesFor(map, "recordId")) || `${book.copyName}:${displayId}`;
    const fields = {
      copy: book.copyName,
      sheet: book.sheet,
      excelRow,
      recordId,
      displayId,
      crosswalkId: cellFrom(raw, candidatesFor(map, "crosswalkId")) || null,
      title,
      description: cellFrom(raw, candidatesFor(map, "description")),
      owner: cellFrom(raw, candidatesFor(map, "owner")),
      frequency: cellFrom(raw, candidatesFor(map, "frequency")),
      riskIds,
      status: parseStatus(cellFrom(raw, candidatesFor(map, "status"))),
      tested: parseTested(cellFrom(raw, candidatesFor(map, "tested"))),
      lastReviewedOn: cellFrom(raw, candidatesFor(map, "lastReviewedOn")),
      sourceModifiedOn: cellFrom(raw, candidatesFor(map, "sourceModifiedOn")),
      issueId: cellFrom(raw, candidatesFor(map, "issueId")) || null,
      issueStatus: cellFrom(raw, candidatesFor(map, "issueStatus")) || null,
      columns: raw,
    };
    rows.push({ ...fields, rowHash: rowHashOf(fields) });
  });
  return { rows, quarantined };
}

export function ingestWorkbook(book: RawWorkbook, map: ColumnMap): FactRow[] {
  return ingestWorkbookDetailed(book, map).rows;
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
