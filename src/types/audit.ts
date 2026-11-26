export type RiskRating = 'Critical' | 'High' | 'Moderate' | 'Low';

export type UserRole = 'Administrator' | 'Auditor' | 'Viewer';
export type UserStatus = 'Active' | 'Disabled';

export interface UserProfile {
  userId: string;
  username: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  mustChangePassword?: boolean;
  createdDate?: unknown;
  lastLogin?: unknown;
}

export type AuditDomain =
  | 'Philippine Corporate'
  | 'Operations'
  | 'Inventory'
  | 'Finance'
  | 'Compliance'
  | 'Procurement'
  | 'Asset Disposal'
  | 'Treasury'
  | 'Branch Operations'
  | 'IT & Governance';

export const AUDIT_DOMAINS: AuditDomain[] = [
  'Philippine Corporate',
  'Operations',
  'Inventory',
  'Finance',
  'Compliance',
  'Procurement',
  'Asset Disposal',
  'Treasury',
  'Branch Operations',
  'IT & Governance',
];

export const RISK_RATINGS: RiskRating[] = ['Critical', 'High', 'Moderate', 'Low'];

export interface InherentRiskItem {
  id: string;
  title: string;
  description: string;
  likelihood: number;
  impact: number;
  regulatoryRef: string;
}

export interface RiskAssessmentSummary {
  likelihood: number;
  impact: number;
  controlEnvironmentScore: number;
  residualRiskRating: RiskRating;
  rationale: string;
}

export interface ControlObjectiveItem {
  id: string;
  objective: string;
  riskRef: string;
}

export interface KeyControlItem {
  id: string;
  controlName: string;
  description: string;
  controlOwner: string;
  frequency: string;
  controlType: 'Preventive' | 'Detective' | 'Corrective';
  automation: 'Automated' | 'IT-Dependent' | 'Manual';
  objectiveRef: string;
}

export interface ControlWeaknessItem {
  id: string;
  weaknessTitle: string;
  gapDescription: string;
  severity: RiskRating;
  affectedControlRef: string;
}

export interface AuditProcedureItem {
  id: string;
  procedureType: 'Inquiry' | 'Observation' | 'Inspection' | 'Reperformance' | 'Analytical';
  objective: string;
  stepDetail: string;
  sampleSizeGuidance: string;
  expectedEvidence: string;
  testingStatus: 'Not Started' | 'In Progress' | 'Tested - Effective' | 'Exception Noted';
}

export interface WalkthroughQuestionItem {
  id: string;
  intervieweeRole: string;
  question: string;
  expectedResponse: string;
  redFlagIndicator: string;
}

export interface PotentialFindingItem {
  id: string;
  title: string;
  condition: string;
  criteria: string;
  cause: string;
  effect: string;
  severity: RiskRating;
}

export interface RootCauseAnalysis {
  summary: string;
  people: string;
  process: string;
  technology: string;
  policyGovernance: string;
  externalRegulatory: string;
}

export interface RecommendationItem {
  id: string;
  priority: RiskRating;
  actionTitle: string;
  detailedAction: string;
  targetOwner: string;
  timeline: string;
  expectedBenefit: string;
}

export interface AuditReportNarratives {
  executiveSummary: string;
  scopeAndMethodology: string;
  overallConclusion: string;
  keyHighlights: string[];
}

export interface AuditAreaIntelligence {
  auditObjective: string;
  processDescription: string;
  inherentRisks: InherentRiskItem[];
  riskAssessment: RiskAssessmentSummary;
  riskRating: RiskRating;
  controlObjectives: ControlObjectiveItem[];
  keyControls: KeyControlItem[];
  controlWeaknesses: ControlWeaknessItem[];
  auditProcedures: AuditProcedureItem[];
  walkthroughQuestions: WalkthroughQuestionItem[];
  potentialFindings: PotentialFindingItem[];
  rootCauseAnalysis: RootCauseAnalysis;
  recommendations: RecommendationItem[];
  auditReportNarratives: AuditReportNarratives;
  generatedAt: string;
}

export type AuditAreaStatus = 'Active' | 'Archived';

export interface AuditArea {
  id: string;
  ownerId: string;
  areaCode: string;
  name: string;
  domain: AuditDomain;
  entityName: string;
  inherentRiskTier: RiskRating;
  regulatoryContext: string;
  description: string;
  lastAuditDate: string;
  hasIntelligence: boolean;
  intelligence?: AuditAreaIntelligence;
  status?: AuditAreaStatus;
  datasetId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type MapStatus = 'Open' | 'In Progress' | 'Agreed' | 'Closed';
export type ObservationStatus = 'Draft' | 'Validated' | 'Reported' | 'Closed';

export interface ManagementActionPlan {
  actionSteps: string;
  responsibleOwner: string;
  targetDate: string;
  status: MapStatus;
}

export interface AuditObservation {
  id: string;
  ownerId: string;
  areaId: string;
  areaName: string;
  domain: string;
  observationTitle: string;
  observationText: string;
  evidenceRef: string;
  sampleTested: string;
  auditFinding: string;
  riskStatement: string;
  rootCause: string;
  recommendation: string;
  riskRating: RiskRating;
  managementActionPlan: ManagementActionPlan;
  status: ObservationStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type KnowledgeItemType =
  | 'finding'
  | 'recommendation'
  | 'control'
  | 'procedure'
  | 'regulatory_note'
  | 'assistant_insight';

export interface KnowledgeItem {
  id: string;
  ownerId: string;
  type: KnowledgeItemType;
  domain: string;
  title: string;
  content: string;
  riskRating: RiskRating | 'Informational';
  regulatoryRef: string;
  tags: string[];
  sourceAreaId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AuditReport {
  id: string;
  ownerId: string;
  areaId: string;
  title: string;
  entityName: string;
  reportPeriod: string;
  executiveSummary: string;
  scopeAndMethodology: string;
  overallConclusion: string;
  includedSections: string[];
  includedObservationIds: string[];
  status: 'Draft' | 'Finalized';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type WorkspaceTab =
  | 'Overview'
  | 'Risk Assessment'
  | 'Control Matrix'
  | 'Audit Procedures'
  | 'Findings Library'
  | 'Recommendations Library'
  | 'Report Builder';

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  suggestedKnowledgeItem?: {
    type: KnowledgeItemType;
    title: string;
    content: string;
    regulatoryRef: string;
    riskRating: RiskRating | 'Informational';
    tags: string[];
  };
}

export type ProcessDocStatus = 'Draft' | 'Active' | 'Under Review';
export type FlowchartNodeType =
  | 'start'
  | 'process'
  | 'decision'
  | 'document'
  | 'system'
  | 'database'
  | 'control'
  | 'manual'
  | 'end';
export type ProcessAttachmentKind = 'pdf' | 'docx' | 'image';

export type ProcessAiActionType =
  | 'risk_assessment'
  | 'control_matrix'
  | 'audit_procedures'
  | 'walkthrough_questions'
  | 'potential_findings'
  | 'recommendations';

export interface ProcessFlowNode {
  id: string;
  stepNo: string;
  label: string;
  actorRole: string;
  nodeType: FlowchartNodeType;
  branchNote: string;
}

export interface ProcessStepItem {
  id: string;
  stepNo: string;
  stepTitle: string;
  description: string;
  actorRole: string;
  systemUsed: string;
  inputDoc: string;
  outputDoc: string;
  slaOrFrequency: string;
}

export interface ProcessOwnerInfo {
  ownerName: string;
  ownerRole: string;
  department: string;
  backupOwner: string;
}

export interface ProcessDocumentItem {
  id: string;
  docCode: string;
  documentName: string;
  docType: string;
  sourceSystem: string;
  retentionPeriod: string;
}

export interface ProcessSystemItem {
  id: string;
  systemName: string;
  moduleName: string;
  accessControlOwner: string;
  interfaceType: string;
}

export interface ProcessRiskItem {
  id: string;
  riskCode: string;
  title: string;
  description: string;
  likelihood: number;
  impact: number;
  riskRating: RiskRating;
  regulatoryRef: string;
}

export interface ProcessControlItem {
  id: string;
  controlCode: string;
  controlName: string;
  description: string;
  controlOwner: string;
  frequency: string;
  controlType: 'Preventive' | 'Detective' | 'Corrective';
  automation: 'Automated' | 'IT-Dependent' | 'Manual';
  mappedRiskCode: string;
}

export interface ProcessAttachmentItem {
  id: string;
  fileName: string;
  fileType: ProcessAttachmentKind;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  dataUrl: string;
  notes: string;
}

export interface ProcessDocumentation {
  id: string;
  ownerId: string;
  processCode: string;
  processName: string;
  domain: AuditDomain;
  entityName: string;
  version: string;
  effectiveDate: string;
  status: ProcessDocStatus;
  linkedAreaId: string;
  linkedAreaName: string;
  processObjective: string;
  scope: string;
  processFlowNarrative: string;
  flowchartNodes: ProcessFlowNode[];
  processSteps: ProcessStepItem[];
  processOwner: ProcessOwnerInfo;
  documentsUsed: ProcessDocumentItem[];
  systemsUsed: ProcessSystemItem[];
  risks: ProcessRiskItem[];
  existingControls: ProcessControlItem[];
  attachments: ProcessAttachmentItem[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type AuditImportSourceType = 'file' | 'manual' | 'starter' | 'reimport';

export interface AuditImportAreaSnapshot {
  areaCode: string;
  name: string;
  domain: AuditDomain;
  entityName: string;
  inherentRiskTier: RiskRating;
  regulatoryContext: string;
  description: string;
  lastAuditDate: string;
}

export interface AuditImportRecord {
  id: string;
  ownerId: string;
  datasetName: string;
  uploadedByUserId: string;
  uploadedByName: string;
  uploadedByUsername: string;
  recordCount: number;
  sourceType: AuditImportSourceType;
  status: 'Active' | 'Archived';
  records: AuditImportAreaSnapshot[];
  createdAreaIds: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type AuditUniverseLogAction =
  | 'Upload Audit Universe'
  | 'Edit Audit Universe'
  | 'Duplicate Audit Universe'
  | 'Archive Audit Universe'
  | 'Restore Audit Universe'
  | 'Delete Audit Universe';

export interface AuditLogEntry {
  id: string;
  userId: string;
  userName: string;
  username: string;
  action: AuditUniverseLogAction;
  areaId: string;
  areaCode: string;
  areaName: string;
  details: string;
  eventDate: string;
  eventTime: string;
  createdAt?: unknown;
}

