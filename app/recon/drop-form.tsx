"use client";

import { useState } from "react";
import { ingestDroppedAction } from "../actions";

export function DropForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const ia = fd.get("ia");
    const sox = fd.get("sox");
    if (!(ia instanceof File) || ia.size === 0) {
      setError("Drop an IA RCM .xlsx or .csv.");
      return;
    }
    if (!(sox instanceof File) || sox.size === 0) {
      setError("Drop a SOX RCM .xlsx or .csv.");
      return;
    }
    setBusy(true);
    try {
      await ingestDroppedAction(fd);
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <h2 style={{ marginTop: 0 }}>Drop two matrices (optional third)</h2>
      <p className="muted">
        Local MOCK ingest of reviewer-shaped .xlsx/.csv — not production client ingest, not an
        AuditBoard API. Preset maps only; there is no mapper UI. Badge stays MOCK.
      </p>
      <label>
        IA RCM (.xlsx or .csv)
        <input name="ia" type="file" accept=".xlsx,.csv,text/csv" required />
      </label>
      <label>
        SOX RCM (.xlsx or .csv)
        <input name="sox" type="file" accept=".xlsx,.csv,text/csv" required />
      </label>
      <label>
        Optional third copy — RCSA / IT GRC (.xlsx or .csv)
        <input name="rcsa" type="file" accept=".xlsx,.csv,text/csv" />
      </label>
      <label>
        Column map
        <select name="preset" defaultValue="auto">
          <option value="auto">Auto-detect (generic RCM or AuditBoard-ish)</option>
          <option value="generic">Generic RCM</option>
          <option value="auditboardish">AuditBoard-ish export columns</option>
          <option value="ia">Wrenbridge IA headers</option>
          <option value="sox">Wrenbridge SOX headers</option>
        </select>
      </label>
      <label>
        Preparer
        <input name="preparer" type="text" defaultValue="A. Sample, Internal Audit" />
      </label>
      <label>
        Reviewer
        <input name="reviewer" type="text" defaultValue="B. Sample, SOX PMO" />
      </label>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      <div style={{ marginTop: 12 }}>
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Ingesting…" : "Ingest copies"}
        </button>
      </div>
      <p className="muted" style={{ marginBottom: 0 }}>
        Sample files:{" "}
        <a href="/recon/samples/ia.csv">IA csv</a>
        {" · "}
        <a href="/recon/samples/sox.csv">SOX csv</a>
        {" · "}
        <a href="/recon/samples/ia.xlsx">IA xlsx</a>
        {" · "}
        <a href="/recon/samples/sox.xlsx">SOX xlsx</a>
        {" · "}
        <a href="/recon/samples/sox-auditboard.csv">SOX AuditBoard-ish csv</a>
      </p>
    </form>
  );
}
