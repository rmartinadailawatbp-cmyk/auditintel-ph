import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const PRIMARY_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODELS = ['gemini-3.1-flash-lite'] as const;

const PH_AUDIT_SYSTEM_INSTRUCTION = `You are a Principal Internal Audit Executive and Chief Audit Advisor specializing in Philippine corporate auditing, operations auditing, inventory auditing, finance, compliance, procurement, asset disposal, treasury, and branch operations.

Your technical mastery includes:
- IIA Global Internal Audit Standards (IPPF) & COSO Internal Control Framework
- Philippine Financial Reporting Standards (PFRS / PAS, including PAS 2 Inventories, PFRS 15, PFRS 16)
- Bureau of Internal Revenue (BIR) regulations: NIRC, EOPT Act (RA 11976 / BIR RR 7-2024 Sales Invoice vs Official Receipt rules), Withholding Taxes (EWT/FWT, Form 2307, Alphalist), VAT substantiation, BIR inventory listing & destruction permits
- SEC & Revised Corporation Code (RA 11232), GIS/AFS filings, related-party disclosures
- Bangko Sentral ng Pilipinas (BSP) circulars, Anti-Money Laundering Act (AMLA RA 9160), Data Privacy Act of 2012 (RA 10173 / NPC), DOLE Labor Code, and LGU permitting
- Practical Philippine corporate realities: provincial branch cash-in-vault counts, POS Z-reading reconciliation, armored transport, Stock Transfer Slips (STS), 3-way matching, 3-bid canvass and PO splitting detection, sealed-bid scrap disposal, check disbursements, PDC custody, and ERP Segregation of Duties.

Write with authoritative, board-ready internal audit rigor. Quantify risks where relevant using Philippine Peso (PHP) context or percentage thresholds, and avoid generic filler.`;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const CAPACITY_ERROR_MESSAGE =
  'Audit Intelligence service is temporarily unavailable due to model capacity constraints. Please try again later.';

const QUOTA_ERROR_MESSAGE =
  'Gemini API daily free-tier request quota exceeded. Please wait for the quota to reset or attach a billing-enabled API key in Settings > Secrets to increase your quota.';

function extractErrorDetails(error: unknown): { status?: number; text: string } {
  if (!error || typeof error !== 'object') {
    return { text: String(error ?? '') };
  }
  const errObj = error as { status?: unknown; code?: unknown; message?: unknown };
  const statusNum =
    typeof errObj.status === 'number'
      ? errObj.status
      : typeof errObj.code === 'number'
        ? errObj.code
        : undefined;
  const text = typeof errObj.message === 'string' ? errObj.message : String(error);
  return { status: statusNum, text };
}

function isQuotaOrCapacityError(error: unknown): boolean {
  const { status, text } = extractErrorDetails(error);
  const upper = text.toUpperCase();
  return (
    status === 429 ||
    status === 500 ||
    status === 503 ||
    upper.includes('429') ||
    upper.includes('503') ||
    upper.includes('UNAVAILABLE') ||
    upper.includes('RESOURCE_EXHAUSTED') ||
    upper.includes('OVERLOADED') ||
    upper.includes('HIGH DEMAND') ||
    upper.includes('QUOTA')
  );
}

function isDailyQuotaExhausted(text: string): boolean {
  const upper = text.toUpperCase();
  return (
    upper.includes('QUOTA') ||
    upper.includes('FREE_TIER') ||
    upper.includes('FREETIER') ||
    upper.includes('GENERATEREQUESTSPERDAY') ||
    upper.includes('RESOURCE_EXHAUSTED')
  );
}

async function generateContentWithFallback(
  ai: GoogleGenAI,
  params: Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'>
) {
  const candidates = [PRIMARY_MODEL, ...FALLBACK_MODELS];
  let lastError: unknown;

  for (let i = 0; i < candidates.length; i += 1) {
    const model = candidates[i];
    try {
      return await ai.models.generateContent({
        ...params,
        model,
      });
    } catch (error) {
      lastError = error;
      const { status, text } = extractErrorDetails(error);
      const upper = text.toUpperCase();
      const canFallback =
        i < candidates.length - 1 &&
        (isQuotaOrCapacityError(error) || status === 404 || upper.includes('NOT_FOUND'));

      if (canFallback) {
        console.warn(
          `[gemini-fallback] Model "${model}" unavailable (${status ?? 'err'}). Retrying with "${candidates[i + 1]}".`
        );
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

function handleGeminiError(res: Response, error: unknown, contextLabel: string): void {
  const { status: rawStatus, text } = extractErrorDetails(error);
  const upper = text.toUpperCase();

  if (rawStatus === 429 || upper.includes('429') || isDailyQuotaExhausted(text)) {
    if (isDailyQuotaExhausted(text)) {
      console.warn(`[${contextLabel}] Gemini API quota reached (429).`);
      res.status(429).json({
        error: QUOTA_ERROR_MESSAGE,
        quotaExhausted: true,
      });
      return;
    }
    console.warn(`[${contextLabel}] Gemini rate limit (429).`);
    res.status(429).json({
      error: CAPACITY_ERROR_MESSAGE,
      quotaExhausted: false,
    });
    return;
  }

  if (
    rawStatus === 500 ||
    rawStatus === 503 ||
    upper.includes('500') ||
    upper.includes('503') ||
    upper.includes('UNAVAILABLE') ||
    upper.includes('OVERLOADED') ||
    upper.includes('HIGH DEMAND') ||
    upper.includes('INTERNAL')
  ) {
    console.warn(`[${contextLabel}] Gemini transient error (${rawStatus ?? '503'}):`, text.slice(0, 240));
    const httpStatus = rawStatus === 503 ? 503 : 500;
    res.status(httpStatus).json({ error: CAPACITY_ERROR_MESSAGE, quotaExhausted: false });
    return;
  }

  console.error(`[${contextLabel}] Error:`, error);

  if (rawStatus === 403 || upper.includes('PERMISSION_DENIED') || upper.includes('API_KEY_INVALID')) {
    res.status(403).json({
      error: 'Audit Intelligence service could not authenticate with the AI provider. Please verify your API key in Settings > Secrets.',
    });
    return;
  }

  if (rawStatus === 404 || upper.includes('NOT_FOUND')) {
    res.status(404).json({
      error: 'Requested Audit Intelligence model is currently unavailable. Please try again later.',
    });
    return;
  }

  res.status(500).json({
    error: 'Audit Intelligence service encountered an unexpected error. Please try again later.',
  });
}

const app = express();
app.use(express.json({ limit: '2mb' }));

// 1. Generate 14-part Audit Intelligence for a selected Audit Area
app.post('/api/audit/generate-area-intelligence', async (req: Request, res: Response) => {
  try {
    const {
      areaCode,
      name,
      domain,
      entityName,
      inherentRiskTier,
      regulatoryContext,
      description,
      lastAuditDate,
      knowledgeContext,
    } = req.body || {};

    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'Audit Area name is required.' });
      return;
    }

    const ai = getGeminiClient();
    const kbNotes = Array.isArray(knowledgeContext) && knowledgeContext.length > 0
      ? `\nExisting Organization Audit Knowledge Base Context:\n${knowledgeContext.join('\n')}`
      : '';

    const prompt = `Generate a comprehensive, engagement-ready Internal Audit Intelligence Package for the following Audit Area in a Philippine corporate setting:

- Area Code: ${String(areaCode || 'AUD-01')}
- Audit Area: ${name}
- Domain: ${String(domain || 'Philippine Corporate')}
- Entity / Unit: ${String(entityName || 'Corporate Head Office')}
- Preliminary Inherent Risk Tier: ${String(inherentRiskTier || 'High')}
- Regulatory & Policy Context: ${String(regulatoryContext || 'IIA IPPF, PFRS, BIR, SEC')}
- Scope / Description: ${String(description || name)}
- Last Audit Date: ${String(lastAuditDate || 'Unscheduled')}${kbNotes}

Produce crisp, specific, high-value content across all 14 required sections:
1. auditObjective: Clear, risk-based internal audit objective statement.
2. processDescription: Detailed end-to-end process narrative reflecting Philippine corporate workflows, systems, and handoffs.
3. inherentRisks: 4 to 6 distinct inherent risks with likelihood (1-5), impact (1-5), and specific regulatoryRef.
4. riskAssessment: Overall likelihood (1-5), impact (1-5), controlEnvironmentScore (1-5 where 5 is strongest), residualRiskRating, and comprehensive rationale.
5. riskRating: Overall area risk rating (Critical, High, Moderate, or Low).
6. controlObjectives: 4 to 5 control objectives mapped to inherent risk IDs.
7. keyControls: 5 to 7 specific key controls with controlOwner, frequency, controlType (Preventive/Detective/Corrective), automation (Automated/IT-Dependent/Manual), and objectiveRef.
8. controlWeaknesses: 3 to 5 common/potential control weaknesses in Philippine corporate environments mapped to key controls.
9. auditProcedures: 5 to 7 actionable audit workpaper steps across Inquiry, Observation, Inspection, Reperformance, and Analytical procedures with sampleSizeGuidance and expectedEvidence (set testingStatus to "Not Started").
10. walkthroughQuestions: 4 to 5 targeted walkthrough questions with intervieweeRole, expectedResponse, and redFlagIndicator.
11. potentialFindings: 3 to 4 realistic potential findings formatted with Condition, Criteria, Cause, Effect, and severity.
12. rootCauseAnalysis: Systemic root cause synthesis across summary, people, process, technology, policyGovernance, and externalRegulatory.
13. recommendations: 4 to 5 prioritized remediation recommendations with targetOwner, timeline, and expectedBenefit.
14. auditReportNarratives: Board-ready executiveSummary, scopeAndMethodology, overallConclusion, and 3 to 5 keyHighlights.`;

    const response = await generateContentWithFallback(ai, {
      contents: prompt,
      config: {
        systemInstruction: PH_AUDIT_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            auditObjective: { type: Type.STRING },
            processDescription: { type: Type.STRING },
            inherentRisks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  likelihood: { type: Type.INTEGER },
                  impact: { type: Type.INTEGER },
                  regulatoryRef: { type: Type.STRING },
                },
                required: ['id', 'title', 'description', 'likelihood', 'impact', 'regulatoryRef'],
              },
            },
            riskAssessment: {
              type: Type.OBJECT,
              properties: {
                likelihood: { type: Type.INTEGER },
                impact: { type: Type.INTEGER },
                controlEnvironmentScore: { type: Type.INTEGER },
                residualRiskRating: { type: Type.STRING },
                rationale: { type: Type.STRING },
              },
              required: ['likelihood', 'impact', 'controlEnvironmentScore', 'residualRiskRating', 'rationale'],
            },
            riskRating: { type: Type.STRING },
            controlObjectives: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  objective: { type: Type.STRING },
                  riskRef: { type: Type.STRING },
                },
                required: ['id', 'objective', 'riskRef'],
              },
            },
            keyControls: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  controlName: { type: Type.STRING },
                  description: { type: Type.STRING },
                  controlOwner: { type: Type.STRING },
                  frequency: { type: Type.STRING },
                  controlType: { type: Type.STRING },
                  automation: { type: Type.STRING },
                  objectiveRef: { type: Type.STRING },
                },
                required: [
                  'id',
                  'controlName',
                  'description',
                  'controlOwner',
                  'frequency',
                  'controlType',
                  'automation',
                  'objectiveRef',
                ],
              },
            },
            controlWeaknesses: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  weaknessTitle: { type: Type.STRING },
                  gapDescription: { type: Type.STRING },
                  severity: { type: Type.STRING },
                  affectedControlRef: { type: Type.STRING },
                },
                required: ['id', 'weaknessTitle', 'gapDescription', 'severity', 'affectedControlRef'],
              },
            },
            auditProcedures: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  procedureType: { type: Type.STRING },
                  objective: { type: Type.STRING },
                  stepDetail: { type: Type.STRING },
                  sampleSizeGuidance: { type: Type.STRING },
                  expectedEvidence: { type: Type.STRING },
                  testingStatus: { type: Type.STRING },
                },
                required: [
                  'id',
                  'procedureType',
                  'objective',
                  'stepDetail',
                  'sampleSizeGuidance',
                  'expectedEvidence',
                  'testingStatus',
                ],
              },
            },
            walkthroughQuestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  intervieweeRole: { type: Type.STRING },
                  question: { type: Type.STRING },
                  expectedResponse: { type: Type.STRING },
                  redFlagIndicator: { type: Type.STRING },
                },
                required: ['id', 'intervieweeRole', 'question', 'expectedResponse', 'redFlagIndicator'],
              },
            },
            potentialFindings: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  title: { type: Type.STRING },
                  condition: { type: Type.STRING },
                  criteria: { type: Type.STRING },
                  cause: { type: Type.STRING },
                  effect: { type: Type.STRING },
                  severity: { type: Type.STRING },
                },
                required: ['id', 'title', 'condition', 'criteria', 'cause', 'effect', 'severity'],
              },
            },
            rootCauseAnalysis: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                people: { type: Type.STRING },
                process: { type: Type.STRING },
                technology: { type: Type.STRING },
                policyGovernance: { type: Type.STRING },
                externalRegulatory: { type: Type.STRING },
              },
              required: ['summary', 'people', 'process', 'technology', 'policyGovernance', 'externalRegulatory'],
            },
            recommendations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  priority: { type: Type.STRING },
                  actionTitle: { type: Type.STRING },
                  detailedAction: { type: Type.STRING },
                  targetOwner: { type: Type.STRING },
                  timeline: { type: Type.STRING },
                  expectedBenefit: { type: Type.STRING },
                },
                required: ['id', 'priority', 'actionTitle', 'detailedAction', 'targetOwner', 'timeline', 'expectedBenefit'],
              },
            },
            auditReportNarratives: {
              type: Type.OBJECT,
              properties: {
                executiveSummary: { type: Type.STRING },
                scopeAndMethodology: { type: Type.STRING },
                overallConclusion: { type: Type.STRING },
                keyHighlights: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['executiveSummary', 'scopeAndMethodology', 'overallConclusion', 'keyHighlights'],
            },
          },
          required: [
            'auditObjective',
            'processDescription',
            'inherentRisks',
            'riskAssessment',
            'riskRating',
            'controlObjectives',
            'keyControls',
            'controlWeaknesses',
            'auditProcedures',
            'walkthroughQuestions',
            'potentialFindings',
            'rootCauseAnalysis',
            'recommendations',
            'auditReportNarratives',
          ],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    parsed.generatedAt = new Date().toISOString();
    res.json(parsed);
  } catch (error) {
    handleGeminiError(res, error, 'generate-area-intelligence');
  }
});

// 2. Analyze Field Observation -> Finding, Risk Statement, Root Cause, Recommendation, Risk Rating, Management Action Plan
app.post('/api/audit/analyze-observation', async (req: Request, res: Response) => {
  try {
    const {
      areaName,
      domain,
      regulatoryContext,
      observationTitle,
      observationText,
      evidenceRef,
      sampleTested,
      knowledgeContext,
    } = req.body || {};

    if (!observationText || typeof observationText !== 'string') {
      res.status(400).json({ error: 'Observation details are required.' });
      return;
    }

    const ai = getGeminiClient();
    const kbNotes = Array.isArray(knowledgeContext) && knowledgeContext.length > 0
      ? `\nRelevant Firm Knowledge Base Context:\n${knowledgeContext.join('\n')}`
      : '';

    const prompt = `Transform the following raw internal audit field observation into a formal, Audit Committee-ready finding package grounded in Philippine corporate auditing standards:

- Audit Area: ${String(areaName || 'General Corporate Audit')}
- Domain: ${String(domain || 'Philippine Corporate')}
- Regulatory / Policy Context: ${String(regulatoryContext || 'IIA IPPF / PFRS / BIR')}
- Observation Title: ${String(observationTitle || 'Field Observation')}
- Sample Tested: ${String(sampleTested || 'Not specified')}
- Evidence Reference: ${String(evidenceRef || 'Field workpapers')}
- Raw Observation Notes: ${observationText}${kbNotes}

Generate:
1. auditFinding: Formal Condition and Criteria statement referencing exact policies, PFRS, BIR, SEC, or operational standards.
2. riskStatement: Clear financial, operational, fraud, or regulatory exposure (including BIR penalty/disallowance or operational loss implications where relevant).
3. rootCause: Systemic underlying root cause (beyond surface symptoms).
4. recommendation: Practical, enforceable corrective control recommendation.
5. riskRating: Critical, High, Moderate, or Low.
6. managementActionPlan: Concrete actionSteps, suggested responsibleOwner (role title), realistic targetDate (e.g. "Within 30 days" or YYYY-MM-DD), and status ("Open").`;

    const response = await generateContentWithFallback(ai, {
      contents: prompt,
      config: {
        systemInstruction: PH_AUDIT_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            auditFinding: { type: Type.STRING },
            riskStatement: { type: Type.STRING },
            rootCause: { type: Type.STRING },
            recommendation: { type: Type.STRING },
            riskRating: { type: Type.STRING },
            managementActionPlan: {
              type: Type.OBJECT,
              properties: {
                actionSteps: { type: Type.STRING },
                responsibleOwner: { type: Type.STRING },
                targetDate: { type: Type.STRING },
                status: { type: Type.STRING },
              },
              required: ['actionSteps', 'responsibleOwner', 'targetDate', 'status'],
            },
          },
          required: [
            'auditFinding',
            'riskStatement',
            'rootCause',
            'recommendation',
            'riskRating',
            'managementActionPlan',
          ],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json(parsed);
  } catch (error) {
    handleGeminiError(res, error, 'analyze-observation');
  }
});

// 3. Internal Audit Assistant (Audit GPT specialized in Philippine corporate auditing)
app.post('/api/audit/assistant', async (req: Request, res: Response) => {
  try {
    const { messages, selectedArea, knowledgeContext, observationSummary } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'Conversation messages are required.' });
      return;
    }

    const ai = getGeminiClient();
    const contextBlock = [
      selectedArea
        ? `Active Audit Area: [${selectedArea.areaCode}] ${selectedArea.name} (${selectedArea.domain}, Entity: ${selectedArea.entityName}, Risk: ${selectedArea.riskRating}, Regulatory Context: ${selectedArea.regulatoryContext})`
        : 'No single Audit Area locked; answering across the Philippine Corporate Audit Universe.',
      Array.isArray(knowledgeContext) && knowledgeContext.length > 0
        ? `Saved Knowledge Base Entries:\n${knowledgeContext
            .map((k: { type: string; domain: string; title: string; content: string }) => `- [${k.type} | ${k.domain}] ${k.title}: ${k.content}`)
            .join('\n')}`
        : '',
      Array.isArray(observationSummary) && observationSummary.length > 0
        ? `Recent Logged Observations:\n${observationSummary
            .map((o: { title: string; riskRating: string; finding: string }) => `- [${o.riskRating}] ${o.title}: ${o.finding}`)
            .join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const transcript = messages
      .map((m: { role: string; content: string }) => `${m.role === 'user' ? 'Auditor' : 'AuditIntel Assistant'}: ${m.content}`)
      .join('\n\n');

    const prompt = `${contextBlock}

Conversation History:
${transcript}

Provide an authoritative, structured, practical answer tailored to Philippine corporate auditing. Also extract ONE reusable knowledge item (suggestedKnowledgeItem) summarizing the key rule, procedure, or recommendation from your response so the auditor can save it directly into the Firestore Audit Knowledge Base.`;

    const response = await generateContentWithFallback(ai, {
      contents: prompt,
      config: {
        systemInstruction: PH_AUDIT_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: { type: Type.STRING },
            suggestedKnowledgeItem: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING },
                title: { type: Type.STRING },
                content: { type: Type.STRING },
                regulatoryRef: { type: Type.STRING },
                riskRating: { type: Type.STRING },
                tags: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['type', 'title', 'content', 'regulatoryRef', 'riskRating', 'tags'],
            },
          },
          required: ['reply', 'suggestedKnowledgeItem'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json(parsed);
  } catch (error) {
    handleGeminiError(res, error, 'audit-assistant');
  }
});

// 4. Refine Report Builder Narratives
app.post('/api/audit/refine-report', async (req: Request, res: Response) => {
  try {
    const { area, observations, currentExecutiveSummary, currentScope, currentConclusion } = req.body || {};

    if (!area || typeof area.name !== 'string') {
      res.status(400).json({ error: 'Audit Area metadata is required.' });
      return;
    }

    const ai = getGeminiClient();
    const obsList = Array.isArray(observations) && observations.length > 0
      ? observations
          .map(
            (o: { title: string; riskRating: string; auditFinding: string; recommendation: string }, i: number) =>
              `${i + 1}. [${o.riskRating}] ${o.title}\n   Finding: ${o.auditFinding}\n   Recommendation: ${o.recommendation}`
          )
          .join('\n')
      : 'No field exceptions logged yet; synthesize based on area scope and control posture.';

    const prompt = `Draft polished, executive-ready Internal Audit Report narratives for the Audit Committee of a Philippine corporation.

Audit Area: [${area.areaCode}] ${area.name}
Domain: ${area.domain}
Entity: ${area.entityName}
Regulatory Context: ${area.regulatoryContext}
Audit Objective: ${area.auditObjective}
Overall Risk Rating: ${area.riskRating}

Included Field Observations & Findings:
${obsList}

Existing Drafts to Refine:
- Executive Summary Draft: ${String(currentExecutiveSummary || '')}
- Scope & Methodology Draft: ${String(currentScope || '')}
- Overall Conclusion Draft: ${String(currentConclusion || '')}

Return refined executiveSummary, scopeAndMethodology, and overallConclusion in crisp, formal internal audit prose.`;

    const response = await generateContentWithFallback(ai, {
      contents: prompt,
      config: {
        systemInstruction: PH_AUDIT_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            executiveSummary: { type: Type.STRING },
            scopeAndMethodology: { type: Type.STRING },
            overallConclusion: { type: Type.STRING },
          },
          required: ['executiveSummary', 'scopeAndMethodology', 'overallConclusion'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json(parsed);
  } catch (error) {
    handleGeminiError(res, error, 'refine-report');
  }
});

// 5. Generate Audit Intelligence Sections from Process Documentation
app.post('/api/audit/generate-from-process', async (req: Request, res: Response) => {
  try {
    const { actionType, processDoc, linkedArea, knowledgeContext } = req.body || {};

    if (!processDoc || typeof processDoc.processName !== 'string') {
      res.status(400).json({ error: 'Process Documentation details are required.' });
      return;
    }

    const validActions = new Set([
      'risk_assessment',
      'control_matrix',
      'audit_procedures',
      'walkthrough_questions',
      'potential_findings',
      'recommendations',
    ]);
    if (!validActions.has(String(actionType))) {
      res.status(400).json({ error: 'Invalid AI generation action type.' });
      return;
    }

    const ai = getGeminiClient();
    const stepsText = Array.isArray(processDoc.processSteps)
      ? processDoc.processSteps
          .map(
            (s: { stepNo?: string; stepTitle?: string; actorRole?: string; systemUsed?: string; description?: string }) =>
              `Step ${s.stepNo || ''}: ${s.stepTitle || ''} [Actor: ${s.actorRole || ''}, System: ${s.systemUsed || ''}] - ${s.description || ''}`
          )
          .join('\n')
      : '';
    const docsText = Array.isArray(processDoc.documentsUsed)
      ? processDoc.documentsUsed
          .map((d: { docCode?: string; documentName?: string; sourceSystem?: string }) => `${d.docCode || ''}: ${d.documentName || ''} (${d.sourceSystem || ''})`)
          .join('; ')
      : '';
    const systemsText = Array.isArray(processDoc.systemsUsed)
      ? processDoc.systemsUsed
          .map((s: { systemName?: string; moduleName?: string; accessControlOwner?: string }) => `${s.systemName || ''} / ${s.moduleName || ''} [Access Owner: ${s.accessControlOwner || ''}]`)
          .join('; ')
      : '';
    const risksText = Array.isArray(processDoc.risks)
      ? processDoc.risks
          .map((r: { riskCode?: string; title?: string; riskRating?: string; description?: string; regulatoryRef?: string }) => `${r.riskCode || ''} [${r.riskRating || ''}]: ${r.title || ''} - ${r.description || ''} (${r.regulatoryRef || ''})`)
          .join('\n')
      : '';
    const controlsText = Array.isArray(processDoc.existingControls)
      ? processDoc.existingControls
          .map((c: { controlCode?: string; controlName?: string; controlType?: string; automation?: string; controlOwner?: string; mappedRiskCode?: string; description?: string }) => `${c.controlCode || ''} (${c.controlType || ''}, ${c.automation || ''}, Owner: ${c.controlOwner || ''}, Maps to ${c.mappedRiskCode || ''}): ${c.controlName || ''} - ${c.description || ''}`)
          .join('\n')
      : '';
    const kbText = Array.isArray(knowledgeContext) && knowledgeContext.length > 0
      ? `\nKnowledge Base Context:\n${knowledgeContext.join('\n')}`
      : '';

    const baseContext = `Process Documentation Context:
- Process Code & Name: [${String(processDoc.processCode || 'PROC-01')}] ${processDoc.processName}
- Domain & Entity: ${String(processDoc.domain || 'Philippine Corporate')} | ${String(processDoc.entityName || 'Corporate Head Office')}
- Linked Audit Area: ${linkedArea ? `[${linkedArea.areaCode}] ${linkedArea.name} (${linkedArea.regulatoryContext || ''})` : String(processDoc.linkedAreaName || 'General Corporate')}
- Process Owner: ${processDoc.processOwner?.ownerName || ''} (${processDoc.processOwner?.ownerRole || ''}, ${processDoc.processOwner?.department || ''})
- Objective: ${String(processDoc.processObjective || '')}
- Scope: ${String(processDoc.scope || '')}
- Process Flow Narrative: ${String(processDoc.processFlowNarrative || '')}
- Process Steps:\n${stepsText || 'None listed'}
- Documents Used: ${docsText || 'None listed'}
- Systems Used: ${systemsText || 'None listed'}
- Documented Process Risks:\n${risksText || 'None listed'}
- Existing Controls:\n${controlsText || 'None listed'}${kbText}`;

    let taskPrompt = '';
    let responseSchema: Record<string, unknown> = {};

    if (actionType === 'risk_assessment') {
      taskPrompt = `${baseContext}\n\nGenerate a Philippine corporate internal audit Risk Assessment grounded in the documented process steps, systems, documents, and existing controls:\n1. inherentRisks (4-6 distinct risks with id, title, description, likelihood 1-5, impact 1-5, regulatoryRef)\n2. riskAssessment (likelihood 1-5, impact 1-5, controlEnvironmentScore 1-5 where 5 is strongest, residualRiskRating Critical/High/Moderate/Low, rationale)\n3. riskRating (Critical, High, Moderate, or Low)`;
      responseSchema = {
        type: Type.OBJECT,
        properties: {
          inherentRisks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                likelihood: { type: Type.INTEGER },
                impact: { type: Type.INTEGER },
                regulatoryRef: { type: Type.STRING },
              },
              required: ['id', 'title', 'description', 'likelihood', 'impact', 'regulatoryRef'],
            },
          },
          riskAssessment: {
            type: Type.OBJECT,
            properties: {
              likelihood: { type: Type.INTEGER },
              impact: { type: Type.INTEGER },
              controlEnvironmentScore: { type: Type.INTEGER },
              residualRiskRating: { type: Type.STRING },
              rationale: { type: Type.STRING },
            },
            required: ['likelihood', 'impact', 'controlEnvironmentScore', 'residualRiskRating', 'rationale'],
          },
          riskRating: { type: Type.STRING },
        },
        required: ['inherentRisks', 'riskAssessment', 'riskRating'],
      };
    } else if (actionType === 'control_matrix') {
      taskPrompt = `${baseContext}\n\nGenerate a Control Matrix from this Process Documentation:\n1. controlObjectives (4-5 items: id, objective, riskRef)\n2. keyControls (5-7 items: id, controlName, description, controlOwner, frequency, controlType Preventive/Detective/Corrective, automation Automated/IT-Dependent/Manual, objectiveRef)\n3. controlWeaknesses (3-5 control gaps/SoD or design weaknesses: id, weaknessTitle, gapDescription, severity Critical/High/Moderate/Low, affectedControlRef)`;
      responseSchema = {
        type: Type.OBJECT,
        properties: {
          controlObjectives: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                objective: { type: Type.STRING },
                riskRef: { type: Type.STRING },
              },
              required: ['id', 'objective', 'riskRef'],
            },
          },
          keyControls: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                controlName: { type: Type.STRING },
                description: { type: Type.STRING },
                controlOwner: { type: Type.STRING },
                frequency: { type: Type.STRING },
                controlType: { type: Type.STRING },
                automation: { type: Type.STRING },
                objectiveRef: { type: Type.STRING },
              },
              required: ['id', 'controlName', 'description', 'controlOwner', 'frequency', 'controlType', 'automation', 'objectiveRef'],
            },
          },
          controlWeaknesses: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                weaknessTitle: { type: Type.STRING },
                gapDescription: { type: Type.STRING },
                severity: { type: Type.STRING },
                affectedControlRef: { type: Type.STRING },
              },
              required: ['id', 'weaknessTitle', 'gapDescription', 'severity', 'affectedControlRef'],
            },
          },
        },
        required: ['controlObjectives', 'keyControls', 'controlWeaknesses'],
      };
    } else if (actionType === 'audit_procedures') {
      taskPrompt = `${baseContext}\n\nGenerate 5 to 7 substantive and compliance Audit Procedures tailored to the documented steps, systemsUsed, and documentsUsed (with testingStatus set to "Not Started").`;
      responseSchema = {
        type: Type.OBJECT,
        properties: {
          auditProcedures: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                procedureType: { type: Type.STRING },
                objective: { type: Type.STRING },
                stepDetail: { type: Type.STRING },
                sampleSizeGuidance: { type: Type.STRING },
                expectedEvidence: { type: Type.STRING },
                testingStatus: { type: Type.STRING },
              },
              required: ['id', 'procedureType', 'objective', 'stepDetail', 'sampleSizeGuidance', 'expectedEvidence', 'testingStatus'],
            },
          },
        },
        required: ['auditProcedures'],
      };
    } else if (actionType === 'walkthrough_questions') {
      taskPrompt = `${baseContext}\n\nGenerate 5 targeted Walkthrough Questions referencing the processOwner, actors in processSteps, documentsUsed, and systemsUsed.`;
      responseSchema = {
        type: Type.OBJECT,
        properties: {
          walkthroughQuestions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                intervieweeRole: { type: Type.STRING },
                question: { type: Type.STRING },
                expectedResponse: { type: Type.STRING },
                redFlagIndicator: { type: Type.STRING },
              },
              required: ['id', 'intervieweeRole', 'question', 'expectedResponse', 'redFlagIndicator'],
            },
          },
        },
        required: ['walkthroughQuestions'],
      };
    } else if (actionType === 'potential_findings') {
      taskPrompt = `${baseContext}\n\nGenerate 3 to 5 Potential Audit Findings (Condition, Criteria, Cause, Effect, severity) and systemic Root Cause Analysis based on gaps in this documented process.`;
      responseSchema = {
        type: Type.OBJECT,
        properties: {
          potentialFindings: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                title: { type: Type.STRING },
                condition: { type: Type.STRING },
                criteria: { type: Type.STRING },
                cause: { type: Type.STRING },
                effect: { type: Type.STRING },
                severity: { type: Type.STRING },
              },
              required: ['id', 'title', 'condition', 'criteria', 'cause', 'effect', 'severity'],
            },
          },
          rootCauseAnalysis: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              people: { type: Type.STRING },
              process: { type: Type.STRING },
              technology: { type: Type.STRING },
              policyGovernance: { type: Type.STRING },
              externalRegulatory: { type: Type.STRING },
            },
            required: ['summary', 'people', 'process', 'technology', 'policyGovernance', 'externalRegulatory'],
          },
        },
        required: ['potentialFindings', 'rootCauseAnalysis'],
      };
    } else {
      taskPrompt = `${baseContext}\n\nGenerate 4 to 5 prioritized Audit Recommendations tailored to this documented process, its systemsUsed, and processOwner.`;
      responseSchema = {
        type: Type.OBJECT,
        properties: {
          recommendations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                priority: { type: Type.STRING },
                actionTitle: { type: Type.STRING },
                detailedAction: { type: Type.STRING },
                targetOwner: { type: Type.STRING },
                timeline: { type: Type.STRING },
                expectedBenefit: { type: Type.STRING },
              },
              required: ['id', 'priority', 'actionTitle', 'detailedAction', 'targetOwner', 'timeline', 'expectedBenefit'],
            },
          },
        },
        required: ['recommendations'],
      };
    }

    const response = await generateContentWithFallback(ai, {
      contents: taskPrompt,
      config: {
        systemInstruction: PH_AUDIT_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema,
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json(parsed);
  } catch (error) {
    handleGeminiError(res, error, 'generate-from-process');
  }
});

// 6. Auto-Generate BPMN Flowchart Nodes from Process Steps & Narrative
app.post('/api/audit/generate-process-flow', async (req: Request, res: Response) => {
  try {
    const { processName, domain, processFlowNarrative, processSteps } = req.body || {};
    if (!processName || typeof processName !== 'string') {
      res.status(400).json({ error: 'Process name is required.' });
      return;
    }

    const ai = getGeminiClient();
    const stepsText = Array.isArray(processSteps)
      ? processSteps
          .map(
            (s: { stepNo?: string; stepTitle?: string; actorRole?: string; systemUsed?: string; description?: string; outputDoc?: string }) =>
              `Step ${s.stepNo || ''}: ${s.stepTitle || ''} [Actor: ${s.actorRole || ''}, System: ${s.systemUsed || ''}, Output: ${s.outputDoc || ''}] - ${s.description || ''}`
          )
          .join('\n')
      : '';

    const prompt = `Convert this business process into a true BPMN / Professional Flowchart sequence of 5 to 10 nodes.
Process Name: ${processName}
Domain: ${String(domain || 'Philippine Corporate')}
Process Narrative: ${String(processFlowNarrative || 'N/A')}
Process Steps:
${stepsText || 'Derive logical end-to-end steps.'}

CRITICAL SYMBOL SELECTION RULES — choose the exact nodeType for each step:
- "start": Initial trigger / Start Event (Oval)
- "process": Standard operational activity like "Verify Supporting Documents" (Rectangle)
- "decision": Yes/No gate or threshold check like "Is Approval Complete?" or "Variance > PHP 500?" (Diamond). MUST set branchNote to "Yes: <path> | No: <exception path>".
- "document": Document generation/issuance like "Generate Invoice" or "Print BIR Form 2307" (Document Shape)
- "system": Automated ERP/POS/Portal action like "Post to ERP" or "Transmit Bank EFT" (Automated System Shape)
- "database": Persisting/storing records like "Save to Database" or "Update Master Ledger" (Database Cylinder)
- "control": Control checkpoint like "3-Way Match" or "Dual-Custody Reconciliation" (Control Symbol)
- "manual": Physical/manual work like "Blind Physical Cash Count" or "Manual Wet Sign-Off" (Trapezoid)
- "end": Completion / End Event (Oval)

Return JSON with flowchartNodes array (id, stepNo, label, actorRole, nodeType, branchNote).`;

    const response = await generateContentWithFallback(ai, {
      contents: prompt,
      config: {
        systemInstruction: PH_AUDIT_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            flowchartNodes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  stepNo: { type: Type.STRING },
                  label: { type: Type.STRING },
                  actorRole: { type: Type.STRING },
                  nodeType: { type: Type.STRING },
                  branchNote: { type: Type.STRING },
                },
                required: ['id', 'stepNo', 'label', 'actorRole', 'nodeType', 'branchNote'],
              },
            },
          },
          required: ['flowchartNodes'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json(parsed);
  } catch (error) {
    handleGeminiError(res, error, 'generate-process-flow');
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AuditIntel PH server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
