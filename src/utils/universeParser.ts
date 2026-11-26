import * as XLSX from 'xlsx';
import type { StarterAuditAreaInput } from '../data/starterUniverse';
import { clampStr, normalizeDomain, normalizeRiskRating } from './validation';

function pickField(row: Record<string, unknown>, candidates: string[]): string {
  const keys = Object.keys(row);
  for (const cand of candidates) {
    const matched = keys.find((k) => k.toLowerCase().replace(/[^a-z0-9]/g, '') === cand);
    if (matched && row[matched] !== undefined && row[matched] !== null) {
      return String(row[matched]).trim();
    }
  }
  return '';
}

export async function parseUniverseFile(file: File): Promise<StarterAuditAreaInput[]> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  if (ext === 'json') {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.areas) ? parsed.areas : [];
    return mapRowsToAreas(arr);
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('The uploaded workbook does not contain any sheets.');
  }
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  return mapRowsToAreas(rows);
}

function mapRowsToAreas(rows: Record<string, unknown>[]): StarterAuditAreaInput[] {
  const results: StarterAuditAreaInput[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || typeof row !== 'object') continue;
    const name = pickField(row, ['auditarea', 'areaname', 'name', 'process', 'title', 'auditunit']);
    if (!name) continue;
    const areaCode =
      pickField(row, ['areacode', 'code', 'id', 'ref', 'reference']) ||
      `AUD-${String(i + 1).padStart(2, '0')}`;
    const domainRaw = pickField(row, ['domain', 'category', 'auditdomain', 'function', 'cluster']);
    const entityName =
      pickField(row, ['entity', 'entityname', 'department', 'branch', 'subsidiary', 'unit']) ||
      'Head Office';
    const riskRaw = pickField(row, ['risktier', 'inherentrisktier', 'riskrating', 'risk', 'priority']);
    const regulatoryContext = pickField(row, [
      'regulatorycontext',
      'regulation',
      'regulations',
      'standards',
      'criteria',
      'compliance',
    ]);
    const description = pickField(row, ['description', 'scope', 'processoverview', 'notes', 'summary']);
    const lastAuditDate =
      pickField(row, ['lastauditdate', 'lastaudit', 'lastaudited', 'auditcycle']) || 'Unscheduled';

    results.push({
      areaCode: clampStr(areaCode, 40, `AUD-${i + 1}`),
      name: clampStr(name, 200),
      domain: normalizeDomain(domainRaw || name),
      entityName: clampStr(entityName, 160),
      inherentRiskTier: normalizeRiskRating(riskRaw, 'High'),
      regulatoryContext: clampStr(regulatoryContext, 400),
      description: clampStr(description, 2000),
      lastAuditDate: clampStr(lastAuditDate, 40),
    });
  }
  if (results.length === 0) {
    throw new Error(
      'No valid Audit Area rows detected. Ensure your file has a column like "Audit Area" or "Name".'
    );
  }
  return results.slice(0, 60);
}

export function downloadUniverseCsvTemplate(): void {
  const headers = [
    'Area Code',
    'Audit Area',
    'Domain',
    'Entity Name',
    'Inherent Risk Tier',
    'Regulatory Context',
    'Description',
    'Last Audit Date',
  ];
  const sampleRows = [
    [
      'BRN-10',
      'Provincial Branch Petty Cash & Revolving Fund Controls',
      'Branch Operations',
      'Cebu & Davao Branches',
      'High',
      'Corporate Treasury SOP; BIR Withholding on Petty Cash Reimbursements',
      'Review surprise count adherence, unliquidated advances aging, and valid Sales Invoice support.',
      '2025-Q2',
    ],
    [
      'INV-11',
      'Cold-Chain / Expiry Management & Stock Write-Off Controls',
      'Inventory',
      'Visayas Distribution Hub',
      'Critical',
      'PAS 2 Inventories; FDA Storage Compliance; BIR Destruction Permit',
      'Verify FEFO picking discipline, near-expiry reporting, and BIR-witnessed spoilage disposal.',
      '2025-Q4',
    ],
  ];

  const escapeCsv = (cell: string) => `"${cell.replace(/"/g, '""')}"`;
  const csv = [headers, ...sampleRows].map((row) => row.map(escapeCsv).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'audit-universe-template-ph.csv';
  a.click();
  URL.revokeObjectURL(url);
}
