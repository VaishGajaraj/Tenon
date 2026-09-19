import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { runDraftAction } from "../actions";
import { DropForm } from "./drop-form";
import { DEMO_BANK } from "@/tenants/rcm/schema";
import { CANONICAL_CONTROLS } from "@/tenants/rcm/library";
import { PendingSubmit } from "../pending-submit";

export const dynamic = "force-dynamic";

export default async function ReconLanding() {
  const db = await getDb();
  const items = await db
    .select()
    .from(schema.workItems)
    .where(eq(schema.workItems.tenant, "rcm"))
    .orderBy(desc(schema.workItems.createdAt));

  return (
    <main>
      <div className="mock-stamp">MOCK</div>
      <h1>RCM reconciliation</h1>
      <p className="muted">
        Public-domain bank language — not a client file. Two named copies the institution already
        keeps. Predicate flags over a fact table, not model prose. {DEMO_BANK.name} is fictional
        (BankFind NAME:&quot;Wrenbridge&quot; = {DEMO_BANK.bankfindCheck.hits} hits as of{" "}
        {DEMO_BANK.bankfindCheck.asOf}). Canonical library: {CANONICAL_CONTROLS.length} controls.
      </p>

      <DropForm />

      {items.length === 0 && (
        <div className="card">
          No MOCK engagement yet. From the repo root: <code>pnpm db:init && pnpm seed && pnpm worker</code>
          , or drop two spreadsheets above.
        </div>
      )}

      {items.map((item) => {
        const input = (item.input ?? {}) as {
          bankName?: string;
          asOf?: string;
          preparer?: string;
          reviewer?: string;
          iaRowCount?: number;
          soxRowCount?: number;
          rcsaRowCount?: number;
          ingestSource?: string;
          rcsaCopyName?: string;
        };
        const iaRows = input.iaRowCount ?? 0;
        const soxRows = input.soxRowCount ?? 0;
        const rcsaRows = input.rcsaRowCount ?? 0;
        const thirdName = input.rcsaCopyName ?? "";
        const source = input.ingestSource ?? "seed";
        return (
          <div className="card" key={item.id}>
            <div className="row">
              <div>
                <b>{item.title}</b>
                <div className="muted">
                  {input.bankName ?? DEMO_BANK.name} · as-of {input.asOf ?? "file date"} ·{" "}
                  {source === "file-drop" ? "file drop" : "seeded library"} · preparer {input.preparer}
                </div>
              </div>
              <span className={`pill ${item.status}`}>{item.status}</span>
            </div>
            <div className="grid" style={{ marginTop: 12 }}>
              <div className="card">
                <div className="muted">Copy</div>
                <h2 style={{ marginTop: 4 }}>IA RCM</h2>
                <p>{iaRows ? `${iaRows} control rows.` : "Named Internal Audit workbook."}</p>
              </div>
              <div className="card">
                <div className="muted">Copy</div>
                <h2 style={{ marginTop: 4 }}>SOX RCM</h2>
                <p>{soxRows ? `${soxRows} control rows.` : "Named SOX PMO workbook."}</p>
              </div>
              {rcsaRows > 0 && (
                <div className="card">
                  <div className="muted">Copy</div>
                  <h2 style={{ marginTop: 4 }}>{thirdName || "RCSA"}</h2>
                  <p>{rcsaRows} rows ingested. Pairwise predicates remain IA↔SOX.</p>
                </div>
              )}
            </div>
            {item.status === "failed" && item.lastError && (
              <p style={{ color: "var(--danger)" }}>{item.lastError}</p>
            )}
            {item.status === "drafting" && (
              <p className="muted">Predicates running on the fact table. Refresh if this does not move to in_review.</p>
            )}
            <p className="muted">The flag matrix does not open until you continue. MOCK stays in the header.</p>
            <div className="row">
              <div className="row" style={{ gap: 10 }}>
                {item.status === "intake" && (
                  <form
                    action={async () => {
                      "use server";
                      await runDraftAction(item.id);
                    }}
                  >
                    <PendingSubmit pendingLabel="Running predicates…">Run predicates</PendingSubmit>
                  </form>
                )}
                {item.status === "failed" && (
                  <form
                    action={async () => {
                      "use server";
                      await runDraftAction(item.id);
                    }}
                  >
                    <PendingSubmit pendingLabel="Retrying…">Retry predicates</PendingSubmit>
                  </form>
                )}
                {item.status === "in_review" && (
                  <Link
                    className="btn primary"
                    href={`/work/${item.id}`}
                    style={{ background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" }}
                  >
                    Open flag matrix →
                  </Link>
                )}
                {item.status === "delivered" && (
                  <Link className="btn" href={`/work/${item.id}`}>
                    Open workpaper →
                  </Link>
                )}
              </div>
              <Link href="/work">queue</Link>
            </div>
          </div>
        );
      })}
    </main>
  );
}
