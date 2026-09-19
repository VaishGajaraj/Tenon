# Preset column maps (no mapper UI)

Tenon maps dropped IA / SOX / optional RCSA spreadsheets onto the canonical fact schema with **code presets**, not a mapper UI. Rename columns to a preset if a bank's export differs. Live AuditBoard / Workiva / Archer connectors are out of scope.

Badge stays **MOCK**. File drop is local demo ingest of reviewer-shaped matrices (public-domain or fictionalized bank language). It is not production client ingest.

## Generic RCM

Typical Excel RCM / FloQast-style template headers. Used by the Wrenbridge IA sample and by `preset=generic`.

| Canonical field | Header |
| --- | --- |
| recordId | System Key |
| displayId | Control ID |
| crosswalkId | GRC Key |
| title | Control Title |
| description | Control Description |
| owner | Owner |
| frequency | Frequency |
| riskIds | Risk ID |
| status | Status |
| tested | Tested |
| lastReviewedOn | Last Reviewed |
| sourceModifiedOn | Source Modified |
| issueId | Issue ID |
| issueStatus | Issue Status |

Aliases accepted on ingest (still no mapper UI): `Control Number`, `Control Name`, `Risk`, `Last Tested`.

## AuditBoard-ish export

**Not an official AuditBoard schema.** Column names documented from public sources only:

- Agency Insights *AuditBoard Implementation Guide for SOC 2* — Control ID, Control title, Control description, Control frequency, Control owner ([public article](https://blog.getagency.com/articles/auditboard-implementation-guide-for-soc-2-compliance))
- Public community Excel-import thread using `Control_ID`, `Status` ([Stackinsight / AuditBoard reviews](https://communities.stackinsight.net/community/cyber-auditboard/anyone-else-having-issues-with-the-excel-import-my-mapping-keeps-failing/))
- Unofficial public API examples using `name`, `frequency`, `lastTestedAt`, `designStatus`

| Canonical field | Header we accept |
| --- | --- |
| recordId | Unique ID |
| displayId | Control ID |
| crosswalkId | Framework Mapping |
| title | Control Title |
| description | Control Description |
| owner | Control Owner |
| frequency | Control Frequency |
| riskIds | Associated Risks |
| status | Control Status |
| tested | Testing Status |
| lastReviewedOn | Last Test Date |
| sourceModifiedOn | Last Updated |
| issueId | Issue ID |
| issueStatus | Issue Status |

`Control_ID` (underscore) is treated as Control ID.

There is **no AuditBoard API plugin**. Export from the platform to Excel/CSV, drop the files, review, export Tenon's workpaper `.xlsx`.

## Wrenbridge seed maps

The manufactured demo still uses distinct IA vs SOX headers (`System Key` / `Ctrl#` / `Control Language` …) so the 10-minute walkthrough can show two copies that do not share a spreadsheet schema.

## Bad rows

Rows that are empty, or that lack a Control ID (display id), are **quarantined** and never enter the fact table or the flag matrix.
