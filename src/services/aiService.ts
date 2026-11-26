import type {
  AssistantMessage,
  AuditArea,
  AuditAreaIntelligence,
  AuditObservation,
  KnowledgeItem,
  KnowledgeItemType,
  ManagementActionPlan,
  ProcessAiActionType,
  ProcessDocumentation,
  RiskRating,
} from '../types/audit';

export interface SynthesizedObservationResult {
  auditFinding: string;
  riskStatement: string;
  rootCause: string;
  recommendation: string;
  riskRating: RiskRating;
  managementActionPlan: ManagementActionPlan;
}

const CAPACITY_ERROR_MESSAGE =
  'Audit Intelligence service is temporarily unavailable due to model capacity constraints. Please try again later.';

const MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 1500;

class NonRetryableApiError extends Error {}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isQuotaExhaustedMessage(rawText: string): boolean {
  const upper = rawText.toUpperCase();
  return (
    upper.includes('QUOTA') ||
    upper.includes('SETTINGS > SECRETS') ||
    upper.includes('FREE-TIER') ||
    upper.includes('FREE_TIER') ||
    upper.includes('GENERATEREQUESTSPERDAY')
  );
}

function isTransientStatus(status: number | undefined, rawText: string, quotaExhausted?: boolean): boolean {
  if (quotaExhausted || isQuotaExhaustedMessage(rawText)) return false;
  if (status === 429 || status === 500 || status === 503) return true;
  const upper = rawText.toUpperCase();
  return (
    upper.includes('UNAVAILABLE') ||
    upper.includes('OVERLOADED') ||
    upper.includes('HIGH DEMAND')
  );
}

function toFriendlyErrorMessage(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed || trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.includes('"error"')) {
    return CAPACITY_ERROR_MESSAGE;
  }
  return trimmed;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  let lastErrorMessage = CAPACITY_ERROR_MESSAGE;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const rawText = await res.text();
      let parsedData: Record<string, unknown> = {};
      try {
        parsedData = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
      } catch {
        parsedData = {};
      }

      if (res.ok) {
        return parsedData as T;
      }

      const serverMsg =
        typeof parsedData?.error === 'string'
          ? parsedData.error
          : rawText || `HTTP ${res.status}`;
      const quotaExhausted = parsedData?.quotaExhausted === true;

      if (isTransientStatus(res.status, serverMsg, quotaExhausted) && attempt < MAX_RETRIES) {
        lastErrorMessage = toFriendlyErrorMessage(serverMsg);
        await sleep(BASE_RETRY_DELAY_MS * Math.pow(2, attempt));
        continue;
      }

      throw new NonRetryableApiError(toFriendlyErrorMessage(serverMsg));
    } catch (err) {
      if (err instanceof NonRetryableApiError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      const isNetworkFailure = err instanceof TypeError;

      if (isNetworkFailure && attempt < MAX_RETRIES) {
        lastErrorMessage = CAPACITY_ERROR_MESSAGE;
        await sleep(BASE_RETRY_DELAY_MS * Math.pow(2, attempt));
        continue;
      }

      throw new Error(toFriendlyErrorMessage(msg || lastErrorMessage));
    }
  }

  throw new Error(lastErrorMessage);
}

export async function generateAreaIntelligence(
  area: AuditArea,
  knowledgeItems: KnowledgeItem[]
): Promise<AuditAreaIntelligence> {
  const relevantKnowledge = knowledgeItems
    .filter((k) => k.domain === area.domain || k.domain === 'Philippine Corporate')
    .slice(0, 8)
    .map((k) => `[${k.type}] ${k.title}: ${k.content.slice(0, 350)}`);

  return postJson<AuditAreaIntelligence>('/api/audit/generate-area-intelligence', {
    areaCode: area.areaCode,
    name: area.name,
    domain: area.domain,
    entityName: area.entityName,
    inherentRiskTier: area.inherentRiskTier,
    regulatoryContext: area.regulatoryContext,
    description: area.description,
    lastAuditDate: area.lastAuditDate,
    knowledgeContext: relevantKnowledge,
  });
}

export async function analyzeObservation(params: {
  areaName: string;
  domain: string;
  regulatoryContext?: string;
  observationTitle: string;
  observationText: string;
  evidenceRef: string;
  sampleTested: string;
  knowledgeItems: KnowledgeItem[];
}): Promise<SynthesizedObservationResult> {
  const relevantKnowledge = params.knowledgeItems
    .filter((k) => k.domain === params.domain || k.domain === 'Philippine Corporate')
    .slice(0, 6)
    .map((k) => `[${k.type}] ${k.title}: ${k.content.slice(0, 300)}`);

  return postJson<SynthesizedObservationResult>('/api/audit/analyze-observation', {
    areaName: params.areaName,
    domain: params.domain,
    regulatoryContext: params.regulatoryContext || '',
    observationTitle: params.observationTitle,
    observationText: params.observationText,
    evidenceRef: params.evidenceRef,
    sampleTested: params.sampleTested,
    knowledgeContext: relevantKnowledge,
  });
}

export async function queryAuditAssistant(params: {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  selectedArea: AuditArea | null;
  knowledgeItems: KnowledgeItem[];
  observations: AuditObservation[];
}): Promise<{
  reply: string;
  suggestedKnowledgeItem?: {
    type: KnowledgeItemType;
    title: string;
    content: string;
    regulatoryRef: string;
    riskRating: RiskRating | 'Informational';
    tags: string[];
  };
}> {
  return postJson('/api/audit/assistant', {
    messages: params.messages.slice(-10),
    selectedArea: params.selectedArea
      ? {
          areaCode: params.selectedArea.areaCode,
          name: params.selectedArea.name,
          domain: params.selectedArea.domain,
          entityName: params.selectedArea.entityName,
          regulatoryContext: params.selectedArea.regulatoryContext,
          riskRating: params.selectedArea.intelligence?.riskRating || params.selectedArea.inherentRiskTier,
        }
      : null,
    knowledgeContext: params.knowledgeItems.slice(0, 12).map((k) => ({
      type: k.type,
      domain: k.domain,
      title: k.title,
      content: k.content.slice(0, 400),
      regulatoryRef: k.regulatoryRef,
    })),
    observationSummary: params.observations.slice(0, 8).map((o) => ({
      title: o.observationTitle,
      areaName: o.areaName,
      riskRating: o.riskRating,
      finding: o.auditFinding.slice(0, 300),
    })),
  });
}

export async function refineAuditReport(params: {
  area: AuditArea;
  observations: AuditObservation[];
  currentExecutiveSummary: string;
  currentScope: string;
  currentConclusion: string;
}): Promise<{
  executiveSummary: string;
  scopeAndMethodology: string;
  overallConclusion: string;
}> {
  return postJson('/api/audit/refine-report', {
    area: {
      areaCode: params.area.areaCode,
      name: params.area.name,
      domain: params.area.domain,
      entityName: params.area.entityName,
      regulatoryContext: params.area.regulatoryContext,
      auditObjective: params.area.intelligence?.auditObjective || '',
      riskRating: params.area.intelligence?.riskRating || params.area.inherentRiskTier,
    },
    observations: params.observations.map((o) => ({
      title: o.observationTitle,
      riskRating: o.riskRating,
      auditFinding: o.auditFinding,
      rootCause: o.rootCause,
      recommendation: o.recommendation,
      actionOwner: o.managementActionPlan.responsibleOwner,
      targetDate: o.managementActionPlan.targetDate,
    })),
    currentExecutiveSummary: params.currentExecutiveSummary,
    currentScope: params.currentScope,
    currentConclusion: params.currentConclusion,
  });
}

export async function generateFromProcessDocumentation(params: {
  actionType: ProcessAiActionType;
  processDoc: ProcessDocumentation;
  linkedArea: AuditArea | null;
  knowledgeItems: KnowledgeItem[];
}): Promise<Partial<AuditAreaIntelligence>> {
  const relevantKnowledge = params.knowledgeItems
    .filter((k) => k.domain === params.processDoc.domain || k.domain === 'Philippine Corporate')
    .slice(0, 6)
    .map((k) => `[${k.type}] ${k.title}: ${k.content.slice(0, 300)}`);

  return postJson<Partial<AuditAreaIntelligence>>('/api/audit/generate-from-process', {
    actionType: params.actionType,
    processDoc: {
      processCode: params.processDoc.processCode,
      processName: params.processDoc.processName,
      domain: params.processDoc.domain,
      entityName: params.processDoc.entityName,
      linkedAreaName: params.processDoc.linkedAreaName,
      processObjective: params.processDoc.processObjective,
      scope: params.processDoc.scope,
      processFlowNarrative: params.processDoc.processFlowNarrative,
      processOwner: params.processDoc.processOwner,
      processSteps: params.processDoc.processSteps,
      documentsUsed: params.processDoc.documentsUsed,
      systemsUsed: params.processDoc.systemsUsed,
      risks: params.processDoc.risks,
      existingControls: params.processDoc.existingControls,
    },
    linkedArea: params.linkedArea
      ? {
          areaCode: params.linkedArea.areaCode,
          name: params.linkedArea.name,
          regulatoryContext: params.linkedArea.regulatoryContext,
        }
      : null,
    knowledgeContext: relevantKnowledge,
  });
}

export async function generateProcessFlowchartAi(params: {
  processName: string;
  domain: string;
  processFlowNarrative: string;
  processSteps: ProcessDocumentation['processSteps'];
}): Promise<{ flowchartNodes: ProcessDocumentation['flowchartNodes'] }> {
  return postJson<{ flowchartNodes: ProcessDocumentation['flowchartNodes'] }>(
    '/api/audit/generate-process-flow',
    params
  );
}

export type { AssistantMessage };
