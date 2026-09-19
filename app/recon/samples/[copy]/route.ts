import { NextResponse } from "next/server";
import { generateDemoUniverse } from "@/tenants/rcm/generate";
import { AUDITBOARDISH_MAP, SOX_MAP } from "@/tenants/rcm/ingest";
import { toCsv, workbookToXlsx } from "@/tenants/rcm/spreadsheet";
import type { RawWorkbook } from "@/tenants/rcm/schema";

export const dynamic = "force-dynamic";

function soxAsAuditboard(book: RawWorkbook): RawWorkbook {
  const headers = Object.values(AUDITBOARDISH_MAP);
  const rows = book.rows.map((r) => ({
    [AUDITBOARDISH_MAP.recordId]: r[SOX_MAP.recordId] ?? "",
    [AUDITBOARDISH_MAP.displayId]: r[SOX_MAP.displayId] ?? "",
    [AUDITBOARDISH_MAP.crosswalkId]: r[SOX_MAP.crosswalkId] ?? "",
    [AUDITBOARDISH_MAP.title]: r[SOX_MAP.title] ?? "",
    [AUDITBOARDISH_MAP.description]: r[SOX_MAP.description] ?? "",
    [AUDITBOARDISH_MAP.owner]: r[SOX_MAP.owner] ?? "",
    [AUDITBOARDISH_MAP.frequency]: r[SOX_MAP.frequency] ?? "",
    [AUDITBOARDISH_MAP.riskIds]: r[SOX_MAP.riskIds] ?? "",
    [AUDITBOARDISH_MAP.status]: r[SOX_MAP.status] ?? "",
    [AUDITBOARDISH_MAP.tested]: r[SOX_MAP.tested] ?? "",
    [AUDITBOARDISH_MAP.lastReviewedOn]: r[SOX_MAP.lastReviewedOn] ?? "",
    [AUDITBOARDISH_MAP.sourceModifiedOn]: r[SOX_MAP.sourceModifiedOn] ?? "",
    [AUDITBOARDISH_MAP.issueId]: r[SOX_MAP.issueId] ?? "",
    [AUDITBOARDISH_MAP.issueStatus]: r[SOX_MAP.issueStatus] ?? "",
  }));
  return { copyName: book.copyName, sheet: book.sheet, headers, rows };
}

export async function GET(_req: Request, { params }: { params: { copy: string } }) {
  const universe = generateDemoUniverse();
  const copy = params.copy.toLowerCase();
  if (copy === "ia.csv") {
    return new NextResponse(toCsv(universe.ia.headers, universe.ia.rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="wrenbridge-ia-rcm-MOCK.csv"',
      },
    });
  }
  if (copy === "sox.csv") {
    return new NextResponse(toCsv(universe.sox.headers, universe.sox.rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="wrenbridge-sox-rcm-MOCK.csv"',
      },
    });
  }
  if (copy === "ia.xlsx") {
    const buf = workbookToXlsx(universe.ia);
    return new NextResponse(Uint8Array.from(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="wrenbridge-ia-rcm-MOCK.xlsx"',
      },
    });
  }
  if (copy === "sox.xlsx") {
    const buf = workbookToXlsx(universe.sox);
    return new NextResponse(Uint8Array.from(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="wrenbridge-sox-rcm-MOCK.xlsx"',
      },
    });
  }
  if (copy === "sox-auditboard.csv" || copy === "sox-auditboardish.csv") {
    const remapped = soxAsAuditboard(universe.sox);
    return new NextResponse(toCsv(remapped.headers, remapped.rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="wrenbridge-sox-auditboardish-MOCK.csv"',
      },
    });
  }
  return NextResponse.json({ error: "unknown sample" }, { status: 404 });
}
