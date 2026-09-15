import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { DraftOutput } from "@/core/types";
import { buildWorkpaperXlsx } from "@/tenants/rcm/xlsx";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const db = await getDb();
  const [item] = await db.select().from(schema.workItems).where(eq(schema.workItems.id, id));
  if (!item || item.tenant !== "rcm") {
    return NextResponse.json({ error: "not an RCM work item" }, { status: 404 });
  }
  const [del] = await db
    .select()
    .from(schema.deliverables)
    .where(eq(schema.deliverables.itemId, id))
    .orderBy(desc(schema.deliverables.deliveredAt))
    .limit(1);
  const [run] = await db
    .select()
    .from(schema.runs)
    .where(eq(schema.runs.itemId, id))
    .orderBy(desc(schema.runs.createdAt))
    .limit(1);
  const raw = del?.final ?? run?.output;
  if (!raw) return NextResponse.json({ error: "no draft yet" }, { status: 404 });
  const final = DraftOutput.parse(raw);
  const input = item.input as { preparer?: string; reviewer?: string; asOf?: string; bankName?: string };
  const meta = {
    preparer: final.workpaper?.preparer || input.preparer || "",
    reviewer: final.workpaper?.reviewer || input.reviewer || "",
    date: final.workpaper?.date || input.asOf || "",
    mode: "MOCK" as const,
    bankName: input.bankName,
  };
  const buf = buildWorkpaperXlsx(final, meta);
  return new NextResponse(Uint8Array.from(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="wrenbridge-ia-sox-rcm-MOCK.xlsx"`,
    },
  });
}
