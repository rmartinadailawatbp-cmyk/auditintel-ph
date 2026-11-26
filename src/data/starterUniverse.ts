import type { AuditDomain, KnowledgeItemType, RiskRating } from '../types/audit';

export interface StarterAuditAreaInput {
  areaCode: string;
  name: string;
  domain: AuditDomain;
  entityName: string;
  inherentRiskTier: RiskRating;
  regulatoryContext: string;
  description: string;
  lastAuditDate: string;
}

export const STARTER_PH_AUDIT_UNIVERSE: StarterAuditAreaInput[] = [
  {
    areaCode: 'FIN-01',
    name: 'BIR Tax Compliance, Withholding & EOPT Invoicing',
    domain: 'Finance',
    entityName: 'Head Office — Controllership & Tax',
    inherentRiskTier: 'Critical',
    regulatoryContext: 'BIR RR 7-2024 / RA 11976 (Ease of Paying Taxes Act), NIRC EWT/FWT/VAT',
    description:
      'End-to-end review of VAT input/output substantiation, BIR Form 2307 issuance and collection, Sales Invoice compliance under EOPT, Alphalist reconciliation, and timely filing via eFPS.',
    lastAuditDate: '2025-Q3',
  },
  {
    areaCode: 'BRN-02',
    name: 'Branch Cash Handling, POS Settlement & Daily Remittance',
    domain: 'Branch Operations',
    entityName: 'NCR & Luzon Retail Branches',
    inherentRiskTier: 'Critical',
    regulatoryContext: 'Corporate Treasury SOP, BIR POS Accreditation / Z-Reading Rules',
    description:
      'Controls over daily POS Z-reading reconciliation, Cash-in-Vault (CIV) surprise counts, armored car / bank deposit validation, petty cash & revolving funds, and branch variance escalation.',
    lastAuditDate: '2026-Q1',
  },
  {
    areaCode: 'INV-03',
    name: 'Warehouse Inventory Custody, Cycle Counting & Shrinkage',
    domain: 'Inventory',
    entityName: 'Central Distribution Center — Laguna',
    inherentRiskTier: 'High',
    regulatoryContext: 'PAS 2 (Inventories), BIR Inventory List Filing (RR 1-2016)',
    description:
      'Physical-to-book perpetual inventory accuracy, Goods Receipt Note (GRN) cut-off, inter-branch Stock Transfer Slips (STS), obsolescence provisioning, and shrinkage investigation thresholds.',
    lastAuditDate: '2025-Q4',
  },
  {
    areaCode: 'PRC-04',
    name: 'Procure-to-Pay, Vendor Accreditation & Three-Bid Canvass',
    domain: 'Procurement',
    entityName: 'Corporate Procurement & Supply Chain',
    inherentRiskTier: 'High',
    regulatoryContext: 'Corporate DOA Matrix, Conflict of Interest Policy, SEC Related-Party Rules',
    description:
      'Vendor master file governance, related-party screening, competitive bidding / 3-quote canvass enforcement, Purchase Order splitting detection, and 3-way matching prior to AP voucher release.',
    lastAuditDate: '2025-Q2',
  },
  {
    areaCode: 'TRS-05',
    name: 'Treasury Operations, Check Disbursement & Bank Reconciliation',
    domain: 'Treasury',
    entityName: 'Corporate Treasury',
    inherentRiskTier: 'Critical',
    regulatoryContext: 'BSP Circulars, AMLA (RA 9160), Dual-Signatory DOA',
    description:
      'Bank reconciliation timeliness, stale check management, online banking dual-authorization tokens, Post-Dated Check (PDC) custody, and intercompany fund transfers.',
    lastAuditDate: '2026-Q1',
  },
  {
    areaCode: 'DSP-06',
    name: 'Fixed Asset Retirement, Scrap Sales & Asset Disposal',
    domain: 'Asset Disposal',
    entityName: 'Admin, Fleet & Plant Operations',
    inherentRiskTier: 'High',
    regulatoryContext: 'PFRS Property Plant & Equipment, BIR VAT on Asset Disposal, Scrap Bid Policy',
    description:
      'Identification of idle/unserviceable assets, independent salvage valuation, Asset Disposal Committee / ManCom approval, sealed-bid scrap sale integrity, and derecognition in the fixed asset ledger.',
    lastAuditDate: '2024-Q4',
  },
  {
    areaCode: 'OPS-07',
    name: 'Fleet Logistics, Fuel Advances & Delivery Turnaround',
    domain: 'Operations',
    entityName: 'VisMin & Luzon Logistics Operations',
    inherentRiskTier: 'High',
    regulatoryContext: 'LTFRB Permits, Corporate Fleet Policy, DOLE Driver Hours Compliance',
    description:
      'Trip ticket authorization, fleet card / fuel advance liquidation against odometer logs, proof-of-delivery (POD) return cycle, and third-party trucking billing verification.',
    lastAuditDate: '2025-Q1',
  },
  {
    areaCode: 'CMP-08',
    name: 'SEC Corporate Governance, LGU Permits & Regulatory Licensing',
    domain: 'Compliance',
    entityName: 'Legal & Corporate Affairs',
    inherentRiskTier: 'Moderate',
    regulatoryContext: 'Revised Corporation Code (RA 11232), SEC GIS/AFS, LGU Mayor Permits',
    description:
      'Monitoring of annual SEC General Information Sheet (GIS), Audited Financial Statements (AFS) deadlines, LGU Mayor/Barangay permits across branches, and Board/Audit Committee charter compliance.',
    lastAuditDate: '2025-Q4',
  },
  {
    areaCode: 'ITG-09',
    name: 'Data Privacy Act (RA 10173) & ERP User Access Governance',
    domain: 'IT & Governance',
    entityName: 'Information Technology & DPO',
    inherentRiskTier: 'High',
    regulatoryContext: 'Data Privacy Act of 2012 (RA 10173), NPC Circulars, Segregation of Duties',
    description:
      'NPC registration and breach notification readiness, ERP Segregation of Duties (SoD) across AP/Treasury/Inventory, privileged access reviews, and resigned employee access revocation.',
    lastAuditDate: '2025-Q3',
  },
];

export interface StarterKnowledgeInput {
  type: KnowledgeItemType;
  domain: AuditDomain;
  title: string;
  content: string;
  riskRating: RiskRating | 'Informational';
  regulatoryRef: string;
  tags: string[];
}

export const STARTER_PH_KNOWLEDGE_ITEMS: StarterKnowledgeInput[] = [
  {
    type: 'regulatory_note',
    domain: 'Finance',
    title: 'EOPT Act (RA 11976) — Shift from Official Receipt to Sales Invoice',
    content:
      'Under Republic Act No. 11976 (Ease of Paying Taxes Act) and BIR RR 7-2024, Sales Invoices serve as the primary commercial and VAT substantiation document for both sale of goods and services. Official Receipts are now treated as supplementary documents unless properly converted/stamped per BIR transition guidelines. Auditors must verify that vendor disbursements above VAT threshold are supported by valid VAT Sales Invoices.',
    riskRating: 'High',
    regulatoryRef: 'RA 11976 / BIR RR 7-2024',
    tags: ['BIR', 'EOPT', 'VAT', 'Substantiation'],
  },
  {
    type: 'finding',
    domain: 'Branch Operations',
    title: 'Delayed Deposit of Branch Cash Collections Beyond T+1 Banking Window',
    content:
      'Surprise cash counts across provincial branches frequently uncover undeposited collections held in branch vaults for 3–7 banking days, creating lapping/kiting exposure and exceeding fidelity bond limits.',
    riskRating: 'Critical',
    regulatoryRef: 'Corporate Treasury SOP / Fidelity Bond Policy',
    tags: ['Cash', 'Branch', 'Lapping', 'Deposit'],
  },
  {
    type: 'recommendation',
    domain: 'Procurement',
    title: 'Automated PO Splitting Detection & Vendor-Employee Conflict Screening',
    content:
      'Configure ERP weekly exception reports flagging sequential Purchase Orders issued to the same vendor within 7 days just below Delegation of Authority (DOA) thresholds, and cross-match vendor bank accounts, TINs, and contact numbers against the HR employee master file.',
    riskRating: 'High',
    regulatoryRef: 'Corporate DOA & Conflict of Interest Policy',
    tags: ['Procurement', 'PO-Splitting', 'Conflict-of-Interest'],
  },
  {
    type: 'control',
    domain: 'Asset Disposal',
    title: 'Dual-Signoff Salvage Valuation & Sealed-Bid Scrap Disposal',
    content:
      'Require written technical condemnation from Engineering/IT, independent floor-price appraisal signed by Finance, and minimum three sealed bids opened jointly by Procurement, Operations, and Internal Audit before releasing scrap or retired vehicles.',
    riskRating: 'High',
    regulatoryRef: 'Asset Disposal Policy / BIR VAT on Sale of Assets',
    tags: ['Disposal', 'Scrap', 'Fixed-Assets'],
  },
];
