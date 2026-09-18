"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DraftOutput, Finding } from "@/core/types";
import { DISPOSITIONS, REJECT_REASON_CODES, type Disposition } from "@/tenants/rcm/schema";
import { finalizeRcmDraft } from "@/tenants/rcm/review";
import { submitReview } from "../../actions";

type Row = {
  finding: Finding;
  status: "accepted" | "rejected";
  reasonCode: string;
  disposition: string;
  dispositionRationale: string;
  note: string;
};

function demoRank(f: Finding): number {
  if (f.predicate === "description_divergence") return 0;
  if (f.predicate === "attribute_mismatch" && f.field === "frequency") return 1;
  if (f.predicate === "unmatched_in_copy" && (f.iaDisplayId === "ITGC-PS-01" || /ITGC-PS-01/.test(f.title))) return 2;
  if (f.predicate === "needs_human_match") return 3;
  return 10;
}

export function RcmReviewEditor(props: {
  itemId: number;
  runId: number;
  draft: DraftOutput;
  preparer: string;
  reviewer: string;
  date: string;
}) {
  const router = useRouter();
  const startedAt = useRef(Date.now());
  const [rows, setRows] = useState<Row[]>(
    [...props.draft.findings]
      .sort((a, b) => demoRank(a) - demoRank(b))
      .map((f) => ({
      finding: f,
      status: "accepted",
      reasonCode: "",
      disposition: "",
      dispositionRationale: "",
      note: "",
    })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const PAGE = 8;

  const visibleAll = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.finding.predicate === filter)),
    [rows, filter],
  );
  const pageCount = Math.max(1, Math.ceil(visibleAll.length / PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = visibleAll.slice(safePage * PAGE, safePage * PAGE + PAGE);
  const predicates = useMemo(
    () => [...new Set(rows.map((r) => r.finding.predicate).filter(Boolean))] as string[],
    [rows],
  );

  function patch(id: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.finding.id === id ? { ...r, ...patch } : r)));
  }

  async function deliver() {
    setError(null);
    const { final, corrections, error: err } = finalizeRcmDraft(
      props.draft,
      rows.map((r) => ({
        finding: r.finding,
        status: r.status,
        reasonCode: r.reasonCode || undefined,
        disposition: (r.disposition as Disposition) || undefined,
        dispositionRationale: r.dispositionRationale,
        note: r.note || undefined,
      })),
      { preparer: props.preparer, reviewer: props.reviewer, date: props.date },
    );
    if (err) {
      setError(err);
      return;
    }
    setBusy(true);
    try {
      await submitReview({
        itemId: props.itemId,
        runId: props.runId,
        corrections,
        final,
        reviewSeconds: Math.round((Date.now() - startedAt.current) / 1000),
      });
      router.push(`/work/${props.itemId}`);
      router.refresh();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <label style={{ margin: 0 }}>
          Filter
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(0);
            }}
            style={{ width: "auto", marginLeft: 8 }}
          >
            <option value="all">all flags ({rows.length})</option>
            {predicates.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <span className="muted">
          {rows.filter((r) => r.status === "rejected").length} to reject ·{" "}
          {rows.filter((r) => r.status === "accepted" && r.disposition).length} with disposition
          {" · "}
          showing {visibleAll.length === 0 ? 0 : safePage * PAGE + 1}–{Math.min((safePage + 1) * PAGE, visibleAll.length)} of {visibleAll.length}
        </span>
      </div>
      <p className="muted">
        Demo order: semantic drift, frequency attribute, keyed miss. Accept requires a disposition.
        <button
          type="button"
          style={{ marginLeft: 8 }}
          onClick={() =>
            setRows((rs) =>
              rs.map((r) =>
                r.status === "accepted" && !r.disposition
                  ? {
                      ...r,
                      disposition: "retain",
                      dispositionRationale: r.dispositionRationale || "Confirm as documented on both copies.",
                    }
                  : r,
              ),
            )
          }
        >
          Fill remaining accepts as retain
        </button>
      </p>

      {visible.length === 0 && (
        <div className="card">
          No flags in this filter.{" "}
          <button type="button" onClick={() => setFilter("all")}>
            Show all
          </button>
        </div>
      )}

      {visible.map((r) => (
        <div className={`finding ${r.status === "rejected" ? "rejected" : ""}`} key={r.finding.id}>
          <div className="head">
            <b>{r.finding.title}</b>
            <span className="pill">{r.finding.predicate ?? r.finding.category}</span>
          </div>
          <div className="quotes">
            <div>
              <div className="muted">IA RCM</div>
              <blockquote>{r.finding.quotes?.left || "—"}</blockquote>
            </div>
            <div>
              <div className="muted">SOX RCM</div>
              <blockquote>{r.finding.quotes?.right || "—"}</blockquote>
            </div>
          </div>
          <div>{r.finding.rationale}</div>
          <div className="cite">{r.finding.citation}</div>
          <div className="tools">
            {r.status !== "rejected" ? (
              <button className="danger" onClick={() => patch(r.finding.id, { status: "rejected", disposition: "" })}>
                Reject
              </button>
            ) : (
              <button onClick={() => patch(r.finding.id, { status: "accepted", reasonCode: "" })}>Restore</button>
            )}
            {r.status === "rejected" ? (
              <>
                <select
                  value={r.reasonCode}
                  onChange={(e) => patch(r.finding.id, { reasonCode: e.target.value })}
                  style={{ width: "auto" }}
                >
                  <option value="">reason code (required)</option>
                  {REJECT_REASON_CODES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="note (optional)"
                  value={r.note}
                  onChange={(e) => patch(r.finding.id, { note: e.target.value })}
                  style={{ width: 240 }}
                />
              </>
            ) : (
              <>
                <select
                  value={r.disposition}
                  onChange={(e) => patch(r.finding.id, { disposition: e.target.value })}
                  style={{ width: "auto" }}
                >
                  <option value="">disposition (required to accept)</option>
                  {DISPOSITIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="one-sentence rationale (required)"
                  value={r.dispositionRationale}
                  onChange={(e) => patch(r.finding.id, { dispositionRationale: e.target.value })}
                />
              </>
            )}
          </div>
        </div>
      ))}

      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      {pageCount > 1 && (
        <div className="row" style={{ marginTop: 12 }}>
          <button type="button" disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            Previous
          </button>
          <span className="muted">
            Page {safePage + 1} of {pageCount}
          </span>
          <button
            type="button"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            Next
          </button>
        </div>
      )}
      <div className="deliver-bar" style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="primary" onClick={deliver} disabled={busy}>
          {busy ? "Recording…" : "Record review & deliver workpaper"}
        </button>
        <span className="muted">Rejected rows stay on the rejected-flags tab. They are never deleted.</span>
      </div>
    </div>
  );
}
