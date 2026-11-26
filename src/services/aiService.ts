import type {
  AssistantMessage,
  AuditArea,
  AuditAreaIntelligence,
  AuditObservation,
  KnowledgeItem,
  KnowledgeItemType,
  ManagementActionPlan,
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

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientCapacityFailure(status: number | undefined, rawText: string): boolean {
  if (status === 429 || status === 500 || status === 503) return true;
  const upper = rawText.toUpperCase();
  return (
    upper.includes('429') ||
    upper.includes('500') ||
    upper.includes('503') ||
    upper.includes('UNAVAILABLE') ||
    upper.includes('RESOURCE_EXHAUSTED') ||
    upper.includes('CAPACITY') ||
    upper.includes('OVERLOADED')
  );
}

function toFriendlyErrorMessage(status: number | undefined, rawText: string): string {
  if (isTransientCapacityFailure(status, rawText)) {
    return CAPACITY_ERROR_MESSAGE;
  }
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

      if (isTransientCapacityFailure(res.status, serverMsg) && attempt < MAX_RETRIES) {
        lastErrorMessage = CAPACITY_ERROR_MESSAGE;
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      throw new Error(toFriendlyErrorMessage(res.status, serverMsg));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isNetworkOrCapacity =
        err instanceof TypeError || isTransientCapacityFailure(undefined, msg);

      if (isNetworkOrCapacity && attempt < MAX_RETRIES) {
        lastErrorMessage = CAPACITY_ERROR_MESSAGE;
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      throw new Error(toFriendlyErrorMessage(undefined, msg || lastErrorMessage));
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

export type { AssistantMessage };
