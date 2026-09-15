import Link from "next/link";
import { allSkus } from "@/core/sku";
import { skuMetrics, metricsByPromptVersion } from "@/core/metrics";

export const dynamic = "force-dynamic";

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(0)}%`);
const num = (v: number | null, d = 1) => (v === null ? "—" : v.toFixed(d));

export default async function Dashboard() {
  const skus = allSkus();
  const metrics = await Promise.all(
    skus.map((s) => skuMetrics(s.tenant, s.sku, { windowDays: 30 })),
  );
  const versions = await Promise.all(skus.map((s) => metricsByPromptVersion(s.tenant, s.sku)));

  return (
    <main>
      <h1>Delivery dashboard</h1>
      <p className="muted">
        Trailing 30 days. Act-one demo is <a href="/recon">MOCK RCM recon</a> (IA RCM vs SOX RCM).
        The harness exists to make <b>corrections per 100</b> fall{" "}
        <i>while findings per deliverable holds</i> — a quieter model is not a better one.
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
              <div className="l">delivered (30d)</div>
            </div>
            <div className="stat card">
              <div className="n">{num(m.correctionsPer100)}</div>
              <div className="l">corrections / 100 · should fall</div>
            </div>
            <div className="stat card">
              <div className="n">{pct(m.findingPrecision)}</div>
              <div className="l">precision · kill line 80%</div>
            </div>
            <div className="stat card">
              <div className="n">{num(m.findingsPerDeliverable)}</div>
              <div className="l">findings / deliverable · must hold</div>
            </div>
            <div className="stat card">
              <div className="n">{num(m.missesPerDeliverable, 2)}</div>
              <div className="l">reviewer-added misses · recall</div>
            </div>
            <div className="stat card">
              <div className="n">
                {m.medianReviewSeconds != null ? `${Math.round(m.medianReviewSeconds / 60)}m` : "—"}
              </div>
              <div className="l">median review time</div>
            </div>
          </div>
          {versions[i].length > 1 && (
            <table style={{ marginTop: 14 }}>
              <thead>
                <tr>
                  <th>prompt version</th>
                  <th>delivered</th>
                  <th>corrections / 100</th>
                  <th>precision</th>
                </tr>
              </thead>
              <tbody>
                {versions[i].map((v) => (
                  <tr key={v.version}>
                    <td>v{v.version}</td>
                    <td>{v.delivered}</td>
                    <td>{v.correctionsPer100.toFixed(1)}</td>
                    <td>{(v.precision * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
      <p className="muted">
        <code>pnpm worker</code> drafts → review in the queue → <code>pnpm learn --promote</code>{" "}
        gates a new prompt version → <code>pnpm selfcheck</code> checks that each mechanism actually
        fires.
      </p>
    </main>
  );
}
