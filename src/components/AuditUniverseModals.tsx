import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  CheckSquare,
  Copy,
  Edit3,
  FileSpreadsheet,
  History,
  Layers,
  Loader2,
  RotateCcw,
  Search,
  Square,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  AUDIT_DOMAINS,
  RISK_RATINGS,
  type AuditArea,
  type AuditDomain,
  type AuditImportRecord,
  type AuditLogEntry,
  type AuditObservation,
  type AuditReport,
  type ProcessDocumentation,
  type RiskRating,
} from '../types/audit';
import type { UpdateAuditAreaMetadataInput } from '../services/firestoreService';

export interface DependencyCounts {
  processDocuments: number;
  riskAssessments: number;
  controlMatrices: number;
  auditProcedures: number;
  findings: number;
  recommendations: number;
  reportBuilderDrafts: number;
}

export function computeAreaDependencies(
  targetAreas: AuditArea[],
  processDocs: ProcessDocumentation[],
  observations: AuditObservation[],
  savedReports: AuditReport[]
): DependencyCounts {
  const targetIds = new Set(targetAreas.map((a) => a.id));
  const processDocuments = processDocs.filter((p) => targetIds.has(p.linkedAreaId)).length;
  const riskAssessments = targetAreas.reduce(
    (sum, area) =>
      sum + (area.intelligence?.inherentRisks?.length || (area.hasIntelligence ? 1 : 0)),
    0
  );
  const controlMatrices = targetAreas.reduce(
    (sum, area) =>
      sum +
      (area.intelligence?.keyControls?.length ||
        area.intelligence?.controlObjectives?.length ||
        (area.hasIntelligence ? 1 : 0)),
    0
  );
  const auditProcedures = targetAreas.reduce(
    (sum, area) =>
      sum + (area.intelligence?.auditProcedures?.length || (area.hasIntelligence ? 1 : 0)),
    0
  );
  const findings =
    observations.filter((o) => targetIds.has(o.areaId)).length +
    targetAreas.reduce((sum, area) => sum + (area.intelligence?.potentialFindings?.length || 0), 0);
  const recommendations =
    observations.filter((o) => targetIds.has(o.areaId) && Boolean(o.recommendation?.trim())).length +
    targetAreas.reduce((sum, area) => sum + (area.intelligence?.recommendations?.length || 0), 0);
  const reportBuilderDrafts = savedReports.filter((r) => targetIds.has(r.areaId)).length;

  return {
    processDocuments,
    riskAssessments,
    controlMatrices,
    auditProcedures,
    findings,
    recommendations,
    reportBuilderDrafts,
  };
}

function formatFirestoreDate(val: unknown): string {
  if (!val) return '—';
  if (val instanceof Date) return val.toLocaleDateString();
  if (typeof val === 'object' && val !== null && 'seconds' in val) {
    const sec = Number((val as { seconds?: number }).seconds);
    if (Number.isFinite(sec) && sec > 0) {
      return new Date(sec * 1000).toLocaleString();
    }
  }
  return String(val);
}

// -----------------------------------------------------------------------------
// 1. Edit Audit Area Modal
// -----------------------------------------------------------------------------

interface EditAuditAreaModalProps {
  area: AuditArea | null;
  onClose: () => void;
  onSave: (areaId: string, updates: UpdateAuditAreaMetadataInput) => Promise<void>;
}

export function EditAuditAreaModal({ area, onClose, onSave }: EditAuditAreaModalProps) {
  const [areaCode, setAreaCode] = useState('');
  const [name, setName] = useState('');
  const [domain, setDomain] = useState<AuditDomain>('Operations');
  const [entityName, setEntityName] = useState('');
  const [inherentRiskTier, setInherentRiskTier] = useState<RiskRating>('High');
  const [regulatoryContext, setRegulatoryContext] = useState('');
  const [lastAuditDate, setLastAuditDate] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!area) return;
    setAreaCode(area.areaCode);
    setName(area.name);
    setDomain(area.domain);
    setEntityName(area.entityName);
    setInherentRiskTier(area.inherentRiskTier);
    setRegulatoryContext(area.regulatoryContext || '');
    setLastAuditDate(area.lastAuditDate || '');
    setDescription(area.description || '');
    setError('');
  }, [area]);

  if (!area) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!areaCode.trim() || !name.trim()) {
      setError('Area Code and Audit Area Name are required.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      await onSave(area.id, {
        areaCode: areaCode.trim(),
        name: name.trim(),
        domain,
        entityName: entityName.trim() || 'Corporate Head Office',
        inherentRiskTier,
        regulatoryContext: regulatoryContext.trim(),
        lastAuditDate: lastAuditDate.trim() || 'Unscheduled',
        description: description.trim(),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update Audit Universe area.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-area-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="edit-area-modal-title" className="text-base font-semibold text-slate-900">
              Edit Audit Universe Record
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Changes save immediately to Cloud Firestore and synchronize across all connected devices.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100"
            aria-label="Close edit dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Area Code *
              </label>
              <input
                type="text"
                required
                value={areaCode}
                onChange={(e) => setAreaCode(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Audit Area Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Audit Domain
              </label>
              <select
                value={domain}
                onChange={(e) => setDomain(e.target.value as AuditDomain)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
              >
                {AUDIT_DOMAINS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Entity / Business Unit
              </label>
              <input
                type="text"
                value={entityName}
                onChange={(e) => setEntityName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Inherent Risk Tier
              </label>
              <select
                value={inherentRiskTier}
                onChange={(e) => setInherentRiskTier(e.target.value as RiskRating)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
              >
                {RISK_RATINGS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Regulatory & Policy Context
              </label>
              <input
                type="text"
                value={regulatoryContext}
                onChange={(e) => setRegulatoryContext(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Last Audit Cycle
              </label>
              <input
                type="text"
                value={lastAuditDate}
                onChange={(e) => setLastAuditDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Scope & Process Notes
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800 disabled:opacity-50"
            >
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 2. Permanent Delete Confirmation + Dependency Check Modal
// -----------------------------------------------------------------------------

interface DeleteUniverseConfirmModalProps {
  targetAreas: AuditArea[];
  processDocs: ProcessDocumentation[];
  observations: AuditObservation[];
  savedReports: AuditReport[];
  onClose: () => void;
  onConfirmDelete: (areas: AuditArea[]) => Promise<void>;
  onArchiveInstead?: (areas: AuditArea[]) => Promise<void>;
}

export function DeleteUniverseConfirmModal({
  targetAreas,
  processDocs,
  observations,
  savedReports,
  onClose,
  onConfirmDelete,
  onArchiveInstead,
}: DeleteUniverseConfirmModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  const deps = useMemo(
    () => computeAreaDependencies(targetAreas, processDocs, observations, savedReports),
    [targetAreas, processDocs, observations, savedReports]
  );

  if (targetAreas.length === 0) return null;

  const isSingle = targetAreas.length === 1;
  const singleArea = targetAreas[0];
  const hasAnyActive = targetAreas.some((a) => a.status !== 'Archived');

  const handleDelete = async () => {
    setIsProcessing(true);
    setError('');
    try {
      await onConfirmDelete(targetAreas);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete Audit Universe records.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleArchive = async () => {
    if (!onArchiveInstead) return;
    setIsProcessing(true);
    setError('');
    try {
      await onArchiveInstead(targetAreas);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive Audit Universe records.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-900/60 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-universe-title"
    >
      <div className="bg-white border border-slate-200 rounded-lg w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-200 bg-red-50/70">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-md bg-red-100 text-red-700 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 id="delete-universe-title" className="text-base font-semibold text-slate-900">
                {isSingle
                  ? 'Confirm Permanent Audit Universe Deletion'
                  : `Confirm Bulk Deletion (${targetAreas.length} Audit Areas)`}
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Review linked dependencies before permanently removing records from Cloud Firestore.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md hover:bg-white/80"
            aria-label="Close confirmation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-700">
          {error && (
            <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md space-y-2">
            <p className="font-semibold text-slate-900">You are about to permanently delete:</p>
            {isSingle ? (
              <div className="space-y-1 text-xs">
                <div>
                  <span className="text-slate-500 block">Area Code:</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {singleArea.areaCode}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Audit Area:</span>
                  <span className="font-semibold text-slate-900">{singleArea.name}</span>
                </div>
              </div>
            ) : (
              <div className="max-h-28 overflow-y-auto space-y-1 divide-y divide-slate-200">
                {targetAreas.map((a) => (
                  <div key={a.id} className="pt-1 first:pt-0 flex items-center gap-2">
                    <span className="font-mono font-semibold text-slate-800 shrink-0">
                      {a.areaCode}
                    </span>
                    <span className="text-slate-700 truncate">{a.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border border-amber-200 bg-amber-50/60 rounded-md p-3.5 space-y-2">
            <p className="font-semibold text-amber-950">
              Dependency Check — Linked Records Detected:
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div className="bg-white border border-amber-200/80 rounded px-2.5 py-1.5 flex items-center justify-between">
                <span className="text-slate-600">Process Documents</span>
                <span className="font-mono font-semibold text-slate-900">
                  {deps.processDocuments}
                </span>
              </div>
              <div className="bg-white border border-amber-200/80 rounded px-2.5 py-1.5 flex items-center justify-between">
                <span className="text-slate-600">Risk Assessments</span>
                <span className="font-mono font-semibold text-slate-900">
                  {deps.riskAssessments}
                </span>
              </div>
              <div className="bg-white border border-amber-200/80 rounded px-2.5 py-1.5 flex items-center justify-between">
                <span className="text-slate-600">Control Matrices</span>
                <span className="font-mono font-semibold text-slate-900">
                  {deps.controlMatrices}
                </span>
              </div>
              <div className="bg-white border border-amber-200/80 rounded px-2.5 py-1.5 flex items-center justify-between">
                <span className="text-slate-600">Audit Procedures</span>
                <span className="font-mono font-semibold text-slate-900">
                  {deps.auditProcedures}
                </span>
              </div>
              <div className="bg-white border border-amber-200/80 rounded px-2.5 py-1.5 flex items-center justify-between">
                <span className="text-slate-600">Findings</span>
                <span className="font-mono font-semibold text-slate-900">{deps.findings}</span>
              </div>
              <div className="bg-white border border-amber-200/80 rounded px-2.5 py-1.5 flex items-center justify-between">
                <span className="text-slate-600">Recommendations</span>
                <span className="font-mono font-semibold text-slate-900">
                  {deps.recommendations}
                </span>
              </div>
              <div className="bg-white border border-amber-200/80 rounded px-2.5 py-1.5 flex items-center justify-between col-span-2 sm:col-span-3">
                <span className="text-slate-600">Report Builder Drafts</span>
                <span className="font-mono font-semibold text-slate-900">
                  {deps.reportBuilderDrafts}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="font-semibold text-slate-900">This action will remove:</p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-slate-600 list-disc list-inside">
              <li>Audit Universe Record</li>
              <li>Process Documentation</li>
              <li>Risk Assessment</li>
              <li>Control Matrix</li>
              <li>Audit Procedures</li>
              <li>Findings Library</li>
              <li>Recommendations Library</li>
              <li>Report Builder Drafts</li>
            </ul>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
          <div>
            {onArchiveInstead && hasAnyActive && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleArchive}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-900 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 disabled:opacity-50"
              >
                <Archive className="w-3.5 h-3.5" />
                Archive Instead (Recommended)
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isProcessing}
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-red-700 rounded-md hover:bg-red-800 disabled:opacity-50"
            >
              {isProcessing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              Delete Permanently
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 3. Audit Universe Management Hub Modal (Bulk, Archived, Import History, Audit Log)
// -----------------------------------------------------------------------------

interface AuditUniverseManagementModalProps {
  isOpen: boolean;
  initialTab?: 'active' | 'archived' | 'history' | 'logs';
  onClose: () => void;
  allAreas: AuditArea[];
  processDocs: ProcessDocumentation[];
  observations: AuditObservation[];
  savedReports: AuditReport[];
  importHistory: AuditImportRecord[];
  auditLogs: AuditLogEntry[];
  onOpenUpload: () => void;
  onEditArea: (area: AuditArea) => void;
  onDuplicateArea: (area: AuditArea) => Promise<void>;
  onArchiveAreas: (areas: AuditArea[]) => Promise<void>;
  onRestoreAreas: (areas: AuditArea[]) => Promise<void>;
  onRequestDeleteAreas: (areas: AuditArea[]) => void;
  onReimportDataset: (record: AuditImportRecord) => Promise<void>;
  onToggleImportArchive: (record: AuditImportRecord) => Promise<void>;
  onDeleteImportRecord: (record: AuditImportRecord) => Promise<void>;
}

export function AuditUniverseManagementModal({
  isOpen,
  initialTab = 'active',
  onClose,
  allAreas,
  processDocs,
  observations,
  savedReports,
  importHistory,
  auditLogs,
  onOpenUpload,
  onEditArea,
  onDuplicateArea,
  onArchiveAreas,
  onRestoreAreas,
  onRequestDeleteAreas,
  onReimportDataset,
  onToggleImportArchive,
  onDeleteImportRecord,
}: AuditUniverseManagementModalProps) {
  const [tab, setTab] = useState<'active' | 'archived' | 'history' | 'logs'>(initialTab);
  const [search, setSearch] = useState('');
  const [logActionFilter, setLogActionFilter] = useState('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [banner, setBanner] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setBanner('');
    }
  }, [isOpen, initialTab]);

  const activeAreas = useMemo(
    () => allAreas.filter((a) => a.status !== 'Archived'),
    [allAreas]
  );
  const archivedAreas = useMemo(
    () => allAreas.filter((a) => a.status === 'Archived'),
    [allAreas]
  );

  const filteredActive = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activeAreas;
    return activeAreas.filter((a) =>
      `${a.areaCode} ${a.name} ${a.domain} ${a.entityName}`.toLowerCase().includes(q)
    );
  }, [activeAreas, search]);

  const filteredArchived = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return archivedAreas;
    return archivedAreas.filter((a) =>
      `${a.areaCode} ${a.name} ${a.domain} ${a.entityName}`.toLowerCase().includes(q)
    );
  }, [archivedAreas, search]);

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return auditLogs.filter((entry) => {
      if (logActionFilter !== 'ALL' && entry.action !== logActionFilter) return false;
      if (!q) return true;
      return `${entry.userName} ${entry.username} ${entry.areaCode} ${entry.areaName} ${entry.action} ${entry.details}`
        .toLowerCase()
        .includes(q);
    });
  }, [auditLogs, logActionFilter, search]);

  if (!isOpen) return null;

  const selectedActiveAreas = activeAreas.filter((a) => selectedIds.has(a.id));
  const allFilteredSelected =
    filteredActive.length > 0 && filteredActive.every((a) => selectedIds.has(a.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredActive.forEach((a) => next.delete(a.id));
      } else {
        filteredActive.forEach((a) => next.add(a.id));
      }
      return next;
    });
  };

  const runAction = async (key: string, fn: () => Promise<void>, message?: string) => {
    setBusyKey(key);
    setBanner('');
    try {
      await fn();
      if (message) setBanner(message);
    } catch (err) {
      setBanner(err instanceof Error ? err.message : 'Operation failed.');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="universe-mgmt-title"
    >
      <div className="bg-white border border-slate-200 rounded-lg w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="universe-mgmt-title" className="text-lg font-semibold text-slate-900">
              Audit Universe Management
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Administrator file maintenance, bulk archive/deletion, dataset import history, and audit activity log.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenUpload();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Audit Universe
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100"
              aria-label="Close management console"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs & Search */}
        <div className="px-6 pt-3 pb-3 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTab('active')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                tab === 'active'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Active Universe ({activeAreas.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('archived')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                tab === 'archived'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              Archived ({archivedAreas.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('history')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                tab === 'history'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Import History ({importHistory.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('logs')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                tab === 'logs'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Audit Activity Log ({auditLogs.length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            {tab === 'logs' && (
              <select
                value={logActionFilter}
                onChange={(e) => setLogActionFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
              >
                <option value="ALL">All Actions</option>
                <option value="Upload Audit Universe">Upload Audit Universe</option>
                <option value="Edit Audit Universe">Edit Audit Universe</option>
                <option value="Duplicate Audit Universe">Duplicate Audit Universe</option>
                <option value="Archive Audit Universe">Archive Audit Universe</option>
                <option value="Restore Audit Universe">Restore Audit Universe</option>
                <option value="Delete Audit Universe">Delete Audit Universe</option>
              </select>
            )}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search records..."
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md w-56 focus:outline-none focus:ring-2 focus:ring-blue-900/20"
              />
            </div>
          </div>
        </div>

        {/* Status Banner */}
        {banner && (
          <div className="mx-6 mt-3 px-3.5 py-2 text-xs bg-blue-50 border border-blue-200 text-blue-900 rounded-md flex items-center justify-between">
            <span>{banner}</span>
            <button
              type="button"
              onClick={() => setBanner('')}
              className="text-blue-800 hover:underline font-medium"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {tab === 'active' && (
            <div className="space-y-3">
              {selectedActiveAreas.length > 0 && (
                <div className="px-4 py-2.5 bg-slate-900 text-white rounded-md flex flex-wrap items-center justify-between gap-3 text-xs">
                  <span className="font-medium">
                    {selectedActiveAreas.length} Audit Universe record(s) selected
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busyKey === 'bulk-archive'}
                      onClick={() =>
                        void runAction(
                          'bulk-archive',
                          async () => {
                            await onArchiveAreas(selectedActiveAreas);
                            setSelectedIds(new Set());
                          },
                          `Archived ${selectedActiveAreas.length} audit area(s).`
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-white font-medium"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      Archive Selected
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onRequestDeleteAreas(selectedActiveAreas);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-white font-medium"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Selected
                    </button>
                  </div>
                </div>
              )}

              <div className="border border-slate-200 rounded-md overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3 w-10">
                        <button
                          type="button"
                          onClick={toggleSelectAllFiltered}
                          className="text-slate-600 hover:text-slate-900"
                          title={allFilteredSelected ? 'Deselect all' : 'Select all'}
                        >
                          {allFilteredSelected ? (
                            <CheckSquare className="w-4 h-4 text-blue-900" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </th>
                      <th className="py-2.5 px-3 font-medium">Code</th>
                      <th className="py-2.5 px-3 font-medium">Audit Area</th>
                      <th className="py-2.5 px-3 font-medium">Domain / Entity</th>
                      <th className="py-2.5 px-3 font-medium">Risk</th>
                      <th className="py-2.5 px-3 font-medium">Linked Docs</th>
                      <th className="py-2.5 px-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredActive.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500">
                          No active Audit Universe records match your search.
                        </td>
                      </tr>
                    ) : (
                      filteredActive.map((area) => {
                        const checked = selectedIds.has(area.id);
                        const deps = computeAreaDependencies(
                          [area],
                          processDocs,
                          observations,
                          savedReports
                        );
                        return (
                          <tr key={area.id} className={checked ? 'bg-blue-50/40' : 'hover:bg-slate-50'}>
                            <td className="py-2.5 px-3">
                              <button
                                type="button"
                                onClick={() => toggleSelect(area.id)}
                                className="text-slate-600 hover:text-slate-900"
                              >
                                {checked ? (
                                  <CheckSquare className="w-4 h-4 text-blue-900" />
                                ) : (
                                  <Square className="w-4 h-4" />
                                )}
                              </button>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-semibold text-slate-700 whitespace-nowrap">
                              {area.areaCode}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-900 max-w-xs">
                              {area.name}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">
                              <div>{area.domain}</div>
                              <div className="text-[11px] text-slate-400">{area.entityName}</div>
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-700 whitespace-nowrap">
                              {area.inherentRiskTier}
                            </td>
                            <td className="py-2.5 px-3 text-[11px] text-slate-500 whitespace-nowrap">
                              {deps.processDocuments} Proc · {deps.findings} Find · {deps.reportBuilderDrafts} Rpt
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => onEditArea(area)}
                                  className="px-2 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-100 inline-flex items-center gap-1"
                                  title="Edit Audit Universe"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  disabled={busyKey === `dup-${area.id}`}
                                  onClick={() =>
                                    void runAction(
                                      `dup-${area.id}`,
                                      () => onDuplicateArea(area),
                                      `Duplicated ${area.areaCode}.`
                                    )
                                  }
                                  className="px-2 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-100 inline-flex items-center gap-1"
                                  title="Duplicate Audit Universe"
                                >
                                  <Copy className="w-3 h-3" />
                                  Duplicate
                                </button>
                                <button
                                  type="button"
                                  disabled={busyKey === `arch-${area.id}`}
                                  onClick={() =>
                                    void runAction(
                                      `arch-${area.id}`,
                                      () => onArchiveAreas([area]),
                                      `Archived ${area.areaCode} (all linked data preserved).`
                                    )
                                  }
                                  className="px-2 py-1 text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100 inline-flex items-center gap-1"
                                  title="Archive Audit Universe"
                                >
                                  <Archive className="w-3 h-3" />
                                  Archive
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onRequestDeleteAreas([area])}
                                  className="px-2 py-1 text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 inline-flex items-center gap-1"
                                  title="Delete Audit Universe Permanently"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'archived' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-600">
                Archived Audit Universe areas are hidden from the active workspace list while preserving all Process Documentation, Risk Assessments, Control Matrices, Procedures, Findings, Recommendations, and Reports.
              </p>
              <div className="border border-slate-200 rounded-md overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3 font-medium">Code</th>
                      <th className="py-2.5 px-3 font-medium">Audit Area</th>
                      <th className="py-2.5 px-3 font-medium">Domain / Entity</th>
                      <th className="py-2.5 px-3 font-medium">Preserved Records</th>
                      <th className="py-2.5 px-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredArchived.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          No archived Audit Universe records.
                        </td>
                      </tr>
                    ) : (
                      filteredArchived.map((area) => {
                        const deps = computeAreaDependencies(
                          [area],
                          processDocs,
                          observations,
                          savedReports
                        );
                        return (
                          <tr key={area.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-mono font-semibold text-slate-700 whitespace-nowrap">
                              {area.areaCode}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-900">{area.name}</td>
                            <td className="py-2.5 px-3 text-slate-600">
                              {area.domain} · {area.entityName}
                            </td>
                            <td className="py-2.5 px-3 text-[11px] text-slate-500">
                              {deps.processDocuments} Process Docs · {deps.riskAssessments} Risks ·{' '}
                              {deps.findings} Findings · {deps.reportBuilderDrafts} Reports
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={busyKey === `rest-${area.id}`}
                                  onClick={() =>
                                    void runAction(
                                      `rest-${area.id}`,
                                      () => onRestoreAreas([area]),
                                      `Restored ${area.areaCode} to active Audit Universe.`
                                    )
                                  }
                                  className="px-2.5 py-1 text-[11px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100 inline-flex items-center gap-1"
                                >
                                  <ArchiveRestore className="w-3 h-3" />
                                  Restore
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onRequestDeleteAreas([area])}
                                  className="px-2.5 py-1 text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 inline-flex items-center gap-1"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  Delete Permanently
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'history' && (
            <div className="border border-slate-200 rounded-md overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-3 font-medium">Dataset Name</th>
                    <th className="py-2.5 px-3 font-medium">Upload Date</th>
                    <th className="py-2.5 px-3 font-medium">Uploaded By</th>
                    <th className="py-2.5 px-3 font-medium">Record Count</th>
                    <th className="py-2.5 px-3 font-medium">Status</th>
                    <th className="py-2.5 px-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {importHistory.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        No uploaded Audit Universe datasets recorded yet.
                      </td>
                    </tr>
                  ) : (
                    importHistory.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-medium text-slate-900">
                          <div>{rec.datasetName}</div>
                          <div className="text-[11px] text-slate-400 uppercase">{rec.sourceType}</div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                          {formatFirestoreDate(rec.createdAt)}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">
                          <div>{rec.uploadedByName}</div>
                          <div className="text-[11px] text-slate-400">@{rec.uploadedByUsername}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                          {rec.recordCount}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                              rec.status === 'Archived'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            }`}
                          >
                            {rec.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              disabled={busyKey === `reimp-${rec.id}` || rec.records.length === 0}
                              onClick={() =>
                                void runAction(
                                  `reimp-${rec.id}`,
                                  () => onReimportDataset(rec),
                                  `Re-imported ${rec.recordCount} record(s) from "${rec.datasetName}".`
                                )
                              }
                              className="px-2 py-1 text-[11px] font-medium text-blue-900 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 inline-flex items-center gap-1 disabled:opacity-50"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Re-import
                            </button>
                            <button
                              type="button"
                              disabled={busyKey === `imp-arch-${rec.id}`}
                              onClick={() =>
                                void runAction(
                                  `imp-arch-${rec.id}`,
                                  () => onToggleImportArchive(rec),
                                  rec.status === 'Archived'
                                    ? `Restored dataset "${rec.datasetName}".`
                                    : `Archived dataset "${rec.datasetName}".`
                                )
                              }
                              className="px-2 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-100 inline-flex items-center gap-1"
                            >
                              {rec.status === 'Archived' ? (
                                <>
                                  <ArchiveRestore className="w-3 h-3" />
                                  Restore
                                </>
                              ) : (
                                <>
                                  <Archive className="w-3 h-3" />
                                  Archive
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={busyKey === `imp-del-${rec.id}`}
                              onClick={() =>
                                void runAction(
                                  `imp-del-${rec.id}`,
                                  () => onDeleteImportRecord(rec),
                                  `Deleted import history entry "${rec.datasetName}".`
                                )
                              }
                              className="px-2 py-1 text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'logs' && (
            <div className="border border-slate-200 rounded-md overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-3 font-medium">User</th>
                    <th className="py-2.5 px-3 font-medium">Date</th>
                    <th className="py-2.5 px-3 font-medium">Time</th>
                    <th className="py-2.5 px-3 font-medium">Audit Area</th>
                    <th className="py-2.5 px-3 font-medium">Action</th>
                    <th className="py-2.5 px-3 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        No Audit Universe activity log entries match your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 text-slate-800 whitespace-nowrap">
                          <div className="font-medium">{log.userName}</div>
                          <div className="text-[11px] text-slate-400">@{log.username}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                          {log.eventDate}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                          {log.eventTime}
                        </td>
                        <td className="py-2.5 px-3 text-slate-800">
                          {log.areaCode && (
                            <span className="font-mono font-semibold text-slate-700 mr-1.5">
                              {log.areaCode}
                            </span>
                          )}
                          <span>{log.areaName}</span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                              log.action === 'Delete Audit Universe'
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : log.action === 'Archive Audit Universe'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : log.action === 'Restore Audit Universe'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-slate-100 text-slate-800 border border-slate-200'
                            }`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate" title={log.details}>
                          {log.details || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
