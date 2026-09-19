import { COPY_IA, COPY_SOX, type GroundTruthEntry, type ReconUniverse, type RawWorkbook } from "./schema";
import { CANONICAL_CONTROLS, DIRECTORY, IMPORT_AS_OF, RISKS, TRIGGERS, type CanonicalControl } from "./library";
import { IA_MAP, SOX_MAP } from "./ingest";

type Mutable = CanonicalControl & { crosswalkId: string | null; recordId: string };

function cloneControl(c: CanonicalControl, copy: "ia" | "sox"): Mutable {
  const keepCrosswalk = ["canon-ac-01", "canon-ac-03", "canon-ia-01"].includes(c.canonicalId);
  return {
    ...c,
    riskIds: [...c.riskIds],
    recordId: copy === "ia" ? `IA-${c.canonicalId}` : `SOX-${c.canonicalId}`,
    crosswalkId: keepCrosswalk ? `GRC-${c.canonicalId.replace("canon-", "").toUpperCase()}` : null,
  };
}

function iaRaw(c: Mutable): Record<string, string> {
  return {
    [IA_MAP.recordId]: c.recordId,
    [IA_MAP.displayId]: c.displayId,
    [IA_MAP.crosswalkId]: c.crosswalkId ?? "",
    [IA_MAP.title]: c.title,
    [IA_MAP.description]: c.description,
    [IA_MAP.owner]: c.owner,
    [IA_MAP.frequency]: c.frequency,
    [IA_MAP.riskIds]: c.riskIds.join("; "),
    [IA_MAP.status]: c.status,
    [IA_MAP.tested]: c.tested ? "Y" : "N",
    [IA_MAP.lastReviewedOn]: c.lastReviewedOn,
    [IA_MAP.sourceModifiedOn]: c.sourceModifiedOn,
    [IA_MAP.issueId]: c.issueId ?? "",
    [IA_MAP.issueStatus]: c.issueStatus ?? "",
  };
}

function soxRaw(c: Mutable): Record<string, string> {
  const active = c.status === "active" ? "Y" : "N";
  return {
    [SOX_MAP.recordId]: c.recordId,
    [SOX_MAP.displayId]: c.displayId,
    [SOX_MAP.crosswalkId]: c.crosswalkId ?? "",
    [SOX_MAP.title]: c.title,
    [SOX_MAP.description]: c.description,
    [SOX_MAP.owner]: c.owner,
    [SOX_MAP.frequency]: c.frequency,
    [SOX_MAP.riskIds]: c.riskIds.join("; "),
    [SOX_MAP.status]: active,
    [SOX_MAP.tested]: c.tested ? "Y" : "N",
    [SOX_MAP.lastReviewedOn]: c.lastReviewedOn,
    [SOX_MAP.sourceModifiedOn]: c.sourceModifiedOn,
    [SOX_MAP.issueId]: c.issueId ?? "",
    [SOX_MAP.issueStatus]: c.issueStatus ?? "",
  };
}

function book(copyName: string, sheet: string, headers: string[], rows: Record<string, string>[]): RawWorkbook {
  return { copyName, sheet, headers, rows };
}

/**
 * Build two divergent named copies from the canonical library and record every
 * divergence in ground_truth so per-predicate precision/recall is exact.
 */
export function generateDemoUniverse(): ReconUniverse {
  const ia = CANONICAL_CONTROLS.map((c) => cloneControl(c, "ia"));
  const sox = CANONICAL_CONTROLS.map((c) => cloneControl(c, "sox"));
  const gt: GroundTruthEntry[] = [];
  const findIa = (id: string) => ia.find((c) => c.displayId === id)!;
  const findSox = (id: string) => sox.find((c) => c.displayId === id)!;

  // 1. Keyed miss a VLOOKUP would catch: termination control present in IA, absent in SOX.
  const dropped = sox.findIndex((c) => c.displayId === "ITGC-PS-01");
  sox.splice(dropped, 1);
  gt.push({
    id: "gt-unmatched-ps-01",
    predicate: "unmatched_in_copy",
    iaDisplayId: "ITGC-PS-01",
    soxDisplayId: null,
    field: "displayId",
    iaValue: "ITGC-PS-01",
    soxValue: null,
    note: "Keyed miss: ITGC-PS-01 is in IA RCM and not in SOX RCM. A VLOOKUP on Ctrl# returns #N/A.",
  });

  // 2. Semantic flag Excel would miss: same control ID, drifted wording and owner.
  const soxAc02 = findSox("ITGC-AC-02");
  const iaAc02 = findIa("ITGC-AC-02");
  soxAc02.description =
    "Business owners confirm privileged IDs on the core and payment rails once a quarter. IDs that miss the window stay enabled until the next cycle unless Information Security objects.";
  soxAc02.owner = "Marcus Hale";
  soxAc02.sourceModifiedOn = "2026-04-22";
  gt.push({
    id: "gt-desc-ac-02",
    predicate: "description_divergence",
    iaDisplayId: iaAc02.displayId,
    soxDisplayId: soxAc02.displayId,
    field: "description",
    iaValue: iaAc02.description,
    soxValue: soxAc02.description,
    note: "Same control, drifted wording. Quote is from the source cell.",
  });
  gt.push({
    id: "gt-owner-ac-02",
    predicate: "attribute_mismatch",
    iaDisplayId: iaAc02.displayId,
    soxDisplayId: soxAc02.displayId,
    field: "owner",
    iaValue: iaAc02.owner,
    soxValue: soxAc02.owner,
    note: "Owner drifted on the same control (Elena Voss vs Marcus Hale).",
  });

  // 3. Frequency as an attribute diff with both values quoted — never a test-vs-operating conflict.
  const iaCm01 = findIa("ITGC-CM-01");
  const soxCm01 = findSox("ITGC-CM-01");
  soxCm01.frequency = "Monthly";
  soxCm01.sourceModifiedOn = "2026-04-08";
  gt.push({
    id: "gt-freq-cm-01",
    predicate: "attribute_mismatch",
    iaDisplayId: iaCm01.displayId,
    soxDisplayId: soxCm01.displayId,
    field: "frequency",
    iaValue: iaCm01.frequency,
    soxValue: soxCm01.frequency,
    note: "Frequency field only. Quote both values. Do not claim test-frequency vs operating-frequency conflict.",
  });

  // 4. Renumbered: SOX split physical-access into a new ID; body text unchanged so content-hash matches.
  const soxPe = findSox("ITGC-PE-01");
  soxPe.displayId = "ITGC-PE-01A";
  soxPe.crosswalkId = null;
  soxPe.recordId = "SOX-canon-pe-01-split";
  gt.push({
    id: "gt-renumber-pe-01",
    predicate: "renumbered",
    iaDisplayId: "ITGC-PE-01",
    soxDisplayId: "ITGC-PE-01A",
    field: "displayId",
    iaValue: "ITGC-PE-01",
    soxValue: "ITGC-PE-01A",
    note: "Same control text, new SOX ID after a physical-access split.",
  });

  // 5. Withdrawn in IA, still tested in SOX.
  const iaSi = findIa("ITGC-SI-01");
  iaSi.status = "withdrawn";
  iaSi.tested = false;
  iaSi.sourceModifiedOn = "2026-01-15";
  const soxSi = findSox("ITGC-SI-01");
  soxSi.tested = true;
  soxSi.status = "active";
  gt.push({
    id: "gt-withdrawn-si-01",
    predicate: "withdrawn_still_tested",
    iaDisplayId: iaSi.displayId,
    soxDisplayId: soxSi.displayId,
    field: "status",
    iaValue: "withdrawn / not tested",
    soxValue: "active / tested",
    note: "IA withdrew malware/IDS control; SOX still tests it.",
  });

  // 6. Owner not in the bank directory (SOX vendor contractor).
  const soxSa = findSox("ITGC-SA-01");
  soxSa.owner = "Jordan Keene, Contractor";
  gt.push({
    id: "gt-owner-dir-sa-01",
    predicate: "owner_not_in_directory",
    iaDisplayId: "ITGC-SA-01",
    soxDisplayId: "ITGC-SA-01",
    field: "owner",
    iaValue: findIa("ITGC-SA-01").owner,
    soxValue: soxSa.owner,
    note: "Jordan Keene is not in the Wrenbridge directory.",
  });

  // 7. Unmapped control — incident handling lost its risk link in SOX.
  const soxIr = findSox("ITGC-IR-01");
  soxIr.riskIds = [];
  gt.push({
    id: "gt-unmapped-ir-01",
    predicate: "unmapped_control",
    iaDisplayId: "ITGC-IR-01",
    soxDisplayId: "ITGC-IR-01",
    field: "riskIds",
    iaValue: findIa("ITGC-IR-01").riskIds.join(","),
    soxValue: "",
    note: "SOX incident-handling control has no risk mapping.",
  });

  // 8. Dead risk mapping.
  const soxRa = findSox("ITGC-RA-01");
  soxRa.riskIds = ["RISK-GHOST"];
  gt.push({
    id: "gt-dead-risk-ra-01",
    predicate: "dead_risk_mapping",
    iaDisplayId: "ITGC-RA-01",
    soxDisplayId: "ITGC-RA-01",
    field: "riskIds",
    iaValue: findIa("ITGC-RA-01").riskIds.join(","),
    soxValue: "RISK-GHOST",
    note: "SOX vulnerability control maps to a risk ID that is not on the register.",
  });

  // 9. Stale review (365-day floor + trigger after last review).
  gt.push({
    id: "gt-stale-cp-02",
    predicate: "stale_review",
    iaDisplayId: "ITGC-CP-02",
    soxDisplayId: "ITGC-CP-02",
    field: "lastReviewedOn",
    iaValue: findIa("ITGC-CP-02").lastReviewedOn,
    soxValue: findSox("ITGC-CP-02").lastReviewedOn,
    note: "Last reviewed 2024-05-01; as-of 2026-06-01 is past the 365-day floor and after core_banking_conversion.",
  });

  // 10. Fuzzy human-match: SOX renamed the BCP control; VLOOKUP on ID fails; wording is close.
  const soxCp01i = sox.findIndex((c) => c.displayId === "ITGC-CP-01");
  const [soxCp01] = sox.splice(soxCp01i, 1);
  sox.push({
    ...soxCp01,
    recordId: "SOX-bcp-07",
    displayId: "SOX-BCP-07",
    crosswalkId: null,
    title: "Business continuity plan covering core deposit processing",
    description:
      "The bank keeps a business continuity plan covering core deposit processing, ATM and debit authorization, and FedLine access. Deposit-posting recovery time is four hours; recovery point is the last successful batch.",
    sourceModifiedOn: "2026-02-12",
  });
  gt.push({
    id: "gt-fuzzy-cp-01",
    predicate: "needs_human_match",
    iaDisplayId: "ITGC-CP-01",
    soxDisplayId: "SOX-BCP-07",
    field: "displayId",
    iaValue: "ITGC-CP-01",
    soxValue: "SOX-BCP-07",
    note: "Different IDs, similar wording. Identity ladder flags for a human and does not auto-match.",
  });

  // 11. Duplicate candidate inside SOX (near-copy of SOD control).
  const soxAc03 = findSox("ITGC-AC-03");
  sox.push({
    ...soxAc03,
    recordId: "SOX-canon-ac-03-dup",
    displayId: "ITGC-AC-03-DUP",
    crosswalkId: null,
    title: "Segregation of duties: originating notes versus posting the GL",
    description:
      "No user may both originate a commercial note in the core and post the related general-ledger entry. The SOD matrix is reviewed when roles change and at least annually. Exceptions require CFO written approval and a compensating review.",
  });
  gt.push({
    id: "gt-dup-ac-03",
    predicate: "duplicate_candidate",
    iaDisplayId: "ITGC-AC-03",
    soxDisplayId: "ITGC-AC-03-DUP",
    field: "description",
    iaValue: null,
    soxValue: "ITGC-AC-03 vs ITGC-AC-03-DUP",
    note: "Two SOX rows describe the same SOD control.",
  });

  // Snapshot SOX *before* the AU-02 text change so changed_since_last_import is exact.
  const priorSoxRows = sox.map((c) => soxRaw(c));

  // 12. Changed since last SOX import (row hash is the clock). IA still matches current SOX.
  const soxAu = findSox("ITGC-AU-02");
  soxAu.description =
    "Information Security reviews the SIEM dashboard of privileged use and failed access each week, documents the review, and opens an incident ticket for unexplained activity within four business hours.";
  soxAu.sourceModifiedOn = "2026-05-02";
  gt.push({
    id: "gt-changed-au-02",
    predicate: "changed_since_last_import",
    iaDisplayId: "ITGC-AU-02",
    soxDisplayId: "ITGC-AU-02",
    field: "description",
    iaValue: findIa("ITGC-AU-02").description,
    soxValue: soxAu.description,
    note: "SOX row hash changed since the prior import set. Source modified date is evidence; the clock is the hash.",
  });

  // 13. Orphaned issue — points at a control ID that exists in neither copy.
  const issues = [
    { issueId: "ISS-118", title: "SOD exception for note operations lead", controlDisplayId: "ITGC-AC-03", status: "open" },
    {
      issueId: "ISS-204",
      title: "Legacy teller-override control not evidenced",
      controlDisplayId: "ITGC-OLD-99",
      status: "open",
    },
  ];
  gt.push({
    id: "gt-orphan-iss-204",
    predicate: "orphaned_issue",
    iaDisplayId: null,
    soxDisplayId: null,
    field: "controlDisplayId",
    iaValue: null,
    soxValue: "ITGC-OLD-99",
    note: "ISS-204 cites ITGC-OLD-99, which is on neither copy.",
  });

  // 14. Risk on the register with no control mapping.
  const risks = [...RISKS, { riskId: "RISK-LIQ-01", title: "Intraday liquidity reporting feed fails", owner: "Chris Molina" }];
  gt.push({
    id: "gt-risk-without-liq",
    predicate: "risk_without_control",
    iaDisplayId: null,
    soxDisplayId: null,
    field: "riskId",
    iaValue: null,
    soxValue: "RISK-LIQ-01",
    note: "RISK-LIQ-01 sits on the register with no mapped control.",
  });

  const iaHeaders = Object.values(IA_MAP);
  const soxHeaders = Object.values(SOX_MAP);

  return {
    bankName: "Wrenbridge Community Bank, N.A.",
    asOf: IMPORT_AS_OF,
    dataMode: "MOCK",
    ia: book(COPY_IA, "Controls", iaHeaders, ia.map(iaRaw)),
    sox: book(COPY_SOX, "RCM", soxHeaders, sox.map(soxRaw)),
    priorSox: book(COPY_SOX, "RCM", soxHeaders, priorSoxRows),
    directory: DIRECTORY.map((d) => ({ ...d })),
    risks: risks.map((r) => ({ ...r })),
    issues,
    triggers: TRIGGERS.map((t) => ({ ...t })),
    groundTruth: gt,
    ingestReport: {
      source: "seed",
      maps: { ia: "ia", sox: "sox" },
      quarantined: [],
    },
  };
}
