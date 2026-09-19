/**
 * Additional MOCK controls so the Wrenbridge library reads like a mid-size
 * bank IA / SOX RCM (ITGC classics plus ICFR, BSA/AML, payments, credit).
 *
 * Language is original bank wording rewritten from public-domain families:
 * NIST SP 800-53 Rev. 5 (public catalog / OSCAL-shaped control IDs, not copied
 * catalog text), FISCAM ITGCs, FDIC RMS IT and BSA topics, OCC Comptroller's
 * Handbooks, FFIEC IT Examination Handbook, 12 CFR Part 363. This is not a
 * substitute for those catalogs and is not any institution's RCM.
 */
import type { CanonicalControl } from "./schema";

function ctrl(
  partial: Pick<
    CanonicalControl,
    "canonicalId" | "displayId" | "nistFamily" | "catalog" | "title" | "description" | "owner" | "frequency" | "riskIds"
  > &
    Partial<CanonicalControl>,
): CanonicalControl {
  return {
    status: "active",
    tested: true,
    lastReviewedOn: "2026-03-15",
    sourceModifiedOn: "2026-03-15",
    issueId: null,
    issueStatus: null,
    ...partial,
  };
}

/** ICFR / Part 363 / COSO-shaped financial reporting controls. */
export const ICFR_CONTROLS: CanonicalControl[] = [
  ctrl({
    canonicalId: "canon-gl-01",
    displayId: "SOX-GL-01",
    nistFamily: "COSO monitoring / Part 363 ICFR",
    catalog: "Part 363",
    title: "Daily proof of DDA subsidiary to the general ledger",
    description:
      "Deposit Operations completes a daily proof of the demand-deposit subsidiary to the general-ledger DDA control account before 10 a.m. Differences above $500 are aged, assigned an owner, and cleared within two business days. Unresolved items are reported to the Controller.",
    owner: "Amira Solis",
    frequency: "Daily",
    riskIds: ["RISK-GL-01"],
  }),
  ctrl({
    canonicalId: "canon-gl-02",
    displayId: "SOX-GL-02",
    nistFamily: "COSO control activities",
    catalog: "COSO ICFR",
    title: "Monthly balance-sheet account reconciliations",
    description:
      "Each on-us balance-sheet account in the SOX scope is reconciled to the subsidiary or bank-owned statement by the 10th business day. Reconciliations are reviewed by a second officer who did not prepare them. Aged items over 30 days require Controller sign-off.",
    owner: "Amira Solis",
    frequency: "Monthly",
    riskIds: ["RISK-GL-01"],
    lastReviewedOn: "2026-04-10",
    sourceModifiedOn: "2026-04-10",
  }),
  ctrl({
    canonicalId: "canon-gl-03",
    displayId: "SOX-GL-03",
    nistFamily: "COSO information and communication",
    catalog: "Part 363",
    title: "Period-end close checklist and hold of the books",
    description:
      "The Controller maintains a close checklist covering subledger roll-forwards, suspense cleanup, and tax provision inputs. The general ledger is held after the checklist is complete. Subsequent entries require dual approval and are listed on the post-close entry log.",
    owner: "Chris Molina",
    frequency: "Monthly",
    riskIds: ["RISK-GL-01"],
  }),
  ctrl({
    canonicalId: "canon-je-01",
    displayId: "SOX-JE-01",
    nistFamily: "COSO control activities",
    catalog: "COSO ICFR",
    title: "Manual journal entries require preparer and approver",
    description:
      "Manual journal entries to SOX-in-scope accounts are prepared by one accountant and approved by a second person with no ability to post the same entry. Supporting calculations are attached in the journal-entry package before posting.",
    owner: "Chris Molina",
    frequency: "Daily",
    riskIds: ["RISK-GL-01"],
  }),
  ctrl({
    canonicalId: "canon-je-02",
    displayId: "SOX-JE-02",
    nistFamily: "COSO control activities",
    catalog: "COSO ICFR",
    title: "Recurring and automatic journal-entry review",
    description:
      "The SOX PMO reviews the inventory of recurring and system-generated journal entries each quarter for unauthorized changes to amount, account, or schedule. Changes require a ticket and Controller approval.",
    owner: "David Chen",
    frequency: "Quarterly",
    riskIds: ["RISK-GL-01"],
  }),
  ctrl({
    canonicalId: "canon-ln-01",
    displayId: "SOX-LN-01",
    nistFamily: "CECL / ALLL (public interagency policy, rewritten)",
    catalog: "OCC",
    title: "Quarter-end allowance for credit losses sign-off",
    description:
      "Credit Administration runs the CECL calculation, documents qualitative adjustments, and presents the allowance to the Allowance Committee. The Chief Credit Officer and Controller sign the quarter-end package before the books close.",
    owner: "Quentin Briggs",
    frequency: "Quarterly",
    riskIds: ["RISK-CECL-01"],
    lastReviewedOn: "2026-04-02",
    sourceModifiedOn: "2026-04-02",
  }),
  ctrl({
    canonicalId: "canon-ln-02",
    displayId: "SOX-LN-02",
    nistFamily: "Credit administration",
    catalog: "OCC",
    title: "Charge-off approval above officer limit",
    description:
      "Loan charge-offs above an officer's lending authority are approved by the Chief Credit Officer and reported to the Directors' Loan Committee. Charge-off codes in the core cannot be applied without the approved form.",
    owner: "Quentin Briggs",
    frequency: "Event-driven",
    riskIds: ["RISK-CRD-01"],
  }),
  ctrl({
    canonicalId: "canon-dep-01",
    displayId: "SOX-DEP-01",
    nistFamily: "Deposit operations",
    catalog: "FDIC RMS",
    title: "Exception-item and NSF decisioning dual control",
    description:
      "NSF, stop-pay, and large exception items are decisioned in the core by one officer and released by a second. Officers cannot decision their own accounts. Daily exception totals are balanced to the GL.",
    owner: "Camille Duarte",
    frequency: "Daily",
    riskIds: ["RISK-GL-01"],
  }),
  ctrl({
    canonicalId: "canon-int-01",
    displayId: "SOX-INT-01",
    nistFamily: "Interest income completeness",
    catalog: "COSO ICFR",
    title: "Accrued interest proof for loans and deposits",
    description:
      "Accounting proofs accrued interest receivable and payable to the core's accrual reports monthly. Variances over a documented threshold are investigated before the close.",
    owner: "Amira Solis",
    frequency: "Monthly",
    riskIds: ["RISK-INT-01"],
  }),
  ctrl({
    canonicalId: "canon-363-01",
    displayId: "SOX-363-01",
    nistFamily: "12 CFR Part 363 management assessment",
    catalog: "Part 363",
    title: "Annual management assessment of ICFR",
    description:
      "Management prepares the Part 363 report on internal control over financial reporting, including identified material weaknesses, and presents it to the Audit Committee before filing. Supporting testing is retained in the SOX workpapers.",
    owner: "David Chen",
    frequency: "Annual",
    riskIds: ["RISK-GL-01"],
    lastReviewedOn: "2026-02-12",
    sourceModifiedOn: "2026-02-12",
  }),
  ctrl({
    canonicalId: "canon-363-02",
    displayId: "SOX-363-02",
    nistFamily: "12 CFR Part 363 external audit package",
    catalog: "Part 363",
    title: "External-auditor PBC package completeness",
    description:
      "The SOX PMO assembles the provided-by-client package (trial balance, reconciliations, ICFR testing, legal letters) against a checklist. Missing items are logged and cleared before the auditor's fieldwork start date.",
    owner: "David Chen",
    frequency: "Annual",
    riskIds: ["RISK-GL-01"],
  }),
];

/** BSA/AML and sanctions — OCC/FDIC public program elements, bank language. */
export const BSA_CONTROLS: CanonicalControl[] = [
  ctrl({
    canonicalId: "canon-bsa-01",
    displayId: "BSA-CIP-01",
    nistFamily: "Customer Identification Program",
    catalog: "OCC",
    title: "Customer identification at account opening",
    description:
      "New consumers and entities are identified under the CIP procedure before the account is opened on the core. Name, date of birth or formation, address, and identification number are collected, and documentary or non-documentary verification is recorded. CIP exceptions require BSA Officer approval.",
    owner: "Leah Ortiz",
    frequency: "Daily",
    riskIds: ["RISK-BSA-01"],
  }),
  ctrl({
    canonicalId: "canon-bsa-02",
    displayId: "BSA-OFAC-01",
    nistFamily: "OFAC screening",
    catalog: "OCC",
    title: "OFAC screening of customers and payment messages",
    description:
      "New customers, periodic batch files, and outbound wires/ACH are screened against the OFAC list before the relationship or payment is completed. Potential matches are decisioned by the BSA Officer. True matches are blocked and documented.",
    owner: "Leah Ortiz",
    frequency: "Continuous",
    riskIds: ["RISK-OFAC-01"],
  }),
  ctrl({
    canonicalId: "canon-bsa-03",
    displayId: "BSA-CTR-01",
    nistFamily: "Currency transaction reporting",
    catalog: "FDIC RMS",
    title: "Currency transaction report filing",
    description:
      "Currency transactions aggregating over the CTR threshold in a business day are captured from teller and vault activity. CTRs are filed within the FinCEN window. Exemptions are reviewed annually.",
    owner: "Leah Ortiz",
    frequency: "Daily",
    riskIds: ["RISK-BSA-01"],
  }),
  ctrl({
    canonicalId: "canon-bsa-04",
    displayId: "BSA-SAR-01",
    nistFamily: "Suspicious activity reporting",
    catalog: "OCC",
    title: "Suspicious activity decisioning and SAR filing",
    description:
      "Alerts from monitoring, teller referrals, and law-enforcement requests are decisioned by BSA staff. SARs are filed within the regulatory window when activity is suspicious. The BSA Officer reports SAR volume to the Board without tipping customers.",
    owner: "Leah Ortiz",
    frequency: "Event-driven",
    riskIds: ["RISK-BSA-01"],
  }),
  ctrl({
    canonicalId: "canon-bsa-05",
    displayId: "BSA-CDD-01",
    nistFamily: "Customer due diligence / beneficial ownership",
    catalog: "OCC",
    title: "CDD and beneficial-ownership refresh",
    description:
      "Legal-entity customers provide beneficial-ownership information at opening. Higher-risk relationships are refreshed on a documented cycle. Missing or stale CDD blocks new product booking until cleared.",
    owner: "Leah Ortiz",
    frequency: "Monthly",
    riskIds: ["RISK-BSA-01"],
    lastReviewedOn: "2026-04-08",
    sourceModifiedOn: "2026-04-08",
  }),
  ctrl({
    canonicalId: "canon-bsa-06",
    displayId: "BSA-IND-01",
    nistFamily: "Independent BSA testing",
    catalog: "FDIC RMS",
    title: "Independent test of the BSA/AML program",
    description:
      "Internal Audit or a qualified independent party tests the BSA/AML program at least annually, covering CIP, OFAC, monitoring, and training. Findings are reported to the Audit Committee.",
    owner: "Elena Voss",
    frequency: "Annual",
    riskIds: ["RISK-BSA-01"],
    lastReviewedOn: "2026-01-20",
    sourceModifiedOn: "2026-01-20",
  }),
];

/** Wires, ACH, credit, vendor — operations a community bank actually tests. */
export const OPS_CONTROLS: CanonicalControl[] = [
  ctrl({
    canonicalId: "canon-wire-01",
    displayId: "WIRE-01",
    nistFamily: "FedLine / funds transfer dual control",
    catalog: "FFIEC",
    title: "Dual control on wire initiation and release",
    description:
      "Wires above the documented callback threshold are entered by one employee and released by a second using separate FedLine credentials. Token holders cannot hold both roles on the same payment. A daily funds-transfer log is balanced to FedLine.",
    owner: "Patrick Yoon",
    frequency: "Daily",
    riskIds: ["RISK-WIRE-01"],
  }),
  ctrl({
    canonicalId: "canon-wire-02",
    displayId: "WIRE-02",
    nistFamily: "Payment authentication",
    catalog: "FFIEC",
    title: "Out-of-band callback on customer wire instructions",
    description:
      "Customer wire instructions received by email or online banking are confirmed by a recorded callback to a phone number on file, not a number in the request. Callbacks are documented on the wire ticket before release.",
    owner: "Patrick Yoon",
    frequency: "Daily",
    riskIds: ["RISK-WIRE-01"],
  }),
  ctrl({
    canonicalId: "canon-ach-01",
    displayId: "ACH-01",
    nistFamily: "ACH origination dual control",
    catalog: "FFIEC",
    title: "ACH file origination dual control",
    description:
      "Originated ACH files are generated from approved source files, balanced to the batch recap, and released by a second officer. Same-day ACH after the cutoff requires supervisor approval.",
    owner: "Camille Duarte",
    frequency: "Daily",
    riskIds: ["RISK-ACH-01"],
  }),
  ctrl({
    canonicalId: "canon-ach-02",
    displayId: "ACH-02",
    nistFamily: "Unauthorized ACH returns",
    catalog: "FDIC RMS",
    title: "Unauthorized ACH return handling",
    description:
      "Customer claims of unauthorized ACH are logged, returned within NACHA windows, and reviewed for patterns. Repeat originators are referred to BSA.",
    owner: "Camille Duarte",
    frequency: "Daily",
    riskIds: ["RISK-ACH-01"],
  }),
  ctrl({
    canonicalId: "canon-crd-01",
    displayId: "CRD-01",
    nistFamily: "Lending authority",
    catalog: "OCC",
    title: "Loan approval within documented authority",
    description:
      "Loan decisions are approved by officers within the Board-approved authority matrix. Policy exceptions are listed on the exception report and ratified by the Directors' Loan Committee.",
    owner: "Quentin Briggs",
    frequency: "Daily",
    riskIds: ["RISK-CRD-01"],
  }),
  ctrl({
    canonicalId: "canon-crd-02",
    displayId: "CRD-02",
    nistFamily: "Collateral exceptions",
    catalog: "OCC",
    title: "Collateral exception tracking",
    description:
      "Missing or expired collateral (insurance, UCC, appraisal) is tracked on an exception list. Past-due items are reported to the Chief Credit Officer monthly until cured or waived.",
    owner: "Quentin Briggs",
    frequency: "Monthly",
    riskIds: ["RISK-CRD-01"],
  }),
  ctrl({
    canonicalId: "canon-vnd-02",
    displayId: "VND-02",
    nistFamily: "Fourth-party / concentration (FDIC FIL-style topic, rewritten)",
    catalog: "FDIC RMS",
    title: "Material fourth-party and concentration review",
    description:
      "Vendor Management inventories fourth parties used by the core processor and material fintechs and reviews concentration risk at least annually. Findings go to the steering committee with the SOC-report review.",
    owner: "Nora Patel",
    frequency: "Annual",
    riskIds: ["RISK-VEN-01"],
    lastReviewedOn: "2026-02-18",
    sourceModifiedOn: "2026-02-18",
  }),
];

/**
 * Extra ITGCs rewritten from NIST 800-53 families (OSCAL-shaped IDs such as
 * AT-2, MA-2, MP-6) into bank operating language. Catalog text is not copied.
 */
export const ITGC_EXTENDED: CanonicalControl[] = [
  ctrl({
    canonicalId: "canon-at-01",
    displayId: "ITGC-AT-01",
    nistFamily: "AT-2 Literacy Training and Awareness",
    catalog: "NIST 800-53",
    title: "Annual security awareness for employees with system access",
    description:
      "Employees with core, FedLine, or email access complete annual security-awareness training, including phishing recognition. New hires complete training within 30 days. Completions are reported to Information Security.",
    owner: "Priya Nandakumar",
    frequency: "Annual",
    riskIds: ["RISK-HR-01"],
  }),
  ctrl({
    canonicalId: "canon-ma-01",
    displayId: "ITGC-MA-01",
    nistFamily: "MA-2 Controlled Maintenance / patching",
    catalog: "NIST 800-53",
    title: "Patch management for in-scope servers",
    description:
      "In-scope servers are patched on a documented cycle: critical security patches within 30 days of release unless a formal exception is open. Failed patches are re-queued and reported to the CISO.",
    owner: "Tom Alvarez",
    frequency: "Monthly",
    riskIds: ["RISK-VUL-01"],
  }),
  ctrl({
    canonicalId: "canon-mp-01",
    displayId: "ITGC-MP-01",
    nistFamily: "MP-6 Media Sanitization",
    catalog: "NIST 800-53",
    title: "Sanitization of disks and media before reuse or vendor return",
    description:
      "Hard drives, tapes, and teller-equipment storage leaving the bank are wiped or destroyed under a documented procedure. Certificates of destruction are filed by Facilities.",
    owner: "James Whitaker",
    frequency: "Event-driven",
    riskIds: ["RISK-PHY-01"],
  }),
  ctrl({
    canonicalId: "canon-pl-01",
    displayId: "ITGC-PL-01",
    nistFamily: "PL-2 System Security and Privacy Plans",
    catalog: "NIST 800-53",
    title: "Annual information-security program report to the Board",
    description:
      "The CISO presents the information-security program, including significant incidents, vendor issues, and resource needs, to the Board or a designated committee at least annually.",
    owner: "Priya Nandakumar",
    frequency: "Annual",
    riskIds: ["RISK-IR-01"],
    lastReviewedOn: "2026-01-28",
    sourceModifiedOn: "2026-01-28",
  }),
  ctrl({
    canonicalId: "canon-ca-01",
    displayId: "ITGC-CA-01",
    nistFamily: "CA-7 Continuous Monitoring",
    catalog: "NIST 800-53",
    title: "Monthly control-monitoring dashboard to the CISO",
    description:
      "Information Security produces a monthly dashboard of failed logons, privileged use, patch exceptions, and open issues for in-scope systems. The CISO reviews and initials the dashboard.",
    owner: "Hannah Briggs",
    frequency: "Monthly",
    riskIds: ["RISK-LOG-01"],
  }),
  ctrl({
    canonicalId: "canon-sr-01",
    displayId: "ITGC-SR-01",
    nistFamily: "SR-3 Supply Chain Controls",
    catalog: "NIST 800-53",
    title: "Core-processor change and subcontracting notice",
    description:
      "Material changes to the core processor's environment or subcontractors are reviewed by Vendor Management and IT Operations before acceptance. Unreviewed changes are logged as issues.",
    owner: "Nora Patel",
    frequency: "Event-driven",
    riskIds: ["RISK-VEN-01"],
  }),
  ctrl({
    canonicalId: "canon-pt-01",
    displayId: "ITGC-PT-01",
    nistFamily: "PT-2 Authority to Process Personally Identifiable Information",
    catalog: "NIST 800-53",
    title: "Customer information used only for authorized bank purposes",
    description:
      "Customer nonpublic information is used only for the product or service the customer requested, or as permitted by the privacy notice. Extracts for vendors require a contract and least-privilege access.",
    owner: "Priya Nandakumar",
    frequency: "Continuous",
    riskIds: ["RISK-PII-01"],
  }),
  ctrl({
    canonicalId: "canon-au-03",
    displayId: "ITGC-AU-03",
    nistFamily: "AU-8 Time Stamps",
    catalog: "NIST 800-53",
    title: "Synchronized clocks on core, directory, and SIEM",
    description:
      "Production core, Active Directory, and the SIEM synchronize to an authenticated time source. Drift beyond a documented threshold pages IT Operations.",
    owner: "Tom Alvarez",
    frequency: "Continuous",
    riskIds: ["RISK-LOG-01"],
  }),
  ctrl({
    canonicalId: "canon-cm-04",
    displayId: "ITGC-CM-04",
    nistFamily: "CM-7 Least Functionality",
    catalog: "NIST 800-53",
    title: "Unused services disabled on servers that host the core",
    description:
      "Servers that host the core and its database run only required services. Newly enabled services require a change ticket. Quarterly scans report unexpected listeners.",
    owner: "Tom Alvarez",
    frequency: "Quarterly",
    riskIds: ["RISK-CHG-01", "RISK-VUL-01"],
  }),
  ctrl({
    canonicalId: "canon-sc-03",
    displayId: "ITGC-SC-03",
    nistFamily: "SC-12 Cryptographic Key Establishment and Management",
    catalog: "NIST 800-53",
    title: "Dual control over encryption keys for core backups",
    description:
      "Keys that encrypt core-database backups are generated and stored under dual control, split from backup operators. Key-ceremony logs are retained with the information-security program.",
    owner: "Marcus Hale",
    frequency: "Annual",
    riskIds: ["RISK-ENC-01"],
  }),
  ctrl({
    canonicalId: "canon-ir-02",
    displayId: "ITGC-IR-02",
    nistFamily: "IR-3 Incident Response Testing",
    catalog: "FDIC RMS",
    title: "Annual incident-response tabletop",
    description:
      "Information Security runs an annual tabletop covering a core outage or customer-data event, including regulator-notification timing. Lessons learned become issues with owners and due dates.",
    owner: "Priya Nandakumar",
    frequency: "Annual",
    riskIds: ["RISK-IR-01"],
    lastReviewedOn: "2026-02-26",
    sourceModifiedOn: "2026-02-26",
  }),
  ctrl({
    canonicalId: "canon-cp-04",
    displayId: "ITGC-CP-04",
    nistFamily: "CP-7 Alternate Processing Site",
    catalog: "FFIEC",
    title: "Alternate-site contract and annual walkthrough",
    description:
      "The bank maintains a contracted alternate processing site capable of deposit posting. Business Continuity walks the site annually and confirms network, badge, and core-image readiness against the 4-hour recovery objective.",
    owner: "Sofia Rahman",
    frequency: "Annual",
    riskIds: ["RISK-BCP-01"],
  }),
  ctrl({
    canonicalId: "canon-pe-02",
    displayId: "ITGC-PE-02",
    nistFamily: "PE-6 Monitoring Physical Access",
    catalog: "NIST 800-53",
    title: "After-hours computer-room access review",
    description:
      "Facilities reviews after-hours badge events for the computer room each month. Unexplained access is referred to Information Security within two business days.",
    owner: "James Whitaker",
    frequency: "Monthly",
    riskIds: ["RISK-PHY-01"],
  }),
  ctrl({
    canonicalId: "canon-si-02",
    displayId: "ITGC-SI-02",
    nistFamily: "SI-8 Spam and Spyware Protection",
    catalog: "NIST 800-53",
    title: "Email gateway filtering for bank mail",
    description:
      "Inbound and outbound bank email passes through a gateway that blocks known malware and obvious phishing. Quarantine releases require Information Security approval.",
    owner: "Hannah Briggs",
    frequency: "Continuous",
    riskIds: ["RISK-VUL-01"],
  }),
  ctrl({
    canonicalId: "canon-ra-02",
    displayId: "ITGC-RA-02",
    nistFamily: "RA-5 Vulnerability Monitoring (independent test)",
    catalog: "FISCAM ITGC",
    title: "Independent external network test of internet-facing systems",
    description:
      "An independent party tests internet-facing systems at least annually. Critical findings are tracked to remediation or formal acceptance by the CISO.",
    owner: "Hannah Briggs",
    frequency: "Annual",
    riskIds: ["RISK-VUL-01"],
    lastReviewedOn: "2026-03-04",
    sourceModifiedOn: "2026-03-04",
  }),
];

export const BANK_GRADE_CONTROLS: CanonicalControl[] = [
  ...ICFR_CONTROLS,
  ...BSA_CONTROLS,
  ...OPS_CONTROLS,
  ...ITGC_EXTENDED,
];

export const BANK_GRADE_DIRECTORY = [
  { name: "Leah Ortiz", title: "BSA Officer", email: "leah.ortiz@wrenbridge.example" },
  { name: "Quentin Briggs", title: "Chief Credit Officer", email: "quentin.briggs@wrenbridge.example" },
  { name: "Amira Solis", title: "Controller", email: "amira.solis@wrenbridge.example" },
  { name: "Patrick Yoon", title: "Wire Operations Manager", email: "patrick.yoon@wrenbridge.example" },
  { name: "Camille Duarte", title: "Deposit Operations Manager", email: "camille.duarte@wrenbridge.example" },
] as const;

export const BANK_GRADE_RISKS = [
  { riskId: "RISK-BSA-01", title: "BSA/AML program failure or late SAR/CTR", owner: "Leah Ortiz" },
  { riskId: "RISK-OFAC-01", title: "Payment or customer not screened against OFAC", owner: "Leah Ortiz" },
  { riskId: "RISK-WIRE-01", title: "Unauthorized or misdirected wire", owner: "Patrick Yoon" },
  { riskId: "RISK-ACH-01", title: "Unauthorized ACH origination or return miss", owner: "Camille Duarte" },
  { riskId: "RISK-CRD-01", title: "Loan approved outside authority or with uncured exceptions", owner: "Quentin Briggs" },
  { riskId: "RISK-CECL-01", title: "Allowance for credit losses misstated", owner: "Quentin Briggs" },
  { riskId: "RISK-GL-01", title: "Material misstatement in regulatory or shareholder reporting", owner: "Amira Solis" },
  { riskId: "RISK-PII-01", title: "Customer nonpublic information used or disclosed without authority", owner: "Priya Nandakumar" },
  { riskId: "RISK-INT-01", title: "Interest income or expense accrual incomplete", owner: "Amira Solis" },
] as const;
