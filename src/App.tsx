import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  FileSpreadsheet,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { ensureDefaultAdminSeeded, setActiveActorUserId } from './firebase';
import {
  createAuditAreasBatch,
  createAuditObservation,
  createKnowledgeItem,
  createKnowledgeItemsBatch,
  deleteAuditArea,
  deleteAuditObservation,
  deleteKnowledgeItem,
  saveAuditAreaIntelligence,
  saveAuditReport,
  subscribeAllUsers,
  subscribeAuditAreas,
  subscribeAuditReports,
  subscribeCurrentUserProfile,
  subscribeKnowledgeItems,
  subscribeObservations,
  updateAuditObservation,
} from './services/firestoreService';
import { generateAreaIntelligence } from './services/aiService';
import {
  STARTER_PH_AUDIT_UNIVERSE,
  STARTER_PH_KNOWLEDGE_ITEMS,
  type StarterAuditAreaInput,
  type StarterKnowledgeInput,
} from './data/starterUniverse';
import {
  AUDIT_DOMAINS,
  type AuditArea,
  type AuditAreaIntelligence,
  type AuditDomain,
  type AuditObservation,
  type AuditReport,
  type KnowledgeItem,
  type ObservationStatus,
  type UserProfile,
  type WorkspaceTab,
} from './types/audit';
import { RiskIndicator } from './components/RiskBadge';
import { AuthScreen } from './components/AuthScreen';
import { UploadUniverseModal } from './components/UploadUniverseModal';
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
  const [dataLoading, setDataLoading] = useState(false);

  // Workspace State
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('Overview');
  const [universeSearch, setUniverseSearch] = useState('');
  const [domainFilter, setDomainFilter] = useState<string>('ALL');

  // Modals & Drawers
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showKnowledgeModal, setShowKnowledgeModal] = useState(false);
  const [showAssistantDrawer, setShowAssistantDrawer] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);

  // AI Generation State
  const [generatingAreaId, setGeneratingAreaId] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState('');
  const inFlightAreasRef = useRef<Set<string>>(new Set());
  const failedAreasRef = useRef<Set<string>>(new Set());

  const handleSignOut = useCallback(() => {
    setActiveActorUserId(null);
    setUserProfile(null);
    setOrgUsers([]);
    setShowUsersModal(false);
    setShowUploadModal(false);
    setShowKnowledgeModal(false);
    setShowAssistantDrawer(false);
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
      setSelectedAreaId(null);
      return;
    }

    setDataLoading(true);
    const unsubAreas = subscribeAuditAreas((items) => {
      setAuditAreas(items);
      setDataLoading(false);
      setSelectedAreaId((prev) => {
        if (prev && items.some((a) => a.id === prev)) return prev;
        return items[0]?.id ?? null;
      });
    });

    const unsubObs = subscribeObservations(setObservations);
    const unsubKb = subscribeKnowledgeItems(setKnowledgeItems);
    const unsubRep = subscribeAuditReports(setSavedReports);

    return () => {
      unsubAreas();
      unsubObs();
      unsubKb();
      unsubRep();
    };
  }, [userProfile?.userId, userProfile?.status, userProfile?.mustChangePassword]);

  // Subscribe to organization users list for Administrators
  useEffect(() => {
    if (!isAdmin) {
      setOrgUsers([]);
      return;
    }
    const unsubUsers = subscribeAllUsers(setOrgUsers);
    return () => unsubUsers();
  }, [isAdmin]);

  const selectedArea = useMemo(
    () => auditAreas.find((a) => a.id === selectedAreaId) ?? null,
    [auditAreas, selectedAreaId]
  );

  const triggerAreaGeneration = useCallback(
    async (area: AuditArea, isManualRetry = false) => {
      if (!userProfile || !canWrite || inFlightAreasRef.current.has(area.id)) return;
      if (isManualRetry) {
        failedAreasRef.current.delete(area.id);
      }
      inFlightAreasRef.current.add(area.id);
      setGeneratingAreaId(area.id);
      setGenerationError('');
      try {
        const intel = await generateAreaIntelligence(area, knowledgeItems);
        failedAreasRef.current.delete(area.id);
        await saveAuditAreaIntelligence(area.id, intel, intel.riskRating);
      } catch (err) {
        failedAreasRef.current.add(area.id);
        setGenerationError(
          err instanceof Error
            ? err.message
            : 'Audit Intelligence service is temporarily unavailable due to model capacity constraints. Please try again later.'
        );
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
      !failedAreasRef.current.has(selectedArea.id)
    ) {
      void triggerAreaGeneration(selectedArea);
    }
  }, [userProfile, canWrite, selectedArea, triggerAreaGeneration]);

  const filteredAreas = useMemo(() => {
    return auditAreas.filter((area) => {
      if (domainFilter !== 'ALL' && area.domain !== domainFilter) return false;
      if (universeSearch.trim()) {
        const q = universeSearch.toLowerCase();
        const hay = `${area.areaCode} ${area.name} ${area.domain} ${area.entityName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [auditAreas, domainFilter, universeSearch]);

  const handleImportAreas = async (inputs: StarterAuditAreaInput[]) => {
    if (!userProfile || !canWrite) return;
    const ids = await createAuditAreasBatch(userProfile.userId, inputs);
    if (ids[0]) {
      setSelectedAreaId(ids[0]);
      setActiveTab('Overview');
    }
  };

  const handleLoadStarterEverything = async () => {
    if (!userProfile || !canWrite) return;
    const ids = await createAuditAreasBatch(userProfile.userId, STARTER_PH_AUDIT_UNIVERSE);
    if (knowledgeItems.length === 0) {
      await createKnowledgeItemsBatch(userProfile.userId, STARTER_PH_KNOWLEDGE_ITEMS);
    }
    if (ids[0]) {
      setSelectedAreaId(ids[0]);
      setActiveTab('Overview');
    }
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
            setActiveTab('Overview');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display"
        >
          AuditIntel PH
        </a>

        {/* Zone 2: Concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          {canWrite && (
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Audit Universe
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab('Findings Library')}
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

      {/* Main Workspace Layout: Left Sidebar + Right Viewport */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Left Sidebar: Audit Universe Explorer */}
        <aside className="w-full lg:w-72 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col shrink-0 no-print">
          <div className="p-4 border-b border-slate-200 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold text-slate-900 tracking-wide">
                Audit Universe ({auditAreas.length})
              </h2>
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
            {dataLoading && auditAreas.length === 0 ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-14 bg-slate-100 rounded animate-pulse" />
                ))}
              </div>
            ) : filteredAreas.length === 0 ? (
              <div className="p-5 text-xs text-slate-500 space-y-2">
                <p>No audit areas found in your universe.</p>
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
                const isGen = generatingAreaId === area.id;
                const canDeleteArea = isAdmin || (canWrite && area.ownerId === userProfile.userId);
                return (
                  <div
                    key={area.id}
                    className={`group px-4 py-3 cursor-pointer transition-colors ${
                      isSelected ? 'bg-slate-100/90' : 'hover:bg-slate-50'
                    }`}
                    onClick={() => setSelectedAreaId(area.id)}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span className="font-mono tabular-nums font-medium text-slate-700">
                        {area.areaCode}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {isGen && <Loader2 className="w-3 h-3 animate-spin text-blue-900" />}
                        <span className="font-medium text-slate-700">{area.inherentRiskTier}</span>
                        {canDeleteArea && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void deleteAuditArea(area.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-red-600 transition-opacity"
                            title="Delete audit area"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
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
          {auditAreas.length === 0 && !dataLoading ? (
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
    </div>
  );
}
