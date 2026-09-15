import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { runDraftAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ReconLanding() {
  const db = await getDb();
  const items = await db
    .select()
    .from(schema.workItems)
    .where(eq(schema.workItems.tenant, "rcm"))
    .orderBy(desc(schema.workItems.createdAt));
  const item = items[0];
  const input = (item?.input ?? {}) as {
    bankName?: string;
    asOf?: string;
    preparer?: string;
    reviewer?: string;
    universeJson?: string;
  };
  let iaRows = 0;
  let soxRows = 0;
  if (input.universeJson) {
    try {
      const u = JSON.parse(input.universeJson);
      iaRows = u.ia?.rows?.length ?? 0;
      soxRows = u.sox?.rows?.length ?? 0;
    } catch {
      /* ignore */
    }
  }

  return (
    <main>
      <div className="mock-stamp">MOCK</div>
      <h1>RCM reconciliation</h1>
      <p className="muted">
        Public-domain bank language — not a client file. Two named copies the institution already
        keeps. Predicate flags over a fact table, not model prose.
      </p>

      {!item && (
        <div className="card">
          No MOCK engagement yet. From the repo root: <code>pnpm db:init && pnpm seed && pnpm worker</code>
        </div>
      )}

      {item && (
        <>
          <p className="muted">
            {input.bankName ?? "Wrenbridge Community Bank, N.A."} · import as-of {input.asOf ?? "file date"} ·
            preparer {input.preparer} · reviewer {input.reviewer}
          </p>
          <div className="grid">
            <div className="card">
              <div className="muted">Copy</div>
              <h2 style={{ marginTop: 4 }}>IA RCM</h2>
              <p>Internal Audit workbook. {iaRows ? `${iaRows} control rows.` : ""}</p>
            </div>
            <div className="card">
              <div className="muted">Copy</div>
              <h2 style={{ marginTop: 4 }}>SOX RCM</h2>
              <p>SOX PMO workbook. {soxRows ? `${soxRows} control rows.` : ""}</p>
            </div>
          </div>
          <p className="muted">The flag matrix does not open until you continue. MOCK stays in the header.</p>
          <div className="row">
            <div className="row" style={{ gap: 10 }}>
              <span className={`pill ${item.status}`}>{item.status}</span>
              {item.status === "intake" && (
                <form
                  action={async () => {
                    "use server";
                    await runDraftAction(item.id);
                  }}
                >
                  <button className="primary" type="submit">
                    Run predicates
                  </button>
                </form>
              )}
              {item.status === "in_review" && (
                <Link className="btn primary" href={`/work/${item.id}`} style={{ background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" }}>
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
        </>
      )}
    </main>
  );
}
