import { crc32, deflateRawSync } from "node:zlib";
import type { DraftOutput, Finding } from "@/core/types";

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function colName(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function sheetXml(name: string, rows: string[][]): string {
  const sheetData = rows
    .map((row, ri) => {
      const cells = row
        .map((value, ci) => {
          const ref = `${colName(ci + 1)}${ri + 1}`;
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <headerFooter>
    <oddHeader>&amp;C&amp;"Arial,Bold"TENON RCM WORKPAPER — MOCK</oddHeader>
    <oddFooter>&amp;LMode: MOCK — public-domain demo, not a client file&amp;C&amp;P of &amp;N&amp;RPreparer / reviewer / date on Committee delta</oddFooter>
  </headerFooter>
  <sheetData>${sheetData}</sheetData>
</worksheet>`;
}

function zipStore(files: { path: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.path, "utf8");
    const compressed = deflateRawSync(f.data);
    const crc = crc32(f.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const localFull = Buffer.concat([local, name, compressed]);
    locals.push(localFull);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(f.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, name]));
    offset += localFull.length;
  }
  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralDir, eocd]);
}

function findingRow(f: Finding): string[] {
  const quotes = f.quotes ?? { left: "", right: "" };
  const loc = (f.cellLocators ?? [])
    .map((l) => `${l.copy} ${l.sheet}!${l.column}${l.row}`)
    .join(" | ");
  return [
    f.predicate ?? f.category,
    f.title,
    quotes.left ?? "",
    quotes.right ?? "",
    f.rationale,
    loc,
    f.disposition ?? "",
    f.dispositionRationale ?? "",
    f.confidence,
  ];
}

const FLAG_HEADERS = [
  "Predicate",
  "Title",
  "IA quote",
  "SOX quote",
  "Rationale",
  "Cell locators",
  "Disposition",
  "Disposition rationale",
  "Confidence",
];

export interface WorkpaperMeta {
  preparer: string;
  reviewer: string;
  date: string;
  mode: "MOCK" | "REAL";
  bankName?: string;
}

/**
 * Build an .xlsx workpaper. Rejected-flags tab is always present and is never
 * omitted, even when empty. MOCK/REAL printed on header row and footer row.
 */
export function workpaperSheets(final: DraftOutput, meta: WorkpaperMeta): { name: string; rows: string[][] }[] {
  const mode = meta.mode;
  const stamp = [`TENON RCM RECON — ${mode}`, `Public-domain demo tenant. Not a client file.`];
  const footer = [
    `Mode: ${mode}`,
    `Preparer: ${meta.preparer || "(unspecified)"}`,
    `Reviewer: ${meta.reviewer || "(unspecified)"}`,
    `Date: ${meta.date}`,
    `Bank: ${meta.bankName ?? ""}`,
  ];
  const flags: string[][] = [stamp, FLAG_HEADERS, ...final.findings.map(findingRow), footer];
  const rejected = final.rejectedFlags ?? [];
  const rejectedSheet: string[][] = [
    stamp,
    FLAG_HEADERS,
    ...rejected.map(findingRow),
    ["This tab is never deleted. Rejected flags remain on the workpaper."],
    footer,
  ];
  const committee: string[][] = [
    stamp,
    ["Committee delta (code-computed counts, not model prose)"],
    ...(final.narrative ?? "").split("\n").map((line) => [line]),
    footer,
  ];
  const copies: string[][] = [
    stamp,
    ["Copy", "Rows", "Sheet"],
    ...(final.copies ?? []).map((c) => [c.name, String(c.rowCount), c.sheet ?? ""]),
    footer,
  ];
  return [
    { name: "Flags", rows: flags },
    { name: "Rejected flags", rows: rejectedSheet },
    { name: "Committee delta", rows: committee },
    { name: "Copies", rows: copies },
  ];
}

export function buildWorkpaperXlsx(final: DraftOutput, meta: WorkpaperMeta): Buffer {
  const sheets = workpaperSheets(final, meta);
  const sheetFiles = sheets.map((s, i) => ({
    path: `xl/worksheets/sheet${i + 1}.xml`,
    data: Buffer.from(sheetXml(s.name, s.rows), "utf8"),
  }));

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${sheets.map((s, i) => `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("\n    ")}
  </sheets>
</workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("\n  ")}
</Relationships>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n  ")}
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  return zipStore([
    { path: "[Content_Types].xml", data: Buffer.from(contentTypes, "utf8") },
    { path: "_rels/.rels", data: Buffer.from(rels, "utf8") },
    { path: "xl/workbook.xml", data: Buffer.from(workbook, "utf8") },
    { path: "xl/_rels/workbook.xml.rels", data: Buffer.from(workbookRels, "utf8") },
    ...sheetFiles,
  ]);
}

export function xlsxContains(buf: Buffer, needle: string): boolean {
  return buf.toString("utf8").includes(needle) || buf.includes(Buffer.from(needle, "utf8"));
}
