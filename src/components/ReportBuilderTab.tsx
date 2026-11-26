import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileText,
  Link2,
  Loader2,
  Printer,
  Save,
  Sparkles,
} from 'lucide-react';
import type {
  AuditArea,
  AuditAreaIntelligence,
  AuditObservation,
  AuditReport,
  ProcessDocumentation,
} from '../types/audit';
import { refineAuditReport } from '../services/aiService';
import {
  DEFAULT_INCLUDED_SECTIONS,
  MAIN_REPORT_SECTIONS,
  PROCESS_DOC_SUBSECTIONS,
  exportAuditReportToDocx,
  exportAuditReportToPdf,
  normalizeIncludedSections,
} from '../utils/reportExport';
import { ProcessFlowchart } from './ProcessFlowchart';
import { RiskIndicator } from './RiskBadge';

interface ReportBuilderTabProps {
  area: AuditArea;
  intelligence: AuditAreaIntelligence;
  processDoc: ProcessDocumentation | null;
  observations: AuditObservation[];
  savedReports: AuditReport[];
  onSaveReport: (input: {
    reportId?: string;
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
  }) => Promise<string>;
  readOnly?: boolean;
}

export function ReportBuilderTab({
  area,
  intelligence,
  processDoc,
  observations,
  savedReports,
  onSaveReport,
  readOnly = false,
}: ReportBuilderTabProps) {
  const areaObservations = useMemo(
    () => observations.filter((o) => o.areaId === area.id || o.areaId === ''),
    [observations, area.id]
  );

  const existingDraft = useMemo(
    () => savedReports.find((r) => r.areaId === area.id),
    [savedReports, area.id]
  );

  const [reportId, setReportId] = useState<string | undefined>(existingDraft?.id);
  const [title, setTitle] = useState(
    existingDraft?.title || `Internal Audit Report — ${area.name}`
  );
  const [entityName, setEntityName] = useState(existingDraft?.entityName || area.entityName);
  const [reportPeriod, setReportPeriod] = useState(existingDraft?.reportPeriod || 'FY 2026 Audit Cycle');
  const [executiveSummary, setExecutiveSummary] = useState(
    existingDraft?.executiveSummary || intelligence.auditReportNarratives.executiveSummary
  );
  const [scopeAndMethodology, setScopeAndMethodology] = useState(
    existingDraft?.scopeAndMethodology || intelligence.auditReportNarratives.scopeAndMethodology
  );
  const [overallConclusion, setOverallConclusion] = useState(
    existingDraft?.overallConclusion || intelligence.auditReportNarratives.overallConclusion
  );
  const [includedSections, setIncludedSections] = useState<string[]>(
    normalizeIncludedSections(existingDraft?.includedSections)
  );
  const [includedObsIds, setIncludedObsIds] = useState<string[]>(
    existingDraft?.includedObservationIds || areaObservations.map((o) => o.id)
  );
  const [status, setStatus] = useState<'Draft' | 'Finalized'>(existingDraft?.status || 'Draft');

  const [isRefining, setIsRefining] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<'pdf' | 'docx' | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setReportId(existingDraft?.id);
    setTitle(existingDraft?.title || `Internal Audit Report — ${area.name}`);
    setEntityName(existingDraft?.entityName || area.entityName);
    setReportPeriod(existingDraft?.reportPeriod || 'FY 2026 Audit Cycle');
    setExecutiveSummary(
      existingDraft?.executiveSummary || intelligence.auditReportNarratives.executiveSummary
    );
    setScopeAndMethodology(
      existingDraft?.scopeAndMethodology || intelligence.auditReportNarratives.scopeAndMethodology
    );
    setOverallConclusion(
      existingDraft?.overallConclusion || intelligence.auditReportNarratives.overallConclusion
    );
    setIncludedSections(normalizeIncludedSections(existingDraft?.includedSections));
    setIncludedObsIds(
      existingDraft?.includedObservationIds || areaObservations.map((o) => o.id)
    );
    setStatus(existingDraft?.status || 'Draft');
  }, [area.id, existingDraft, intelligence, area.name, area.entityName, areaObservations]);

  const toggleSection = (sec: string) => {
    setIncludedSections((prev) =>
      prev.includes(sec) ? prev.filter((s) => s !== sec) : [...prev, sec]
    );
  };

  const toggleObs = (id: string) => {
    setIncludedObsIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectedObservations = areaObservations.filter((o) => includedObsIds.includes(o.id));
  const hasSection = (sec: string) => includedSections.includes(sec);

  const handleRefineWithAi = async () => {
    setIsRefining(true);
    setNotice('');
    try {
      const refined = await refineAuditReport({
        area,
        observations: selectedObservations,
        currentExecutiveSummary: executiveSummary,
        currentScope: scopeAndMethodology,
        currentConclusion: overallConclusion,
      });
      setExecutiveSummary(refined.executiveSummary);
      setScopeAndMethodology(refined.scopeAndMethodology);
      setOverallConclusion(refined.overallConclusion);
      setNotice('Report narratives refined with AI based on selected observations.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Unable to refine report narratives.');
    } finally {
      setIsRefining(false);
    }
  };

  const handleSave = async (targetStatus: 'Draft' | 'Finalized') => {
    setIsSaving(true);
    setNotice('');
    try {
      const savedId = await onSaveReport({
        reportId: status === 'Finalized' ? undefined : reportId,
        areaId: area.id,
        title,
        entityName,
        reportPeriod,
        executiveSummary,
        scopeAndMethodology,
        overallConclusion,
        includedSections,
        includedObservationIds: includedObsIds,
        status: targetStatus,
      });
      setReportId(savedId);
      setStatus(targetStatus);
      setNotice(
        targetStatus === 'Finalized'
          ? 'Audit Report finalized and locked in Firestore.'
          : 'Audit Report draft saved to Firestore.'
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Failed to save report.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportPdf = async () => {
    setExportingFormat('pdf');
    setNotice('');
    try {
      await exportAuditReportToPdf({
        title,
        entityName,
        reportPeriod,
        status,
        area,
        intelligence,
        processDoc,
        observations: selectedObservations,
        includedSections,
        executiveSummary,
        scopeAndMethodology,
        overallConclusion,
      });
      setNotice('Board-level PDF report generated (Cover Page, Portrait narratives & Landscape matrices/flowchart).');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Failed to generate PDF report.');
    } finally {
      setExportingFormat(null);
    }
  };

  const handleExportDocx = async () => {
    setExportingFormat('docx');
    setNotice('');
    try {
      await exportAuditReportToDocx({
        title,
        entityName,
        reportPeriod,
        status,
        area,
        intelligence,
        processDoc,
        observations: selectedObservations,
        includedSections,
        executiveSummary,
        scopeAndMethodology,
        overallConclusion,
      });
      setNotice('Board-level DOCX report generated with embedded BPMN flowchart diagram and structured tables.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Failed to generate DOCX report.');
    } finally {
      setExportingFormat(null);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left Configuration Panel (Hidden in Print) */}
      <div className="xl:col-span-5 bg-white border border-slate-200 rounded-lg p-6 space-y-5 no-print">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Report Configuration</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Board-Level Internal Audit Report Builder · PDF & DOCX Export
            </p>
          </div>
          <span className="text-xs font-medium text-slate-700 border border-slate-200 px-2 py-0.5 rounded">
            {status}
          </span>
        </div>

        {/* Linked 1:1 Process Documentation Badge */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-950">
          <div className="flex items-center gap-1.5 min-w-0">
            <Link2 className="w-3.5 h-3.5 text-blue-900 shrink-0" />
            <span className="font-medium shrink-0">Process Docs:</span>
            <span className="font-semibold truncate">
              {processDoc
                ? `${processDoc.processCode} - ${processDoc.processName}`
                : 'No linked Process Documentation yet'}
            </span>
          </div>
          {processDoc && (
            <span className="text-[11px] font-mono text-blue-800 shrink-0">
              {processDoc.flowchartNodes.length} nodes
            </span>
          )}
        </div>

        {notice && (
          <div className="p-3 text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-md flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-blue-900 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Report Title</label>
            <input
              type="text"
              value={title}
              disabled={readOnly || status === 'Finalized'}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md disabled:bg-slate-50"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Entity / Auditee</label>
              <input
                type="text"
                value={entityName}
                disabled={readOnly || status === 'Finalized'}
                onChange={(e) => setEntityName(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Audit Period</label>
              <input
                type="text"
                value={reportPeriod}
                disabled={readOnly || status === 'Finalized'}
                onChange={(e) => setReportPeriod(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md disabled:bg-slate-50"
              />
            </div>
          </div>
        </div>

        {/* Main 12 Report Sections */}
        <div className="space-y-2.5 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-800">
              Report Sections (Ordered Executive Structure)
            </label>
            {status !== 'Finalized' && (
              <button
                type="button"
                onClick={() =>
                  setIncludedSections(
                    includedSections.length === DEFAULT_INCLUDED_SECTIONS.length
                      ? []
                      : [...DEFAULT_INCLUDED_SECTIONS]
                  )
                }
                className="text-[11px] font-medium text-blue-900 hover:underline"
              >
                {includedSections.length === DEFAULT_INCLUDED_SECTIONS.length
                  ? 'Clear All'
                  : 'Select All'}
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {MAIN_REPORT_SECTIONS.map((sec, idx) => (
              <label
                key={sec}
                className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer py-1"
              >
                <input
                  type="checkbox"
                  checked={hasSection(sec)}
                  disabled={status === 'Finalized'}
                  onChange={() => toggleSection(sec)}
                  className="rounded border-slate-300 text-blue-900 focus:ring-blue-900"
                />
                <span>
                  <span className="font-mono text-[10px] text-slate-400 mr-1">{idx + 1}.</span>
                  {sec}
                </span>
              </label>
            ))}
          </div>

          {/* Optional Process Documentation Sub-Sections */}
          {hasSection('Process Documentation') && (
            <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-md space-y-2">
              <p className="text-[11px] font-semibold text-slate-800">
                Process Documentation Optional Sub-Sections
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {PROCESS_DOC_SUBSECTIONS.map((sub) => (
                  <label
                    key={sub}
                    className="flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={hasSection(sub)}
                      disabled={status === 'Finalized'}
                      onChange={() => toggleSection(sub)}
                      className="rounded border-slate-300 text-blue-900 focus:ring-blue-900"
                    />
                    <span>{sub}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Logged Observations Selector */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <label className="block text-xs font-semibold text-slate-800">
            Include Logged Observations ({areaObservations.length})
          </label>
          {areaObservations.length === 0 ? (
            <p className="text-xs text-slate-500">
              No field observations logged yet. The report will reference the area's predictive potential findings unless observations are added.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {areaObservations.map((obs) => (
                <label key={obs.id} className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includedObsIds.includes(obs.id)}
                    disabled={status === 'Finalized'}
                    onChange={() => toggleObs(obs.id)}
                    className="mt-0.5 rounded border-slate-300 text-blue-900"
                  />
                  <span>
                    <span className="font-medium">{obs.observationTitle}</span> ({obs.riskRating})
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Report Narratives */}
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-800">Narratives</span>
            {!readOnly && (
              <button
                type="button"
                disabled={isRefining || status === 'Finalized'}
                onClick={handleRefineWithAi}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-900 bg-sky-50 border border-sky-200 rounded-md hover:bg-sky-100 disabled:opacity-50"
              >
                {isRefining ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Refining...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3" />
                    Refine Narratives with AI
                  </>
                )}
              </button>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Executive Summary</label>
            <textarea
              rows={4}
              value={executiveSummary}
              disabled={readOnly || status === 'Finalized'}
              onChange={(e) => setExecutiveSummary(e.target.value)}
              className="w-full p-2.5 text-xs border border-slate-200 rounded-md leading-relaxed disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Scope & Methodology</label>
            <textarea
              rows={3}
              value={scopeAndMethodology}
              disabled={readOnly || status === 'Finalized'}
              onChange={(e) => setScopeAndMethodology(e.target.value)}
              className="w-full p-2.5 text-xs border border-slate-200 rounded-md leading-relaxed disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Overall Conclusion</label>
            <textarea
              rows={3}
              value={overallConclusion}
              disabled={readOnly || status === 'Finalized'}
              onChange={(e) => setOverallConclusion(e.target.value)}
              className="w-full p-2.5 text-xs border border-slate-200 rounded-md leading-relaxed disabled:bg-slate-50"
            />
          </div>
        </div>

        {/* Save & Board-Level Export Actions */}
        <div className="space-y-3 pt-3 border-t border-slate-200">
          {!readOnly && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isSaving || status === 'Finalized'}
                onClick={() => handleSave('Draft')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                Save Draft
              </button>
              <button
                type="button"
                disabled={isSaving || status === 'Finalized'}
                onClick={() => handleSave('Finalized')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800 disabled:opacity-50"
              >
                <FileText className="w-3.5 h-3.5" />
                Finalize Report
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={Boolean(exportingFormat)}
              onClick={handleExportPdf}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50"
            >
              {exportingFormat === 'pdf' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              {exportingFormat === 'pdf' ? 'Building PDF...' : 'Download PDF'}
            </button>

            <button
              type="button"
              disabled={Boolean(exportingFormat)}
              onClick={handleExportDocx}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-950 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 disabled:opacity-50"
            >
              {exportingFormat === 'docx' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              {exportingFormat === 'docx' ? 'Building DOCX...' : 'Download DOCX'}
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Report
            </button>
          </div>
        </div>
      </div>

      {/* Right Formal Board-Level Report Preview */}
      <div className="xl:col-span-7 bg-white border border-slate-200 rounded-lg p-8 space-y-7 print-only-full">
        {/* Executive Header */}
        <div className="border-b-2 border-slate-900 pb-5 space-y-2">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-mono text-slate-500 uppercase tracking-wider">
              Confidential · Board-Level Internal Audit Report
            </span>
            <RiskIndicator rating={intelligence.riskRating} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 pt-1">
            <span>Entity: {entityName}</span>
            <span aria-hidden="true">·</span>
            <span>Area: {area.areaCode} ({area.domain})</span>
            <span aria-hidden="true">·</span>
            <span>Period: {reportPeriod}</span>
            {processDoc && (
              <>
                <span aria-hidden="true">·</span>
                <span>Process: {processDoc.processCode} ({processDoc.version})</span>
              </>
            )}
          </div>
        </div>

        {/* 1. Executive Summary */}
        {hasSection('Executive Summary') && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-1">
              1. Executive Summary
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
              {executiveSummary}
            </p>
          </section>
        )}

        {/* 2. Audit Objective, Scope & Methodology */}
        {hasSection('Audit Objective, Scope & Methodology') && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-1">
              2. Audit Objective, Scope & Methodology
            </h3>
            <p className="text-sm text-slate-800 font-medium">{intelligence.auditObjective}</p>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
              {scopeAndMethodology}
            </p>
          </section>
        )}

        {/* 3. Process Documentation */}
        {hasSection('Process Documentation') && (
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-1">
              3. Process Documentation
            </h3>

            {!processDoc ? (
              <p className="text-xs text-slate-500">
                No Process Documentation record is linked to {area.areaCode} yet. Open Process Docs to create or sync process details.
              </p>
            ) : (
              <div className="space-y-4">
                {hasSection('Process Information') && (
                  <div className="bg-slate-50 border border-slate-200 rounded-md p-3.5 grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="text-slate-500">Process Code & Name</p>
                      <p className="font-semibold text-slate-900 mt-0.5">
                        {processDoc.processCode} — {processDoc.processName}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Process Owner</p>
                      <p className="font-medium text-slate-900 mt-0.5">
                        {processDoc.processOwner.ownerName} ({processDoc.processOwner.ownerRole})
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Version · Status</p>
                      <p className="font-mono text-slate-900 mt-0.5">
                        {processDoc.version} · {processDoc.effectiveDate} · {processDoc.status}
                      </p>
                    </div>
                  </div>
                )}

                {hasSection('Process Objective') && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-800">Process Objective</p>
                    <p className="text-xs text-slate-700 leading-relaxed">{processDoc.processObjective}</p>
                  </div>
                )}

                {hasSection('Scope') && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-800">Process Scope</p>
                    <p className="text-xs text-slate-700 leading-relaxed">{processDoc.scope}</p>
                  </div>
                )}

                {hasSection('Process Steps Table') && processDoc.processSteps.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-800">Process Steps Table</p>
                    <div className="overflow-x-auto border border-slate-200 rounded-md">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                          <tr>
                            <th className="py-2 px-2.5">Step</th>
                            <th className="py-2 px-2.5">Activity</th>
                            <th className="py-2 px-2.5">Actor / Role</th>
                            <th className="py-2 px-2.5">System</th>
                            <th className="py-2 px-2.5">SLA</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {processDoc.processSteps.map((s) => (
                            <tr key={s.id} className="align-top">
                              <td className="py-2 px-2.5 font-mono text-slate-700 whitespace-nowrap">{s.stepNo}</td>
                              <td className="py-2 px-2.5">
                                <p className="font-medium text-slate-900">{s.stepTitle}</p>
                                <p className="text-slate-600">{s.description}</p>
                              </td>
                              <td className="py-2 px-2.5 text-slate-700">{s.actorRole}</td>
                              <td className="py-2 px-2.5 text-slate-600">{s.systemUsed || '—'}</td>
                              <td className="py-2 px-2.5 text-slate-600 whitespace-nowrap">{s.slaOrFrequency || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {hasSection('Risks Identified') && processDoc.risks.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-800">Risks Identified</p>
                    <div className="overflow-x-auto border border-slate-200 rounded-md">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                          <tr>
                            <th className="py-2 px-2.5">Code</th>
                            <th className="py-2 px-2.5">Risk</th>
                            <th className="py-2 px-2.5">Rating</th>
                            <th className="py-2 px-2.5">Reference</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {processDoc.risks.map((r) => (
                            <tr key={r.id}>
                              <td className="py-2 px-2.5 font-mono text-slate-700">{r.riskCode}</td>
                              <td className="py-2 px-2.5">
                                <span className="font-medium text-slate-900">{r.title}</span>
                                <span className="block text-slate-600">{r.description}</span>
                              </td>
                              <td className="py-2 px-2.5 font-semibold text-slate-800">{r.riskRating}</td>
                              <td className="py-2 px-2.5 text-slate-600">{r.regulatoryRef}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {hasSection('Existing Controls') && processDoc.existingControls.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-800">Existing Controls</p>
                    <div className="overflow-x-auto border border-slate-200 rounded-md">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                          <tr>
                            <th className="py-2 px-2.5">Code</th>
                            <th className="py-2 px-2.5">Control</th>
                            <th className="py-2 px-2.5">Owner & Freq</th>
                            <th className="py-2 px-2.5">Type / Auto</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {processDoc.existingControls.map((c) => (
                            <tr key={c.id}>
                              <td className="py-2 px-2.5 font-mono text-slate-700">{c.controlCode}</td>
                              <td className="py-2 px-2.5">
                                <span className="font-medium text-slate-900">{c.controlName}</span>
                                <span className="block text-slate-600">{c.description}</span>
                              </td>
                              <td className="py-2 px-2.5 text-slate-700">
                                {c.controlOwner} · {c.frequency}
                              </td>
                              <td className="py-2 px-2.5 text-slate-600">
                                {c.controlType} / {c.automation}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {(hasSection('Systems Used') || hasSection('Documents Used')) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    {hasSection('Systems Used') && (
                      <div className="border border-slate-200 rounded-md p-3 space-y-1.5">
                        <p className="font-semibold text-slate-800">Systems Used</p>
                        {processDoc.systemsUsed.map((sys) => (
                          <p key={sys.id} className="text-slate-700">
                            <span className="font-medium">{sys.systemName}</span> ({sys.moduleName || 'Core'}) · {sys.interfaceType}
                          </p>
                        ))}
                      </div>
                    )}
                    {hasSection('Documents Used') && (
                      <div className="border border-slate-200 rounded-md p-3 space-y-1.5">
                        <p className="font-semibold text-slate-800">Documents Used</p>
                        {processDoc.documentsUsed.map((docItem) => (
                          <p key={docItem.id} className="text-slate-700">
                            <span className="font-mono text-slate-500">{docItem.docCode}</span> {docItem.documentName} ({docItem.retentionPeriod})
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* 4. Process Flow Diagram (Live BPMN / ISO Flowchart) */}
        {hasSection('Process Flow Diagram') && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-1">
              4. Process Flow Diagram (BPMN / Flowchart)
            </h3>
            {processDoc && processDoc.flowchartNodes.length > 0 ? (
              <ProcessFlowchart
                nodes={processDoc.flowchartNodes}
                editing={false}
                onChange={() => {}}
              />
            ) : (
              <p className="text-xs text-slate-500">
                No flowchart nodes defined yet. Add steps in Process Docs to include the graphical diagram.
              </p>
            )}
          </section>
        )}

        {/* 5. Process Narrative */}
        {hasSection('Process Narrative') && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-1">
              5. Process Narrative
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
              {processDoc?.processFlowNarrative || intelligence.processDescription}
            </p>
          </section>
        )}

        {/* 6. Risk Assessment Summary */}
        {hasSection('Risk Assessment Summary') && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-1">
              6. Risk Assessment Summary
            </h3>
            <p className="text-xs font-mono tabular-nums text-slate-600">
              Likelihood: {intelligence.riskAssessment.likelihood}/5 · Impact: {intelligence.riskAssessment.impact}/5 · Control Environment: {intelligence.riskAssessment.controlEnvironmentScore}/5 · Residual Risk: {intelligence.riskAssessment.residualRiskRating}
            </p>
            <p className="text-sm text-slate-700 leading-relaxed">
              {intelligence.riskAssessment.rationale}
            </p>
            {intelligence.inherentRisks.length > 0 && (
              <div className="overflow-x-auto border border-slate-200 rounded-md">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-2.5">ID</th>
                      <th className="py-2 px-2.5">Inherent Risk</th>
                      <th className="py-2 px-2.5">Score</th>
                      <th className="py-2 px-2.5">Regulatory Ref</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {intelligence.inherentRisks.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2 px-2.5 font-mono text-slate-700">{r.id}</td>
                        <td className="py-2 px-2.5">
                          <span className="font-medium text-slate-900">{r.title}</span>
                          <span className="block text-slate-600">{r.description}</span>
                        </td>
                        <td className="py-2 px-2.5 font-mono tabular-nums">
                          {r.likelihood}×{r.impact} ({r.likelihood * r.impact})
                        </td>
                        <td className="py-2 px-2.5 text-slate-600">{r.regulatoryRef}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* 7. Control Matrix Summary */}
        {hasSection('Control Matrix Summary') && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-1">
              7. Control Matrix Summary
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1.5 border border-slate-200 rounded-md p-3">
                <p className="font-semibold text-slate-800">Key Controls Evaluated</p>
                {intelligence.keyControls.map((kc) => (
                  <p key={kc.id} className="text-slate-700">
                    <span className="font-mono text-slate-500">{kc.id}</span> {kc.controlName} ({kc.controlType} · {kc.automation})
                  </p>
                ))}
              </div>
              <div className="space-y-1.5 border border-slate-200 rounded-md p-3">
                <p className="font-semibold text-slate-800">Identified Control Gaps</p>
                {intelligence.controlWeaknesses.map((cw) => (
                  <p key={cw.id} className="text-slate-700">
                    <span className="font-mono text-slate-500">{cw.id}</span> {cw.weaknessTitle} [{cw.severity}]
                  </p>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 8. Audit Procedures */}
        {hasSection('Audit Procedures') && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-1">
              8. Audit Procedures
            </h3>
            <div className="overflow-x-auto border border-slate-200 rounded-md">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-2.5">ID</th>
                    <th className="py-2 px-2.5">Type</th>
                    <th className="py-2 px-2.5">Objective & Step</th>
                    <th className="py-2 px-2.5">Evidence & Sample</th>
                    <th className="py-2 px-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {intelligence.auditProcedures.map((ap) => (
                    <tr key={ap.id} className="align-top">
                      <td className="py-2 px-2.5 font-mono text-slate-700">{ap.id}</td>
                      <td className="py-2 px-2.5 text-slate-700">{ap.procedureType}</td>
                      <td className="py-2 px-2.5">
                        <p className="font-medium text-slate-900">{ap.objective}</p>
                        <p className="text-slate-600">{ap.stepDetail}</p>
                      </td>
                      <td className="py-2 px-2.5 text-slate-600">
                        {ap.expectedEvidence} ({ap.sampleSizeGuidance})
                      </td>
                      <td className="py-2 px-2.5 whitespace-nowrap text-slate-700">{ap.testingStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 9. Findings */}
        {hasSection('Findings') && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-1">
              9. Findings
            </h3>
            {selectedObservations.length > 0 ? (
              selectedObservations.map((obs, idx) => (
                <div key={obs.id} className="p-4 border border-slate-200 rounded-md space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="font-semibold text-sm text-slate-900">
                      {idx + 1}. {obs.observationTitle}
                    </h4>
                    <RiskIndicator rating={obs.riskRating} />
                  </div>
                  <p className="text-slate-700">
                    <span className="font-semibold text-slate-900">Finding: </span>
                    {obs.auditFinding || obs.observationText}
                  </p>
                  <p className="text-slate-700">
                    <span className="font-semibold text-slate-900">Risk Exposure: </span>
                    {obs.riskStatement}
                  </p>
                  <p className="text-slate-700">
                    <span className="font-semibold text-slate-900">Root Cause: </span>
                    {obs.rootCause}
                  </p>
                </div>
              ))
            ) : (
              intelligence.potentialFindings.map((pf, idx) => (
                <div key={pf.id} className="p-4 border border-slate-200 rounded-md space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="font-semibold text-sm text-slate-900">
                      {idx + 1}. {pf.title}
                    </h4>
                    <RiskIndicator rating={pf.severity} />
                  </div>
                  <p className="text-slate-700"><span className="font-semibold">Condition:</span> {pf.condition}</p>
                  <p className="text-slate-700"><span className="font-semibold">Criteria:</span> {pf.criteria}</p>
                  <p className="text-slate-700"><span className="font-semibold">Cause & Effect:</span> {pf.cause} — {pf.effect}</p>
                </div>
              ))
            )}
          </section>
        )}

        {/* 10. Recommendations */}
        {hasSection('Recommendations') && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-1">
              10. Recommendations
            </h3>
            <div className="space-y-2 text-xs">
              {selectedObservations.length > 0
                ? selectedObservations.map((obs, idx) => (
                    <div key={obs.id} className="p-3 border border-slate-200 rounded-md">
                      <p className="font-semibold text-slate-900">
                        REC-{idx + 1} [{obs.riskRating}]: {obs.observationTitle}
                      </p>
                      <p className="text-slate-700 mt-1">{obs.recommendation}</p>
                    </div>
                  ))
                : intelligence.recommendations.map((rec) => (
                    <div key={rec.id} className="p-3 border border-slate-200 rounded-md">
                      <p className="font-semibold text-slate-900">
                        {rec.id} [{rec.priority}]: {rec.actionTitle}
                      </p>
                      <p className="text-slate-700 mt-1">
                        {rec.detailedAction} — Owner: {rec.targetOwner} ({rec.timeline})
                      </p>
                    </div>
                  ))}
            </div>
          </section>
        )}

        {/* 11. Management Action Plan */}
        {hasSection('Management Action Plan') && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-1">
              11. Management Action Plan
            </h3>
            <div className="overflow-x-auto border border-slate-200 rounded-md">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-2.5">MAP ID</th>
                    <th className="py-2 px-2.5">Committed Action Steps</th>
                    <th className="py-2 px-2.5">Responsible Owner</th>
                    <th className="py-2 px-2.5">Target Date</th>
                    <th className="py-2 px-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(selectedObservations.length > 0
                    ? selectedObservations.map((obs, idx) => ({
                        id: `MAP-${idx + 1}`,
                        steps: obs.managementActionPlan.actionSteps || obs.recommendation,
                        owner: obs.managementActionPlan.responsibleOwner || 'Process Owner',
                        target: obs.managementActionPlan.targetDate || 'TBD',
                        status: obs.managementActionPlan.status,
                      }))
                    : intelligence.recommendations.map((rec, idx) => ({
                        id: `MAP-${idx + 1}`,
                        steps: `${rec.actionTitle}: ${rec.detailedAction}`,
                        owner: rec.targetOwner,
                        target: rec.timeline,
                        status: 'Open',
                      }))
                  ).map((row) => (
                    <tr key={row.id} className="align-top">
                      <td className="py-2 px-2.5 font-mono text-slate-700 whitespace-nowrap">{row.id}</td>
                      <td className="py-2 px-2.5 text-slate-800">{row.steps}</td>
                      <td className="py-2 px-2.5 text-slate-700">{row.owner}</td>
                      <td className="py-2 px-2.5 font-mono text-slate-700 whitespace-nowrap">{row.target}</td>
                      <td className="py-2 px-2.5 font-medium text-slate-800">{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 12. Conclusion */}
        {hasSection('Conclusion') && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-1">
              12. Conclusion
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
              {overallConclusion}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
