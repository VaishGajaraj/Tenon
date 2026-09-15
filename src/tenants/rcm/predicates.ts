import type { CellLocator, FactRow, FuzzyProposal, PredicateName, TriggerEvent } from "./schema";
import { COPY_IA, COPY_SOX } from "./schema";
import type { AutoMatch } from "./schema";
import type { DirectoryPerson, IssueRecord, RiskRecord } from "./schema";
import { IA_MAP, SOX_MAP, locator, missingLocator } from "./ingest";
import { DUPLICATE_THRESHOLD, similarity } from "./identity";

export interface Flag {
  id: string;
  predicate: PredicateName;
  title: string;
  rationale: string;
  quotes: { left: string; right: string };
  locators: [CellLocator, CellLocator];
  iaDisplayId: string | null;
  soxDisplayId: string | null;
  field: string | null;
  confidence: "high" | "medium" | "low";
}

export interface PredicateInput {
  asOf: string;
  directory: DirectoryPerson[];
  risks: RiskRecord[];
  issues: IssueRecord[];
  triggers: TriggerEvent[];
  ia: FactRow[];
  sox: FactRow[];
  priorSox: FactRow[];
  auto: AutoMatch[];
  fuzzy: FuzzyProposal[];
  unmatchedIa: FactRow[];
  unmatchedSox: FactRow[];
}

const STALE_FLOOR_DAYS = 365;

function daysBetween(later: string, earlier: string): number {
  const a = Date.parse(later);
  const b = Date.parse(earlier);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.floor((a - b) / (24 * 3600 * 1000));
}

function locPair(ia: FactRow | null, sox: FactRow | null, iaHeader: string, soxHeader: string, iaQuote: string | null, soxQuote: string | null, iaNote?: string, soxNote?: string): [CellLocator, CellLocator] {
  const left = ia
    ? locator(ia, iaHeader, iaQuote, true, iaNote)
    : missingLocator(COPY_IA, "Controls", "A", iaNote ?? "not present on IA RCM");
  const right = sox
    ? locator(sox, soxHeader, soxQuote, true, soxNote)
    : missingLocator(COPY_SOX, "RCM", "A", soxNote ?? "not present on SOX RCM");
  return [left, right];
}

function bothResolved(pair: [CellLocator, CellLocator]): boolean {
  return pair[0].resolved && pair[1].resolved;
}

export function runPredicates(input: PredicateInput): { flags: Flag[]; quarantined: Flag[] } {
  const flags: Flag[] = [];
  const quarantined: Flag[] = [];
  const emit = (f: Flag) => {
    if (!bothResolved(f.locators) || f.locators.length !== 2) {
      quarantined.push(f);
      return;
    }
    flags.push(f);
  };

  const dirNames = new Set(input.directory.map((p) => p.name.toLowerCase()));
  const riskIds = new Set(input.risks.map((r) => r.riskId));
  const activeIds = new Set(
    [...input.ia, ...input.sox].filter((r) => r.status === "active").map((r) => r.displayId),
  );
  const priorByDisplay = new Map(input.priorSox.map((r) => [r.displayId, r]));
  const priorByRecord = new Map(input.priorSox.map((r) => [r.recordId, r]));

  let n = 0;
  const id = (p: PredicateName) => `rcm-${p}-${++n}`;

  for (const m of input.auto) {
    const { ia, sox } = m;

    if (ia.displayId !== sox.displayId) {
      const locators = locPair(ia, sox, IA_MAP.displayId, SOX_MAP.displayId, ia.displayId, sox.displayId);
      emit({
        id: id("renumbered"),
        predicate: "renumbered",
        title: `Renumbered: ${ia.displayId} vs ${sox.displayId}`,
        rationale: `Matched by ${m.method}, but display IDs differ. IA quotes “${ia.displayId}”; SOX quotes “${sox.displayId}”.`,
        quotes: { left: ia.displayId, right: sox.displayId },
        locators,
        iaDisplayId: ia.displayId,
        soxDisplayId: sox.displayId,
        field: "displayId",
        confidence: "high",
      });
    }

    if (ia.description.trim() !== sox.description.trim()) {
      const locators = locPair(ia, sox, IA_MAP.description, SOX_MAP.description, ia.description, sox.description);
      emit({
        id: id("description_divergence"),
        predicate: "description_divergence",
        title: `Description drifted on ${ia.displayId}`,
        rationale: `Same control, drifted wording. IA cell quotes “${ia.description}”. SOX cell quotes “${sox.description}”.`,
        quotes: { left: ia.description, right: sox.description },
        locators,
        iaDisplayId: ia.displayId,
        soxDisplayId: sox.displayId,
        field: "description",
        confidence: "high",
      });
    }

    const attrFields: { field: keyof FactRow; iaHeader: string; soxHeader: string; label: string }[] = [
      { field: "owner", iaHeader: IA_MAP.owner, soxHeader: SOX_MAP.owner, label: "owner" },
      { field: "frequency", iaHeader: IA_MAP.frequency, soxHeader: SOX_MAP.frequency, label: "frequency" },
      { field: "status", iaHeader: IA_MAP.status, soxHeader: SOX_MAP.status, label: "status" },
    ];
    for (const a of attrFields) {
      const left = String(ia[a.field] ?? "");
      const right = String(sox[a.field] ?? "");
      if (left === right) continue;
      const locators = locPair(ia, sox, a.iaHeader, a.soxHeader, left, right);
      const freqNote =
        a.field === "frequency"
          ? " Both cell values are quoted as an attribute diff. We do not interpret which frequency the source meant."
          : "";
      emit({
        id: id("attribute_mismatch"),
        predicate: "attribute_mismatch",
        title: `${a.label} differs on ${ia.displayId}`,
        rationale: `${a.label} IA quotes “${left}”; SOX quotes “${right}”.${freqNote}`,
        quotes: { left, right },
        locators,
        iaDisplayId: ia.displayId,
        soxDisplayId: sox.displayId,
        field: a.field,
        confidence: "high",
      });
    }

    const iaWithdrawn = ia.status === "withdrawn" || ia.status === "retired";
    const soxWithdrawn = sox.status === "withdrawn" || sox.status === "retired";
    if ((iaWithdrawn && sox.tested) || (soxWithdrawn && ia.tested)) {
      const locators = locPair(
        ia,
        sox,
        IA_MAP.status,
        SOX_MAP.tested,
        `${ia.status} / tested=${ia.tested}`,
        `${sox.status} / tested=${sox.tested}`,
      );
      emit({
        id: id("withdrawn_still_tested"),
        predicate: "withdrawn_still_tested",
        title: `Withdrawn still tested: ${ia.displayId}`,
        rationale: `IA quotes status “${ia.status}” tested=${ia.tested}. SOX quotes status “${sox.status}” tested=${sox.tested}.`,
        quotes: { left: `${ia.status}/${ia.tested}`, right: `${sox.status}/${sox.tested}` },
        locators,
        iaDisplayId: ia.displayId,
        soxDisplayId: sox.displayId,
        field: "status",
        confidence: "high",
      });
    }
  }

  const considerOwners = [...input.ia, ...input.sox];
  const seenOwner = new Set<string>();
  for (const row of considerOwners) {
    const key = `${row.copy}:${row.displayId}:${row.owner}`;
    if (seenOwner.has(key)) continue;
    seenOwner.add(key);
    const ownerKey = row.owner.toLowerCase().replace(/,.*/, "").trim();
    const known = [...dirNames].some((n) => ownerKey.includes(n) || n.includes(ownerKey));
    if (known) continue;
    const isIa = row.copy === COPY_IA;
    const locators = locPair(
      isIa ? row : null,
      isIa ? null : row,
      IA_MAP.owner,
      SOX_MAP.owner,
      isIa ? row.owner : null,
      isIa ? null : row.owner,
      undefined,
      undefined,
    );
    emit({
      id: id("owner_not_in_directory"),
      predicate: "owner_not_in_directory",
      title: `Owner not in directory: ${row.owner}`,
      rationale: `“${row.owner}” on ${row.copy} ${row.displayId} is not in the Wrenbridge directory.`,
      quotes: { left: isIa ? row.owner : "", right: isIa ? "" : row.owner },
      locators,
      iaDisplayId: isIa ? row.displayId : null,
      soxDisplayId: isIa ? null : row.displayId,
      field: "owner",
      confidence: "high",
    });
  }

  for (const row of [...input.ia, ...input.sox]) {
    if (row.riskIds.length > 0) continue;
    const isIa = row.copy === COPY_IA;
    const locators = locPair(
      isIa ? row : null,
      isIa ? null : row,
      IA_MAP.riskIds,
      SOX_MAP.riskIds,
      isIa ? "(empty)" : null,
      isIa ? null : "(empty)",
    );
    emit({
      id: id("unmapped_control"),
      predicate: "unmapped_control",
      title: `Unmapped control ${row.displayId} on ${row.copy}`,
      rationale: `${row.copy} ${row.displayId} has an empty risk mapping. The ${isIa ? "Risk ID" : "Risk Ref"} cell is blank.`,
      quotes: { left: isIa ? "(empty)" : "", right: isIa ? "" : "(empty)" },
      locators,
      iaDisplayId: isIa ? row.displayId : null,
      soxDisplayId: isIa ? null : row.displayId,
      field: "riskIds",
      confidence: "high",
    });
  }

  for (const row of [...input.ia, ...input.sox]) {
    const dead = row.riskIds.filter((r) => !riskIds.has(r));
    if (dead.length === 0) continue;
    const isIa = row.copy === COPY_IA;
    const locators = locPair(
      isIa ? row : null,
      isIa ? null : row,
      IA_MAP.riskIds,
      SOX_MAP.riskIds,
      isIa ? row.riskIds.join("; ") : null,
      isIa ? null : row.riskIds.join("; "),
    );
    emit({
      id: id("dead_risk_mapping"),
      predicate: "dead_risk_mapping",
      title: `Dead risk mapping on ${row.displayId}`,
      rationale: `${row.copy} ${row.displayId} maps to ${dead.join(", ")}, which is not on the risk register.`,
      quotes: { left: isIa ? dead.join(", ") : "", right: isIa ? "" : dead.join(", ") },
      locators,
      iaDisplayId: isIa ? row.displayId : null,
      soxDisplayId: isIa ? null : row.displayId,
      field: "riskIds",
      confidence: "high",
    });
  }

  const mapped = new Set([...input.ia, ...input.sox].flatMap((r) => r.riskIds));
  for (const risk of input.risks) {
    if (mapped.has(risk.riskId)) continue;
    const locators: [CellLocator, CellLocator] = [
      missingLocator(COPY_IA, "Risks", "A", `risk ${risk.riskId} has no IA control`),
      missingLocator(COPY_SOX, "Risks", "A", `risk ${risk.riskId} has no SOX control`),
    ];
    emit({
      id: id("risk_without_control"),
      predicate: "risk_without_control",
      title: `Risk without control: ${risk.riskId}`,
      rationale: `${risk.riskId} (${risk.title}) is on the register and mapped from neither copy.`,
      quotes: { left: risk.riskId, right: risk.riskId },
      locators,
      iaDisplayId: null,
      soxDisplayId: null,
      field: "riskId",
      confidence: "high",
    });
  }

  for (const issue of input.issues) {
    if (activeIds.has(issue.controlDisplayId)) continue;
    const locators: [CellLocator, CellLocator] = [
      missingLocator(COPY_IA, "Issues", "A", `issue ${issue.issueId} cites ${issue.controlDisplayId}`),
      missingLocator(COPY_SOX, "Issues", "A", `issue ${issue.issueId} cites ${issue.controlDisplayId}`),
    ];
    emit({
      id: id("orphaned_issue"),
      predicate: "orphaned_issue",
      title: `Orphaned issue ${issue.issueId}`,
      rationale: `${issue.issueId} (“${issue.title}”) cites ${issue.controlDisplayId}, which is not an active control on either copy.`,
      quotes: { left: issue.controlDisplayId, right: issue.controlDisplayId },
      locators,
      iaDisplayId: null,
      soxDisplayId: null,
      field: "controlDisplayId",
      confidence: "high",
    });
  }

  const soxRows = input.sox;
  const usedDup = new Set<string>();
  const duplicateDisplayIds = new Set<string>();
  for (let i = 0; i < soxRows.length; i++) {
    for (let j = i + 1; j < soxRows.length; j++) {
      const a = soxRows[i];
      const b = soxRows[j];
      if (a.displayId === b.displayId) continue;
      const score = similarity(`${a.title} ${a.description}`, `${b.title} ${b.description}`);
      if (score < DUPLICATE_THRESHOLD) continue;
      const key = [a.displayId, b.displayId].sort().join("|");
      if (usedDup.has(key)) continue;
      usedDup.add(key);
      duplicateDisplayIds.add(a.displayId);
      duplicateDisplayIds.add(b.displayId);
      const locators: [CellLocator, CellLocator] = [
        locator(a, SOX_MAP.displayId, a.displayId),
        locator(b, SOX_MAP.displayId, b.displayId),
      ];
      emit({
        id: id("duplicate_candidate"),
        predicate: "duplicate_candidate",
        title: `Duplicate candidate ${a.displayId} / ${b.displayId}`,
        rationale: `Two SOX rows are near-copies (similarity ${(score * 100).toFixed(0)}%). “${a.displayId}” and “${b.displayId}”.`,
        quotes: { left: a.displayId, right: b.displayId },
        locators,
        iaDisplayId: null,
        soxDisplayId: a.displayId,
        field: "description",
        confidence: "medium",
      });
    }
  }

  const staleSeen = new Set<string>();
  for (const row of [...input.ia, ...input.sox]) {
    if (!row.lastReviewedOn) continue;
    if (staleSeen.has(row.displayId)) continue;
    const age = daysBetween(input.asOf, row.lastReviewedOn);
    const triggerHit = input.triggers.find((t) => t.date > row.lastReviewedOn && t.date <= input.asOf);
    if (age < STALE_FLOOR_DAYS && !triggerHit) continue;
    staleSeen.add(row.displayId);
    const isIa = row.copy === COPY_IA;
    const locators = locPair(
      isIa ? row : null,
      isIa ? null : row,
      IA_MAP.lastReviewedOn,
      SOX_MAP.lastReviewedOn,
      isIa ? row.lastReviewedOn : null,
      isIa ? null : row.lastReviewedOn,
    );
    emit({
      id: id("stale_review"),
      predicate: "stale_review",
      title: `Stale review ${row.displayId} on ${row.copy}`,
      rationale: `Last reviewed “${row.lastReviewedOn}”; import as-of is ${input.asOf} (${age} days, floor ${STALE_FLOOR_DAYS}).${triggerHit ? ` Trigger “${triggerHit.name}” on ${triggerHit.date} is after the last review.` : ""}`,
      quotes: { left: isIa ? row.lastReviewedOn : input.asOf, right: isIa ? input.asOf : row.lastReviewedOn },
      locators,
      iaDisplayId: isIa ? row.displayId : null,
      soxDisplayId: isIa ? null : row.displayId,
      field: "lastReviewedOn",
      confidence: "high",
    });
  }

  for (const row of input.sox) {
    const prior = priorByDisplay.get(row.displayId) ?? priorByRecord.get(row.recordId);
    if (!prior) continue;
    if (prior.rowHash === row.rowHash) continue;
    const locators = locPair(null, row, IA_MAP.description, SOX_MAP.description, null, row.description);
    locators[0] = locator(prior, SOX_MAP.description, prior.description, true, "prior import set");
    locators[1] = locator(row, SOX_MAP.description, row.description, true, "current import set");
    emit({
      id: id("changed_since_last_import"),
      predicate: "changed_since_last_import",
      title: `Changed since last import: ${row.displayId}`,
      rationale: `Row hash moved from ${prior.rowHash.slice(0, 8)}… to ${row.rowHash.slice(0, 8)}…. Source modified “${row.sourceModifiedOn}” is evidence; the import clock is the hash, not the wall clock. Prior cell quotes “${prior.description}”. Current cell quotes “${row.description}”.`,
      quotes: { left: prior.description, right: row.description },
      locators,
      iaDisplayId: null,
      soxDisplayId: row.displayId,
      field: "description",
      confidence: "high",
    });
  }

  for (const row of input.unmatchedIa) {
    if (duplicateDisplayIds.has(row.displayId)) continue;
    const locators = locPair(
      row,
      null,
      IA_MAP.displayId,
      SOX_MAP.displayId,
      row.displayId,
      null,
      undefined,
      `display id ${row.displayId} not present`,
    );
    emit({
      id: id("unmatched_in_copy"),
      predicate: "unmatched_in_copy",
      title: `Keyed miss: ${row.displayId} on IA RCM only`,
      rationale: `${row.displayId} (“${row.title}”) is on IA RCM and not on SOX RCM. A VLOOKUP on Ctrl# would return #N/A.`,
      quotes: { left: row.displayId, right: "(not present)" },
      locators,
      iaDisplayId: row.displayId,
      soxDisplayId: null,
      field: "displayId",
      confidence: "high",
    });
  }
  for (const row of input.unmatchedSox) {
    if (duplicateDisplayIds.has(row.displayId)) continue;
    const locators = locPair(
      null,
      row,
      IA_MAP.displayId,
      SOX_MAP.displayId,
      null,
      row.displayId,
      `display id ${row.displayId} not present`,
      undefined,
    );
    emit({
      id: id("unmatched_in_copy"),
      predicate: "unmatched_in_copy",
      title: `Keyed miss: ${row.displayId} on SOX RCM only`,
      rationale: `${row.displayId} (“${row.title}”) is on SOX RCM and not on IA RCM. A VLOOKUP on Control ID would return #N/A.`,
      quotes: { left: "(not present)", right: row.displayId },
      locators,
      iaDisplayId: null,
      soxDisplayId: row.displayId,
      field: "displayId",
      confidence: "high",
    });
  }

  for (const f of input.fuzzy) {
    const locators = locPair(
      f.ia,
      f.sox,
      IA_MAP.displayId,
      SOX_MAP.displayId,
      f.ia.displayId,
      f.sox.displayId,
    );
    emit({
      id: id("needs_human_match"),
      predicate: "needs_human_match",
      title: `Needs human match: ${f.ia.displayId} ~ ${f.sox.displayId}`,
      rationale: `Fuzzy similarity ${(f.score * 100).toFixed(0)}% — flagged for a human, never auto-matched. IA quotes “${f.ia.displayId} ${f.ia.title}”. SOX quotes “${f.sox.displayId} ${f.sox.title}”.`,
      quotes: { left: `${f.ia.displayId} ${f.ia.title}`, right: `${f.sox.displayId} ${f.sox.title}` },
      locators,
      iaDisplayId: f.ia.displayId,
      soxDisplayId: f.sox.displayId,
      field: "displayId",
      confidence: "medium",
    });
  }

  return { flags, quarantined };
}

/** Guard: this module must never define a test-vs-operating frequency conflict predicate. */
export const FORBIDDEN_FREQUENCY_CONFLICT = "test_vs_operating_frequency";
