"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DraftOutput, Finding, CorrectionEvent } from "@/core/types";
import { submitReview } from "../../actions";

type RowState = {
  finding: Finding;
  status: "accepted" | "edited" | "rejected";
  reasonCode: string;
  note: string;
};

export function ReviewEditor(props: {
  itemId: number;
  runId: number;
  draft: DraftOutput;
  reasonCodes: { code: string; label: string }[];
  categories: string[];
}) {
  const router = useRouter();
  const startedAt = useRef(Date.now());
  const original = useMemo(
    () => new Map(props.draft.findings.map((f) => [f.id, f])),
    [props.draft.findings],
  );
  const [rows, setRows] = useState<RowState[]>(
    props.draft.findings.map((f) => ({
      finding: { ...f },
      status: "accepted",
      reasonCode: "",
      note: "",
    })),
  );
  const [added, setAdded] = useState<{ finding: Finding; note: string }[]>([]);
  const [narrative, setNarrative] = useState(props.draft.narrative);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patchRow(i: number, patch: Partial<RowState>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  function patchFinding(i: number, patch: Partial<Finding>) {
    setRows((rs) =>
      rs.map((r, j) => {
        if (j !== i) return r;
        const finding = { ...r.finding, ...patch };
        const orig = original.get(r.finding.id);
        const changed =
          !!orig &&
          (finding.title !== orig.title ||
            finding.rationale !== orig.rationale ||
            finding.citation !== orig.citation);
        return { ...r, finding, status: r.status === "rejected" ? "rejected" : changed ? "edited" : "accepted" };
      }),
    );
  }
  function addFinding() {
    const id = `added-${added.length + 1}`;
    setAdded((a) => [
      ...a,
      {
        finding: {
          id,
          category: props.categories[0],
          title: "",
          rationale: "",
          citation: "",
          estimatedValueUsd: null,
          confidence: "medium",
        },
        note: "",
      },
    ]);
  }

  async function deliver() {
    setError(null);
    for (const r of rows) {
      if ((r.status === "rejected" || r.status === "edited") && !r.reasonCode) {
        setError("Every rejection or edit needs a reason code — that's what the system learns from.");
        return;
      }
    }
    if (added.some((a) => !a.finding.title)) {
      setError("Added findings need a title.");
      return;
    }
    setBusy(true);
    const corrections: CorrectionEvent[] = [];
    rows.forEach((r, i) => {
      const orig = original.get(r.finding.id)!;
      if (r.status === "rejected") {
        corrections.push({
          targetPath: `findings[${i}]`,
          kind: "reject",
          reasonCode: r.reasonCode,
          before: orig,
          after: null,
          note: r.note || undefined,
        });
      } else if (r.status === "edited") {
        corrections.push({
          targetPath: `findings[${i}]`,
          kind: "edit",
          reasonCode: r.reasonCode,
          before: orig,
          after: r.finding,
          note: r.note || undefined,
        });
      }
    });
    added.forEach((a, i) => {
      corrections.push({
        targetPath: `findings[+${i}]`,
        kind: "add",
        reasonCode: "missed_by_ai",
        before: null,
        after: a.finding,
        note: a.note || undefined,
      });
    });
    if (narrative !== props.draft.narrative) {
      corrections.push({
        targetPath: "narrative",
        kind: "edit",
        reasonCode: "style",
        before: props.draft.narrative,
        after: narrative,
      });
    }
    const kept = rows.filter((r) => r.status !== "rejected").map((r) => r.finding);
    const final: DraftOutput = {
      findings: [...kept, ...added.map((a) => a.finding)],
      narrative,
      selfCheckNotes: props.draft.selfCheckNotes,
    };
    try {
      // Counts are deliberately NOT sent: the server derives every metric from
      // the stored run. A number reported by the party being measured is not
      // evidence, and these numbers are the product's proof.
      await submitReview({
        itemId: props.itemId,
        runId: props.runId,
        corrections,
        final,
        reviewSeconds: Math.round((Date.now() - startedAt.current) / 1000),
      });
      router.push("/work");
      router.refresh();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  return (
    <div>
      <h2>Findings ({rows.length} drafted)</h2>
      {rows.map((r, i) => (
        <div className={`finding ${r.status}`} key={r.finding.id}>
          <div className="head">
            <input
              type="text"
              value={r.finding.title}
              onChange={(e) => patchFinding(i, { title: e.target.value })}
              style={{ fontWeight: 600 }}
            />
            <span className="val">
              {r.finding.estimatedValueUsd
                ? `$${r.finding.estimatedValueUsd[0]}–$${r.finding.estimatedValueUsd[1]}`
                : "—"}
            </span>
          </div>
          <textarea
            value={r.finding.rationale}
            onChange={(e) => patchFinding(i, { rationale: e.target.value })}
          />
          <input
            type="text"
            value={r.finding.citation}
            onChange={(e) => patchFinding(i, { citation: e.target.value })}
            placeholder="Citation"
          />
          <div className="tools">
            <span className="pill">{r.status}</span>
            {r.status !== "rejected" ? (
              <button className="danger" onClick={() => patchRow(i, { status: "rejected" })}>
                Reject
              </button>
            ) : (
              <button onClick={() => patchRow(i, { status: "accepted", reasonCode: "" })}>
                Restore
              </button>
            )}
            {(r.status === "rejected" || r.status === "edited") && (
              <>
                <select
                  value={r.reasonCode}
                  onChange={(e) => patchRow(i, { reasonCode: e.target.value })}
                  style={{ width: "auto" }}
                >
                  <option value="">why? (required)</option>
                  {props.reasonCodes.map((rc) => (
                    <option key={rc.code} value={rc.code}>
                      {rc.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="note (optional)"
                  value={r.note}
                  onChange={(e) => patchRow(i, { note: e.target.value })}
                  style={{ width: 220 }}
                />
              </>
            )}
          </div>
        </div>
      ))}

      {added.map((a, i) => (
        <div className="finding added" key={a.finding.id}>
          <div className="head">
            <input
              type="text"
              placeholder="Finding the AI missed — title"
              value={a.finding.title}
              onChange={(e) =>
                setAdded((xs) =>
                  xs.map((x, j) => (j === i ? { ...x, finding: { ...x.finding, title: e.target.value } } : x)),
                )
              }
              style={{ fontWeight: 600 }}
            />
            <select
              value={a.finding.category}
              onChange={(e) =>
                setAdded((xs) =>
                  xs.map((x, j) => (j === i ? { ...x, finding: { ...x.finding, category: e.target.value } } : x)),
                )
              }
              style={{ width: "auto" }}
            >
              {props.categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <textarea
            placeholder="Rationale, grounded in the documents"
            value={a.finding.rationale}
            onChange={(e) =>
              setAdded((xs) =>
                xs.map((x, j) => (j === i ? { ...x, finding: { ...x.finding, rationale: e.target.value } } : x)),
              )
            }
          />
          <input
            type="text"
            placeholder="Citation"
            value={a.finding.citation}
            onChange={(e) =>
              setAdded((xs) =>
                xs.map((x, j) => (j === i ? { ...x, finding: { ...x.finding, citation: e.target.value } } : x)),
              )
            }
          />
          <div className="tools">
            <span className="pill">added (missed_by_ai)</span>
            <button className="danger" onClick={() => setAdded((xs) => xs.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
        </div>
      ))}
      <button onClick={addFinding}>+ Add finding the AI missed</button>

      <h2>Narrative</h2>
      <textarea
        value={narrative}
        onChange={(e) => setNarrative(e.target.value)}
        style={{ minHeight: 140 }}
      />

      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
        <button className="primary" onClick={deliver} disabled={busy}>
          {busy ? "Delivering…" : "Approve & deliver"}
        </button>
        <span className="muted">
          {rows.filter((r) => r.status === "rejected").length} rejected ·{" "}
          {rows.filter((r) => r.status === "edited").length} edited · {added.length} added
        </span>
      </div>
    </div>
  );
}
