import Link from "next/link";
import { allSkus } from "@/core/sku";
import { skuMetrics } from "@/core/metrics";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const skus = allSkus();
  const metrics = await Promise.all(skus.map((s) => skuMetrics(s.tenant, s.sku)));
  return (
    <main>
      <h1>Delivery dashboard</h1>
      <p className="muted">
        One row per SKU. The harness exists to make <b>corrections per 100 deliverables</b> fall
        while <b>finding precision</b> rises — that graph is the company.
      </p>
      {metrics.map((m, i) => (
        <div className="card" key={`${m.tenant}/${m.sku}`}>
          <div className="row">
            <div>
              <b>{skus[i].displayName}</b>{" "}
              <span className="muted">
                {m.tenant}/{m.sku} · prompt v{m.activePromptVersion ?? "—"}
              </span>
            </div>
            <Link href="/work">queue →</Link>
          </div>
          <div className="grid" style={{ marginTop: 12 }}>
            <div className="stat card">
              <div className="n">{m.delivered}</div>
              <div className="l">deliverables shipped</div>
            </div>
            <div className="stat card">
              <div className="n">{m.correctionsPer100.toFixed(1)}</div>
              <div className="l">corrections / 100 deliverables</div>
            </div>
            <div className="stat card">
              <div className="n">{(m.findingPrecision * 100).toFixed(0)}%</div>
              <div className="l">finding precision (kill line: 80%)</div>
            </div>
            <div className="stat card">
              <div className="n">{m.medianReviewSeconds != null ? `${Math.round(m.medianReviewSeconds / 60)}m` : "—"}</div>
              <div className="l">median review time</div>
            </div>
          </div>
        </div>
      ))}
      <p className="muted">
        Loop: <code>pnpm worker</code> drafts intake → review in the queue → <code>pnpm learn --promote</code> turns
        corrections into eval cases and an eval-gated prompt version.
      </p>
    </main>
  );
}
