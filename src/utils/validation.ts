import {
  AUDIT_DOMAINS,
  RISK_RATINGS,
  type AuditAreaIntelligence,
  type AuditDomain,
  type KnowledgeItemType,
  type ManagementActionPlan,
  type MapStatus,
  type ObservationStatus,
  type RiskRating,
} from '../types/audit';

export function clampStr(val: unknown, maxLen: number, fallback = ''): string {
  const s = typeof val === 'string' ? val.trim() : String(val ?? '').trim();
  if (!s) return fallback;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

export function clampInt(val: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(val));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeDomain(val: unknown): AuditDomain {
  const raw = clampStr(val, 80, 'Philippine Corporate');
  const exact = AUDIT_DOMAINS.find((d) => d.toLowerCase() === raw.toLowerCase());
  if (exact) return exact;
  const lower = raw.toLowerCase();
  if (lower.includes('invent') || lower.includes('warehous')) return 'Inventory';
  if (lower.includes('procur') || lower.includes('purchas')) return 'Procurement';
  if (lower.includes('dispos') || lower.includes('scrap') || lower.includes('asset')) return 'Asset Disposal';
  if (lower.includes('treasur') || lower.includes('cash') || lower.includes('bank')) return 'Treasury';
  if (lower.includes('branch') || lower.includes('retail') || lower.includes('store')) return 'Branch Operations';
  if (lower.includes('financ') || lower.includes('account') || lower.includes('tax')) return 'Finance';
  if (lower.includes('compli') || lower.includes('regulat') || lower.includes('bir') || lower.includes('sec')) return 'Compliance';
  if (lower.includes('operat') || lower.includes('logist')) return 'Operations';
  if (lower.includes('it') || lower.includes('cyber') || lower.includes('data')) return 'IT & Governance';
  return 'Philippine Corporate';
}

export function normalizeRiskRating(val: unknown, fallback: RiskRating = 'High'): RiskRating {
  const raw = clampStr(val, 20, fallback);
  const found = RISK_RATINGS.find((r) => r.toLowerCase() === raw.toLowerCase());
  if (found) return found;
  if (raw.toLowerCase().includes('crit')) return 'Critical';
  if (raw.toLowerCase().includes('high')) return 'High';
  if (raw.toLowerCase().includes('med') || raw.toLowerCase().includes('mod')) return 'Moderate';
  if (raw.toLowerCase().includes('low')) return 'Low';
  return fallback;
}

export function sanitizeId(val: unknown): string {
  const s = clampStr(val, 128, '');
  return s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

export function sanitizeIntelligence(raw: AuditAreaIntelligence): AuditAreaIntelligence {
  return {
    auditObjective: clampStr(raw.auditObjective, 3000, 'Assess the adequacy and effectiveness of internal controls.'),
    processDescription: clampStr(raw.processDescription, 6000, 'End-to-end operational and financial workflow.'),
    inherentRisks: (Array.isArray(raw.inherentRisks) ? raw.inherentRisks : []).slice(0, 25).map((r, idx) => ({
      id: clampStr(r.id, 30, `IR-${idx + 1}`),
      title: clampStr(r.title, 200, 'Inherent Risk'),
      description: clampStr(r.description, 1000, ''),
      likelihood: clampInt(r.likelihood, 1, 5, 3),
      impact: clampInt(r.impact, 1, 5, 4),
      regulatoryRef: clampStr(r.regulatoryRef, 200, 'IIA IPPF / PFRS'),
    })),
    riskAssessment: {
      likelihood: clampInt(raw.riskAssessment?.likelihood, 1, 5, 3),
      impact: clampInt(raw.riskAssessment?.impact, 1, 5, 4),
      controlEnvironmentScore: clampInt(raw.riskAssessment?.controlEnvironmentScore, 1, 5, 3),
      residualRiskRating: normalizeRiskRating(raw.riskAssessment?.residualRiskRating, 'High'),
      rationale: clampStr(raw.riskAssessment?.rationale, 3000, 'Risk evaluated based on inherent exposure and control maturity.'),
    },
    riskRating: normalizeRiskRating(raw.riskRating, 'High'),
    controlObjectives: (Array.isArray(raw.controlObjectives) ? raw.controlObjectives : []).slice(0, 25).map((c, idx) => ({
      id: clampStr(c.id, 30, `CO-${idx + 1}`),
      objective: clampStr(c.objective, 800, ''),
      riskRef: clampStr(c.riskRef, 40, 'IR-1'),
    })),
    keyControls: (Array.isArray(raw.keyControls) ? raw.keyControls : []).slice(0, 30).map((kc, idx) => ({
      id: clampStr(kc.id, 30, `KC-${idx + 1}`),
      controlName: clampStr(kc.controlName, 200, 'Key Control'),
      description: clampStr(kc.description, 1000, ''),
      controlOwner: clampStr(kc.controlOwner, 120, 'Process Owner'),
      frequency: clampStr(kc.frequency, 60, 'Monthly'),
      controlType:
        kc.controlType === 'Detective' || kc.controlType === 'Corrective' ? kc.controlType : 'Preventive',
      automation:
        kc.automation === 'Automated' || kc.automation === 'IT-Dependent' ? kc.automation : 'Manual',
      objectiveRef: clampStr(kc.objectiveRef, 40, 'CO-1'),
    })),
    controlWeaknesses: (Array.isArray(raw.controlWeaknesses) ? raw.controlWeaknesses : []).slice(0, 25).map((cw, idx) => ({
      id: clampStr(cw.id, 30, `CW-${idx + 1}`),
      weaknessTitle: clampStr(cw.weaknessTitle, 200, 'Control Gap'),
      gapDescription: clampStr(cw.gapDescription, 1000, ''),
      severity: normalizeRiskRating(cw.severity, 'High'),
      affectedControlRef: clampStr(cw.affectedControlRef, 40, 'KC-1'),
    })),
    auditProcedures: (Array.isArray(raw.auditProcedures) ? raw.auditProcedures : []).slice(0, 35).map((ap, idx) => ({
      id: clampStr(ap.id, 30, `AP-${idx + 1}`),
      procedureType: (['Inquiry', 'Observation', 'Inspection', 'Reperformance', 'Analytical'].includes(ap.procedureType)
        ? ap.procedureType
        : 'Inspection') as AuditAreaIntelligence['auditProcedures'][number]['procedureType'],
      objective: clampStr(ap.objective, 400, ''),
      stepDetail: clampStr(ap.stepDetail, 1200, ''),
      sampleSizeGuidance: clampStr(ap.sampleSizeGuidance, 300, '25 transactions or 10% of population'),
      expectedEvidence: clampStr(ap.expectedEvidence, 400, ''),
      testingStatus: (['Not Started', 'In Progress', 'Tested - Effective', 'Exception Noted'].includes(ap.testingStatus)
        ? ap.testingStatus
        : 'Not Started') as AuditAreaIntelligence['auditProcedures'][number]['testingStatus'],
    })),
    walkthroughQuestions: (Array.isArray(raw.walkthroughQuestions) ? raw.walkthroughQuestions : []).slice(0, 25).map((wq, idx) => ({
      id: clampStr(wq.id, 30, `WQ-${idx + 1}`),
      intervieweeRole: clampStr(wq.intervieweeRole, 120, 'Department Head'),
      question: clampStr(wq.question, 600, ''),
      expectedResponse: clampStr(wq.expectedResponse, 800, ''),
      redFlagIndicator: clampStr(wq.redFlagIndicator, 600, ''),
    })),
    potentialFindings: (Array.isArray(raw.potentialFindings) ? raw.potentialFindings : []).slice(0, 25).map((pf, idx) => ({
      id: clampStr(pf.id, 30, `PF-${idx + 1}`),
      title: clampStr(pf.title, 200, 'Potential Audit Finding'),
      condition: clampStr(pf.condition, 1000, ''),
      criteria: clampStr(pf.criteria, 800, ''),
      cause: clampStr(pf.cause, 800, ''),
      effect: clampStr(pf.effect, 800, ''),
      severity: normalizeRiskRating(pf.severity, 'High'),
    })),
    rootCauseAnalysis: {
      summary: clampStr(raw.rootCauseAnalysis?.summary, 2000, 'Root cause themes across governance, process, and technology.'),
      people: clampStr(raw.rootCauseAnalysis?.people, 1500, ''),
      process: clampStr(raw.rootCauseAnalysis?.process, 1500, ''),
      technology: clampStr(raw.rootCauseAnalysis?.technology, 1500, ''),
      policyGovernance: clampStr(raw.rootCauseAnalysis?.policyGovernance, 1500, ''),
      externalRegulatory: clampStr(raw.rootCauseAnalysis?.externalRegulatory, 1500, ''),
    },
    recommendations: (Array.isArray(raw.recommendations) ? raw.recommendations : []).slice(0, 25).map((rec, idx) => ({
      id: clampStr(rec.id, 30, `REC-${idx + 1}`),
      priority: normalizeRiskRating(rec.priority, 'High'),
      actionTitle: clampStr(rec.actionTitle, 200, 'Remediation Action'),
      detailedAction: clampStr(rec.detailedAction, 1200, ''),
      targetOwner: clampStr(rec.targetOwner, 120, 'Management'),
      timeline: clampStr(rec.timeline, 60, '30-60 Days'),
      expectedBenefit: clampStr(rec.expectedBenefit, 500, ''),
    })),
    auditReportNarratives: {
      executiveSummary: clampStr(raw.auditReportNarratives?.executiveSummary, 4000, 'Executive summary of audit scope and risk posture.'),
      scopeAndMethodology: clampStr(raw.auditReportNarratives?.scopeAndMethodology, 3000, 'Risk-based audit executed in accordance with IIA Global Internal Audit Standards.'),
      overallConclusion: clampStr(raw.auditReportNarratives?.overallConclusion, 3000, 'Control environment requires targeted remediation in high-risk control areas.'),
      keyHighlights: (Array.isArray(raw.auditReportNarratives?.keyHighlights) ? raw.auditReportNarratives.keyHighlights : [])
        .slice(0, 12)
        .map((h) => clampStr(h, 400))
        .filter(Boolean),
    },
    generatedAt: clampStr(raw.generatedAt, 60, new Date().toISOString()),
  };
}

export function sanitizeManagementActionPlan(plan: Partial<ManagementActionPlan> | undefined): ManagementActionPlan {
  const validStatuses: MapStatus[] = ['Open', 'In Progress', 'Agreed', 'Closed'];
  const status = validStatuses.includes(plan?.status as MapStatus) ? (plan?.status as MapStatus) : 'Open';
  return {
    actionSteps: clampStr(plan?.actionSteps, 3000, ''),
    responsibleOwner: clampStr(plan?.responsibleOwner, 160, ''),
    targetDate: clampStr(plan?.targetDate, 40, ''),
    status,
  };
}

export function sanitizeObservationStatus(val: unknown): ObservationStatus {
  const valid: ObservationStatus[] = ['Draft', 'Validated', 'Reported', 'Closed'];
  return valid.includes(val as ObservationStatus) ? (val as ObservationStatus) : 'Draft';
}

export function sanitizeKnowledgeType(val: unknown): KnowledgeItemType {
  const valid: KnowledgeItemType[] = [
    'finding',
    'recommendation',
    'control',
    'procedure',
    'regulatory_note',
    'assistant_insight',
  ];
  return valid.includes(val as KnowledgeItemType) ? (val as KnowledgeItemType) : 'assistant_insight';
}

export function sanitizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .slice(0, 10)
    .map((t) => clampStr(t, 40))
    .filter(Boolean);
}
