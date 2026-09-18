import { COPY_IA, COPY_RCSA, COPY_SOX, type DirectoryPerson, type IngestReport, type QuarantinedRow, type RawWorkbook, type ReconUniverse, type RiskRecord } from "./schema";
import { DIRECTORY, IMPORT_AS_OF, RISKS, TRIGGERS } from "./library";
import {
  AUDITBOARDISH_MAP,
  detectColumnMap,
  GENERIC_RCM_MAP,
  ingestWorkbookDetailed,
  PRESET_MAPS,
  type ColumnMap,
  type PresetMapName,
} from "./ingest";
import { parseSpreadsheet, workbookFromParsed } from "./spreadsheet";

export interface DroppedFile {
  filename: string;
  bytes: Buffer | Uint8Array | string;
}

export interface DropInput {
  ia: DroppedFile;
  sox: DroppedFile;
  rcsa?: DroppedFile;
  /** Force a preset; default auto-detect per file. */
  preset?: PresetMapName | "auto";
  bankName?: string;
  asOf?: string;
}

function mapFor(headers: string[], preset: PresetMapName | "auto" | undefined): { name: string; map: ColumnMap } {
  if (preset && preset !== "auto") return { name: preset, map: PRESET_MAPS[preset] };
  const detected = detectColumnMap(headers);
  return { name: `auto:${detected.name}`, map: detected.map };
}

function directoryFrom(books: RawWorkbook[]): DirectoryPerson[] {
  const seen = new Set<string>();
  const people: DirectoryPerson[] = DIRECTORY.map((d) => ({ ...d }));
  for (const p of people) seen.add(p.name.toLowerCase());
  for (const book of books) {
    for (const row of book.rows) {
      const owner =
        row["Owner"] ||
        row["Control Owner"] ||
        row["Control owner"] ||
        Object.entries(row).find(([k]) => /owner/i.test(k))?.[1] ||
        "";
      const name = owner.split(",")[0].trim();
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      people.push({ name, title: "Imported owner", email: "" });
    }
  }
  return people;
}

function risksFrom(books: RawWorkbook[]): RiskRecord[] {
  const byId = new Map<string, RiskRecord>(RISKS.map((r) => [r.riskId, { ...r }]));
  for (const book of books) {
    for (const row of book.rows) {
      const raw =
        row["Risk ID"] ||
        row["Risk Ref"] ||
        row["Associated Risks"] ||
        row["Risk"] ||
        "";
      for (const id of raw.split(/[;,]/).map((x) => x.trim()).filter(Boolean)) {
        if (!byId.has(id)) byId.set(id, { riskId: id, title: `Imported risk ${id}`, owner: "" });
      }
    }
  }
  return [...byId.values()];
}

/**
 * Build a MOCK universe from dropped IA + SOX (+ optional RCSA) spreadsheets.
 * Badge stays MOCK: this is local demo ingest of reviewer-shaped matrices, not
 * production client ingest. Ground truth is empty — P/R is only claimed on the
 * manufactured seed set.
 */
export function universeFromDroppedFiles(input: DropInput): ReconUniverse {
  const iaParsed = parseSpreadsheet(input.ia.filename, input.ia.bytes);
  const soxParsed = parseSpreadsheet(input.sox.filename, input.sox.bytes);
  const iaBook = workbookFromParsed(COPY_IA, iaParsed);
  const soxBook = workbookFromParsed(COPY_SOX, soxParsed);
  const iaMap = mapFor(iaBook.headers, input.preset);
  const soxMap = mapFor(soxBook.headers, input.preset);

  let rcsaBook: RawWorkbook | undefined;
  let rcsaMapName: string | undefined;
  const quarantined: QuarantinedRow[] = [];

  const iaIngest = ingestWorkbookDetailed(iaBook, iaMap.map);
  const soxIngest = ingestWorkbookDetailed(soxBook, soxMap.map);
  quarantined.push(...iaIngest.quarantined, ...soxIngest.quarantined);

  if (input.rcsa) {
    const rcsaParsed = parseSpreadsheet(input.rcsa.filename, input.rcsa.bytes);
    rcsaBook = workbookFromParsed(COPY_RCSA, rcsaParsed);
    const rcsaMap = mapFor(rcsaBook.headers, input.preset);
    rcsaMapName = rcsaMap.name;
    const rcsaIngest = ingestWorkbookDetailed(rcsaBook, rcsaMap.map);
    quarantined.push(...rcsaIngest.quarantined);
  }

  const books = [iaBook, soxBook, rcsaBook].filter(Boolean) as RawWorkbook[];
  const report: IngestReport = {
    source: "file-drop",
    maps: { ia: iaMap.name, sox: soxMap.name, rcsa: rcsaMapName },
    quarantined,
  };

  return {
    bankName: input.bankName || "Wrenbridge Community Bank, N.A.",
    asOf: input.asOf || IMPORT_AS_OF,
    dataMode: "MOCK",
    ia: iaBook,
    sox: soxBook,
    priorSox: { ...soxBook, rows: soxBook.rows.map((r) => ({ ...r })) },
    rcsa: rcsaBook,
    directory: directoryFrom(books),
    risks: risksFrom(books),
    issues: [],
    triggers: TRIGGERS.map((t) => ({ ...t })),
    groundTruth: [],
    ingestReport: report,
  };
}

export { GENERIC_RCM_MAP, AUDITBOARDISH_MAP };
