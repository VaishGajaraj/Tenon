# Workflow integration (co-source reviewer)

How a solo practitioner uses Tenon next to Excel or AuditBoard **today**. This is a disclosed-subcontractor workpaper loop, not a GRC seat.

MOCK badge stays on. File drop is local ingest of reviewer-shaped matrices (public-domain or fictionalized bank language). It is **not** production client ingest.

## The loop

1. **Export two copies the bank already keeps.** Typical pair: Internal Audit RCM and SOX/ICFR RCM. Optional third: RCSA or IT GRC extract. Export `.xlsx` or `.csv` from Excel, SharePoint, or the GRC tool’s table export.
2. **Confirm headers match a preset** (`docs/PRESET-COLUMN-MAPS.md`):
   - Generic RCM (`Control ID`, `Control Title`, `Control Description`, `Owner`, `Frequency`, …)
   - AuditBoard-ish (`Control ID`, `Control Title`, `Control Owner`, `Control Frequency`, `Last Test Date`, …)
   If the export uses other labels, rename columns in Excel. There is **no mapper UI**.
3. **Drop the files on `/recon`.** Badge is MOCK. Bad rows (empty / missing Control ID) are quarantined and never enter the flag matrix.
4. **Run predicates.** TypeScript over the fact table — not model prose. Frequency mismatches quote both cell values; they are not “test vs operating conflict.”
5. **Review the queue** (mobile-usable, paginated). Accept: disposition + one-sentence rationale. Reject: reason code (row stays on **rejected-flags**).
6. **Export `.xlsx` workpaper.** Preparer, reviewer, date, MOCK stamp, rejected-flags tab never deleted.
7. **Hand the workpaper back into the bank pack.** Copy accepted dispositions into the living matrix, or keep Tenon’s file as the recon workpaper. Rejected-flags travel with the pack.

Sample files for the walkthrough: `/recon/samples/ia.xlsx`, `sox.xlsx`, `sox-auditboard.csv`.

## What does **not** integrate yet

- No AuditBoard / Optro / SOXHUB API plugin
- No Workiva, Archer, ServiceNow, MetricStream, TeamMate connector
- No live production client secrets, auth/RLS, or hash chain
- No mapper UI for arbitrary column names
- No PDF/narrative ingest
- Three-way predicates (optional third copy is ingested and listed; flags remain IA↔SOX)

If the client already lives in AuditBoard, Tenon is useful only when a second copy still lives in Excel, Workiva, RCSA, or a PBC extract — the seam, not a migration.

## Commands that must stay green

```bash
pnpm demo        # accept one + reject one through the real deliver path
pnpm selfcheck   # a line per mechanism that actually fired
pnpm build       # Next.js production build
```

Offline seed path (no API key): `pnpm db:init && pnpm seed && pnpm worker && pnpm dev`.
