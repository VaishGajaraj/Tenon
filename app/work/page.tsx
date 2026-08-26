import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { runDraftAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function WorkQueue() {
  const db = await getDb();
  const items = await db
    .select()
    .from(schema.workItems)
    .orderBy(desc(schema.workItems.createdAt));

  return (
    <main>
      <h1>Work queue</h1>
      <p className="muted">
        intake → drafting → in_review → delivered. The reviewer only ever sees{" "}
        <b>in_review</b>; the harness owns the rest.
      </p>
      {items.length === 0 && (
        <div className="card">
          No work items yet. <Link href="/intake">Create one</Link> or run{" "}
          <code>pnpm seed</code>.
        </div>
      )}
      {items.map((it: typeof schema.workItems.$inferSelect) => (
        <div className="card row" key={it.id}>
          <div>
            <b>{it.title}</b>
            <div className="muted">
              #{it.id} · {it.tenant}/{it.sku} ·{" "}
              {new Date(it.createdAt as unknown as string).toLocaleString()}
            </div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <span className={`pill ${it.status}`}>{it.status}</span>
            {it.status === "intake" && (
              <form
                action={async () => {
                  "use server";
                  await runDraftAction(it.id);
                }}
              >
                <button className="primary" type="submit">
                  Run draft
                </button>
              </form>
            )}
            {it.status === "in_review" && (
              <Link className="btn" href={`/work/${it.id}`}>
                Review →
              </Link>
            )}
            {it.status === "delivered" && (
              <Link className="btn" href={`/work/${it.id}`}>
                View
              </Link>
            )}
          </div>
        </div>
      ))}
    </main>
  );
}
