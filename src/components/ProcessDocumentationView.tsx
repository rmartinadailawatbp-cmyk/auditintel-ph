import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  AUDIT_DOMAINS,
  RISK_RATINGS,
  type AuditArea,
  type AuditDomain,
  type AuditObservation,
  type ProcessAiActionType,
  type ProcessAttachmentItem,
  type ProcessAttachmentKind,
  type ProcessControlItem,
  type ProcessDocStatus,
  type ProcessDocumentItem,
  type ProcessDocumentation,
  type ProcessRiskItem,
  type ProcessStepItem,
  type ProcessSystemItem,
  type RiskRating,
  type WorkspaceTab,
} from '../types/audit';
import {
  MAX_TOTAL_ATTACHMENT_DATA_CHARS,
  sanitizeProcessDocumentationInput,
  type ProcessDocumentationInput,
} from '../utils/validation';
import { buildAutoDraftFromArea, findProcessDocForArea } from '../utils/processSync';
import { ProcessFlowchart } from './ProcessFlowchart';
import { RiskIndicator } from './RiskBadge';

interface ProcessDocumentationViewProps {
  processDocs: ProcessDocumentation[];
  auditAreas: AuditArea[];
  selectedAreaId: string | null;
  onSelectArea: (areaId: string) => void;
  observations: AuditObservation[];
  canWrite: boolean;
  isAdmin: boolean;
  currentUserId: string;
  onCreateProcess: (input: Partial<ProcessDocumentationInput>) => Promise<string>;
  onUpdateProcess: (processId: string, input: Partial<ProcessDocumentationInput>) => Promise<void>;
  onDeleteProcess: (processId: string) => Promise<void>;
  onNavigateToModule: (areaId: string, tab: WorkspaceTab) => void;
  onRunAiAction: (
    processDoc: ProcessDocumentation,
    actionType: ProcessAiActionType
  ) => Promise<string>;
}

const AI_ACTIONS: Array<{
  type: ProcessAiActionType;
  label: string;
  targetTab: WorkspaceTab;
}> = [
  { type: 'risk_assessment', label: 'Generate Risk Assessment', targetTab: 'Risk Assessment' },
  { type: 'control_matrix', label: 'Generate Control Matrix', targetTab: 'Control Matrix' },
  { type: 'audit_procedures', label: 'Generate Audit Procedures', targetTab: 'Audit Procedures' },
  { type: 'walkthrough_questions', label: 'Generate Walkthrough Questions', targetTab: 'Audit Procedures' },
  { type: 'potential_findings', label: 'Generate Potential Findings', targetTab: 'Findings Library' },
  { type: 'recommendations', label: 'Generate Recommendations', targetTab: 'Recommendations Library' },
];

const LINKED_MODULES: Array<{ label: string; tab: WorkspaceTab }> = [
  { label: 'Audit Universe', tab: 'Overview' },
  { label: 'Risk Assessment', tab: 'Risk Assessment' },
  { label: 'Control Matrix', tab: 'Control Matrix' },
  { label: 'Audit Procedures', tab: 'Audit Procedures' },
  { label: 'Findings Library', tab: 'Findings Library' },
  { label: 'Recommendations Library', tab: 'Recommendations Library' },
  { label: 'Report Builder', tab: 'Report Builder' },
];

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image format.'));
      img.onload = () => {
        const maxDim = 1100;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result || ''));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read attachment file.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

function toEditableDraft(docItem: ProcessDocumentation): ProcessDocumentationInput {
  return sanitizeProcessDocumentationInput({
    processCode: docItem.processCode,
    processName: docItem.processName,
    domain: docItem.domain,
    entityName: docItem.entityName,
    version: docItem.version,
    effectiveDate: docItem.effectiveDate,
    status: docItem.status,
    linkedAreaId: docItem.linkedAreaId,
    linkedAreaName: docItem.linkedAreaName,
    processObjective: docItem.processObjective,
    scope: docItem.scope,
    processFlowNarrative: docItem.processFlowNarrative,
    flowchartNodes: docItem.flowchartNodes,
    processSteps: docItem.processSteps,
    processOwner: docItem.processOwner,
    documentsUsed: docItem.documentsUsed,
    systemsUsed: docItem.systemsUsed,
    risks: docItem.risks,
    existingControls: docItem.existingControls,
    attachments: docItem.attachments,
  });
}

export function ProcessDocumentationView({
  processDocs,
  auditAreas,
  selectedAreaId,
  onSelectArea,
  observations,
  canWrite,
  isAdmin,
  currentUserId,
  onCreateProcess,
  onUpdateProcess,
  onDeleteProcess,
  onNavigateToModule,
  onRunAiAction,
}: ProcessDocumentationViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [domainFilter, setDomainFilter] = useState<string>('ALL');

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProcessDocumentationInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [autoCreatingAreaId, setAutoCreatingAreaId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const [runningAiAction, setRunningAiAction] = useState<ProcessAiActionType | null>(null);
  const [aiFeedback, setAiFeedback] = useState<{ text: string; tab?: WorkspaceTab; areaId?: string } | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<ProcessAttachmentItem | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoCreatingRef = useRef<Set<string>>(new Set());
  const manuallyDeletedAreaIdsRef = useRef<Set<string>>(new Set());

  const selectedArea = useMemo(
    () => auditAreas.find((a) => a.id === selectedAreaId) ?? auditAreas[0] ?? null,
    [auditAreas, selectedAreaId]
  );

  // Strict 1:1 mapping: One Audit Universe = One Process Documentation
  const selectedDoc = useMemo(
    () => findProcessDocForArea(selectedArea, processDocs),
    [selectedArea, processDocs]
  );

  // Automatically create a draft Process Documentation when none exists for the selected Audit Universe area
  useEffect(() => {
    if (
      !selectedArea ||
      !canWrite ||
      selectedDoc ||
      autoCreatingRef.current.has(selectedArea.id) ||
      manuallyDeletedAreaIdsRef.current.has(selectedArea.id)
    ) {
      return;
    }

    autoCreatingRef.current.add(selectedArea.id);
    setAutoCreatingAreaId(selectedArea.id);
    setErrorMessage('');
    const autoDraft = buildAutoDraftFromArea(selectedArea);

    void onCreateProcess(autoDraft)
      .then(() => {
        setSaveMessage(
          `Draft Process Documentation automatically created and linked to ${selectedArea.areaCode} - ${selectedArea.name}.`
        );
      })
      .catch((err) => {
        setErrorMessage(
          err instanceof Error ? err.message : 'Unable to auto-create Process Documentation draft.'
        );
      })
      .finally(() => {
        autoCreatingRef.current.delete(selectedArea.id);
        setAutoCreatingAreaId((curr) => (curr === selectedArea.id ? null : curr));
      });
  }, [selectedArea, selectedDoc, canWrite, onCreateProcess]);

  // Sync draft automatically when switching selected area or receiving remote Firestore updates while not editing
  useEffect(() => {
    if (!selectedDoc) {
      setDraft(null);
      setEditing(false);
      return;
    }
    if (!editing) {
      setDraft(toEditableDraft(selectedDoc));
    }
  }, [selectedDoc, editing]);

  const filteredAreas = useMemo(() => {
    return auditAreas.filter((area) => {
      if (domainFilter !== 'ALL' && area.domain !== domainFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const linkedProc = findProcessDocForArea(area, processDocs);
        const hay = `${area.areaCode} ${area.name} ${area.domain} ${area.entityName} ${linkedProc?.processCode || ''} ${linkedProc?.processName || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [auditAreas, processDocs, domainFilter, searchTerm]);

  const linkedObservationsCount = useMemo(() => {
    if (!selectedArea) return 0;
    return observations.filter((o) => o.areaId === selectedArea.id).length;
  }, [observations, selectedArea]);

  const handleGenerateProcessDocumentation = async () => {
    if (!selectedArea || !canWrite) return;
    setErrorMessage('');
    setSaveMessage('');
    manuallyDeletedAreaIdsRef.current.delete(selectedArea.id);
    setAutoCreatingAreaId(selectedArea.id);
    try {
      const autoDraft = buildAutoDraftFromArea(selectedArea);
      await onCreateProcess(autoDraft);
      setEditing(true);
      setSaveMessage(
        `Draft Process Documentation generated from ${selectedArea.areaCode} - ${selectedArea.name}.`
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to generate Process Documentation.'
      );
    } finally {
      setAutoCreatingAreaId(null);
    }
  };

  const handleSave = async () => {
    if (!selectedDoc || !draft || !selectedArea || !canWrite) return;
    setSaving(true);
    setErrorMessage('');
    setSaveMessage('');
    try {
      const nextPayload: ProcessDocumentationInput = {
        ...draft,
        linkedAreaId: selectedArea.id,
        linkedAreaName: selectedArea.name,
      };
      await onUpdateProcess(selectedDoc.id, nextPayload);
      setEditing(false);
      setSaveMessage(
        `Saved to Firestore and synchronized context to Risk Assessment, Control Matrix, Audit Procedures, Findings Library, and Recommendations Library for ${selectedArea.areaCode}.`
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save process documentation.');
    } finally {
      setSaving(false);
    }
  };

  const handleAttachmentUpload = async (files: FileList | null) => {
    if (!files || !draft) return;
    setErrorMessage('');

    const currentTotalChars = draft.attachments.reduce((acc, a) => acc + (a.dataUrl?.length || 0), 0);
    let runningTotal = currentTotalChars;
    const added: ProcessAttachmentItem[] = [];

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      if (draft.attachments.length + added.length >= 10) {
        setErrorMessage('Maximum of 10 attachments per process record.');
        break;
      }

      const lower = file.name.toLowerCase();
      let fileType: ProcessAttachmentKind | null = null;
      if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
        fileType = 'pdf';
      } else if (
        lower.endsWith('.docx') ||
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        fileType = 'docx';
      } else if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(lower)) {
        fileType = 'image';
      }

      if (!fileType) {
        setErrorMessage(`Unsupported file "${file.name}". Please upload PDF, DOCX, or Image files.`);
        continue;
      }

      let dataUrl = '';
      try {
        if (fileType === 'image') {
          dataUrl = await compressImageToDataUrl(file);
        } else {
          if (file.size > 190 * 1024) {
            setErrorMessage(
              `"${file.name}" (${formatBytes(file.size)}) exceeds the 190 KB Firestore document attachment cap. Please upload a smaller PDF/DOCX or link its reference.`
            );
            continue;
          }
          dataUrl = await readFileAsDataUrl(file);
        }
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : `Failed to process "${file.name}".`);
        continue;
      }

      if (dataUrl.length > 260000 || runningTotal + dataUrl.length > MAX_TOTAL_ATTACHMENT_DATA_CHARS) {
        setErrorMessage(
          `Adding "${file.name}" would exceed the per-record Firestore sync storage limit (480 KB total attachments).`
        );
        continue;
      }

      runningTotal += dataUrl.length;
      added.push({
        id: `att_${Date.now().toString(36)}_${i}`,
        fileName: file.name,
        fileType,
        mimeType: file.type || (fileType === 'pdf' ? 'application/pdf' : 'application/octet-stream'),
        sizeBytes: file.size,
        uploadedAt: new Date().toISOString(),
        dataUrl,
        notes: '',
      });
    }

    if (added.length > 0) {
      setDraft({
        ...draft,
        attachments: [...draft.attachments, ...added],
      });
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRunAi = async (action: (typeof AI_ACTIONS)[number]) => {
    if (!selectedDoc || !selectedArea || !canWrite) return;
    setErrorMessage('');
    setAiFeedback(null);
    setRunningAiAction(action.type);
    try {
      // Persist unsaved draft edits first if user is currently editing
      let docForAi = selectedDoc;
      if (editing && draft) {
        const nextPayload: ProcessDocumentationInput = {
          ...draft,
          linkedAreaId: selectedArea.id,
          linkedAreaName: selectedArea.name,
        };
        await onUpdateProcess(selectedDoc.id, nextPayload);
        docForAi = { ...selectedDoc, ...nextPayload };
        setEditing(false);
      }

      const summaryMsg = await onRunAiAction(docForAi, action.type);
      setAiFeedback({
        text: summaryMsg,
        tab: action.targetTab,
        areaId: selectedArea.id,
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'AI generation failed.');
    } finally {
      setRunningAiAction(null);
    }
  };

  const viewDoc = draft;
  const inheritedRiskRating = selectedArea?.intelligence?.riskRating || selectedArea?.inherentRiskTier || 'High';

  return (
    <div className="flex-1 flex flex-col lg:flex-row min-h-0">
      {/* Left Sidebar: 1:1 Audit Universe Process Explorer */}
      <aside className="w-full lg:w-80 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col shrink-0 no-print">
        <div className="p-4 border-b border-slate-200 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold text-slate-900 tracking-wide">
              Audit Universe Processes ({auditAreas.length})
            </h2>
            <span className="text-[11px] font-mono tabular-nums text-slate-500">
              1:1 Linked
            </span>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search area code, name, process..."
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
          {filteredAreas.length === 0 ? (
            <div className="p-5 text-xs text-slate-500">
              No Audit Universe areas match your filter.
            </div>
          ) : (
            filteredAreas.map((area) => {
              const isSelected = area.id === selectedArea?.id;
              const areaDoc = findProcessDocForArea(area, processDocs);
              const isAutoCreating = autoCreatingAreaId === area.id;
              const canDeleteDoc =
                Boolean(areaDoc) && (isAdmin || (canWrite && areaDoc!.ownerId === currentUserId));

              return (
                <div
                  key={area.id}
                  onClick={() => {
                    onSelectArea(area.id);
                    setEditing(false);
                    setSaveMessage('');
                    setErrorMessage('');
                    setAiFeedback(null);
                  }}
                  className={`group px-4 py-3 cursor-pointer transition-colors ${
                    isSelected ? 'bg-slate-100/90' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span className="font-mono tabular-nums font-medium text-slate-700">
                      {area.areaCode}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {isAutoCreating ? (
                        <Loader2 className="w-3 h-3 animate-spin text-blue-900" />
                      ) : areaDoc ? (
                        <span
                          className={`font-medium ${
                            areaDoc.status === 'Active'
                              ? 'text-emerald-700'
                              : areaDoc.status === 'Under Review'
                                ? 'text-amber-700'
                                : 'text-blue-900'
                          }`}
                        >
                          {areaDoc.status}
                        </span>
                      ) : (
                        <span className="text-slate-400">No Draft</span>
                      )}
                      {canDeleteDoc && areaDoc && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            manuallyDeletedAreaIdsRef.current.add(area.id);
                            void onDeleteProcess(areaDoc.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-red-600 transition-opacity"
                          title="Delete process record"
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
      </aside>

      {/* Main Process Documentation Viewport */}
      <main className="flex-1 min-w-0 overflow-y-auto p-6">
        {!selectedArea ? (
          <div className="max-w-2xl mx-auto mt-10 bg-white border border-slate-200 rounded-lg p-8 space-y-4">
            <h1 className="text-xl font-bold text-slate-900">
              Select or Upload an Audit Universe Area
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Process Documentation follows a 1:1 relationship with your Audit Universe. Upload or load an Audit Universe area first to automatically create and link its Process Documentation.
            </p>
          </div>
        ) : !selectedDoc || !viewDoc ? (
          <div className="max-w-2xl mx-auto mt-10 bg-white border border-slate-200 rounded-lg p-8 space-y-5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 border border-blue-200 text-xs text-blue-950">
              <Link2 className="w-3.5 h-3.5 text-blue-900 shrink-0" />
              <span className="font-medium">Linked to:</span>
              <span className="font-semibold">
                {selectedArea.areaCode} - {selectedArea.name}
              </span>
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-slate-900">
                {autoCreatingAreaId === selectedArea.id
                  ? 'Creating Draft Process Documentation...'
                  : 'Process Documentation Pending'}
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed">
                Inherited from <span className="font-semibold">{selectedArea.areaCode} · {selectedArea.name}</span> ({selectedArea.domain} · {selectedArea.entityName} · Risk: {inheritedRiskRating} · Last Audit: {selectedArea.lastAuditDate || 'Not yet audited'}).
              </p>
            </div>

            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-xs text-red-800">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {canWrite && (
              <button
                type="button"
                disabled={autoCreatingAreaId === selectedArea.id}
                onClick={handleGenerateProcessDocumentation}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800 disabled:opacity-50"
              >
                {autoCreatingAreaId === selectedArea.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>
                  {autoCreatingAreaId === selectedArea.id
                    ? 'Generating Draft...'
                    : 'Generate Process Documentation'}
                </span>
              </button>
            )}
          </div>
        ) : (
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Top Header & Actions */}
            <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
              {/* Reference Linkage Badge (Requirement 8) */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 border border-blue-200 text-xs text-blue-950">
                  <Link2 className="w-3.5 h-3.5 text-blue-900 shrink-0" />
                  <span className="font-medium">Linked to:</span>
                  <span className="font-semibold">
                    {selectedArea.areaCode} - {selectedArea.name}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 tabular-nums">
                  {selectedArea.intelligence ? 'AI Intelligence Synced' : 'Process Context Ready'} ·{' '}
                  {linkedObservationsCount} Field Observation(s)
                </span>
              </div>

              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono font-medium text-slate-700">
                      {viewDoc.processCode}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{viewDoc.domain}</span>
                    <span aria-hidden="true">·</span>
                    <span>{viewDoc.entityName}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{viewDoc.version}</span>
                    <span aria-hidden="true">·</span>
                    <span>Effective {viewDoc.effectiveDate}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium text-slate-700">{viewDoc.status}</span>
                  </div>
                  <h1 className="text-xl font-bold text-slate-900">
                    {viewDoc.processName}
                  </h1>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <RiskIndicator rating={inheritedRiskRating} />
                  {canWrite && (
                    !editing ? (
                      <button
                        type="button"
                        onClick={() => {
                          setDraft(toEditableDraft(selectedDoc));
                          setEditing(true);
                          setSaveMessage('');
                          setErrorMessage('');
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Edit Process Doc
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setDraft(toEditableDraft(selectedDoc));
                            setEditing(false);
                            setErrorMessage('');
                          }}
                          className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={handleSave}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                        >
                          {saving ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Save className="w-3.5 h-3.5" />
                          )}
                          {saving ? 'Syncing...' : 'Save & Sync Modules'}
                        </button>
                      </>
                    )
                  )}
                </div>
              </div>

              {/* Linked Audit Modules Pipeline Strip */}
              <div className="pt-4 border-t border-slate-100 space-y-2.5">
                <p className="text-xs font-medium text-slate-700">
                  Downstream Synchronized Audit Modules (1:1 Workflow Chain):
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {LINKED_MODULES.map((m) => (
                    <button
                      key={m.label}
                      type="button"
                      onClick={() => onNavigateToModule(selectedArea.id, m.tab)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 hover:text-blue-900 transition-colors whitespace-nowrap shrink-0"
                    >
                      <span>{m.label}</span>
                      <ExternalLink className="w-3 h-3 text-slate-400" />
                    </button>
                  ))}
                </div>
              </div>

              {/* 6 AI Generation Functions */}
              {canWrite && (
                <div className="pt-4 border-t border-slate-100 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                      <Sparkles className="w-3.5 h-3.5 text-blue-900" />
                      AI Audit Intelligence Generators (Synced to {selectedArea.areaCode})
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {AI_ACTIONS.map((act) => {
                      const busy = runningAiAction === act.type;
                      return (
                        <button
                          key={act.type}
                          type="button"
                          disabled={Boolean(runningAiAction)}
                          onClick={() => handleRunAi(act)}
                          className="inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-md hover:border-blue-900 hover:text-blue-900 disabled:opacity-50 transition-colors whitespace-nowrap"
                        >
                          {busy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-900" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5 text-blue-900" />
                          )}
                          <span>{busy ? 'Generating...' : act.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Feedback Banners */}
              {saveMessage && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md flex items-center gap-2 text-xs text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{saveMessage}</span>
                </div>
              )}
              {aiFeedback && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-md flex flex-wrap items-center justify-between gap-3 text-xs text-blue-950">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-900 shrink-0" />
                    <span>{aiFeedback.text}</span>
                  </div>
                  {aiFeedback.areaId && aiFeedback.tab && (
                    <button
                      type="button"
                      onClick={() => onNavigateToModule(aiFeedback.areaId!, aiFeedback.tab!)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-blue-900 rounded hover:bg-blue-800 whitespace-nowrap shrink-0"
                    >
                      Open {aiFeedback.tab}
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
              {errorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-xs text-red-800">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>

            {/* 01. Process Information */}
            <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
              <h2 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-3">
                01. Process Information
              </h2>

              {/* Inherited Audit Universe Metadata (Requirement 1) */}
              <div className="bg-slate-50 border border-slate-200 rounded-md p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-xs">
                <div>
                  <p className="text-slate-500">Audit Area Code</p>
                  <p className="font-mono font-semibold text-slate-900 mt-0.5">{selectedArea.areaCode}</p>
                </div>
                <div className="col-span-2 md:col-span-1 lg:col-span-1">
                  <p className="text-slate-500">Audit Area Name</p>
                  <p className="font-semibold text-slate-900 mt-0.5 line-clamp-2">{selectedArea.name}</p>
                </div>
                <div>
                  <p className="text-slate-500">Audit Domain</p>
                  <p className="font-medium text-slate-900 mt-0.5">{selectedArea.domain}</p>
                </div>
                <div>
                  <p className="text-slate-500">Entity / Business Unit</p>
                  <p className="font-medium text-slate-900 mt-0.5">{selectedArea.entityName}</p>
                </div>
                <div>
                  <p className="text-slate-500">Risk Rating</p>
                  <div className="mt-0.5">
                    <RiskIndicator rating={inheritedRiskRating} />
                  </div>
                </div>
                <div>
                  <p className="text-slate-500">Last Audit Information</p>
                  <p className="font-mono tabular-nums text-slate-900 mt-0.5">
                    {selectedArea.lastAuditDate || 'Not yet audited'}
                  </p>
                </div>
              </div>

              {editing ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Process Code</label>
                    <input
                      type="text"
                      value={viewDoc.processCode}
                      onChange={(e) => setDraft({ ...viewDoc, processCode: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs font-mono border border-slate-200 rounded-md"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Process Name</label>
                    <input
                      type="text"
                      value={viewDoc.processName}
                      onChange={(e) => setDraft({ ...viewDoc, processName: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                    <select
                      value={viewDoc.status}
                      onChange={(e) => setDraft({ ...viewDoc, status: e.target.value as ProcessDocStatus })}
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
                    >
                      <option value="Draft">Draft</option>
                      <option value="Active">Active</option>
                      <option value="Under Review">Under Review</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Audit Domain</label>
                    <select
                      value={viewDoc.domain}
                      onChange={(e) => setDraft({ ...viewDoc, domain: e.target.value as AuditDomain })}
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
                    >
                      {AUDIT_DOMAINS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Entity / Business Unit</label>
                    <input
                      type="text"
                      value={viewDoc.entityName}
                      onChange={(e) => setDraft({ ...viewDoc, entityName: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Version & Effective Date</label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={viewDoc.version}
                        onChange={(e) => setDraft({ ...viewDoc, version: e.target.value })}
                        placeholder="v1.0"
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-md"
                      />
                      <input
                        type="date"
                        value={viewDoc.effectiveDate}
                        onChange={(e) => setDraft({ ...viewDoc, effectiveDate: e.target.value })}
                        className="w-full px-2 py-1.5 text-xs font-mono border border-slate-200 rounded-md"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Auto-Linked Audit Area</label>
                    <div className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700 truncate">
                      {selectedArea.areaCode} - {selectedArea.name}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div>
                    <p className="text-slate-500">Process Code</p>
                    <p className="font-mono font-semibold text-slate-900 mt-0.5">{viewDoc.processCode}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Process Domain</p>
                    <p className="font-medium text-slate-900 mt-0.5">{viewDoc.domain}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Process Entity / Unit</p>
                    <p className="font-medium text-slate-900 mt-0.5">{viewDoc.entityName}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Version / Effective</p>
                    <p className="font-mono tabular-nums text-slate-900 mt-0.5">
                      {viewDoc.version} · {viewDoc.effectiveDate}
                    </p>
                  </div>
                </div>
              )}
            </section>

            {/* 02. Process Objective & 03. Scope */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-3">
                <h2 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-3">
                  02. Process Objective
                </h2>
                {editing ? (
                  <textarea
                    rows={5}
                    value={viewDoc.processObjective}
                    onChange={(e) => setDraft({ ...viewDoc, processObjective: e.target.value })}
                    className="w-full px-3 py-2 text-xs leading-relaxed border border-slate-200 rounded-md"
                  />
                ) : (
                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                    {viewDoc.processObjective}
                  </p>
                )}
              </section>

              <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-3">
                <h2 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-3">
                  03. Scope
                </h2>
                {editing ? (
                  <textarea
                    rows={5}
                    value={viewDoc.scope}
                    onChange={(e) => setDraft({ ...viewDoc, scope: e.target.value })}
                    className="w-full px-3 py-2 text-xs leading-relaxed border border-slate-200 rounded-md"
                  />
                ) : (
                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                    {viewDoc.scope}
                  </p>
                )}
              </section>
            </div>

            {/* 04. Process Flow (Flowchart + Narrative) */}
            <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
              <h2 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-3">
                04. Process Flow (Interactive Flowchart & Narrative)
              </h2>

              <ProcessFlowchart
                nodes={viewDoc.flowchartNodes}
                editing={editing}
                onChange={(nextNodes) => setDraft({ ...viewDoc, flowchartNodes: nextNodes })}
                processSteps={viewDoc.processSteps}
                processName={viewDoc.processName}
                domain={viewDoc.domain}
                processFlowNarrative={viewDoc.processFlowNarrative}
              />

              <div className="pt-2 space-y-1.5">
                <p className="text-xs font-medium text-slate-700">Process Flow Narrative</p>
                {editing ? (
                  <textarea
                    rows={4}
                    value={viewDoc.processFlowNarrative}
                    onChange={(e) => setDraft({ ...viewDoc, processFlowNarrative: e.target.value })}
                    placeholder="Describe end-to-end flow handoffs, decision thresholds, and exception paths..."
                    className="w-full px-3 py-2 text-xs leading-relaxed border border-slate-200 rounded-md"
                  />
                ) : (
                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                    {viewDoc.processFlowNarrative || 'No additional text narrative recorded.'}
                  </p>
                )}
              </div>
            </section>

            {/* 05. Process Steps */}
            <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <h2 className="text-sm font-semibold text-slate-900">
                  05. Process Steps ({viewDoc.processSteps.length})
                </h2>
                {editing && (
                  <button
                    type="button"
                    onClick={() => {
                      const next: ProcessStepItem = {
                        id: `step_${Date.now().toString(36)}`,
                        stepNo: `${viewDoc.processSteps.length + 1}.0`,
                        stepTitle: 'New Process Step',
                        description: '',
                        actorRole: 'Process Owner',
                        systemUsed: '',
                        inputDoc: '',
                        outputDoc: '',
                        slaOrFrequency: '',
                      };
                      setDraft({ ...viewDoc, processSteps: [...viewDoc.processSteps, next] });
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-900 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Step
                  </button>
                )}
              </div>

              {viewDoc.processSteps.length === 0 ? (
                <p className="text-xs text-slate-500">No process steps documented yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-medium">
                        <th className="py-2 pr-3">Step</th>
                        <th className="py-2 pr-3">Activity & Description</th>
                        <th className="py-2 pr-3">Actor / Role</th>
                        <th className="py-2 pr-3">System</th>
                        <th className="py-2 pr-3">Input / Output</th>
                        <th className="py-2">SLA / Freq</th>
                        {editing && <th className="py-2 w-8" />}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {viewDoc.processSteps.map((step) => (
                        <tr key={step.id} className="align-top">
                          <td className="py-2.5 pr-3 font-mono tabular-nums font-medium text-slate-800 whitespace-nowrap">
                            {editing ? (
                              <input
                                type="text"
                                value={step.stepNo}
                                onChange={(e) =>
                                  setDraft({
                                    ...viewDoc,
                                    processSteps: viewDoc.processSteps.map((s) =>
                                      s.id === step.id ? { ...s, stepNo: e.target.value } : s
                                    ),
                                  })
                                }
                                className="w-14 px-2 py-1 border border-slate-200 rounded font-mono text-xs"
                              />
                            ) : (
                              step.stepNo
                            )}
                          </td>
                          <td className="py-2.5 pr-3 min-w-[220px]">
                            {editing ? (
                              <div className="space-y-1.5">
                                <input
                                  type="text"
                                  value={step.stepTitle}
                                  onChange={(e) =>
                                    setDraft({
                                      ...viewDoc,
                                      processSteps: viewDoc.processSteps.map((s) =>
                                        s.id === step.id ? { ...s, stepTitle: e.target.value } : s
                                      ),
                                    })
                                  }
                                  placeholder="Step title"
                                  className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-medium"
                                />
                                <textarea
                                  rows={2}
                                  value={step.description}
                                  onChange={(e) =>
                                    setDraft({
                                      ...viewDoc,
                                      processSteps: viewDoc.processSteps.map((s) =>
                                        s.id === step.id ? { ...s, description: e.target.value } : s
                                      ),
                                    })
                                  }
                                  placeholder="Detailed step narrative"
                                  className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                                />
                              </div>
                            ) : (
                              <>
                                <p className="font-semibold text-slate-900">{step.stepTitle}</p>
                                <p className="text-slate-600 mt-0.5">{step.description}</p>
                              </>
                            )}
                          </td>
                          <td className="py-2.5 pr-3">
                            {editing ? (
                              <input
                                type="text"
                                value={step.actorRole}
                                onChange={(e) =>
                                  setDraft({
                                    ...viewDoc,
                                    processSteps: viewDoc.processSteps.map((s) =>
                                      s.id === step.id ? { ...s, actorRole: e.target.value } : s
                                    ),
                                  })
                                }
                                className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                              />
                            ) : (
                              step.actorRole
                            )}
                          </td>
                          <td className="py-2.5 pr-3">
                            {editing ? (
                              <input
                                type="text"
                                value={step.systemUsed}
                                onChange={(e) =>
                                  setDraft({
                                    ...viewDoc,
                                    processSteps: viewDoc.processSteps.map((s) =>
                                      s.id === step.id ? { ...s, systemUsed: e.target.value } : s
                                    ),
                                  })
                                }
                                className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                              />
                            ) : (
                              step.systemUsed || '—'
                            )}
                          </td>
                          <td className="py-2.5 pr-3">
                            {editing ? (
                              <div className="space-y-1">
                                <input
                                  type="text"
                                  value={step.inputDoc}
                                  onChange={(e) =>
                                    setDraft({
                                      ...viewDoc,
                                      processSteps: viewDoc.processSteps.map((s) =>
                                        s.id === step.id ? { ...s, inputDoc: e.target.value } : s
                                      ),
                                    })
                                  }
                                  placeholder="Input doc"
                                  className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                                />
                                <input
                                  type="text"
                                  value={step.outputDoc}
                                  onChange={(e) =>
                                    setDraft({
                                      ...viewDoc,
                                      processSteps: viewDoc.processSteps.map((s) =>
                                        s.id === step.id ? { ...s, outputDoc: e.target.value } : s
                                      ),
                                    })
                                  }
                                  placeholder="Output doc"
                                  className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                                />
                              </div>
                            ) : (
                              <span className="text-slate-600">
                                {step.inputDoc || '—'} → {step.outputDoc || '—'}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5">
                            {editing ? (
                              <input
                                type="text"
                                value={step.slaOrFrequency}
                                onChange={(e) =>
                                  setDraft({
                                    ...viewDoc,
                                    processSteps: viewDoc.processSteps.map((s) =>
                                      s.id === step.id ? { ...s, slaOrFrequency: e.target.value } : s
                                    ),
                                  })
                                }
                                className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                              />
                            ) : (
                              step.slaOrFrequency || '—'
                            )}
                          </td>
                          {editing && (
                            <td className="py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  setDraft({
                                    ...viewDoc,
                                    processSteps: viewDoc.processSteps.filter((s) => s.id !== step.id),
                                  })
                                }
                                className="p-1 text-slate-400 hover:text-red-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* 06. Process Owner */}
            <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
              <h2 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-3">
                06. Process Owner
              </h2>
              {editing ? (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Owner Full Name</label>
                    <input
                      type="text"
                      value={viewDoc.processOwner.ownerName}
                      onChange={(e) =>
                        setDraft({
                          ...viewDoc,
                          processOwner: { ...viewDoc.processOwner, ownerName: e.target.value },
                        })
                      }
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Role / Title</label>
                    <input
                      type="text"
                      value={viewDoc.processOwner.ownerRole}
                      onChange={(e) =>
                        setDraft({
                          ...viewDoc,
                          processOwner: { ...viewDoc.processOwner, ownerRole: e.target.value },
                        })
                      }
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Department</label>
                    <input
                      type="text"
                      value={viewDoc.processOwner.department}
                      onChange={(e) =>
                        setDraft({
                          ...viewDoc,
                          processOwner: { ...viewDoc.processOwner, department: e.target.value },
                        })
                      }
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Backup / Delegate Owner</label>
                    <input
                      type="text"
                      value={viewDoc.processOwner.backupOwner}
                      onChange={(e) =>
                        setDraft({
                          ...viewDoc,
                          processOwner: { ...viewDoc.processOwner, backupOwner: e.target.value },
                        })
                      }
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div>
                    <p className="text-slate-500">Primary Owner</p>
                    <p className="font-semibold text-slate-900 mt-0.5">{viewDoc.processOwner.ownerName}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Role / Title</p>
                    <p className="font-medium text-slate-900 mt-0.5">{viewDoc.processOwner.ownerRole}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Department</p>
                    <p className="font-medium text-slate-900 mt-0.5">{viewDoc.processOwner.department}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Backup Owner</p>
                    <p className="font-medium text-slate-900 mt-0.5">{viewDoc.processOwner.backupOwner || '—'}</p>
                  </div>
                </div>
              )}
            </section>

            {/* 07. Documents Used & 08. Systems Used */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <h2 className="text-sm font-semibold text-slate-900">
                    07. Documents Used ({viewDoc.documentsUsed.length})
                  </h2>
                  {editing && (
                    <button
                      type="button"
                      onClick={() => {
                        const next: ProcessDocumentItem = {
                          id: `doc_${Date.now().toString(36)}`,
                          docCode: `DOC-${viewDoc.documentsUsed.length + 1}`,
                          documentName: 'New Supporting Document',
                          docType: 'Control Form',
                          sourceSystem: 'ERP',
                          retentionPeriod: '5 Years',
                        };
                        setDraft({ ...viewDoc, documentsUsed: [...viewDoc.documentsUsed, next] });
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-900 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Document
                    </button>
                  )}
                </div>

                {viewDoc.documentsUsed.length === 0 ? (
                  <p className="text-xs text-slate-500">No documents listed yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 font-medium">
                          <th className="py-2 pr-2">Code</th>
                          <th className="py-2 pr-2">Document</th>
                          <th className="py-2 pr-2">Type / Source</th>
                          <th className="py-2">Retention</th>
                          {editing && <th className="py-2 w-7" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {viewDoc.documentsUsed.map((docRow) => (
                          <tr key={docRow.id} className="align-top">
                            <td className="py-2 pr-2 font-mono text-slate-800 whitespace-nowrap">
                              {editing ? (
                                <input
                                  type="text"
                                  value={docRow.docCode}
                                  onChange={(e) =>
                                    setDraft({
                                      ...viewDoc,
                                      documentsUsed: viewDoc.documentsUsed.map((d) =>
                                        d.id === docRow.id ? { ...d, docCode: e.target.value } : d
                                      ),
                                    })
                                  }
                                  className="w-20 px-1.5 py-1 border border-slate-200 rounded font-mono text-xs"
                                />
                              ) : (
                                docRow.docCode
                              )}
                            </td>
                            <td className="py-2 pr-2">
                              {editing ? (
                                <input
                                  type="text"
                                  value={docRow.documentName}
                                  onChange={(e) =>
                                    setDraft({
                                      ...viewDoc,
                                      documentsUsed: viewDoc.documentsUsed.map((d) =>
                                        d.id === docRow.id ? { ...d, documentName: e.target.value } : d
                                      ),
                                    })
                                  }
                                  className="w-full px-1.5 py-1 border border-slate-200 rounded text-xs"
                                />
                              ) : (
                                <span className="font-medium text-slate-900">{docRow.documentName}</span>
                              )}
                            </td>
                            <td className="py-2 pr-2 text-slate-600">
                              {editing ? (
                                <div className="space-y-1">
                                  <input
                                    type="text"
                                    value={docRow.docType}
                                    onChange={(e) =>
                                      setDraft({
                                        ...viewDoc,
                                        documentsUsed: viewDoc.documentsUsed.map((d) =>
                                          d.id === docRow.id ? { ...d, docType: e.target.value } : d
                                        ),
                                      })
                                    }
                                    placeholder="Type"
                                    className="w-full px-1.5 py-1 border border-slate-200 rounded text-xs"
                                  />
                                  <input
                                    type="text"
                                    value={docRow.sourceSystem}
                                    onChange={(e) =>
                                      setDraft({
                                        ...viewDoc,
                                        documentsUsed: viewDoc.documentsUsed.map((d) =>
                                          d.id === docRow.id ? { ...d, sourceSystem: e.target.value } : d
                                        ),
                                      })
                                    }
                                    placeholder="Source"
                                    className="w-full px-1.5 py-1 border border-slate-200 rounded text-xs"
                                  />
                                </div>
                              ) : (
                                `${docRow.docType} · ${docRow.sourceSystem}`
                              )}
                            </td>
                            <td className="py-2 text-slate-700 whitespace-nowrap">
                              {editing ? (
                                <input
                                  type="text"
                                  value={docRow.retentionPeriod}
                                  onChange={(e) =>
                                    setDraft({
                                      ...viewDoc,
                                      documentsUsed: viewDoc.documentsUsed.map((d) =>
                                        d.id === docRow.id ? { ...d, retentionPeriod: e.target.value } : d
                                      ),
                                    })
                                  }
                                  className="w-24 px-1.5 py-1 border border-slate-200 rounded text-xs"
                                />
                              ) : (
                                docRow.retentionPeriod
                              )}
                            </td>
                            {editing && (
                              <td className="py-2 text-right">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDraft({
                                      ...viewDoc,
                                      documentsUsed: viewDoc.documentsUsed.filter((d) => d.id !== docRow.id),
                                    })
                                  }
                                  className="p-1 text-slate-400 hover:text-red-600"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <h2 className="text-sm font-semibold text-slate-900">
                    08. Systems Used ({viewDoc.systemsUsed.length})
                  </h2>
                  {editing && (
                    <button
                      type="button"
                      onClick={() => {
                        const next: ProcessSystemItem = {
                          id: `sys_${Date.now().toString(36)}`,
                          systemName: 'Enterprise System',
                          moduleName: 'Core Module',
                          accessControlOwner: 'IT Governance',
                          interfaceType: 'RBAC',
                        };
                        setDraft({ ...viewDoc, systemsUsed: [...viewDoc.systemsUsed, next] });
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-900 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add System
                    </button>
                  )}
                </div>

                {viewDoc.systemsUsed.length === 0 ? (
                  <p className="text-xs text-slate-500">No IT systems listed yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 font-medium">
                          <th className="py-2 pr-2">System</th>
                          <th className="py-2 pr-2">Module</th>
                          <th className="py-2 pr-2">Access Owner</th>
                          <th className="py-2">Control / Auth</th>
                          {editing && <th className="py-2 w-7" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {viewDoc.systemsUsed.map((sysRow) => (
                          <tr key={sysRow.id} className="align-top">
                            <td className="py-2 pr-2 font-medium text-slate-900">
                              {editing ? (
                                <input
                                  type="text"
                                  value={sysRow.systemName}
                                  onChange={(e) =>
                                    setDraft({
                                      ...viewDoc,
                                      systemsUsed: viewDoc.systemsUsed.map((s) =>
                                        s.id === sysRow.id ? { ...s, systemName: e.target.value } : s
                                      ),
                                    })
                                  }
                                  className="w-full px-1.5 py-1 border border-slate-200 rounded text-xs"
                                />
                              ) : (
                                sysRow.systemName
                              )}
                            </td>
                            <td className="py-2 pr-2 text-slate-600">
                              {editing ? (
                                <input
                                  type="text"
                                  value={sysRow.moduleName}
                                  onChange={(e) =>
                                    setDraft({
                                      ...viewDoc,
                                      systemsUsed: viewDoc.systemsUsed.map((s) =>
                                        s.id === sysRow.id ? { ...s, moduleName: e.target.value } : s
                                      ),
                                    })
                                  }
                                  className="w-full px-1.5 py-1 border border-slate-200 rounded text-xs"
                                />
                              ) : (
                                sysRow.moduleName || '—'
                              )}
                            </td>
                            <td className="py-2 pr-2 text-slate-600">
                              {editing ? (
                                <input
                                  type="text"
                                  value={sysRow.accessControlOwner}
                                  onChange={(e) =>
                                    setDraft({
                                      ...viewDoc,
                                      systemsUsed: viewDoc.systemsUsed.map((s) =>
                                        s.id === sysRow.id ? { ...s, accessControlOwner: e.target.value } : s
                                      ),
                                    })
                                  }
                                  className="w-full px-1.5 py-1 border border-slate-200 rounded text-xs"
                                />
                              ) : (
                                sysRow.accessControlOwner
                              )}
                            </td>
                            <td className="py-2 text-slate-600">
                              {editing ? (
                                <input
                                  type="text"
                                  value={sysRow.interfaceType}
                                  onChange={(e) =>
                                    setDraft({
                                      ...viewDoc,
                                      systemsUsed: viewDoc.systemsUsed.map((s) =>
                                        s.id === sysRow.id ? { ...s, interfaceType: e.target.value } : s
                                      ),
                                    })
                                  }
                                  className="w-full px-1.5 py-1 border border-slate-200 rounded text-xs"
                                />
                              ) : (
                                sysRow.interfaceType
                              )}
                            </td>
                            {editing && (
                              <td className="py-2 text-right">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDraft({
                                      ...viewDoc,
                                      systemsUsed: viewDoc.systemsUsed.filter((s) => s.id !== sysRow.id),
                                    })
                                  }
                                  className="p-1 text-slate-400 hover:text-red-600"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>

            {/* 09. Risks */}
            <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <h2 className="text-sm font-semibold text-slate-900">
                  09. Process Risks ({viewDoc.risks.length})
                </h2>
                {editing && (
                  <button
                    type="button"
                    onClick={() => {
                      const next: ProcessRiskItem = {
                        id: `pr_${Date.now().toString(36)}`,
                        riskCode: `PR-${String(viewDoc.risks.length + 1).padStart(2, '0')}`,
                        title: 'New Process Risk',
                        description: '',
                        likelihood: 3,
                        impact: 4,
                        riskRating: 'High',
                        regulatoryRef: 'IIA IPPF / Corporate SOP',
                      };
                      setDraft({ ...viewDoc, risks: [...viewDoc.risks, next] });
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-900 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Risk
                  </button>
                )}
              </div>

              {viewDoc.risks.length === 0 ? (
                <p className="text-xs text-slate-500">No process risks documented yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-medium">
                        <th className="py-2 pr-3">Code</th>
                        <th className="py-2 pr-3">Risk Title & Description</th>
                        <th className="py-2 pr-3">L × I</th>
                        <th className="py-2 pr-3">Rating</th>
                        <th className="py-2">Regulatory Reference</th>
                        {editing && <th className="py-2 w-8" />}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {viewDoc.risks.map((riskRow) => (
                        <tr key={riskRow.id} className="align-top">
                          <td className="py-2.5 pr-3 font-mono font-medium text-slate-800 whitespace-nowrap">
                            {editing ? (
                              <input
                                type="text"
                                value={riskRow.riskCode}
                                onChange={(e) =>
                                  setDraft({
                                    ...viewDoc,
                                    risks: viewDoc.risks.map((r) =>
                                      r.id === riskRow.id ? { ...r, riskCode: e.target.value } : r
                                    ),
                                  })
                                }
                                className="w-20 px-2 py-1 border border-slate-200 rounded font-mono text-xs"
                              />
                            ) : (
                              riskRow.riskCode
                            )}
                          </td>
                          <td className="py-2.5 pr-3 min-w-[240px]">
                            {editing ? (
                              <div className="space-y-1">
                                <input
                                  type="text"
                                  value={riskRow.title}
                                  onChange={(e) =>
                                    setDraft({
                                      ...viewDoc,
                                      risks: viewDoc.risks.map((r) =>
                                        r.id === riskRow.id ? { ...r, title: e.target.value } : r
                                      ),
                                    })
                                  }
                                  className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-medium"
                                />
                                <textarea
                                  rows={2}
                                  value={riskRow.description}
                                  onChange={(e) =>
                                    setDraft({
                                      ...viewDoc,
                                      risks: viewDoc.risks.map((r) =>
                                        r.id === riskRow.id ? { ...r, description: e.target.value } : r
                                      ),
                                    })
                                  }
                                  className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                                />
                              </div>
                            ) : (
                              <>
                                <p className="font-semibold text-slate-900">{riskRow.title}</p>
                                <p className="text-slate-600 mt-0.5">{riskRow.description}</p>
                              </>
                            )}
                          </td>
                          <td className="py-2.5 pr-3 font-mono tabular-nums whitespace-nowrap">
                            {editing ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min={1}
                                  max={5}
                                  value={riskRow.likelihood}
                                  onChange={(e) =>
                                    setDraft({
                                      ...viewDoc,
                                      risks: viewDoc.risks.map((r) =>
                                        r.id === riskRow.id
                                          ? { ...r, likelihood: Number(e.target.value) || 3 }
                                          : r
                                      ),
                                    })
                                  }
                                  className="w-11 px-1.5 py-1 border border-slate-200 rounded font-mono text-xs"
                                />
                                <span>×</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={5}
                                  value={riskRow.impact}
                                  onChange={(e) =>
                                    setDraft({
                                      ...viewDoc,
                                      risks: viewDoc.risks.map((r) =>
                                        r.id === riskRow.id
                                          ? { ...r, impact: Number(e.target.value) || 4 }
                                          : r
                                      ),
                                    })
                                  }
                                  className="w-11 px-1.5 py-1 border border-slate-200 rounded font-mono text-xs"
                                />
                              </div>
                            ) : (
                              `${riskRow.likelihood} × ${riskRow.impact} (${riskRow.likelihood * riskRow.impact})`
                            )}
                          </td>
                          <td className="py-2.5 pr-3">
                            {editing ? (
                              <select
                                value={riskRow.riskRating}
                                onChange={(e) =>
                                  setDraft({
                                    ...viewDoc,
                                    risks: viewDoc.risks.map((r) =>
                                      r.id === riskRow.id
                                        ? { ...r, riskRating: e.target.value as RiskRating }
                                        : r
                                    ),
                                  })
                                }
                                className="px-2 py-1 border border-slate-200 rounded bg-white text-xs"
                              >
                                {RISK_RATINGS.map((r) => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <RiskIndicator rating={riskRow.riskRating} />
                            )}
                          </td>
                          <td className="py-2.5 text-slate-600">
                            {editing ? (
                              <input
                                type="text"
                                value={riskRow.regulatoryRef}
                                onChange={(e) =>
                                  setDraft({
                                    ...viewDoc,
                                    risks: viewDoc.risks.map((r) =>
                                      r.id === riskRow.id ? { ...r, regulatoryRef: e.target.value } : r
                                    ),
                                  })
                                }
                                className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                              />
                            ) : (
                              riskRow.regulatoryRef
                            )}
                          </td>
                          {editing && (
                            <td className="py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  setDraft({
                                    ...viewDoc,
                                    risks: viewDoc.risks.filter((r) => r.id !== riskRow.id),
                                  })
                                }
                                className="p-1 text-slate-400 hover:text-red-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* 10. Existing Controls */}
            <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <h2 className="text-sm font-semibold text-slate-900">
                  10. Existing Controls ({viewDoc.existingControls.length})
                </h2>
                {editing && (
                  <button
                    type="button"
                    onClick={() => {
                      const next: ProcessControlItem = {
                        id: `pc_${Date.now().toString(36)}`,
                        controlCode: `PC-${String(viewDoc.existingControls.length + 1).padStart(2, '0')}`,
                        controlName: 'New Control Activity',
                        description: '',
                        controlOwner: viewDoc.processOwner.ownerRole || 'Process Owner',
                        frequency: 'Per Transaction',
                        controlType: 'Preventive',
                        automation: 'Manual',
                        mappedRiskCode: viewDoc.risks[0]?.riskCode || 'PR-01',
                      };
                      setDraft({
                        ...viewDoc,
                        existingControls: [...viewDoc.existingControls, next],
                      });
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-900 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Control
                  </button>
                )}
              </div>

              {viewDoc.existingControls.length === 0 ? (
                <p className="text-xs text-slate-500">No existing controls documented yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-medium">
                        <th className="py-2 pr-3">Code</th>
                        <th className="py-2 pr-3">Control Activity</th>
                        <th className="py-2 pr-3">Owner & Frequency</th>
                        <th className="py-2 pr-3">Type & Nature</th>
                        <th className="py-2">Risk Ref</th>
                        {editing && <th className="py-2 w-8" />}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {viewDoc.existingControls.map((ctrl) => (
                        <tr key={ctrl.id} className="align-top">
                          <td className="py-2.5 pr-3 font-mono font-medium text-slate-800 whitespace-nowrap">
                            {editing ? (
                              <input
                                type="text"
                                value={ctrl.controlCode}
                                onChange={(e) =>
                                  setDraft({
                                    ...viewDoc,
                                    existingControls: viewDoc.existingControls.map((c) =>
                                      c.id === ctrl.id ? { ...c, controlCode: e.target.value } : c
                                    ),
                                  })
                                }
                                className="w-20 px-2 py-1 border border-slate-200 rounded font-mono text-xs"
                              />
                            ) : (
                              ctrl.controlCode
                            )}
                          </td>
                          <td className="py-2.5 pr-3 min-w-[240px]">
                            {editing ? (
                              <div className="space-y-1">
                                <input
                                  type="text"
                                  value={ctrl.controlName}
                                  onChange={(e) =>
                                    setDraft({
                                      ...viewDoc,
                                      existingControls: viewDoc.existingControls.map((c) =>
                                        c.id === ctrl.id ? { ...c, controlName: e.target.value } : c
                                      ),
                                    })
                                  }
                                  className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-medium"
                                />
                                <textarea
                                  rows={2}
                                  value={ctrl.description}
                                  onChange={(e) =>
                                    setDraft({
                                      ...viewDoc,
                                      existingControls: viewDoc.existingControls.map((c) =>
                                        c.id === ctrl.id ? { ...c, description: e.target.value } : c
                                      ),
                                    })
                                  }
                                  className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                                />
                              </div>
                            ) : (
                              <>
                                <p className="font-semibold text-slate-900">{ctrl.controlName}</p>
                                <p className="text-slate-600 mt-0.5">{ctrl.description}</p>
                              </>
                            )}
                          </td>
                          <td className="py-2.5 pr-3">
                            {editing ? (
                              <div className="space-y-1">
                                <input
                                  type="text"
                                  value={ctrl.controlOwner}
                                  onChange={(e) =>
                                    setDraft({
                                      ...viewDoc,
                                      existingControls: viewDoc.existingControls.map((c) =>
                                        c.id === ctrl.id ? { ...c, controlOwner: e.target.value } : c
                                      ),
                                    })
                                  }
                                  placeholder="Owner"
                                  className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                                />
                                <input
                                  type="text"
                                  value={ctrl.frequency}
                                  onChange={(e) =>
                                    setDraft({
                                      ...viewDoc,
                                      existingControls: viewDoc.existingControls.map((c) =>
                                        c.id === ctrl.id ? { ...c, frequency: e.target.value } : c
                                      ),
                                    })
                                  }
                                  placeholder="Frequency"
                                  className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                                />
                              </div>
                            ) : (
                              <span>
                                {ctrl.controlOwner} · {ctrl.frequency}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 pr-3">
                            {editing ? (
                              <div className="space-y-1">
                                <select
                                  value={ctrl.controlType}
                                  onChange={(e) =>
                                    setDraft({
                                      ...viewDoc,
                                      existingControls: viewDoc.existingControls.map((c) =>
                                        c.id === ctrl.id
                                          ? {
                                              ...c,
                                              controlType: e.target.value as ProcessControlItem['controlType'],
                                            }
                                          : c
                                      ),
                                    })
                                  }
                                  className="w-full px-2 py-1 border border-slate-200 rounded bg-white text-xs"
                                >
                                  <option value="Preventive">Preventive</option>
                                  <option value="Detective">Detective</option>
                                  <option value="Corrective">Corrective</option>
                                </select>
                                <select
                                  value={ctrl.automation}
                                  onChange={(e) =>
                                    setDraft({
                                      ...viewDoc,
                                      existingControls: viewDoc.existingControls.map((c) =>
                                        c.id === ctrl.id
                                          ? {
                                              ...c,
                                              automation: e.target.value as ProcessControlItem['automation'],
                                            }
                                          : c
                                      ),
                                    })
                                  }
                                  className="w-full px-2 py-1 border border-slate-200 rounded bg-white text-xs"
                                >
                                  <option value="Automated">Automated</option>
                                  <option value="IT-Dependent">IT-Dependent</option>
                                  <option value="Manual">Manual</option>
                                </select>
                              </div>
                            ) : (
                              <span>
                                {ctrl.controlType} · {ctrl.automation}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 font-mono text-slate-700 whitespace-nowrap">
                            {editing ? (
                              <input
                                type="text"
                                value={ctrl.mappedRiskCode}
                                onChange={(e) =>
                                  setDraft({
                                    ...viewDoc,
                                    existingControls: viewDoc.existingControls.map((c) =>
                                      c.id === ctrl.id ? { ...c, mappedRiskCode: e.target.value } : c
                                    ),
                                  })
                                }
                                className="w-20 px-2 py-1 border border-slate-200 rounded font-mono text-xs"
                              />
                            ) : (
                              ctrl.mappedRiskCode
                            )}
                          </td>
                          {editing && (
                            <td className="py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  setDraft({
                                    ...viewDoc,
                                    existingControls: viewDoc.existingControls.filter(
                                      (c) => c.id !== ctrl.id
                                    ),
                                  })
                                }
                                className="p-1 text-slate-400 hover:text-red-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* 11. Attachments (PDF, DOCX, Images) */}
            <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    11. Process Attachments ({viewDoc.attachments.length})
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Supports PDF, DOCX, and Images (auto-compressed for real-time Firestore cross-device sync).
                  </p>
                </div>

                {editing && (
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.docx,image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={(e) => void handleAttachmentUpload(e.target.files)}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-900 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Upload PDF / DOCX / Image
                    </button>
                  </div>
                )}
              </div>

              {viewDoc.attachments.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No PDF, DOCX, or Image attachments uploaded yet.
                  {editing ? ' Click "Upload PDF / DOCX / Image" above to attach supporting SOPs or diagrams.' : ''}
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {viewDoc.attachments.map((att) => (
                    <div
                      key={att.id}
                      className="border border-slate-200 rounded-md p-3.5 space-y-2.5 bg-slate-50/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {att.fileType === 'image' ? (
                            <ImageIcon className="w-4 h-4 text-blue-900 shrink-0" />
                          ) : (
                            <FileText className="w-4 h-4 text-blue-900 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-900 truncate">
                              {att.fileName}
                            </p>
                            <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                              {att.fileType.toUpperCase()} · {formatBytes(att.sizeBytes)}
                            </p>
                          </div>
                        </div>
                        {editing && (
                          <button
                            type="button"
                            onClick={() =>
                              setDraft({
                                ...viewDoc,
                                attachments: viewDoc.attachments.filter((a) => a.id !== att.id),
                              })
                            }
                            className="p-1 text-slate-400 hover:text-red-600 shrink-0"
                            title="Remove attachment"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {att.fileType === 'image' && att.dataUrl && (
                        <button
                          type="button"
                          onClick={() => setPreviewAttachment(att)}
                          className="block w-full overflow-hidden rounded border border-slate-200 bg-white"
                        >
                          <img
                            src={att.dataUrl}
                            alt={att.fileName}
                            className="w-full h-32 object-cover"
                          />
                        </button>
                      )}

                      {editing ? (
                        <input
                          type="text"
                          value={att.notes}
                          onChange={(e) =>
                            setDraft({
                              ...viewDoc,
                              attachments: viewDoc.attachments.map((a) =>
                                a.id === att.id ? { ...a, notes: e.target.value } : a
                              ),
                            })
                          }
                          placeholder="Attachment description / SOP reference..."
                          className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded"
                        />
                      ) : (
                        att.notes && <p className="text-xs text-slate-600">{att.notes}</p>
                      )}

                      {att.dataUrl && (
                        <div className="flex items-center gap-2 pt-1">
                          {(att.fileType === 'image' || att.fileType === 'pdf') && (
                            <button
                              type="button"
                              onClick={() => setPreviewAttachment(att)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-blue-900 bg-white border border-slate-200 rounded hover:bg-slate-50"
                            >
                              Preview
                            </button>
                          )}
                          <a
                            href={att.dataUrl}
                            download={att.fileName}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50"
                          >
                            <Download className="w-3 h-3" />
                            Download
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* Attachment Preview Modal */}
      {previewAttachment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {previewAttachment.fileName}
                </p>
                <p className="text-xs text-slate-500 font-mono">
                  {previewAttachment.fileType.toUpperCase()} · {formatBytes(previewAttachment.sizeBytes)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={previewAttachment.dataUrl}
                  download={previewAttachment.fileName}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewAttachment(null)}
                  className="p-1.5 text-slate-500 hover:text-slate-900 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-slate-50 flex items-center justify-center">
              {previewAttachment.fileType === 'image' ? (
                <img
                  src={previewAttachment.dataUrl}
                  alt={previewAttachment.fileName}
                  className="max-w-full max-h-[75vh] object-contain rounded"
                />
              ) : previewAttachment.fileType === 'pdf' ? (
                <iframe
                  title={previewAttachment.fileName}
                  src={previewAttachment.dataUrl}
                  className="w-full h-[72vh] rounded border border-slate-200 bg-white"
                />
              ) : (
                <div className="text-center space-y-2 p-8">
                  <p className="text-sm font-medium text-slate-800">
                    DOCX document ready for download.
                  </p>
                  <a
                    href={previewAttachment.dataUrl}
                    download={previewAttachment.fileName}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download {previewAttachment.fileName}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
