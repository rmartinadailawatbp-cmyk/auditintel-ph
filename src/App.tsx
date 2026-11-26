import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  BookOpen,
  CheckSquare,
  Copy,
  Edit3,
  FileSpreadsheet,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { ensureDefaultAdminSeeded, setActiveActorUserId } from './firebase';
import {
  bulkDeleteAuditAreasCascade,
  bulkSetAuditAreaStatus,
  createAuditAreasBatch,
  createAuditImportRecord,
  createAuditLogEntry,
  createAuditObservation,
  createKnowledgeItem,
  createKnowledgeItemsBatch,
  createProcessDocumentation,
  deleteAuditImportRecord,
  deleteAuditObservation,
  deleteKnowledgeItem,
  deleteProcessDocumentation,
  duplicateAuditArea,
  saveAuditAreaIntelligence,
  saveAuditReport,
  subscribeAllUsers,
  subscribeAuditAreas,
  subscribeAuditImportHistory,
  subscribeAuditLogs,
  subscribeAuditReports,
  subscribeCurrentUserProfile,
  subscribeKnowledgeItems,
  subscribeObservations,
  subscribeProcessDocumentations,
  updateAuditAreaMetadata,
  updateAuditImportStatus,
  updateAuditObservation,
  updateProcessDocumentation,
  type SnapshotSyncMeta,
  type UpdateAuditAreaMetadataInput,
} from './services/firestoreService';
import {
  generateAreaIntelligence,
  generateFromProcessDocumentation,
} from './services/aiService';
import {
  STARTER_PH_AUDIT_UNIVERSE,
  STARTER_PH_KNOWLEDGE_ITEMS,
  type StarterAuditAreaInput,
  type StarterKnowledgeInput,
} from './data/starterUniverse';
import { findProcessDocForArea, syncProcessDocToAreaIntelligence } from './utils/processSync';
import {
  sanitizeIntelligence,
  sanitizeProcessDocumentationInput,
  type ProcessDocumentationInput,
} from './utils/validation';
import {
  AUDIT_DOMAINS,
  type AuditArea,
  type AuditAreaIntelligence,
  type AuditDomain,
  type AuditImportRecord,
  type AuditLogEntry,
  type AuditObservation,
  type AuditReport,
  type KnowledgeItem,
  type ObservationStatus,
  type ProcessAiActionType,
  type ProcessDocumentation,
  type UserProfile,
  type WorkspaceTab,
} from './types/audit';
import { RiskIndicator } from './components/RiskBadge';
import { AuthScreen } from './components/AuthScreen';
import { UploadUniverseModal, type UploadImportMeta } from './components/UploadUniverseModal';
import { OverviewTab } from './components/OverviewTab';
import { RiskAssessmentTab } from './components/RiskAssessmentTab';
import { ControlMatrixTab } from './components/ControlMatrixTab';
import { AuditProceduresTab } from './components/AuditProceduresTab';
import { FindingsLibraryTab } from './components/FindingsLibraryTab';
import { RecommendationsLibraryTab } from './components/RecommendationsLibraryTab';
import { ReportBuilderTab } from './components/ReportBuilderTab';
import { KnowledgeBaseModal } from './components/KnowledgeBaseModal';
import { AuditAssistantDrawer } from './components/AuditAssistantDrawer';
import { UsersModuleModal } from './components/UsersModuleModal';
import { ForcePasswordChangeModal } from './components/ForcePasswordChangeModal';
import { ProcessDocumentationView } from './components/ProcessDocumentationView';
import {
  AuditUniverseManagementModal,
  DeleteUniverseConfirmModal,
  EditAuditAreaModal,
} from './components/AuditUniverseModals';

const WORKSPACE_TABS: WorkspaceTab[] = [
  'Overview',
  'Risk Assessment',
  'Control Matrix',
  'Audit Procedures',
  'Findings Library',
  'Recommendations Library',
  'Report Builder',
];

export default function App() {
  const [startupReady, setStartupReady] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authError, setAuthError] = useState('');

  // Organization Users (Admin only)
  const [orgUsers, setOrgUsers] = useState<UserProfile[]>([]);

  // Firestore Collections
  const [auditAreas, setAuditAreas] = useState<AuditArea[]>([]);
  const [observations, setObservations] = useState<AuditObservation[]>([]);
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [savedReports, setSavedReports] = useState<AuditReport[]>([]);
  const [processDocs, setProcessDocs] = useState<ProcessDocumentation[]>([]);
  const [importHistory, setImportHistory] = useState<AuditImportRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [syncMeta, setSyncMeta] = useState<SnapshotSyncMeta | null>(null);
  const [dataLoading, setDataLoading] = useState(false);

  // Workspace State
  const [workspaceMode, setWorkspaceMode] = useState<'audit_areas' | 'process_docs'>('audit_areas');
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('Overview');
  const [universeSearch, setUniverseSearch] = useState('');
  const [domainFilter, setDomainFilter] = useState<string>('ALL');
  const [sidebarSelectMode, setSidebarSelectMode] = useState(false);
  const [sidebarSelectedIds, setSidebarSelectedIds] = useState<Set<string>>(new Set());

  // Modals & Drawers
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showKnowledgeModal, setShowKnowledgeModal] = useState(false);
  const [showAssistantDrawer, setShowAssistantDrawer] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [showUniverseMgmtModal, setShowUniverseMgmtModal] = useState(false);
  const [universeMgmtTab, setUniverseMgmtTab] = useState<
    'active' | 'archived' | 'history' | 'logs'
  >('active');
  const [editingArea, setEditingArea] = useState<AuditArea | null>(null);
  const [pendingDeleteAreas, setPendingDeleteAreas] = useState<AuditArea[]>([]);

  // AI Generation State
  const [generatingAreaId, setGeneratingAreaId] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState('');
  const inFlightAreasRef = useRef<Set<string>>(new Set());
  const failedAreasRef = useRef<Set<string>>(new Set());
  const quotaBlockedRef = useRef(false);

  const handleSignOut = useCallback(() => {
    setActiveActorUserId(null);
    setUserProfile(null);
    setOrgUsers([]);
    setProcessDocs([]);
    setImportHistory([]);
    setAuditLogs([]);
    setSyncMeta(null);
    setWorkspaceMode('audit_areas');
    setShowUsersModal(false);
    setShowUploadModal(false);
    setShowKnowledgeModal(false);
    setShowAssistantDrawer(false);
    setShowUniverseMgmtModal(false);
    setEditingArea(null);
    setPendingDeleteAreas([]);
    setSidebarSelectMode(false);
    setSidebarSelectedIds(new Set());
  }, []);

  // Seed default administrator account (admin / Admin@2026) on first startup
  useEffect(() => {
    let active = true;
    void ensureDefaultAdminSeeded()
      .catch((err) => {
        console.error('Initial admin seed check failed:', err);
      })
      .finally(() => {
        if (active) setStartupReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // Keep active user profile synced from Firestore (enforces real-time disable & role changes)
  const activeSessionUserId = userProfile?.userId ?? null;
  useEffect(() => {
    if (!activeSessionUserId) return;

    const unsubProfile = subscribeCurrentUserProfile(
      activeSessionUserId,
      (latest) => {
        if (!latest) {
          handleSignOut();
          return;
        }
        if (latest.status === 'Disabled') {
          setAuthError('Account Disabled. Please contact your Administrator.');
          handleSignOut();
          return;
        }
        setUserProfile(latest);
      },
      () => {
        // Retain current session on transient snapshot error
      }
    );

    return () => {
      unsubProfile();
    };
  }, [activeSessionUserId, handleSignOut]);

  const isAdmin =
    userProfile?.role === 'Administrator' &&
    userProfile?.status === 'Active' &&
    !userProfile?.mustChangePassword;
  const canWrite =
    userProfile?.status === 'Active' &&
    !userProfile?.mustChangePassword &&
    (userProfile.role === 'Administrator' || userProfile.role === 'Auditor');
  const isViewer =
    userProfile?.status === 'Active' &&
    !userProfile?.mustChangePassword &&
    userProfile.role === 'Viewer';

  // Subscribe to workspace collections once active user profile is confirmed & password change satisfied
  useEffect(() => {
    if (!userProfile || userProfile.status !== 'Active' || userProfile.mustChangePassword) {
      setAuditAreas([]);
      setObservations([]);
      setKnowledgeItems([]);
      setSavedReports([]);
      setProcessDocs([]);
      setSyncMeta(null);
      setSelectedAreaId(null);
      return;
    }

    setDataLoading(true);
    const unsubAreas = subscribeAuditAreas(
      (items) => {
        setAuditAreas(items);
        setDataLoading(false);
        const activeOnly = items.filter((a) => a.status !== 'Archived');
        setSelectedAreaId((prev) => {
          if (prev && activeOnly.some((a) => a.id === prev)) return prev;
          return activeOnly[0]?.id ?? null;
        });
      },
      undefined,
      (meta) => setSyncMeta(meta)
    );

    const unsubObs = subscribeObservations(setObservations);
    const unsubKb = subscribeKnowledgeItems(setKnowledgeItems);
    const unsubRep = subscribeAuditReports(setSavedReports);
    const unsubProcesses = subscribeProcessDocumentations((items, meta) => {
      setProcessDocs(items);
      setSyncMeta(meta);
    });

    return () => {
      unsubAreas();
      unsubObs();
      unsubKb();
      unsubRep();
      unsubProcesses();
    };
  }, [userProfile?.userId, userProfile?.status, userProfile?.mustChangePassword]);

  // Subscribe to organization users, import history, and audit logs for Administrators
  useEffect(() => {
    if (!isAdmin) {
      setOrgUsers([]);
      setImportHistory([]);
      setAuditLogs([]);
      return;
    }
    const unsubUsers = subscribeAllUsers(setOrgUsers);
    const unsubImports = subscribeAuditImportHistory(setImportHistory);
    const unsubLogs = subscribeAuditLogs(setAuditLogs);
    return () => {
      unsubUsers();
      unsubImports();
      unsubLogs();
    };
  }, [isAdmin]);

  const activeAuditAreas = useMemo(
    () => auditAreas.filter((a) => a.status !== 'Archived'),
    [auditAreas]
  );

  const archivedAuditAreas = useMemo(
    () => auditAreas.filter((a) => a.status === 'Archived'),
    [auditAreas]
  );

  const selectedArea = useMemo(
    () => activeAuditAreas.find((a) => a.id === selectedAreaId) ?? null,
    [activeAuditAreas, selectedAreaId]
  );

  const triggerAreaGeneration = useCallback(
    async (area: AuditArea, isManualRetry = false) => {
      if (!userProfile || !canWrite || inFlightAreasRef.current.has(area.id)) return;
      if (isManualRetry) {
        failedAreasRef.current.delete(area.id);
        quotaBlockedRef.current = false;
      }
      inFlightAreasRef.current.add(area.id);
      setGeneratingAreaId(area.id);
      setGenerationError('');
      try {
        const intel = await generateAreaIntelligence(area, knowledgeItems);
        failedAreasRef.current.delete(area.id);
        quotaBlockedRef.current = false;
        await saveAuditAreaIntelligence(area.id, intel, intel.riskRating);
      } catch (err) {
        failedAreasRef.current.add(area.id);
        const message =
          err instanceof Error
            ? err.message
            : 'Audit Intelligence service is temporarily unavailable due to model capacity constraints. Please try again later.';
        if (message.toLowerCase().includes('quota') || message.includes('Settings > Secrets')) {
          quotaBlockedRef.current = true;
        }
        setGenerationError(message);
      } finally {
        inFlightAreasRef.current.delete(area.id);
        setGeneratingAreaId((curr) => (curr === area.id ? null : curr));
      }
    },
    [userProfile, canWrite, knowledgeItems]
  );

  // Clear error banner when switching to another area that already has intelligence
  useEffect(() => {
    if (selectedArea?.intelligence) {
      setGenerationError('');
    }
  }, [selectedAreaId, selectedArea?.intelligence]);

  // Automatically generate audit intelligence when an Auditor/Admin selects an area without intelligence
  useEffect(() => {
    if (
      userProfile &&
      canWrite &&
      selectedArea &&
      (!selectedArea.hasIntelligence || !selectedArea.intelligence) &&
      !inFlightAreasRef.current.has(selectedArea.id) &&
      !failedAreasRef.current.has(selectedArea.id) &&
      !quotaBlockedRef.current
    ) {
      void triggerAreaGeneration(selectedArea);
    }
  }, [userProfile, canWrite, selectedArea, triggerAreaGeneration]);

  const filteredAreas = useMemo(() => {
    return activeAuditAreas.filter((area) => {
      if (domainFilter !== 'ALL' && area.domain !== domainFilter) return false;
      if (universeSearch.trim()) {
        const q = universeSearch.toLowerCase();
        const hay = `${area.areaCode} ${area.name} ${area.domain} ${area.entityName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [activeAuditAreas, domainFilter, universeSearch]);

  const handleImportAreas = async (
    inputs: StarterAuditAreaInput[],
    meta?: UploadImportMeta
  ) => {
    if (!userProfile || !canWrite || inputs.length === 0) return;
    const datasetId = `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const ids = await createAuditAreasBatch(userProfile.userId, inputs, datasetId);
    const datasetName =
      meta?.datasetName ||
      (inputs.length === 1
        ? `${inputs[0].areaCode} - ${inputs[0].name}`
        : `Audit Universe Import (${inputs.length} Areas)`);

    await createAuditImportRecord({
      id: datasetId,
      ownerId: userProfile.userId,
      datasetName,
      uploadedByUserId: userProfile.userId,
      uploadedByName: userProfile.fullName,
      uploadedByUsername: userProfile.username,
      sourceType: meta?.sourceType || 'file',
      records: inputs,
      createdAreaIds: ids,
    });

    await createAuditLogEntry({
      userId: userProfile.userId,
      userName: userProfile.fullName,
      username: userProfile.username,
      action: 'Upload Audit Universe',
      areaId: ids[0] || '',
      areaCode: inputs.length === 1 ? inputs[0].areaCode : `BATCH (${inputs.length})`,
      areaName: datasetName,
      details: `Uploaded ${inputs.length} Audit Universe record(s) via ${meta?.sourceType || 'file'}.`,
    });

    if (ids[0]) {
      setSelectedAreaId(ids[0]);
      setActiveTab('Overview');
    }
  };

  const handleLoadStarterEverything = async () => {
    if (!userProfile || !canWrite) return;
    await handleImportAreas(STARTER_PH_AUDIT_UNIVERSE, {
      datasetName: 'Philippine Corporate Starter Universe (9 Areas)',
      sourceType: 'starter',
    });
    if (knowledgeItems.length === 0) {
      await createKnowledgeItemsBatch(userProfile.userId, STARTER_PH_KNOWLEDGE_ITEMS);
    }
  };

  const handleSaveAreaEdit = async (
    areaId: string,
    updates: UpdateAuditAreaMetadataInput
  ) => {
    if (!userProfile || !isAdmin) return;
    await updateAuditAreaMetadata(areaId, updates);
    await createAuditLogEntry({
      userId: userProfile.userId,
      userName: userProfile.fullName,
      username: userProfile.username,
      action: 'Edit Audit Universe',
      areaId,
      areaCode: updates.areaCode,
      areaName: updates.name,
      details: `Updated domain (${updates.domain}), entity (${updates.entityName}), and risk tier (${updates.inherentRiskTier}).`,
    });
  };

  const handleDuplicateArea = async (area: AuditArea) => {
    if (!userProfile || !isAdmin) return;
    const created = await duplicateAuditArea(
      userProfile.userId,
      area,
      auditAreas.map((a) => a.areaCode)
    );
    await createAuditLogEntry({
      userId: userProfile.userId,
      userName: userProfile.fullName,
      username: userProfile.username,
      action: 'Duplicate Audit Universe',
      areaId: created.id,
      areaCode: created.areaCode,
      areaName: created.name,
      details: `Duplicated from [${area.areaCode}] ${area.name}.`,
    });
    setSelectedAreaId(created.id);
  };

  const handleArchiveAreas = async (areas: AuditArea[]) => {
    if (!userProfile || !isAdmin || areas.length === 0) return;
    const ids = areas.map((a) => a.id);
    await bulkSetAuditAreaStatus(ids, 'Archived');
    setSidebarSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    await createAuditLogEntry({
      userId: userProfile.userId,
      userName: userProfile.fullName,
      username: userProfile.username,
      action: 'Archive Audit Universe',
      areaId: areas.length === 1 ? areas[0].id : '',
      areaCode: areas.length === 1 ? areas[0].areaCode : `BULK (${areas.length})`,
      areaName:
        areas.length === 1
          ? areas[0].name
          : areas.map((a) => a.areaCode).join(', '),
      details: `Archived ${areas.length} Audit Universe record(s); linked Process Docs, Risks, Controls, Findings, Recommendations, and Reports preserved.`,
    });
  };

  const handleRestoreAreas = async (areas: AuditArea[]) => {
    if (!userProfile || !isAdmin || areas.length === 0) return;
    const ids = areas.map((a) => a.id);
    await bulkSetAuditAreaStatus(ids, 'Active');
    await createAuditLogEntry({
      userId: userProfile.userId,
      userName: userProfile.fullName,
      username: userProfile.username,
      action: 'Restore Audit Universe',
      areaId: areas.length === 1 ? areas[0].id : '',
      areaCode: areas.length === 1 ? areas[0].areaCode : `BULK (${areas.length})`,
      areaName:
        areas.length === 1
          ? areas[0].name
          : areas.map((a) => a.areaCode).join(', '),
      details: `Restored ${areas.length} archived Audit Universe record(s) to Active status.`,
    });
    if (areas[0]) setSelectedAreaId(areas[0].id);
  };

  const handleConfirmPermanentDelete = async (areas: AuditArea[]) => {
    if (!userProfile || !isAdmin || areas.length === 0) return;
    const ids = areas.map((a) => a.id);
    await bulkDeleteAuditAreasCascade(ids);
    setSidebarSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    await createAuditLogEntry({
      userId: userProfile.userId,
      userName: userProfile.fullName,
      username: userProfile.username,
      action: 'Delete Audit Universe',
      areaId: '',
      areaCode: areas.length === 1 ? areas[0].areaCode : `BULK (${areas.length})`,
      areaName:
        areas.length === 1
          ? areas[0].name
          : areas.map((a) => a.areaCode).join(', '),
      details: `Permanently deleted ${areas.length} Audit Universe record(s) and all linked Process Docs, Findings, Knowledge items, and Report Drafts.`,
    });
  };

  const handleReimportDataset = async (record: AuditImportRecord) => {
    if (!userProfile || !isAdmin || record.records.length === 0) return;
    await handleImportAreas(record.records, {
      datasetName: `Re-import: ${record.datasetName}`,
      sourceType: 'reimport',
    });
  };

  const handleToggleImportArchive = async (record: AuditImportRecord) => {
    if (!userProfile || !isAdmin) return;
    const nextStatus = record.status === 'Archived' ? 'Active' : 'Archived';
    await updateAuditImportStatus(record.id, nextStatus);
    const linkedAreas = auditAreas.filter(
      (a) => a.datasetId === record.id || record.createdAreaIds.includes(a.id)
    );
    if (linkedAreas.length > 0) {
      if (nextStatus === 'Archived') {
        await handleArchiveAreas(linkedAreas.filter((a) => a.status !== 'Archived'));
      } else {
        await handleRestoreAreas(linkedAreas.filter((a) => a.status === 'Archived'));
      }
    }
  };

  const handleDeleteImportRecord = async (record: AuditImportRecord) => {
    if (!userProfile || !isAdmin) return;
    await deleteAuditImportRecord(record.id);
  };

  const handleUpdateIntelligence = async (updated: AuditAreaIntelligence) => {
    if (!selectedArea || !canWrite) return;
    await saveAuditAreaIntelligence(selectedArea.id, updated, updated.riskRating);
  };

  const handlePromoteObservationToKb = async (obs: AuditObservation) => {
    if (!userProfile || !canWrite) return;
    await createKnowledgeItem(userProfile.userId, {
      type: 'finding',
      domain: obs.domain as AuditDomain,
      title: obs.observationTitle,
      content: `Finding: ${obs.auditFinding}\nRisk: ${obs.riskStatement}\nRoot Cause: ${obs.rootCause}\nRecommendation: ${obs.recommendation}`,
      riskRating: obs.riskRating,
      regulatoryRef: obs.evidenceRef || 'Internal Audit Field Benchmark',
      tags: [obs.domain, obs.riskRating],
      sourceAreaId: obs.areaId,
    });
  };

  const handleUpdateProcessAndSync = useCallback(
    async (processId: string, input: Partial<ProcessDocumentationInput>) => {
      await updateProcessDocumentation(processId, input);
      const targetArea =
        auditAreas.find((a) => a.id === input.linkedAreaId) || selectedArea || null;
      if (targetArea) {
        const cleanInput = sanitizeProcessDocumentationInput({
          ...input,
          linkedAreaId: targetArea.id,
          linkedAreaName: targetArea.name,
        });
        const syncedIntel = syncProcessDocToAreaIntelligence(targetArea, cleanInput);
        await saveAuditAreaIntelligence(targetArea.id, syncedIntel, syncedIntel.riskRating);
      }
    },
    [auditAreas, selectedArea]
  );

  const handleNavigateToModule = useCallback((areaId: string, tab: WorkspaceTab) => {
    setSelectedAreaId(areaId);
    setActiveTab(tab);
    setWorkspaceMode('audit_areas');
  }, []);

  const handleRunProcessAiAction = async (
    processDoc: ProcessDocumentation,
    actionType: ProcessAiActionType
  ): Promise<string> => {
    if (!userProfile || !canWrite) {
      throw new Error('Only Administrators and Auditors can run AI generation.');
    }
    const linkedArea =
      auditAreas.find((a) => a.id === processDoc.linkedAreaId) || auditAreas[0] || null;
    if (!linkedArea) {
      throw new Error(
        'Please create or link an Audit Universe area before running AI generation.'
      );
    }

    const generated = await generateFromProcessDocumentation({
      actionType,
      processDoc,
      linkedArea,
      knowledgeItems,
    });

    const baseIntel =
      linkedArea.intelligence ||
      sanitizeIntelligence({
        auditObjective: processDoc.processObjective,
        processDescription: processDoc.processFlowNarrative || processDoc.scope,
        riskRating: linkedArea.inherentRiskTier,
      } as AuditAreaIntelligence);

    const merged = sanitizeIntelligence({
      ...baseIntel,
      ...generated,
      generatedAt: new Date().toISOString(),
    });

    await saveAuditAreaIntelligence(linkedArea.id, merged, merged.riskRating);

    const labels: Record<ProcessAiActionType, string> = {
      risk_assessment: 'Risk Assessment',
      control_matrix: 'Control Matrix',
      audit_procedures: 'Audit Procedures',
      walkthrough_questions: 'Walkthrough Questions',
      potential_findings: 'Potential Findings & Root Cause',
      recommendations: 'Recommendations',
    };

    return `${labels[actionType]} generated from ${processDoc.processCode} and synced to [${linkedArea.areaCode}] ${linkedArea.name}.`;
  };

  if (!startupReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="w-4 h-4 animate-spin text-blue-900" />
          <span>Initializing Audit Workspace...</span>
        </div>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <AuthScreen
        externalError={authError}
        onLoginSuccess={(profile) => {
          setAuthError('');
          setUserProfile(profile);
        }}
      />
    );
  }

  if (userProfile.mustChangePassword) {
    return (
      <ForcePasswordChangeModal
        user={userProfile}
        onPasswordChanged={() => {
          setUserProfile((prev) => (prev ? { ...prev, mustChangePassword: false } : prev));
        }}
        onSignOut={handleSignOut}
      />
    );
  }

  const isGeneratingCurrent = Boolean(selectedArea && generatingAreaId === selectedArea.id);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Strict 3-Zone Top Bar */}
      <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between gap-8 no-print">
        {/* Zone 1: Single-element Wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setWorkspaceMode('audit_areas');
            setActiveTab('Overview');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display"
        >
          AuditIntel PH
        </a>

        {/* Zone 2: Concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <button
            type="button"
            onClick={() => setWorkspaceMode('audit_areas')}
            className={`hover:text-slate-900 underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              workspaceMode === 'audit_areas' ? 'text-blue-900 font-semibold underline' : 'hover:underline'
            }`}
          >
            Audit Universe
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceMode('process_docs')}
            className={`hover:text-slate-900 underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              workspaceMode === 'process_docs' ? 'text-blue-900 font-semibold underline' : 'hover:underline'
            }`}
          >
            Process Docs
          </button>
          <button
            type="button"
            onClick={() => {
              setWorkspaceMode('audit_areas');
              setActiveTab('Findings Library');
            }}
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Observation Engine
          </button>
          <button
            type="button"
            onClick={() => setShowKnowledgeModal(true)}
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Knowledge Base
          </button>
          <button
            type="button"
            onClick={() => setShowAssistantDrawer(true)}
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Audit GPT
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowUsersModal(true)}
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Users
            </button>
          )}
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="shrink-0">
          {canWrite ? (
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Universe
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowAssistantDrawer(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Ask Audit GPT
            </button>
          )}
        </div>
      </header>

      {/* Mobile Navigation Bar */}
      <div className="md:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2 overflow-x-auto no-print">
        <button
          type="button"
          onClick={() => setWorkspaceMode('audit_areas')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
            workspaceMode === 'audit_areas'
              ? 'bg-blue-900 text-white'
              : 'bg-slate-100 text-slate-700'
          }`}
        >
          Audit Universe
        </button>
        <button
          type="button"
          onClick={() => setWorkspaceMode('process_docs')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
            workspaceMode === 'process_docs'
              ? 'bg-blue-900 text-white'
              : 'bg-slate-100 text-slate-700'
          }`}
        >
          Process Docs ({processDocs.length})
        </button>
        <button
          type="button"
          onClick={() => setShowKnowledgeModal(true)}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-slate-100 text-slate-700 whitespace-nowrap shrink-0"
        >
          Knowledge Base
        </button>
        <button
          type="button"
          onClick={() => setShowAssistantDrawer(true)}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-slate-100 text-slate-700 whitespace-nowrap shrink-0"
        >
          Audit GPT
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowUsersModal(true)}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-slate-100 text-slate-700 whitespace-nowrap shrink-0"
          >
            Users ({orgUsers.length})
          </button>
        )}
      </div>

      {/* Main Workspace Layout */}
      {workspaceMode === 'process_docs' ? (
        <ProcessDocumentationView
          processDocs={processDocs}
          auditAreas={activeAuditAreas}
          selectedAreaId={selectedAreaId}
          onSelectArea={setSelectedAreaId}
          observations={observations}
          canWrite={canWrite}
          isAdmin={isAdmin}
          currentUserId={userProfile.userId}
          onCreateProcess={async (input) =>
            createProcessDocumentation(userProfile.userId, input)
          }
          onUpdateProcess={handleUpdateProcessAndSync}
          onDeleteProcess={deleteProcessDocumentation}
          onNavigateToModule={handleNavigateToModule}
          onRunAiAction={handleRunProcessAiAction}
        />
      ) : (
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Left Sidebar: Audit Universe Explorer */}
        <aside className="w-full lg:w-72 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col shrink-0 no-print">
          <div className="p-4 border-b border-slate-200 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold text-slate-900 tracking-wide">
                Audit Universe ({activeAuditAreas.length})
              </h2>
              <div className="flex items-center gap-2">
                {isAdmin && activeAuditAreas.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSidebarSelectMode((prev) => !prev);
                      setSidebarSelectedIds(new Set());
                    }}
                    className={`text-[11px] font-medium px-2 py-0.5 rounded border transition-colors ${
                      sidebarSelectMode
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {sidebarSelectMode ? 'Done' : 'Select'}
                  </button>
                )}
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => setShowUploadModal(true)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-900 hover:text-blue-700 whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add / Import
                  </button>
                )}
              </div>
            </div>

            {isAdmin && sidebarSelectMode && (
              <div className="p-2 bg-slate-900 text-white rounded-md space-y-2 text-[11px]">
                <div className="flex items-center justify-between">
                  <span>{sidebarSelectedIds.size} selected</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        filteredAreas.length > 0 &&
                        filteredAreas.every((a) => sidebarSelectedIds.has(a.id))
                      ) {
                        setSidebarSelectedIds(new Set());
                      } else {
                        setSidebarSelectedIds(new Set(filteredAreas.map((a) => a.id)));
                      }
                    }}
                    className="text-blue-200 hover:underline"
                  >
                    {filteredAreas.length > 0 &&
                    filteredAreas.every((a) => sidebarSelectedIds.has(a.id))
                      ? 'Clear All'
                      : 'Select All'}
                  </button>
                </div>
                {sidebarSelectedIds.size > 0 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const targets = activeAuditAreas.filter((a) =>
                          sidebarSelectedIds.has(a.id)
                        );
                        void handleArchiveAreas(targets);
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-1 py-1 bg-slate-700 hover:bg-slate-600 rounded font-medium"
                    >
                      <Archive className="w-3 h-3" />
                      Archive
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const targets = activeAuditAreas.filter((a) =>
                          sidebarSelectedIds.has(a.id)
                        );
                        setPendingDeleteAreas(targets);
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-1 py-1 bg-red-600 hover:bg-red-700 rounded font-medium"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={universeSearch}
                onChange={(e) => setUniverseSearch(e.target.value)}
                placeholder="Search audit areas..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20"
              />
            </div>

            <select
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
            >
              <option value="ALL">All Audit Domains</option>
              {AUDIT_DOMAINS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 max-h-72 lg:max-h-none">
            {dataLoading && activeAuditAreas.length === 0 ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-14 bg-slate-100 rounded animate-pulse" />
                ))}
              </div>
            ) : filteredAreas.length === 0 ? (
              <div className="p-5 text-xs text-slate-500 space-y-2">
                <p>No active audit areas found in your universe.</p>
                {canWrite && (
                  <button
                    type="button"
                    onClick={handleLoadStarterEverything}
                    className="text-blue-900 font-medium hover:underline"
                  >
                    Load 9 Philippine Corporate Starter Areas
                  </button>
                )}
              </div>
            ) : (
              filteredAreas.map((area) => {
                const isSelected = area.id === selectedAreaId;
                const isChecked = sidebarSelectedIds.has(area.id);
                const isGen = generatingAreaId === area.id;
                return (
                  <div
                    key={area.id}
                    className={`group px-4 py-3 cursor-pointer transition-colors ${
                      isSelected ? 'bg-slate-100/90' : 'hover:bg-slate-50'
                    }`}
                    onClick={() => {
                      if (sidebarSelectMode && isAdmin) {
                        setSidebarSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(area.id)) next.delete(area.id);
                          else next.add(area.id);
                          return next;
                        });
                      } else {
                        setSelectedAreaId(area.id);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {sidebarSelectMode && isAdmin && (
                          <span className="shrink-0">
                            {isChecked ? (
                              <CheckSquare className="w-3.5 h-3.5 text-blue-900" />
                            ) : (
                              <Square className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </span>
                        )}
                        <span className="font-mono tabular-nums font-medium text-slate-700">
                          {area.areaCode}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {isGen && <Loader2 className="w-3 h-3 animate-spin text-blue-900" />}
                        <span className="font-medium text-slate-700">{area.inherentRiskTier}</span>
                        {isAdmin && !sidebarSelectMode && (
                          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingArea(area);
                              }}
                              className="p-0.5 text-slate-400 hover:text-blue-900"
                              title="Edit audit area"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleArchiveAreas([area]);
                              }}
                              className="p-0.5 text-slate-400 hover:text-amber-700"
                              title="Archive audit area"
                            >
                              <Archive className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPendingDeleteAreas([area]);
                              }}
                              className="p-0.5 text-slate-400 hover:text-red-600"
                              title="Delete audit area"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="text-xs font-semibold text-slate-900 mt-1 line-clamp-2">
                      {area.name}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1 truncate">
                      {area.domain} · {area.entityName}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          {/* Mobile Quick Tools + User Account Footer */}
          <div className="p-4 border-t border-slate-200 bg-slate-50 space-y-3">
            <div className="flex md:hidden items-center gap-2">
              <button
                type="button"
                onClick={() => setShowKnowledgeModal(true)}
                className="flex-1 py-1.5 text-xs font-medium border border-slate-200 bg-white rounded-md text-slate-700"
              >
                Knowledge Base
              </button>
              <button
                type="button"
                onClick={() => setShowAssistantDrawer(true)}
                className="flex-1 py-1.5 text-xs font-medium border border-slate-200 bg-white rounded-md text-slate-700"
              >
                Audit GPT
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowUsersModal(true)}
                  className="flex-1 py-1.5 text-xs font-medium border border-slate-200 bg-white rounded-md text-slate-700"
                >
                  Users
                </button>
              )}
            </div>

            {isAdmin && (
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setUniverseMgmtTab('active');
                    setShowUniverseMgmtModal(true);
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-100 transition-colors"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-blue-900" />
                    Universe Maintenance
                  </span>
                  <span className="font-mono tabular-nums text-[11px] text-slate-500">
                    {archivedAuditAreas.length > 0
                      ? `${archivedAuditAreas.length} arch`
                      : `${importHistory.length} imp`}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowUsersModal(true)}
                  className="hidden md:flex w-full items-center justify-between px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-100 transition-colors"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-blue-900" />
                    Users Module
                  </span>
                  <span className="font-mono tabular-nums text-[11px] text-slate-500">
                    {orgUsers.length}
                  </span>
                </button>
              </div>
            )}

            {syncMeta && (
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>
                  {syncMeta.fromCache
                    ? 'Offline Cache Mode'
                    : syncMeta.hasPendingWrites
                    ? 'Syncing Changes...'
                    : 'Firestore Connected'}
                </span>
                <span className="font-mono tabular-nums">
                  {syncMeta.syncedAt.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-900 truncate">
                  {userProfile.fullName}
                </p>
                <p className="text-[11px] text-slate-500 truncate">
                  @{userProfile.username} · {userProfile.role}
                </p>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-200/60"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content Viewport */}
        <main className="flex-1 min-w-0 flex flex-col">
          {activeAuditAreas.length === 0 && !dataLoading ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="max-w-2xl w-full bg-white border border-slate-200 rounded-lg p-8 space-y-6">
                <div className="space-y-2">
                  <h1 className="text-2xl font-bold text-slate-900">
                    {canWrite
                      ? 'Upload Your Audit Universe to Begin'
                      : 'Audit Universe Pending Publication'}
                  </h1>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {canWrite
                      ? 'Import your corporate Audit Universe spreadsheet (.xlsx, .csv, .json) or load our curated 9-area Philippine Corporate Starter Universe covering Finance/BIR, Branch Operations, Inventory, Procurement, Treasury, Asset Disposal, Logistics, SEC Compliance, and Data Privacy.'
                      : 'No audit areas have been added to the organization workspace yet. Once an Administrator or Auditor uploads the Audit Universe, all areas, risk matrices, findings, and audit reports will appear here in read-only mode.'}
                  </p>
                </div>
                {canWrite && (
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowUploadModal(true)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800 transition-colors"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      Upload Audit Universe File
                    </button>
                    <button
                      type="button"
                      onClick={handleLoadStarterEverything}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
                    >
                      <BookOpen className="w-4 h-4" />
                      Load Philippine Corporate Starter Universe (9 Areas)
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Active Audit Area Header + 7 Required Tabs */}
              <div className="bg-white border-b border-slate-200 px-6 pt-5 no-print">
                {selectedArea ? (
                  <div className="flex flex-wrap items-start justify-between gap-4 pb-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono font-medium text-slate-700">
                          {selectedArea.areaCode}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{selectedArea.domain}</span>
                        <span aria-hidden="true">·</span>
                        <span>{selectedArea.entityName}</span>
                        {selectedArea.lastAuditDate && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>Last Audit: {selectedArea.lastAuditDate}</span>
                          </>
                        )}
                        {isViewer && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-medium text-slate-700">Read-Only Access</span>
                          </>
                        )}
                      </div>
                      <h1 className="text-xl font-bold text-slate-900">
                        {selectedArea.name}
                      </h1>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <RiskIndicator
                        rating={
                          selectedArea.intelligence?.riskRating || selectedArea.inherentRiskTier
                        }
                      />
                      {isAdmin && (
                        <div className="flex items-center gap-1 border border-slate-200 rounded-md bg-slate-50/70 p-0.5">
                          <button
                            type="button"
                            onClick={() => setEditingArea(selectedArea)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-white rounded"
                            title="Edit Audit Universe"
                          >
                            <Edit3 className="w-3 h-3" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDuplicateArea(selectedArea)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-white rounded"
                            title="Duplicate Audit Universe"
                          >
                            <Copy className="w-3 h-3" />
                            Duplicate
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleArchiveAreas([selectedArea])}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-50 rounded"
                            title="Archive Audit Universe (preserve linked records)"
                          >
                            <Archive className="w-3 h-3" />
                            Archive
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDeleteAreas([selectedArea])}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50 rounded"
                            title="Delete Audit Universe Permanently"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete
                          </button>
                        </div>
                      )}
                      {canWrite && (
                        <button
                          type="button"
                          disabled={isGeneratingCurrent}
                          onClick={() => triggerAreaGeneration(selectedArea, true)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                        >
                          {isGeneratingCurrent ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-3.5 h-3.5" />
                              {selectedArea.hasIntelligence ? 'Regenerate AI' : 'Generate Intelligence'}
                            </>
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowAssistantDrawer(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Ask Audit GPT
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="pb-4">
                    <h1 className="text-xl font-bold text-slate-900">
                      Internal Audit Workspace
                    </h1>
                  </div>
                )}

                {/* 7 Required Tabs */}
                <div className="flex items-center gap-1 overflow-x-auto -mb-px">
                  {WORKSPACE_TABS.map((tab) => {
                    const active = activeTab === tab;
                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        className={`px-3.5 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                          active
                            ? 'border-blue-900 text-blue-900'
                            : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                        }`}
                      >
                        {tab}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tab Content Area */}
              <div className="p-6 max-w-7xl w-full mx-auto flex-1">
                {generationError && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between gap-4 no-print">
                    <p className="text-xs text-red-800">{generationError}</p>
                    {selectedArea && canWrite && (
                      <button
                        type="button"
                        disabled={isGeneratingCurrent}
                        onClick={() => triggerAreaGeneration(selectedArea, true)}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-red-700 rounded-md hover:bg-red-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        Retry Generation
                      </button>
                    )}
                  </div>
                )}

                {/* Findings Library and Recommendations Library work both with and without area intelligence */}
                {activeTab === 'Findings Library' ? (
                  <FindingsLibraryTab
                    selectedArea={selectedArea}
                    observations={observations}
                    knowledgeItems={knowledgeItems}
                    onSaveObservation={async (input) => {
                      await createAuditObservation(userProfile.userId, input);
                    }}
                    onUpdateObservationStatus={async (obsId, status: ObservationStatus) => {
                      await updateAuditObservation(obsId, { status });
                    }}
                    onDeleteObservation={deleteAuditObservation}
                    onPromoteToKnowledge={handlePromoteObservationToKb}
                    readOnly={!canWrite}
                  />
                ) : activeTab === 'Recommendations Library' ? (
                  <RecommendationsLibraryTab
                    selectedArea={selectedArea}
                    observations={observations}
                    knowledgeItems={knowledgeItems}
                    onAddKnowledgeRecommendation={async (input) => {
                      await createKnowledgeItem(userProfile.userId, {
                        type: 'recommendation',
                        domain: input.domain,
                        title: input.title,
                        content: input.content,
                        riskRating: input.riskRating,
                        regulatoryRef: input.regulatoryRef,
                        tags: input.tags,
                        sourceAreaId: selectedArea?.id || '',
                      });
                    }}
                    readOnly={!canWrite}
                  />
                ) : !selectedArea ? (
                  <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-600">
                    Select an Audit Area from the left sidebar to inspect its audit intelligence.
                  </div>
                ) : !selectedArea.intelligence ? (
                  isGeneratingCurrent ? (
                    <div className="bg-white border border-slate-200 rounded-lg p-10 space-y-4">
                      <div className="flex items-center gap-3">
                        <Loader2 className="w-5 h-5 animate-spin text-blue-900" />
                        <div>
                          <h3 className="text-base font-semibold text-slate-900">
                            Generating Philippine Corporate Audit Intelligence
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Synthesizing Audit Objective, Inherent Risks, Control Matrix, Substantive Procedures, Walkthroughs, Root Cause Analysis, and Report Narratives for {selectedArea.name}...
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="h-24 bg-slate-100 rounded-md animate-pulse" />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white border border-slate-200 rounded-lg p-8 space-y-4">
                      <h3 className="text-base font-semibold text-slate-900">
                        Audit Intelligence Not Yet Loaded
                      </h3>
                      <p className="text-sm text-slate-600">
                        {generationError ||
                          (canWrite
                            ? 'Select Generate Intelligence to synthesize the 14-section audit package for this area.'
                            : 'An Auditor or Administrator has not generated AI audit intelligence for this area yet.')}
                      </p>
                      {canWrite && (
                        <button
                          type="button"
                          onClick={() => triggerAreaGeneration(selectedArea, true)}
                          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Generate Audit Intelligence
                        </button>
                      )}
                    </div>
                  )
                ) : activeTab === 'Overview' ? (
                  <OverviewTab
                    area={selectedArea}
                    intelligence={selectedArea.intelligence}
                    onUpdateIntelligence={handleUpdateIntelligence}
                    onJumpToObservations={() => setActiveTab('Findings Library')}
                    readOnly={!canWrite}
                  />
                ) : activeTab === 'Risk Assessment' ? (
                  <RiskAssessmentTab
                    intelligence={selectedArea.intelligence}
                    onUpdateIntelligence={handleUpdateIntelligence}
                    readOnly={!canWrite}
                  />
                ) : activeTab === 'Control Matrix' ? (
                  <ControlMatrixTab
                    intelligence={selectedArea.intelligence}
                    onUpdateIntelligence={handleUpdateIntelligence}
                    readOnly={!canWrite}
                  />
                ) : activeTab === 'Audit Procedures' ? (
                  <AuditProceduresTab
                    intelligence={selectedArea.intelligence}
                    onUpdateIntelligence={handleUpdateIntelligence}
                    readOnly={!canWrite}
                  />
                ) : (
                  <ReportBuilderTab
                    area={selectedArea}
                    intelligence={selectedArea.intelligence}
                    processDoc={findProcessDocForArea(selectedArea, processDocs)}
                    observations={observations}
                    savedReports={savedReports}
                    onSaveReport={async (input) => saveAuditReport(userProfile.userId, input)}
                    readOnly={!canWrite}
                  />
                )}
              </div>
            </>
          )}
        </main>
      </div>
      )}

      {/* Modals & Drawers */}
      {canWrite && (
        <UploadUniverseModal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          onImportAreas={handleImportAreas}
        />
      )}

      <KnowledgeBaseModal
        isOpen={showKnowledgeModal}
        onClose={() => setShowKnowledgeModal(false)}
        items={knowledgeItems}
        onAddItem={async (input: StarterKnowledgeInput) => {
          await createKnowledgeItem(userProfile.userId, input);
        }}
        onSeedStarterKnowledge={async () => {
          await createKnowledgeItemsBatch(userProfile.userId, STARTER_PH_KNOWLEDGE_ITEMS);
        }}
        onDeleteItem={deleteKnowledgeItem}
        readOnly={!canWrite}
      />

      <AuditAssistantDrawer
        isOpen={showAssistantDrawer}
        onClose={() => setShowAssistantDrawer(false)}
        selectedArea={selectedArea}
        knowledgeItems={knowledgeItems}
        observations={observations}
        onSaveKnowledgeItem={async (input) => {
          await createKnowledgeItem(userProfile.userId, input);
        }}
        readOnly={!canWrite}
      />

      {isAdmin && (
        <UsersModuleModal
          isOpen={showUsersModal}
          onClose={() => setShowUsersModal(false)}
          users={orgUsers}
          currentAdminUserId={userProfile.userId}
        />
      )}

      {isAdmin && (
        <AuditUniverseManagementModal
          isOpen={showUniverseMgmtModal}
          initialTab={universeMgmtTab}
          onClose={() => setShowUniverseMgmtModal(false)}
          allAreas={auditAreas}
          processDocs={processDocs}
          observations={observations}
          savedReports={savedReports}
          importHistory={importHistory}
          auditLogs={auditLogs}
          onOpenUpload={() => setShowUploadModal(true)}
          onEditArea={(area) => setEditingArea(area)}
          onDuplicateArea={handleDuplicateArea}
          onArchiveAreas={handleArchiveAreas}
          onRestoreAreas={handleRestoreAreas}
          onRequestDeleteAreas={(areas) => setPendingDeleteAreas(areas)}
          onReimportDataset={handleReimportDataset}
          onToggleImportArchive={handleToggleImportArchive}
          onDeleteImportRecord={handleDeleteImportRecord}
        />
      )}

      {isAdmin && (
        <EditAuditAreaModal
          area={editingArea}
          onClose={() => setEditingArea(null)}
          onSave={handleSaveAreaEdit}
        />
      )}

      {isAdmin && (
        <DeleteUniverseConfirmModal
          targetAreas={pendingDeleteAreas}
          processDocs={processDocs}
          observations={observations}
          savedReports={savedReports}
          onClose={() => setPendingDeleteAreas([])}
          onConfirmDelete={handleConfirmPermanentDelete}
          onArchiveInstead={handleArchiveAreas}
        />
      )}
    </div>
  );
}
