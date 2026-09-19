import { inflateRawSync, deflateRawSync, crc32 } from "node:zlib";
import type { RawWorkbook } from "./schema";

/**
 * Thin CSV / XLSX reader-writer for RCM file drop. No spreadsheet framework.
 * Writer uses inline strings (same pattern as the workpaper exporter).
 * Reader handles inlineStr, shared strings, and numeric cells.
 */

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const cleaned = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const records = splitCsvRecords(cleaned);
  if (records.length === 0) return { headers: [], rows: [] };
  const headers = records[0].map((h) => h.trim());
  const rows = records.slice(1).map((cols) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      rec[h] = cols[i] ?? "";
    });
    return rec;
  });
  return { headers, rows };
}

function splitCsvRecords(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      field = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

export function toCsv(headers: string[], rows: Record<string, string>[]): string {
  const esc = (v: string) => {
    const s = v ?? "";
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.map(esc).join(",")];
  for (const r of rows) lines.push(headers.map((h) => esc(r[h] ?? "")).join(","));
  return lines.join("\n") + "\n";
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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

function sheetXml(rows: string[][]): string {
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
    local.writeUInt16LE(8, 8);
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

export function workbookToXlsx(book: RawWorkbook): Buffer {
  const table = [book.headers, ...book.rows.map((r) => book.headers.map((h) => r[h] ?? ""))];
  const sheetName = (book.sheet || "Sheet1").slice(0, 31);
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
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
    { path: "xl/worksheets/sheet1.xml", data: Buffer.from(sheetXml(table), "utf8") },
  ]);
}

function unzip(buf: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 30 <= buf.length) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;
    const method = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const uncompSize = buf.readUInt32LE(offset + 22);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.subarray(offset + 30, offset + 30 + nameLen).toString("utf8");
    const dataStart = offset + 30 + nameLen + extraLen;
    const compressed = buf.subarray(dataStart, dataStart + compSize);
    let data: Buffer;
    if (method === 0) data = Buffer.from(compressed);
    else if (method === 8) data = Buffer.from(inflateRawSync(compressed, { maxOutputLength: Math.max(uncompSize, 1) }));
    else throw new Error(`unsupported zip method ${method} for ${name}`);
    files.set(name.replace(/\\/g, "/"), data);
    offset = dataStart + compSize;
  }
  return files;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml))) {
    const texts = [...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => decodeXmlEntities(t[1]));
    out.push(texts.join(""));
  }
  return out;
}

function colLetters(ref: string): string {
  const m = ref.match(/^([A-Z]+)/i);
  return m ? m[1].toUpperCase() : "A";
}

function colIndex(letters: string): number {
  let n = 0;
  for (const c of letters) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function parseSheetRows(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(xml))) {
    const cells = new Map<number, string>();
    const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;
    let c: RegExpExecArray | null;
    while ((c = cellRe.exec(rowMatch[1]))) {
      const attrs = c[1] ?? c[3] ?? "";
      const body = c[2] ?? "";
      const ref = /r="([^"]+)"/.exec(attrs)?.[1] ?? "";
      const t = /t="([^"]+)"/.exec(attrs)?.[1] ?? "";
      const idx = colIndex(colLetters(ref || "A"));
      let value = "";
      if (t === "inlineStr") {
        const tm = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/.exec(body);
        value = tm ? decodeXmlEntities(tm[1]) : "";
      } else if (t === "s") {
        const v = /<v>([\s\S]*?)<\/v>/.exec(body);
        const i = v ? Number(v[1]) : -1;
        value = i >= 0 ? (shared[i] ?? "") : "";
      } else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(body);
        value = v ? decodeXmlEntities(v[1]) : "";
      }
      cells.set(idx, value);
    }
    const width = cells.size ? Math.max(...cells.keys()) + 1 : 0;
    const row: string[] = [];
    for (let i = 0; i < width; i++) row.push(cells.get(i) ?? "");
    rows.push(row);
  }
  return rows;
}

export function parseXlsx(buf: Buffer): { headers: string[]; rows: Record<string, string>[]; sheet: string } {
  const files = unzip(buf);
  const sheetPath =
    [...files.keys()].find((k) => /^xl\/worksheets\/sheet1\.xml$/i.test(k)) ??
    [...files.keys()].find((k) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k));
  if (!sheetPath) throw new Error("xlsx has no worksheet");
  const ssPath = [...files.keys()].find((k) => /xl\/sharedStrings\.xml$/i.test(k));
  const shared = ssPath ? parseSharedStrings(files.get(ssPath)!.toString("utf8")) : [];
  const table = parseSheetRows(files.get(sheetPath)!.toString("utf8"), shared);
  if (table.length === 0) return { headers: [], rows: [], sheet: "Sheet1" };
  const headers = table[0].map((h) => h.trim());
  const rows = table.slice(1).map((cols) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h) rec[h] = cols[i] ?? "";
    });
    return rec;
  });
  let sheet = "Sheet1";
  const wb = files.get("xl/workbook.xml")?.toString("utf8") ?? "";
  const name = /<sheet\b[^>]*name="([^"]+)"/.exec(wb);
  if (name) sheet = decodeXmlEntities(name[1]);
  return { headers, rows, sheet };
}

export function parseSpreadsheet(
  filename: string,
  bytes: Buffer | Uint8Array | string,
): { headers: string[]; rows: Record<string, string>[]; sheet: string } {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) {
    const text = typeof bytes === "string" ? bytes : Buffer.from(bytes).toString("utf8");
    const parsed = parseCsv(text);
    return { ...parsed, sheet: "Sheet1" };
  }
  if (lower.endsWith(".xlsx")) {
    const buf = typeof bytes === "string" ? Buffer.from(bytes) : Buffer.from(bytes);
    return parseXlsx(buf);
  }
  throw new Error(`unsupported file type for ${filename} — drop .xlsx or .csv`);
}

export function workbookFromParsed(
  copyName: string,
  parsed: { headers: string[]; rows: Record<string, string>[]; sheet: string },
): RawWorkbook {
  return {
    copyName,
    sheet: parsed.sheet || "Sheet1",
    headers: parsed.headers,
    rows: parsed.rows,
  };
}
