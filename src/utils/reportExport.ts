import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type {
  AuditArea,
  AuditAreaIntelligence,
  AuditObservation,
  ProcessDocumentation,
  RiskRating,
} from '../types/audit';
import { flowchartSvgToPng } from './flowchartSvg';

export const MAIN_REPORT_SECTIONS = [
  'Executive Summary',
  'Audit Objective, Scope & Methodology',
  'Process Documentation',
  'Process Flow Diagram',
  'Process Narrative',
  'Risk Assessment Summary',
  'Control Matrix Summary',
  'Audit Procedures',
  'Findings',
  'Recommendations',
  'Management Action Plan',
  'Conclusion',
] as const;

export const PROCESS_DOC_SUBSECTIONS = [
  'Process Information',
  'Process Objective',
  'Scope',
  'Process Steps Table',
  'Risks Identified',
  'Existing Controls',
  'Systems Used',
  'Documents Used',
] as const;

export const DEFAULT_INCLUDED_SECTIONS: string[] = [
  ...MAIN_REPORT_SECTIONS,
  ...PROCESS_DOC_SUBSECTIONS,
];

/**
 * Upgrades legacy section names from previously saved Firestore drafts so checkboxes
 * and previews remain compatible without losing existing draft selections.
 */
export function normalizeIncludedSections(sections?: string[]): string[] {
  if (!sections || sections.length === 0) return [...DEFAULT_INCLUDED_SECTIONS];
  const validSet = new Set<string>([...MAIN_REPORT_SECTIONS, ...PROCESS_DOC_SUBSECTIONS]);
  const out = new Set<string>();

  for (const s of sections) {
    if (validSet.has(s)) {
      out.add(s);
    } else if (s === 'Audit Objective & Scope') {
      out.add('Audit Objective, Scope & Methodology');
    } else if (s === 'Process Overview') {
      out.add('Process Documentation');
      out.add('Process Flow Diagram');
      out.add('Process Narrative');
      out.add('Process Information');
      out.add('Process Objective');
      out.add('Scope');
    } else if (s === 'Key Controls & Weaknesses') {
      out.add('Control Matrix Summary');
    } else if (s === 'Audit Findings & Root Causes') {
      out.add('Findings');
    } else if (s === 'Recommendations & Management Action Plans') {
      out.add('Recommendations');
      out.add('Management Action Plan');
    } else if (s === 'Overall Audit Conclusion') {
      out.add('Conclusion');
    }
  }

  return out.size > 0 ? Array.from(out) : [...DEFAULT_INCLUDED_SECTIONS];
}

export interface ReportExportPayload {
  title: string;
  entityName: string;
  reportPeriod: string;
  status: 'Draft' | 'Finalized';
  area: AuditArea;
  intelligence: AuditAreaIntelligence;
  processDoc: ProcessDocumentation | null;
  observations: AuditObservation[];
  includedSections: string[];
  executiveSummary: string;
  scopeAndMethodology: string;
  overallConclusion: string;
}

interface LogoAsset {
  dataUrl: string;
  bytes: Uint8Array;
  width: number;
  height: number;
}

function createCorporateLogoAsset(): LogoAsset | null {
  if (typeof document === 'undefined') return null;
  const w = 360;
  const h = 92;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, w, h);

  // Shield emblem
  ctx.fillStyle = '#0f294a';
  ctx.beginPath();
  ctx.moveTo(14, 14);
  ctx.lineTo(68, 14);
  ctx.lineTo(68, 52);
  ctx.quadraticCurveTo(68, 72, 41, 82);
  ctx.quadraticCurveTo(14, 72, 14, 52);
  ctx.closePath();
  ctx.fill();

  // Inner gold accent ring
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Checkmark / pillar bars inside shield
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(26, 44, 7, 18);
  ctx.fillRect(37, 34, 7, 28);
  ctx.fillRect(48, 25, 7, 37);

  // Brand typography
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 28px Arial, Helvetica, sans-serif';
  ctx.fillText('AuditIntel PH', 86, 45);

  ctx.fillStyle = '#475569';
  ctx.font = 'bold 12px Arial, Helvetica, sans-serif';
  ctx.fillText('INTERNAL AUDIT & RISK GOVERNANCE', 87, 68);

  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1] || '';
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  return { dataUrl, bytes, width: w, height: h };
}

function getRiskColorRgb(rating: RiskRating | string): [number, number, number] {
  switch (rating) {
    case 'Critical':
      return [153, 27, 27];
    case 'High':
      return [194, 65, 12];
    case 'Moderate':
      return [161, 98, 7];
    default:
      return [21, 128, 61];
  }
}

export async function exportAuditReportToPdf(payload: ReportExportPayload): Promise<void> {
  const {
    title,
    entityName,
    reportPeriod,
    status,
    area,
    intelligence,
    processDoc,
    observations,
    includedSections,
    executiveSummary,
    scopeAndMethodology,
    overallConclusion,
  } = payload;

  const has = (sec: string) => includedSections.includes(sec);
  const logo = createCorporateLogoAsset();
  const flowchartPng =
    processDoc && processDoc.flowchartNodes.length > 0
      ? await flowchartSvgToPng(processDoc.flowchartNodes, 2.2)
      : null;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let currentOrientation: 'p' | 'l' = 'p';
  let hasStartedBody = false;
  let y = 24;

  const pageWidth = () => doc.internal.pageSize.getWidth();
  const pageHeight = () => doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = () => pageWidth() - margin * 2;

  const switchOrientation = (target: 'p' | 'l', forceNewPage = false) => {
    if (!hasStartedBody) {
      doc.addPage('a4', target === 'l' ? 'landscape' : 'portrait');
      currentOrientation = target;
      hasStartedBody = true;
      y = 22;
      return;
    }
    if (currentOrientation !== target || forceNewPage) {
      doc.addPage('a4', target === 'l' ? 'landscape' : 'portrait');
      currentOrientation = target;
      y = 22;
    }
  };

  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > pageHeight() - 18) {
      doc.addPage('a4', currentOrientation === 'l' ? 'landscape' : 'portrait');
      y = 22;
    }
  };

  const drawSectionHeading = (heading: string, subtitle?: string) => {
    ensureSpace(18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 41, 74);
    doc.text(heading, margin, y);
    y += 2;
    doc.setDrawColor(30, 58, 138);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth() - margin, y);
    y += 5;
    if (subtitle) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(subtitle, margin, y);
      y += 5;
    }
  };

  const drawParagraph = (text: string, fontSize = 10, bold = false) => {
    const clean = (text || '').trim();
    if (!clean) return;
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(30, 41, 59);
    const lines = doc.splitTextToSize(clean, contentWidth()) as string[];
    const lineHeight = fontSize * 0.45;
    for (const line of lines) {
      ensureSpace(lineHeight + 2);
      doc.text(line, margin, y);
      y += lineHeight;
    }
    y += 3;
  };

  const getLastFinalY = () =>
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 10;

  // =========================================================================
  // COVER PAGE (PORTRAIT A4)
  // =========================================================================
  // Navy top accent bar
  doc.setFillColor(15, 41, 74);
  doc.rect(0, 0, 210, 24, 'F');
  doc.setFillColor(217, 119, 6);
  doc.rect(0, 24, 210, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(255, 255, 255);
  doc.text('CONFIDENTIAL · AUDIT COMMITTEE & EXECUTIVE BOARD REPORT', 15, 14.5);

  // Company Logo
  if (logo) {
    doc.addImage(logo.dataUrl, 'PNG', 15, 36, 78, (78 * logo.height) / logo.width);
  }

  // Main Cover Title Block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 58, 138);
  doc.text('INTERNAL AUDIT ENGAGEMENT DELIVERABLE', 15, 76);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(15, 23, 42);
  const titleLines = doc.splitTextToSize(title || `Internal Audit Report — ${area.name}`, 180) as string[];
  let coverY = 86;
  for (const tLine of titleLines) {
    doc.text(tLine, 15, coverY);
    coverY += 9.5;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`${entityName} · ${area.domain}`, 15, coverY + 4);

  // Risk Badge on Cover
  const [rrR, rrG, rrB] = getRiskColorRgb(intelligence.riskRating);
  doc.setFillColor(rrR, rrG, rrB);
  doc.roundedRect(15, coverY + 14, 56, 9, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(255, 255, 255);
  doc.text(`OVERALL RISK: ${intelligence.riskRating.toUpperCase()}`, 18.5, coverY + 20);

  // Cover Metadata Card
  const cardTop = Math.max(145, coverY + 34);
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(15, cardTop, 180, 74, 3, 3, 'FD');

  const metaRows: Array<[string, string]> = [
    ['Auditee / Entity', entityName],
    ['Audit Area', `[${area.areaCode}] ${area.name}`],
    ['Audit Domain', area.domain],
    ['Audit Period', reportPeriod],
    ['Report Status', status],
    [
      'Linked Process Doc',
      processDoc ? `${processDoc.processCode} — ${processDoc.processName} (${processDoc.version})` : 'Not Linked',
    ],
    ['Prepared Date', new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })],
  ];

  let my = cardTop + 10;
  for (const [k, v] of metaRows) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`${k}:`, 22, my);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    const valStr = doc.splitTextToSize(v, 118)[0] || v;
    doc.text(valStr, 68, my);
    my += 9;
  }

  // Cover Bottom Notice
  doc.setDrawColor(203, 213, 225);
  doc.line(15, 266, 195, 266);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Prepared in accordance with IIA Global Internal Audit Standards (IPPF), Philippine Financial Reporting Standards (PFRS), and applicable BIR / SEC regulatory requirements. Distribution is restricted to authorized governance stakeholders.',
    15,
    272,
    { maxWidth: 180 }
  );

  // =========================================================================
  // BODY SECTIONS IN STRUCTURED ORDER
  // =========================================================================

  // 1. Executive Summary (Portrait)
  if (has('Executive Summary')) {
    switchOrientation('p');
    drawSectionHeading('1. Executive Summary');
    drawParagraph(executiveSummary);
    if (intelligence.auditReportNarratives.keyHighlights?.length > 0) {
      drawParagraph('Key Engagement Highlights:', 10, true);
      for (const hl of intelligence.auditReportNarratives.keyHighlights.slice(0, 6)) {
        drawParagraph(`•  ${hl}`, 9.5);
      }
    }
    y += 3;
  }

  // 2. Audit Objective, Scope & Methodology (Portrait)
  if (has('Audit Objective, Scope & Methodology')) {
    switchOrientation('p');
    drawSectionHeading('2. Audit Objective, Scope & Methodology');
    drawParagraph('Audit Objective', 10, true);
    drawParagraph(intelligence.auditObjective);
    drawParagraph('Scope & Methodology', 10, true);
    drawParagraph(scopeAndMethodology);
    y += 3;
  }

  // 3. Process Documentation (Portrait for info/objective/scope/systems/docs; Landscape for steps/risks/controls)
  if (has('Process Documentation') && processDoc) {
    const showInfo = has('Process Information');
    const showObj = has('Process Objective');
    const showScope = has('Scope');
    const showSys = has('Systems Used');
    const showDocs = has('Documents Used');
    const showSteps = has('Process Steps Table');
    const showProcRisks = has('Risks Identified');
    const showProcControls = has('Existing Controls');

    if (showInfo || showObj || showScope || showSys || showDocs) {
      switchOrientation('p');
      drawSectionHeading(
        '3. Process Documentation',
        `Linked Process: ${processDoc.processCode} · ${processDoc.processName} (${processDoc.version})`
      );

      if (showInfo) {
        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [['Process Field', 'Detail', 'Governance Field', 'Detail']],
          body: [
            ['Process Code', processDoc.processCode, 'Linked Area', `${area.areaCode} — ${area.name}`],
            ['Process Name', processDoc.processName, 'Domain / Unit', `${processDoc.domain} · ${processDoc.entityName}`],
            ['Version / Effective', `${processDoc.version} · ${processDoc.effectiveDate}`, 'Status', processDoc.status],
            [
              'Process Owner',
              `${processDoc.processOwner.ownerName} (${processDoc.processOwner.ownerRole})`,
              'Backup Owner',
              processDoc.processOwner.backupOwner || '—',
            ],
          ],
          styles: { fontSize: 8.5, cellPadding: 2.5 },
          headStyles: { fillColor: [15, 41, 74], textColor: 255, fontStyle: 'bold' },
          columnStyles: { 0: { fontStyle: 'bold', cellWidth: 34 }, 2: { fontStyle: 'bold', cellWidth: 34 } },
        });
        y = getLastFinalY() + 6;
      }

      if (showObj) {
        drawParagraph('Process Objective', 10, true);
        drawParagraph(processDoc.processObjective, 9.5);
      }

      if (showScope) {
        drawParagraph('Process Scope', 10, true);
        drawParagraph(processDoc.scope, 9.5);
      }

      if (showSys && processDoc.systemsUsed.length > 0) {
        ensureSpace(22);
        drawParagraph('Systems Used', 10, true);
        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [['System Name', 'Module', 'Access Control Owner', 'Interface / Auth']],
          body: processDoc.systemsUsed.map((s) => [
            s.systemName,
            s.moduleName || '—',
            s.accessControlOwner,
            s.interfaceType,
          ]),
          styles: { fontSize: 8.5, cellPadding: 2.5 },
          headStyles: { fillColor: [30, 58, 138], textColor: 255 },
        });
        y = getLastFinalY() + 6;
      }

      if (showDocs && processDoc.documentsUsed.length > 0) {
        ensureSpace(22);
        drawParagraph('Documents Used', 10, true);
        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [['Doc Code', 'Document Name', 'Type', 'Source System', 'Retention']],
          body: processDoc.documentsUsed.map((d) => [
            d.docCode,
            d.documentName,
            d.docType,
            d.sourceSystem,
            d.retentionPeriod,
          ]),
          styles: { fontSize: 8.5, cellPadding: 2.5 },
          headStyles: { fillColor: [30, 58, 138], textColor: 255 },
        });
        y = getLastFinalY() + 6;
      }
    }

    if (showSteps && processDoc.processSteps.length > 0) {
      switchOrientation('l');
      drawSectionHeading('Process Steps Matrix', `${processDoc.processCode} — ${processDoc.processName}`);
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['Step', 'Activity Title & Description', 'Actor / Role', 'System', 'Input -> Output', 'SLA / Frequency']],
        body: processDoc.processSteps.map((s) => [
          s.stepNo,
          `${s.stepTitle}\n${s.description}`,
          s.actorRole,
          s.systemUsed || '—',
          `${s.inputDoc || '—'} -> ${s.outputDoc || '—'}`,
          s.slaOrFrequency || '—',
        ]),
        styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' },
        headStyles: { fillColor: [15, 41, 74], textColor: 255, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 16 }, 1: { cellWidth: 92 }, 2: { cellWidth: 38 }, 3: { cellWidth: 36 } },
      });
      y = getLastFinalY() + 7;
    }

    if (showProcRisks && processDoc.risks.length > 0) {
      switchOrientation('l');
      drawSectionHeading('Process Risks Identified', `${processDoc.processCode} — Documented Operational & Compliance Risks`);
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['Code', 'Risk Title', 'Description', 'L x I', 'Rating', 'Regulatory Reference']],
        body: processDoc.risks.map((r) => [
          r.riskCode,
          r.title,
          r.description,
          `${r.likelihood} x ${r.impact} (${r.likelihood * r.impact})`,
          r.riskRating,
          r.regulatoryRef,
        ]),
        styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' },
        headStyles: { fillColor: [15, 41, 74], textColor: 255 },
        columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 52 }, 2: { cellWidth: 96 }, 3: { cellWidth: 22 }, 4: { cellWidth: 22 } },
      });
      y = getLastFinalY() + 7;
    }

    if (showProcControls && processDoc.existingControls.length > 0) {
      switchOrientation('l');
      drawSectionHeading('Existing Process Controls', `${processDoc.processCode} — Documented Control Design`);
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['Code', 'Control Name & Description', 'Owner', 'Frequency', 'Type', 'Automation', 'Mapped Risk']],
        body: processDoc.existingControls.map((c) => [
          c.controlCode,
          `${c.controlName}\n${c.description}`,
          c.controlOwner,
          c.frequency,
          c.controlType,
          c.automation,
          c.mappedRiskCode,
        ]),
        styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' },
        headStyles: { fillColor: [15, 41, 74], textColor: 255 },
        columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 98 } },
      });
      y = getLastFinalY() + 7;
    }
  }

  // 4. Process Flow Diagram (Landscape wide page preserving all BPMN shapes & connectors)
  if (has('Process Flow Diagram')) {
    switchOrientation('l', true);
    drawSectionHeading(
      '4. Process Flow Diagram (BPMN / Flowchart)',
      processDoc
        ? `${processDoc.processCode} — ${processDoc.processName} · Shapes & Decision Branches`
        : `${area.areaCode} — ${area.name}`
    );
    if (flowchartPng) {
      const availW = contentWidth();
      const availH = pageHeight() - y - 22;
      const ratio = Math.min(availW / flowchartPng.width, availH / flowchartPng.height);
      const drawW = flowchartPng.width * ratio;
      const drawH = flowchartPng.height * ratio;
      const offsetX = margin + (availW - drawW) / 2;
      doc.setDrawColor(203, 213, 225);
      doc.rect(offsetX - 1, y - 1, drawW + 2, drawH + 2);
      doc.addImage(flowchartPng.dataUrl, 'PNG', offsetX, y, drawW, drawH);
      y += drawH + 6;
    } else {
      drawParagraph('No flowchart diagram nodes have been defined for this process yet.', 9.5);
    }
  }

  // 5. Process Narrative (Portrait)
  if (has('Process Narrative')) {
    switchOrientation('p');
    drawSectionHeading('5. Process Narrative');
    drawParagraph(
      processDoc?.processFlowNarrative || intelligence.processDescription || 'No narrative documented.',
      9.5
    );
    y += 3;
  }

  // 6. Risk Assessment Summary (Landscape)
  if (has('Risk Assessment Summary')) {
    switchOrientation('l');
    drawSectionHeading(
      '6. Risk Assessment Summary',
      `Inherent Likelihood: ${intelligence.riskAssessment.likelihood}/5 · Impact: ${intelligence.riskAssessment.impact}/5 · Control Environment: ${intelligence.riskAssessment.controlEnvironmentScore}/5 · Residual Risk: ${intelligence.riskAssessment.residualRiskRating}`
    );
    drawParagraph(intelligence.riskAssessment.rationale, 9.5);
    if (intelligence.inherentRisks.length > 0) {
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['Risk ID', 'Inherent Risk Title', 'Description', 'Likelihood', 'Impact', 'Score', 'Regulatory Ref']],
        body: intelligence.inherentRisks.map((r) => [
          r.id,
          r.title,
          r.description,
          `${r.likelihood}/5`,
          `${r.impact}/5`,
          `${r.likelihood * r.impact}/25`,
          r.regulatoryRef,
        ]),
        styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' },
        headStyles: { fillColor: [15, 41, 74], textColor: 255 },
        columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 50 }, 2: { cellWidth: 100 }, 3: { cellWidth: 18 }, 4: { cellWidth: 16 }, 5: { cellWidth: 18 } },
      });
      y = getLastFinalY() + 7;
    }
  }

  // 7. Control Matrix Summary (Landscape)
  if (has('Control Matrix Summary')) {
    switchOrientation('l');
    drawSectionHeading('7. Control Matrix Summary');
    if (intelligence.keyControls.length > 0) {
      drawParagraph('Key Controls Evaluated', 10, true);
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['ID', 'Control Name', 'Control Description', 'Owner', 'Freq', 'Type', 'Automation', 'Obj Ref']],
        body: intelligence.keyControls.map((kc) => [
          kc.id,
          kc.controlName,
          kc.description,
          kc.controlOwner,
          kc.frequency,
          kc.controlType,
          kc.automation,
          kc.objectiveRef,
        ]),
        styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' },
        headStyles: { fillColor: [15, 41, 74], textColor: 255 },
        columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 46 }, 2: { cellWidth: 88 } },
      });
      y = getLastFinalY() + 6;
    }

    if (intelligence.controlWeaknesses.length > 0) {
      ensureSpace(24);
      drawParagraph('Identified Control Weaknesses / Design Gaps', 10, true);
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['Gap ID', 'Weakness Title', 'Gap Description', 'Severity', 'Affected Control']],
        body: intelligence.controlWeaknesses.map((cw) => [
          cw.id,
          cw.weaknessTitle,
          cw.gapDescription,
          cw.severity,
          cw.affectedControlRef,
        ]),
        styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' },
        headStyles: { fillColor: [153, 27, 27], textColor: 255 },
        columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 55 }, 2: { cellWidth: 120 }, 3: { cellWidth: 24 } },
      });
      y = getLastFinalY() + 7;
    }
  }

  // 8. Audit Procedures (Landscape)
  if (has('Audit Procedures')) {
    switchOrientation('l');
    drawSectionHeading('8. Audit Procedures & Testing Program');
    if (intelligence.auditProcedures.length > 0) {
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['ID', 'Type', 'Objective', 'Execution Step', 'Sample Guidance', 'Expected Evidence', 'Status']],
        body: intelligence.auditProcedures.map((ap) => [
          ap.id,
          ap.procedureType,
          ap.objective,
          ap.stepDetail,
          ap.sampleSizeGuidance,
          ap.expectedEvidence,
          ap.testingStatus,
        ]),
        styles: { fontSize: 7.8, cellPadding: 2.3, overflow: 'linebreak' },
        headStyles: { fillColor: [15, 41, 74], textColor: 255 },
        columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 24 }, 2: { cellWidth: 48 }, 3: { cellWidth: 74 }, 4: { cellWidth: 34 }, 5: { cellWidth: 42 } },
      });
      y = getLastFinalY() + 7;
    } else {
      drawParagraph('No audit procedures recorded.', 9.5);
    }
  }

  // 9. Findings (Portrait)
  if (has('Findings')) {
    switchOrientation('p');
    drawSectionHeading('9. Detailed Audit Findings & Root Causes');
    if (observations.length > 0) {
      observations.forEach((obs, idx) => {
        ensureSpace(34);
        drawParagraph(`${idx + 1}. ${obs.observationTitle} [${obs.riskRating} Risk · ${obs.status}]`, 10.5, true);
        drawParagraph(`Finding: ${obs.auditFinding || obs.observationText}`, 9.5);
        if (obs.riskStatement) drawParagraph(`Risk Exposure: ${obs.riskStatement}`, 9.5);
        if (obs.rootCause) drawParagraph(`Root Cause: ${obs.rootCause}`, 9.5);
        y += 2;
      });
    } else if (intelligence.potentialFindings.length > 0) {
      intelligence.potentialFindings.forEach((pf, idx) => {
        ensureSpace(32);
        drawParagraph(`${idx + 1}. ${pf.title} [${pf.severity}]`, 10.5, true);
        drawParagraph(`Condition: ${pf.condition}`, 9.5);
        drawParagraph(`Criteria: ${pf.criteria}`, 9.5);
        drawParagraph(`Cause: ${pf.cause}`, 9.5);
        drawParagraph(`Effect: ${pf.effect}`, 9.5);
        y += 2;
      });
    } else {
      drawParagraph('No audit findings or observations recorded.', 9.5);
    }
  }

  // 10. Recommendations (Portrait)
  if (has('Recommendations')) {
    switchOrientation('p');
    drawSectionHeading('10. Audit Recommendations');
    if (observations.length > 0) {
      observations.forEach((obs, idx) => {
        ensureSpace(22);
        drawParagraph(`REC-${idx + 1} (${obs.riskRating}): ${obs.observationTitle}`, 10, true);
        drawParagraph(obs.recommendation || 'Implement corrective control enhancements.', 9.5);
      });
    } else if (intelligence.recommendations.length > 0) {
      intelligence.recommendations.forEach((rec) => {
        ensureSpace(22);
        drawParagraph(`${rec.id} [${rec.priority}]: ${rec.actionTitle}`, 10, true);
        drawParagraph(`${rec.detailedAction} (Target Owner: ${rec.targetOwner} · Timeline: ${rec.timeline})`, 9.5);
      });
    } else {
      drawParagraph('No recommendations recorded.', 9.5);
    }
  }

  // 11. Management Action Plan (Landscape)
  if (has('Management Action Plan')) {
    switchOrientation('l');
    drawSectionHeading('11. Management Action Plan (MAP) Tracker');
    const mapRows =
      observations.length > 0
        ? observations.map((obs, idx) => [
            `MAP-${idx + 1}`,
            obs.observationTitle,
            obs.managementActionPlan.actionSteps || obs.recommendation,
            obs.managementActionPlan.responsibleOwner || 'Process Owner',
            obs.managementActionPlan.targetDate || 'TBD',
            obs.managementActionPlan.status,
          ])
        : intelligence.recommendations.map((rec, idx) => [
            `MAP-${idx + 1}`,
            rec.actionTitle,
            rec.detailedAction,
            rec.targetOwner,
            rec.timeline,
            'Open',
          ]);

    if (mapRows.length > 0) {
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['MAP ID', 'Finding / Action Title', 'Committed Action Steps', 'Responsible Owner', 'Target Date', 'Status']],
        body: mapRows,
        styles: { fontSize: 8.2, cellPadding: 2.5, overflow: 'linebreak' },
        headStyles: { fillColor: [15, 41, 74], textColor: 255 },
        columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 56 }, 2: { cellWidth: 102 }, 3: { cellWidth: 40 }, 4: { cellWidth: 26 } },
      });
      y = getLastFinalY() + 7;
    } else {
      drawParagraph('No management action plans tracked yet.', 9.5);
    }
  }

  // 12. Conclusion (Portrait)
  if (has('Conclusion')) {
    switchOrientation('p');
    drawSectionHeading('12. Overall Audit Conclusion');
    drawParagraph(overallConclusion);

    ensureSpace(28);
    y += 6;
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, y, margin + 75, y);
    doc.line(margin + 100, y, margin + 175, y);
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text('Chief Audit Executive / Engagement Lead', margin, y);
    doc.text('Process Owner / Management Representative', margin + 100, y);
  }

  // Apply crisp running headers & footers across all content pages (pages 2..N)
  const totalPages = doc.getNumberOfPages();
  for (let p = 2; p <= totalPages; p += 1) {
    doc.setPage(p);
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();

    // Header bar
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(margin, 13, pw - margin, 13);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(title.slice(0, 72), margin, 10.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`${area.areaCode} · ${reportPeriod}`, pw - margin, 10.5, { align: 'right' });

    // Footer bar
    doc.line(margin, ph - 13, pw - margin, ph - 13);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('AuditIntel PH · Confidential — Board & Audit Committee Use Only', margin, ph - 8.5);
    doc.text(`Page ${p} of ${totalPages}`, pw - margin, ph - 8.5, { align: 'right' });
  }

  doc.save(`${area.areaCode.toLowerCase()}-board-audit-report.pdf`);
}

// ===========================================================================
// BOARD-LEVEL DOCX EXPORT
// ===========================================================================

function makeDocxTable(headers: string[], rows: string[][]): Table {
  const cellBorder = {
    top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
  };

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (h) =>
        new TableCell({
          borders: cellBorder,
          shading: { type: ShadingType.CLEAR, fill: '0F294A' },
          children: [
            new Paragraph({
              children: [new TextRun({ text: h, bold: true, size: 18, color: 'FFFFFF', font: 'Calibri' })],
            }),
          ],
        })
    ),
  });

  const bodyRows = rows.map(
    (row, rIdx) =>
      new TableRow({
        children: row.map(
          (val) =>
            new TableCell({
              borders: cellBorder,
              shading: rIdx % 2 === 1 ? { type: ShadingType.CLEAR, fill: 'F8FAFC' } : undefined,
              children: [
                new Paragraph({
                  children: [new TextRun({ text: val || '—', size: 18, color: '1E293B', font: 'Calibri' })],
                }),
              ],
            })
        ),
      })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows],
  });
}

function makeDocxHeading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 260, after: 120 },
    border: { bottom: { color: '1E3A8A', space: 4, style: BorderStyle.SINGLE, size: 8 } },
    children: [new TextRun({ text, bold: true, size: 26, color: '0F294A', font: 'Calibri' })],
  });
}

function makeDocxSubheading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 160, after: 80 },
    children: [new TextRun({ text, bold: true, size: 22, color: '1E3A8A', font: 'Calibri' })],
  });
}

function makeDocxParagraph(text: string, bold = false): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text: text || '', bold, size: 21, color: '1E293B', font: 'Calibri' })],
  });
}

export async function exportAuditReportToDocx(payload: ReportExportPayload): Promise<void> {
  const {
    title,
    entityName,
    reportPeriod,
    status,
    area,
    intelligence,
    processDoc,
    observations,
    includedSections,
    executiveSummary,
    scopeAndMethodology,
    overallConclusion,
  } = payload;

  const has = (sec: string) => includedSections.includes(sec);
  const logo = createCorporateLogoAsset();
  const flowchartPng =
    processDoc && processDoc.flowchartNodes.length > 0
      ? await flowchartSvgToPng(processDoc.flowchartNodes, 2)
      : null;

  const sharedHeader = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({
            text: `${title}  |  ${area.areaCode} · ${reportPeriod}`,
            size: 16,
            color: '64748B',
            font: 'Calibri',
          }),
        ],
      }),
    ],
  });

  const sharedFooter = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: 'AuditIntel PH · Confidential Board & Audit Committee Deliverable  |  Page ',
            size: 16,
            color: '64748B',
            font: 'Calibri',
          }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '64748B', font: 'Calibri' }),
        ],
      }),
    ],
  });

  // Portrait Part 1: Cover + Exec Summary + Objective/Scope + Process Documentation Narrative Info
  const part1Children: Array<Paragraph | Table> = [];

  if (logo) {
    part1Children.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new ImageRun({
            type: 'png',
            data: logo.bytes,
            transformation: { width: 220, height: Math.round((220 * logo.height) / logo.width) },
          }),
        ],
      })
    );
  }

  part1Children.push(
    new Paragraph({
      spacing: { before: 120, after: 80 },
      children: [
        new TextRun({
          text: 'CONFIDENTIAL · BOARD-LEVEL INTERNAL AUDIT REPORT',
          bold: true,
          size: 20,
          color: '1E3A8A',
          font: 'Calibri',
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: title, bold: true, size: 40, color: '0F172A', font: 'Calibri' })],
    }),
    new Paragraph({
      spacing: { after: 260 },
      children: [
        new TextRun({
          text: `${entityName} · [${area.areaCode}] ${area.name}`,
          size: 24,
          color: '475569',
          font: 'Calibri',
        }),
      ],
    }),
    makeDocxTable(
      ['Engagement Attribute', 'Detail'],
      [
        ['Entity / Auditee', entityName],
        ['Audit Area', `[${area.areaCode}] ${area.name} (${area.domain})`],
        ['Audit Period', reportPeriod],
        ['Overall Risk Rating', intelligence.riskRating],
        ['Report Status', status],
        [
          'Linked Process Documentation',
          processDoc ? `${processDoc.processCode} — ${processDoc.processName} (${processDoc.version})` : 'Not Linked',
        ],
      ]
    ),
    new Paragraph({ children: [new PageBreak()] })
  );

  if (has('Executive Summary')) {
    part1Children.push(makeDocxHeading('1. Executive Summary'), makeDocxParagraph(executiveSummary));
  }

  if (has('Audit Objective, Scope & Methodology')) {
    part1Children.push(
      makeDocxHeading('2. Audit Objective, Scope & Methodology'),
      makeDocxSubheading('Audit Objective'),
      makeDocxParagraph(intelligence.auditObjective),
      makeDocxSubheading('Scope & Methodology'),
      makeDocxParagraph(scopeAndMethodology)
    );
  }

  if (has('Process Documentation') && processDoc) {
    part1Children.push(
      makeDocxHeading(`3. Process Documentation (${processDoc.processCode} — ${processDoc.processName})`)
    );

    if (has('Process Information')) {
      part1Children.push(
        makeDocxSubheading('Process Information'),
        makeDocxTable(
          ['Field', 'Value'],
          [
            ['Process Code & Name', `${processDoc.processCode} — ${processDoc.processName}`],
            ['Domain & Entity', `${processDoc.domain} · ${processDoc.entityName}`],
            ['Version & Effective Date', `${processDoc.version} · ${processDoc.effectiveDate}`],
            ['Process Owner', `${processDoc.processOwner.ownerName} (${processDoc.processOwner.ownerRole})`],
            ['Backup Owner', processDoc.processOwner.backupOwner || '—'],
          ]
        )
      );
    }
    if (has('Process Objective')) {
      part1Children.push(makeDocxSubheading('Process Objective'), makeDocxParagraph(processDoc.processObjective));
    }
    if (has('Scope')) {
      part1Children.push(makeDocxSubheading('Process Scope'), makeDocxParagraph(processDoc.scope));
    }
    if (has('Systems Used') && processDoc.systemsUsed.length > 0) {
      part1Children.push(
        makeDocxSubheading('Systems Used'),
        makeDocxTable(
          ['System Name', 'Module', 'Access Owner', 'Interface Type'],
          processDoc.systemsUsed.map((s) => [s.systemName, s.moduleName || '—', s.accessControlOwner, s.interfaceType])
        )
      );
    }
    if (has('Documents Used') && processDoc.documentsUsed.length > 0) {
      part1Children.push(
        makeDocxSubheading('Documents Used'),
        makeDocxTable(
          ['Code', 'Document Name', 'Type', 'Source System', 'Retention'],
          processDoc.documentsUsed.map((d) => [d.docCode, d.documentName, d.docType, d.sourceSystem, d.retentionPeriod])
        )
      );
    }
  }

  if (has('Process Narrative')) {
    part1Children.push(
      makeDocxHeading('5. Process Narrative'),
      makeDocxParagraph(processDoc?.processFlowNarrative || intelligence.processDescription)
    );
  }

  // Landscape Section: Flowchart Diagram + Wide Tables (Process Steps, Risks, Controls, Audit Procedures, MAP)
  const landscapeChildren: Array<Paragraph | Table> = [];

  if (has('Process Flow Diagram')) {
    landscapeChildren.push(makeDocxHeading('4. Process Flow Diagram (BPMN / Flowchart)'));
    if (flowchartPng) {
      const maxW = 900;
      const maxH = 490;
      const scale = Math.min(maxW / flowchartPng.width, maxH / flowchartPng.height);
      landscapeChildren.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 100, after: 180 },
          children: [
            new ImageRun({
              type: 'png',
              data: flowchartPng.bytes,
              transformation: {
                width: Math.round(flowchartPng.width * scale),
                height: Math.round(flowchartPng.height * scale),
              },
            }),
          ],
        })
      );
    } else {
      landscapeChildren.push(makeDocxParagraph('No flowchart nodes defined for this process.'));
    }
  }

  if (has('Process Documentation') && processDoc) {
    if (has('Process Steps Table') && processDoc.processSteps.length > 0) {
      landscapeChildren.push(
        makeDocxHeading('Process Steps Table'),
        makeDocxTable(
          ['Step', 'Activity & Description', 'Actor / Role', 'System', 'Input -> Output', 'SLA'],
          processDoc.processSteps.map((s) => [
            s.stepNo,
            `${s.stepTitle}: ${s.description}`,
            s.actorRole,
            s.systemUsed || '—',
            `${s.inputDoc || '—'} -> ${s.outputDoc || '—'}`,
            s.slaOrFrequency || '—',
          ])
        )
      );
    }
    if (has('Risks Identified') && processDoc.risks.length > 0) {
      landscapeChildren.push(
        makeDocxHeading('Process Risks Identified'),
        makeDocxTable(
          ['Code', 'Risk Title', 'Description', 'Score', 'Rating', 'Regulatory Ref'],
          processDoc.risks.map((r) => [
            r.riskCode,
            r.title,
            r.description,
            `${r.likelihood} x ${r.impact}`,
            r.riskRating,
            r.regulatoryRef,
          ])
        )
      );
    }
    if (has('Existing Controls') && processDoc.existingControls.length > 0) {
      landscapeChildren.push(
        makeDocxHeading('Existing Process Controls'),
        makeDocxTable(
          ['Code', 'Control Name', 'Description', 'Owner', 'Freq', 'Type', 'Automation', 'Mapped Risk'],
          processDoc.existingControls.map((c) => [
            c.controlCode,
            c.controlName,
            c.description,
            c.controlOwner,
            c.frequency,
            c.controlType,
            c.automation,
            c.mappedRiskCode,
          ])
        )
      );
    }
  }

  if (has('Risk Assessment Summary')) {
    landscapeChildren.push(
      makeDocxHeading('6. Risk Assessment Summary'),
      makeDocxParagraph(
        `Inherent Likelihood: ${intelligence.riskAssessment.likelihood}/5 | Impact: ${intelligence.riskAssessment.impact}/5 | Control Environment: ${intelligence.riskAssessment.controlEnvironmentScore}/5 | Residual Risk: ${intelligence.riskAssessment.residualRiskRating}`,
        true
      ),
      makeDocxParagraph(intelligence.riskAssessment.rationale),
      makeDocxTable(
        ['ID', 'Inherent Risk', 'Description', 'L', 'I', 'Score', 'Regulatory Ref'],
        intelligence.inherentRisks.map((r) => [
          r.id,
          r.title,
          r.description,
          String(r.likelihood),
          String(r.impact),
          `${r.likelihood * r.impact}/25`,
          r.regulatoryRef,
        ])
      )
    );
  }

  if (has('Control Matrix Summary')) {
    landscapeChildren.push(
      makeDocxHeading('7. Control Matrix Summary'),
      makeDocxSubheading('Key Controls Evaluated'),
      makeDocxTable(
        ['ID', 'Control Name', 'Description', 'Owner', 'Freq', 'Type', 'Automation'],
        intelligence.keyControls.map((kc) => [
          kc.id,
          kc.controlName,
          kc.description,
          kc.controlOwner,
          kc.frequency,
          kc.controlType,
          kc.automation,
        ])
      ),
      makeDocxSubheading('Identified Control Weaknesses'),
      makeDocxTable(
        ['ID', 'Weakness Title', 'Gap Description', 'Severity', 'Affected Control'],
        intelligence.controlWeaknesses.map((cw) => [
          cw.id,
          cw.weaknessTitle,
          cw.gapDescription,
          cw.severity,
          cw.affectedControlRef,
        ])
      )
    );
  }

  if (has('Audit Procedures')) {
    landscapeChildren.push(
      makeDocxHeading('8. Audit Procedures'),
      makeDocxTable(
        ['ID', 'Type', 'Objective', 'Execution Step', 'Sample Size', 'Expected Evidence', 'Status'],
        intelligence.auditProcedures.map((ap) => [
          ap.id,
          ap.procedureType,
          ap.objective,
          ap.stepDetail,
          ap.sampleSizeGuidance,
          ap.expectedEvidence,
          ap.testingStatus,
        ])
      )
    );
  }

  if (has('Management Action Plan')) {
    const mapRows =
      observations.length > 0
        ? observations.map((obs, idx) => [
            `MAP-${idx + 1}`,
            obs.observationTitle,
            obs.managementActionPlan.actionSteps || obs.recommendation,
            obs.managementActionPlan.responsibleOwner || 'Process Owner',
            obs.managementActionPlan.targetDate || 'TBD',
            obs.managementActionPlan.status,
          ])
        : intelligence.recommendations.map((rec, idx) => [
            `MAP-${idx + 1}`,
            rec.actionTitle,
            rec.detailedAction,
            rec.targetOwner,
            rec.timeline,
            'Open',
          ]);
    landscapeChildren.push(
      makeDocxHeading('11. Management Action Plan'),
      makeDocxTable(['MAP ID', 'Finding / Title', 'Action Steps', 'Owner', 'Target Date', 'Status'], mapRows)
    );
  }

  // Portrait Part 2: Findings, Recommendations, Conclusion
  const part3Children: Array<Paragraph | Table> = [];

  if (has('Findings')) {
    part3Children.push(makeDocxHeading('9. Audit Findings & Root Causes'));
    if (observations.length > 0) {
      observations.forEach((obs, idx) => {
        part3Children.push(
          makeDocxSubheading(`${idx + 1}. ${obs.observationTitle} [${obs.riskRating}]`),
          makeDocxParagraph(`Finding: ${obs.auditFinding || obs.observationText}`),
          makeDocxParagraph(`Risk Exposure: ${obs.riskStatement}`),
          makeDocxParagraph(`Root Cause: ${obs.rootCause}`)
        );
      });
    } else {
      intelligence.potentialFindings.forEach((pf, idx) => {
        part3Children.push(
          makeDocxSubheading(`${idx + 1}. ${pf.title} [${pf.severity}]`),
          makeDocxParagraph(`Condition: ${pf.condition}`),
          makeDocxParagraph(`Criteria: ${pf.criteria}`),
          makeDocxParagraph(`Cause: ${pf.cause}`),
          makeDocxParagraph(`Effect: ${pf.effect}`)
        );
      });
    }
  }

  if (has('Recommendations')) {
    part3Children.push(makeDocxHeading('10. Recommendations'));
    if (observations.length > 0) {
      observations.forEach((obs, idx) => {
        part3Children.push(
          makeDocxSubheading(`REC-${idx + 1} [${obs.riskRating}]: ${obs.observationTitle}`),
          makeDocxParagraph(obs.recommendation)
        );
      });
    } else {
      intelligence.recommendations.forEach((rec) => {
        part3Children.push(
          makeDocxSubheading(`${rec.id} [${rec.priority}]: ${rec.actionTitle}`),
          makeDocxParagraph(`${rec.detailedAction} — Owner: ${rec.targetOwner} (${rec.timeline})`)
        );
      });
    }
  }

  if (has('Conclusion')) {
    part3Children.push(makeDocxHeading('12. Overall Audit Conclusion'), makeDocxParagraph(overallConclusion));
  }

  const sections = [
    {
      properties: { page: { size: { orientation: PageOrientation.PORTRAIT } } },
      headers: { default: sharedHeader },
      footers: { default: sharedFooter },
      children: part1Children,
    },
    ...(landscapeChildren.length > 0
      ? [
          {
            properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } },
            headers: { default: sharedHeader },
            footers: { default: sharedFooter },
            children: landscapeChildren,
          },
        ]
      : []),
    ...(part3Children.length > 0
      ? [
          {
            properties: { page: { size: { orientation: PageOrientation.PORTRAIT } } },
            headers: { default: sharedHeader },
            footers: { default: sharedFooter },
            children: part3Children,
          },
        ]
      : []),
  ];

  const docxDocument = new Document({
    creator: 'AuditIntel PH',
    title,
    description: `Board-Level Internal Audit Report for ${area.areaCode} - ${area.name}`,
    sections,
  });

  const blob = await Packer.toBlob(docxDocument);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${area.areaCode.toLowerCase()}-board-audit-report.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
