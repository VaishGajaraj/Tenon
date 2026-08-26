import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db/client";
import { getSku } from "@/core/sku";
import { DraftOutput } from "@/core/types";
import { ReviewEditor } from "./review-editor";

export const dynamic = "force-dynamic";

export default async function WorkItemPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const db = await getDb();
  const [item] = await db.select().from(schema.workItems).where(eq(schema.workItems.id, id));
  if (!item) notFound();
  const def = getSku(item.tenant, item.sku);

  const [run] = await db
    .select()
    .from(schema.runs)
    .where(eq(schema.runs.itemId, id))
    .orderBy(desc(schema.runs.createdAt))
    .limit(1);

  if (item.status === "delivered") {
    const [d] = await db
      .select()
      .from(schema.deliverables)
      .where(eq(schema.deliverables.itemId, id))
      .orderBy(desc(schema.deliverables.deliveredAt))
      .limit(1);
    const final = d ? DraftOutput.parse(d.final) : null;
    return (
      <main>
        <h1>{item.title}</h1>
        <p className="muted">Delivered{d?.reviewSeconds != null ? ` · reviewed in ${Math.round(d.reviewSeconds / 60)}m` : ""} · {d?.correctionCount ?? 0} correction(s)</p>
        {final && (
          <>
            <h2>Findings ({final.findings.length})</h2>
            {final.findings.map((f) => (
              <div className="finding" key={f.id}>
                <div className="head">
                  <b>{f.title}</b>
                  <span className="val">
                    {f.estimatedValueUsd ? `$${f.estimatedValueUsd[0]}–$${f.estimatedValueUsd[1]}` : "—"}
                  </span>
                </div>
                <div>{f.rationale}</div>
                <div className="cite">{f.citation} · {f.category} · {f.confidence}</div>
              </div>
            ))}
            <h2>Narrative</h2>
            <div className="card" style={{ whiteSpace: "pre-wrap" }}>{final.narrative}</div>
          </>
        )}
      </main>
    );
  }

  if (!run) {
    return (
      <main>
        <h1>{item.title}</h1>
        <p className="muted">Status: {item.status}. No draft yet — run it from the queue or with <code>pnpm worker</code>.</p>
      </main>
    );
  }

  const draft = DraftOutput.parse(run.output);
  return (
    <main>
      <h1>{item.title}</h1>
      <p className="muted">
        Review the AI first pass. Every edit, rejection, and addition is captured as a structured
        correction — the learning loop turns them into eval cases and prompt improvements.
      </p>
      {run.model === "mock" && (
        <div className="mock-note">
          Drafted in <b>mock mode</b> (no ANTHROPIC_API_KEY). The pipeline, review capture, and
          learning loop are fully live; only the drafting content is canned.
        </div>
      )}
      <ReviewEditor
        itemId={item.id}
        runId={run.id}
        draft={draft}
        reasonCodes={def.reasonCodes}
        categories={def.categories}
      />
    </main>
  );
}
