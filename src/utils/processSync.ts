import { buildStarterProcessTemplates } from '../data/starterProcesses';
import type {
  AuditArea,
  AuditAreaIntelligence,
  AuditProcedureItem,
  ControlObjectiveItem,
  ControlWeaknessItem,
  InherentRiskItem,
  KeyControlItem,
  PotentialFindingItem,
  ProcessDocumentation,
  ProcessFlowNode,
  RecommendationItem,
  RiskRating,
  WalkthroughQuestionItem,
} from '../types/audit';
import {
  clampInt,
  clampStr,
  normalizeRiskRating,
  sanitizeIntelligence,
  type ProcessDocumentationInput,
} from './validation';

/**
 * Resolves the single 1:1 Process Documentation record linked to an Audit Universe area.
 */
export function findProcessDocForArea(
  area: AuditArea | null | undefined,
  processDocs: ProcessDocumentation[]
): ProcessDocumentation | null {
  if (!area) return null;
  const byId = processDocs.find((p) => p.linkedAreaId === area.id);
  if (byId) return byId;

  const expectedCode = `PD-${area.areaCode}`.toLowerCase();
  const byCode = processDocs.find(
    (p) =>
      !p.linkedAreaId &&
      (p.processCode.toLowerCase() === expectedCode ||
        p.processCode.toLowerCase() === area.areaCode.toLowerCase())
  );
  return byCode ?? null;
}

/**
 * Generates an initial editable Process Documentation draft automatically populated
 * from the currently selected Audit Universe area (and its intelligence if loaded).
 */
export function buildAutoDraftFromArea(area: AuditArea): ProcessDocumentationInput {
  const starterMatches = buildStarterProcessTemplates({
    [area.areaCode]: { id: area.id, name: area.name },
  });
  const matchingStarter = starterMatches.find(
    (tpl) =>
      tpl.processCode.toUpperCase() === `PD-${area.areaCode}`.toUpperCase() &&
      tpl.linkedAreaId === area.id
  );

  if (matchingStarter) {
    return {
      ...matchingStarter,
      processCode: `PD-${area.areaCode}`,
      processName: area.name,
      domain: area.domain,
      entityName: area.entityName,
      status: 'Draft',
      linkedAreaId: area.id,
      linkedAreaName: area.name,
      effectiveDate: new Date().toISOString().slice(0, 10),
    };
  }

  const intel = area.intelligence;
  const regContext = area.regulatoryContext || 'IIA IPPF, PFRS, BIR, and Corporate Policy';
  const defaultOwnerName =
    intel?.keyControls?.[0]?.controlOwner || `${area.domain} Process Owner`;

  const flowchartNodes: ProcessFlowNode[] = [
    {
      id: `node_${area.areaCode}_1`,
      stepNo: '1',
      label: `Initiate ${area.areaCode} Activity`,
      actorRole: `${area.domain} Specialist`,
      nodeType: 'start',
      branchNote: area.entityName,
    },
    {
      id: `node_${area.areaCode}_2`,
      stepNo: '2',
      label: 'Verify Supporting Documents',
      actorRole: 'Department Supervisor',
      nodeType: 'process',
      branchNote: clampStr(regContext, 60),
    },
    {
      id: `node_${area.areaCode}_3`,
      stepNo: '3',
      label: intel?.keyControls?.[0]?.controlName
        ? clampStr(intel.keyControls[0].controlName, 80)
        : 'Control Approval & Threshold Check',
      actorRole: defaultOwnerName,
      nodeType: 'control',
      branchNote: area.inherentRiskTier + ' Risk Control',
    },
    {
      id: `node_${area.areaCode}_4`,
      stepNo: '4',
      label: 'Is Approval Complete?',
      actorRole: `${area.domain} Head`,
      nodeType: 'decision',
      branchNote: 'Yes: Proceed to Posting | No: Escalate & Return',
    },
    {
      id: `node_${area.areaCode}_5`,
      stepNo: '5',
      label: 'Post to ERP & Save to Database',
      actorRole: 'Finance / Core System',
      nodeType: 'system',
      branchNote: 'Automated GL Entry',
    },
    {
      id: `node_${area.areaCode}_6`,
      stepNo: '6',
      label: 'Archive Audit Trail & Close',
      actorRole: 'Compliance Officer',
      nodeType: 'end',
      branchNote: 'Audit Trail Retained',
    },
  ];

  const processSteps =
    intel && intel.auditProcedures.length > 0
      ? intel.keyControls.slice(0, 5).map((kc, idx) => ({
          id: `step_${area.areaCode}_${idx + 1}`,
          stepNo: `${idx + 1}.0`,
          stepTitle: kc.controlName,
          description: kc.description || `Execute ${kc.controlName} in accordance with ${regContext}.`,
          actorRole: kc.controlOwner || defaultOwnerName,
          systemUsed: kc.automation === 'Manual' ? 'Manual Log / Documented Form' : 'Corporate ERP / Core System',
          inputDoc: 'Authorized Source Record',
          outputDoc: 'Reviewed Control Evidence',
          slaOrFrequency: kc.frequency || 'Per Transaction',
        }))
      : [
          {
            id: `step_${area.areaCode}_1`,
            stepNo: '1.0',
            stepTitle: 'Transaction Initiation & Documentation',
            description: `Initiate ${area.name} request and attach required supporting documents for ${area.entityName}.`,
            actorRole: `${area.domain} Staff`,
            systemUsed: 'Corporate ERP / Core System',
            inputDoc: 'Request / Source Slip',
            outputDoc: 'Logged Transaction Ticket',
            slaOrFrequency: 'Daily',
          },
          {
            id: `step_${area.areaCode}_2`,
            stepNo: '2.0',
            stepTitle: 'Supervisory Review & Compliance Check',
            description: `Review completeness, authorization limits, and compliance against ${regContext}.`,
            actorRole: defaultOwnerName,
            systemUsed: 'Approval Workflow / ERP',
            inputDoc: 'Logged Transaction Ticket',
            outputDoc: 'Approved Transaction Record',
            slaOrFrequency: 'Within 24 Hours',
          },
          {
            id: `step_${area.areaCode}_3`,
            stepNo: '3.0',
            stepTitle: 'Recording, Reconciliation & Archival',
            description: 'Post approved transactions, perform periodic reconciliation, and archive evidence for statutory retention.',
            actorRole: 'Accounting / Compliance Officer',
            systemUsed: 'General Ledger / Document Repository',
            inputDoc: 'Approved Transaction Record',
            outputDoc: 'Reconciled Ledger & Audit File',
            slaOrFrequency: 'Monthly / Period-End',
          },
        ];

  const risks =
    intel && intel.inherentRisks.length > 0
      ? intel.inherentRisks.slice(0, 8).map((r, idx) => {
          const score = r.likelihood * r.impact;
          const rating: RiskRating =
            score >= 20 ? 'Critical' : score >= 12 ? 'High' : score >= 6 ? 'Moderate' : 'Low';
          return {
            id: `pr_${area.areaCode}_${idx + 1}`,
            riskCode: `PR-${String(idx + 1).padStart(2, '0')}`,
            title: r.title,
            description: r.description,
            likelihood: r.likelihood,
            impact: r.impact,
            riskRating: rating,
            regulatoryRef: r.regulatoryRef || regContext,
          };
        })
      : [
          {
            id: `pr_${area.areaCode}_1`,
            riskCode: 'PR-01',
            title: `Control Breakdown or Non-Compliance in ${area.name}`,
            description:
              area.description ||
              `Unmitigated operational, financial, or regulatory exposure in ${area.name} at ${area.entityName}.`,
            likelihood: area.inherentRiskTier === 'Critical' ? 5 : area.inherentRiskTier === 'High' ? 4 : 3,
            impact: area.inherentRiskTier === 'Low' ? 2 : 4,
            riskRating: area.inherentRiskTier,
            regulatoryRef: regContext,
          },
        ];

  const existingControls =
    intel && intel.keyControls.length > 0
      ? intel.keyControls.slice(0, 8).map((kc, idx) => ({
          id: `pc_${area.areaCode}_${idx + 1}`,
          controlCode: `PC-${String(idx + 1).padStart(2, '0')}`,
          controlName: kc.controlName,
          description: kc.description,
          controlOwner: kc.controlOwner,
          frequency: kc.frequency,
          controlType: kc.controlType,
          automation: kc.automation,
          mappedRiskCode: risks[idx % risks.length]?.riskCode || 'PR-01',
        }))
      : [
          {
            id: `pc_${area.areaCode}_1`,
            controlCode: 'PC-01',
            controlName: 'Supervisory Dual Review & Exception Sign-Off',
            description: `Independent review against ${regContext} prior to final posting or execution.`,
            controlOwner: defaultOwnerName,
            frequency: 'Per Transaction / Monthly',
            controlType: 'Preventive' as const,
            automation: 'IT-Dependent' as const,
            mappedRiskCode: 'PR-01',
          },
        ];

  return {
    processCode: `PD-${area.areaCode}`,
    processName: area.name,
    domain: area.domain,
    entityName: area.entityName,
    version: 'v1.0',
    effectiveDate: new Date().toISOString().slice(0, 10),
    status: 'Draft',
    linkedAreaId: area.id,
    linkedAreaName: area.name,
    processObjective:
      intel?.auditObjective ||
      area.description ||
      `Ensure effective governance, operational accuracy, asset safeguarding, and regulatory compliance across ${area.name}.`,
    scope: `Covers end-to-end ${area.name} operations at ${area.entityName} (${area.domain}), governed by ${regContext}. Last Audit: ${area.lastAuditDate || 'Unscheduled'}.`,
    processFlowNarrative:
      intel?.processDescription ||
      `1. Activity initiated within ${area.entityName} under ${area.domain} guidelines.\n2. Supporting documentation validated against ${regContext}.\n3. Supervisory review and approval control executed prior to system posting and reconciliation.`,
    flowchartNodes,
    processSteps,
    processOwner: {
      ownerName: defaultOwnerName,
      ownerRole: `${area.domain} Process Owner`,
      department: area.domain,
      backupOwner: `${area.entityName} Operations Lead`,
    },
    documentsUsed: [
      {
        id: `doc_${area.areaCode}_1`,
        docCode: `DOC-${area.areaCode}-01`,
        documentName: `Authorized ${area.name} Source Record & Approval Sheet`,
        docType: 'Operational Control Evidence',
        sourceSystem: 'Corporate ERP / Workflow',
        retentionPeriod: '5–10 Years (BIR / Corporate)',
      },
    ],
    systemsUsed: [
      {
        id: `sys_${area.areaCode}_1`,
        systemName: 'Corporate ERP / Core Operations System',
        moduleName: area.domain,
        accessControlOwner: 'IT Governance & Process Owner',
        interfaceType: 'Role-Based Access Control (RBAC)',
      },
    ],
    risks,
    existingControls,
    attachments: [],
  };
}

/**
 * Synchronizes saved Process Documentation context directly into the linked Audit Area's
 * intelligence package so Overview, Risk Assessment, Control Matrix, Audit Procedures,
 * Findings Library, Recommendations Library, and Report Builder stay automatically updated.
 */
export function syncProcessDocToAreaIntelligence(
  area: AuditArea,
  processDoc: ProcessDocumentationInput
): AuditAreaIntelligence {
  const existing = area.intelligence;

  // Build rich process description combining flowchart narrative, scope, systems, and steps
  const stepSummary =
    processDoc.processSteps.length > 0
      ? `\n\nKey Process Steps (${processDoc.processSteps.length}): ${processDoc.processSteps
          .slice(0, 6)
          .map((s) => `${s.stepNo} ${s.stepTitle} (${s.actorRole})`)
          .join(' -> ')}`
      : '';
  const systemsSummary =
    processDoc.systemsUsed.length > 0
      ? `\nSystems Used: ${processDoc.systemsUsed.map((s) => `${s.systemName}${s.moduleName ? ` (${s.moduleName})` : ''}`).join(', ')}`
      : '';
  const docsSummary =
    processDoc.documentsUsed.length > 0
      ? `\nDocuments Used: ${processDoc.documentsUsed.map((d) => `${d.docCode}: ${d.documentName}`).join(', ')}`
      : '';

  const syncedProcessDescription = clampStr(
    `${processDoc.processFlowNarrative || ''}${processDoc.scope ? `\n\nScope: ${processDoc.scope}` : ''}${stepSummary}${systemsSummary}${docsSummary}`,
    6000,
    existing?.processDescription || area.description || processDoc.processName
  );

  // 1. Risk Assessment synchronization (upsert PR-* risks from Process Documentation)
  const processRisksMapped: InherentRiskItem[] = processDoc.risks.map((r, idx) => ({
    id: clampStr(r.riskCode || `PR-${idx + 1}`, 30),
    title: r.title,
    description: r.description || `Process risk documented in ${processDoc.processCode} (${processDoc.processName}).`,
    likelihood: clampInt(r.likelihood, 1, 5, 3),
    impact: clampInt(r.impact, 1, 5, 4),
    regulatoryRef: r.regulatoryRef || area.regulatoryContext || 'Corporate Policy / IIA IPPF',
  }));
  const nonProcessRisks = (existing?.inherentRisks || []).filter(
    (r) => !r.id.toUpperCase().startsWith('PR-')
  );
  const mergedInherentRisks = [...processRisksMapped, ...nonProcessRisks].slice(0, 25);

  const highestRiskRating: RiskRating =
    processDoc.risks.find((r) => r.riskRating === 'Critical')?.riskRating ||
    processDoc.risks.find((r) => r.riskRating === 'High')?.riskRating ||
    existing?.riskRating ||
    area.inherentRiskTier;

  const avgLikelihood =
    processDoc.risks.length > 0
      ? Math.round(
          processDoc.risks.reduce((acc, r) => acc + clampInt(r.likelihood, 1, 5, 3), 0) /
            processDoc.risks.length
        )
      : existing?.riskAssessment?.likelihood || 3;
  const avgImpact =
    processDoc.risks.length > 0
      ? Math.round(
          processDoc.risks.reduce((acc, r) => acc + clampInt(r.impact, 1, 5, 4), 0) /
            processDoc.risks.length
        )
      : existing?.riskAssessment?.impact || 4;

  // 2. Control Matrix synchronization (upsert CO-PR-* objectives, PC-* controls, CW-PD-* gaps)
  const processControlObjectives: ControlObjectiveItem[] = processDoc.risks.map((r, idx) => {
    const code = clampStr(r.riskCode || `PR-${idx + 1}`, 30);
    return {
      id: clampStr(`CO-${code}`, 30),
      objective: `Mitigate ${r.title} across ${processDoc.processName}.`,
      riskRef: code,
    };
  });
  const nonProcessObjectives = (existing?.controlObjectives || []).filter(
    (co) => !co.id.toUpperCase().startsWith('CO-PR-')
  );
  const mergedControlObjectives = [...processControlObjectives, ...nonProcessObjectives].slice(0, 25);

  const processControlsMapped: KeyControlItem[] = processDoc.existingControls.map((c, idx) => ({
    id: clampStr(c.controlCode || `PC-${idx + 1}`, 30),
    controlName: c.controlName,
    description: c.description || `Control documented in ${processDoc.processCode}.`,
    controlOwner: c.controlOwner || processDoc.processOwner.ownerName || 'Process Owner',
    frequency: c.frequency || 'Per Transaction',
    controlType: c.controlType,
    automation: c.automation,
    objectiveRef: clampStr(c.mappedRiskCode ? `CO-${c.mappedRiskCode}` : 'CO-PR-01', 40),
  }));
  const nonProcessControls = (existing?.keyControls || []).filter(
    (kc) => !kc.id.toUpperCase().startsWith('PC-')
  );
  const mergedKeyControls = [...processControlsMapped, ...nonProcessControls].slice(0, 30);

  const mappedRiskCodes = new Set(
    processDoc.existingControls.map((c) => c.mappedRiskCode.trim().toUpperCase()).filter(Boolean)
  );
  const unmitigatedRisks = processDoc.risks.filter(
    (r) => !mappedRiskCodes.has(r.riskCode.trim().toUpperCase())
  );
  const processControlWeaknesses: ControlWeaknessItem[] = unmitigatedRisks.map((r, idx) => ({
    id: `CW-PD-${idx + 1}`,
    weaknessTitle: `Unmapped Control Coverage for ${r.riskCode}: ${r.title}`,
    gapDescription: `Process Documentation ${processDoc.processCode} identifies risk "${r.title}" without a corresponding mapped control in Existing Controls.`,
    severity: normalizeRiskRating(r.riskRating, 'High'),
    affectedControlRef: r.riskCode,
  }));
  const nonProcessWeaknesses = (existing?.controlWeaknesses || []).filter(
    (cw) => !cw.id.toUpperCase().startsWith('CW-PD-')
  );
  const mergedWeaknesses = [...processControlWeaknesses, ...nonProcessWeaknesses].slice(0, 25);

  // 3. Audit Procedures & Walkthrough Questions synchronization (upsert PD-AP-* & PD-WQ-*)
  const primaryEvidence =
    processDoc.documentsUsed.map((d) => `${d.docCode} (${d.documentName})`).slice(0, 3).join(', ') ||
    'Source documents & system logs';
  const primarySystem =
    processDoc.systemsUsed.map((s) => s.systemName).slice(0, 2).join(', ') || 'Core ERP System';

  const processProcedures: AuditProcedureItem[] = processDoc.existingControls.slice(0, 10).map((c, idx) => ({
    id: `PD-AP-${idx + 1}`,
    procedureType: c.automation === 'Automated' ? 'Reperformance' : 'Inspection',
    objective: `Verify operating effectiveness of ${c.controlCode} (${c.controlName}) in ${processDoc.processCode}.`,
    stepDetail: `Inspect sample transactions in ${primarySystem} handled by ${c.controlOwner || processDoc.processOwner.ownerName} to confirm "${c.description || c.controlName}" operates consistently at ${c.frequency} frequency.`,
    sampleSizeGuidance: c.frequency.toLowerCase().includes('daily') ? '25 daily instances' : '15–25 transactions or 10% sample',
    expectedEvidence: primaryEvidence,
    testingStatus: 'Not Started',
  }));
  const nonProcessProcedures = (existing?.auditProcedures || []).filter(
    (ap) => !ap.id.toUpperCase().startsWith('PD-AP-')
  );
  const mergedProcedures = [...processProcedures, ...nonProcessProcedures].slice(0, 35);

  const processWalkthroughs: WalkthroughQuestionItem[] = processDoc.processSteps
    .slice(0, 6)
    .map((s, idx) => ({
      id: `PD-WQ-${idx + 1}`,
      intervieweeRole: s.actorRole || processDoc.processOwner.ownerRole,
      question: `During Step ${s.stepNo} (${s.stepTitle}) in ${s.systemUsed || primarySystem}, how do you validate ${s.inputDoc || 'source inputs'} before generating ${s.outputDoc || 'output records'}?`,
      expectedResponse: s.description || `Actor verifies authorization, completeness, and policy compliance within ${s.slaOrFrequency || 'SLA'}.`,
      redFlagIndicator: `Missing sign-off on ${s.outputDoc || 'step output'}, manual overrides in ${s.systemUsed || primarySystem}, or bypassed SLA (${s.slaOrFrequency || 'unspecified'}).`,
    }));
  const nonProcessWalkthroughs = (existing?.walkthroughQuestions || []).filter(
    (wq) => !wq.id.toUpperCase().startsWith('PD-WQ-')
  );
  const mergedWalkthroughs = [...processWalkthroughs, ...nonProcessWalkthroughs].slice(0, 25);

  // 4. Findings Library synchronization (upsert PD-PF-* potential findings)
  const findingSourceRisks =
    unmitigatedRisks.length > 0
      ? unmitigatedRisks
      : processDoc.risks.filter((r) => r.riskRating === 'Critical' || r.riskRating === 'High').slice(0, 3);

  const processPotentialFindings: PotentialFindingItem[] = findingSourceRisks.map((r, idx) => ({
    id: `PD-PF-${idx + 1}`,
    title: `${r.riskCode}: Potential Exposure in ${r.title}`,
    condition:
      unmitigatedRisks.some((u) => u.id === r.id)
        ? `Process Documentation (${processDoc.processCode}) records risk "${r.title}" without a mapped preventive/detective control.`
        : `High-risk area documented in ${processDoc.processCode} (${processDoc.processName}): ${r.description}`,
    criteria: r.regulatoryRef || area.regulatoryContext || 'IIA IPPF & Corporate Policy',
    cause: `Control design or enforcement dependency around ${processDoc.processOwner.ownerName} / ${primarySystem}.`,
    effect: `Elevated ${r.riskRating} compliance, financial, or operational exposure for ${processDoc.entityName}.`,
    severity: normalizeRiskRating(r.riskRating, 'High'),
  }));
  const nonProcessFindings = (existing?.potentialFindings || []).filter(
    (pf) => !pf.id.toUpperCase().startsWith('PD-PF-')
  );
  const mergedFindings = [...processPotentialFindings, ...nonProcessFindings].slice(0, 25);

  // 5. Recommendations Library synchronization (upsert PD-REC-* recommendations)
  const processRecommendations: RecommendationItem[] = findingSourceRisks.map((r, idx) => ({
    id: `PD-REC-${idx + 1}`,
    priority: normalizeRiskRating(r.riskRating, 'High'),
    actionTitle: `Strengthen Control Coverage for ${r.riskCode}: ${r.title}`,
    detailedAction: `Implement and document automated or dual-custody preventive controls in ${primarySystem} addressing ${r.title}, verified against ${primaryEvidence}.`,
    targetOwner: processDoc.processOwner.ownerName || `${processDoc.domain} Process Owner`,
    timeline: r.riskRating === 'Critical' ? '15–30 Days' : '30–60 Days',
    expectedBenefit: `Mitigates ${r.riskRating} exposure under ${r.regulatoryRef || 'corporate standards'} in ${processDoc.processName}.`,
  }));
  const nonProcessRecommendations = (existing?.recommendations || []).filter(
    (rec) => !rec.id.toUpperCase().startsWith('PD-REC-')
  );
  const mergedRecommendations = [...processRecommendations, ...nonProcessRecommendations].slice(0, 25);

  return sanitizeIntelligence({
    auditObjective: clampStr(
      processDoc.processObjective,
      3000,
      existing?.auditObjective || area.description || 'Assess control adequacy and compliance.'
    ),
    processDescription: syncedProcessDescription,
    inherentRisks: mergedInherentRisks,
    riskAssessment: existing?.riskAssessment || {
      likelihood: avgLikelihood,
      impact: avgImpact,
      controlEnvironmentScore: processDoc.existingControls.length >= 2 ? 3 : 2,
      residualRiskRating: highestRiskRating,
      rationale: `Synchronized from Process Documentation ${processDoc.processCode} (${processDoc.processName}) covering ${processDoc.risks.length} documented risks and ${processDoc.existingControls.length} controls.`,
    },
    riskRating: existing?.riskRating || highestRiskRating,
    controlObjectives: mergedControlObjectives,
    keyControls: mergedKeyControls,
    controlWeaknesses: mergedWeaknesses,
    auditProcedures: mergedProcedures,
    walkthroughQuestions: mergedWalkthroughs,
    potentialFindings: mergedFindings,
    rootCauseAnalysis: existing?.rootCauseAnalysis || {
      summary: `Process-level root cause context derived from ${processDoc.processCode} (${processDoc.processName}).`,
      people: `Process execution owned by ${processDoc.processOwner.ownerName} (${processDoc.processOwner.ownerRole}).`,
      process: `${processDoc.processSteps.length} documented steps across ${processDoc.scope}`,
      technology: `Systems in scope: ${primarySystem}`,
      policyGovernance: `Compliance benchmark: ${area.regulatoryContext || 'IIA IPPF / PFRS / BIR'}`,
      externalRegulatory: area.regulatoryContext || 'Philippine statutory & regulatory frameworks',
    },
    recommendations: mergedRecommendations,
    auditReportNarratives: existing?.auditReportNarratives || {
      executiveSummary: `Process Documentation ${processDoc.processCode} (${processDoc.processName}) for ${processDoc.entityName} has been synchronized with Risk Assessment, Control Matrix, and Audit Procedures.`,
      scopeAndMethodology: processDoc.scope,
      overallConclusion: `Control coverage across ${processDoc.existingControls.length} documented controls and ${processDoc.risks.length} risks is ready for audit execution and report compilation.`,
      keyHighlights: [
        `Process Owner: ${processDoc.processOwner.ownerName} (${processDoc.processOwner.department})`,
        `Systems in Scope: ${primarySystem}`,
        `Documented Controls: ${processDoc.existingControls.length} | Documented Risks: ${processDoc.risks.length}`,
      ],
    },
    generatedAt: new Date().toISOString(),
  });
}
