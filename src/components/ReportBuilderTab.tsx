import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileText,
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
} from '../types/audit';
import { refineAuditReport } from '../services/aiService';
import { RiskIndicator } from './RiskBadge';

interface ReportBuilderTabProps {
  area: AuditArea;
  intelligence: AuditAreaIntelligence;
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

const REPORT_SECTION_OPTIONS = [
  'Executive Summary',
  'Audit Objective & Scope',
  'Process Overview',
  'Risk Assessment Summary',
  'Key Controls & Weaknesses',
  'Audit Findings & Root Causes',
  'Recommendations & Management Action Plans',
  'Overall Audit Conclusion',
];

export function ReportBuilderTab({
  area,
  intelligence,
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
    existingDraft?.includedSections || REPORT_SECTION_OPTIONS
  );
  const [includedObsIds, setIncludedObsIds] = useState<string[]>(
    existingDraft?.includedObservationIds || areaObservations.map((o) => o.id)
  );
  const [status, setStatus] = useState<'Draft' | 'Finalized'>(existingDraft?.status || 'Draft');

  const [isRefining, setIsRefining] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
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
    setIncludedSections(existingDraft?.includedSections || REPORT_SECTION_OPTIONS);
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

  const handleExportMarkdown = () => {
    const lines: string[] = [
      `# ${title}`,
      `**Entity / Unit:** ${entityName}  `,
      `**Audit Area:** [${area.areaCode}] ${area.name} (${area.domain})  `,
      `**Audit Period:** ${reportPeriod}  `,
      `**Overall Risk Rating:** ${intelligence.riskRating}  `,
      `**Status:** ${status}`,
      '',
    ];

    if (includedSections.includes('Executive Summary')) {
      lines.push('## 1. Executive Summary', executiveSummary, '');
    }
    if (includedSections.includes('Audit Objective & Scope')) {
      lines.push(
        '## 2. Audit Objective, Scope & Methodology',
        `**Objective:** ${intelligence.auditObjective}`,
        '',
        scopeAndMethodology,
        ''
      );
    }
    if (includedSections.includes('Process Overview')) {
      lines.push('## 3. Process Overview', intelligence.processDescription, '');
    }
    if (includedSections.includes('Risk Assessment Summary')) {
      lines.push(
        '## 4. Risk Assessment Summary',
        `Inherent Likelihood: ${intelligence.riskAssessment.likelihood}/5 | Impact: ${intelligence.riskAssessment.impact}/5 | Residual Risk: ${intelligence.riskAssessment.residualRiskRating}`,
        '',
        intelligence.riskAssessment.rationale,
        ''
      );
    }
    if (includedSections.includes('Audit Findings & Root Causes')) {
      lines.push('## 5. Audit Findings & Root Causes');
      if (selectedObservations.length > 0) {
        selectedObservations.forEach((o, i) => {
          lines.push(
            `### Finding ${i + 1}: ${o.observationTitle} [${o.riskRating}]`,
            `- **Finding:** ${o.auditFinding || o.observationText}`,
            `- **Risk Exposure:** ${o.riskStatement}`,
            `- **Root Cause:** ${o.rootCause}`,
            `- **Recommendation:** ${o.recommendation}`,
            `- **Management Action Plan:** ${o.managementActionPlan.actionSteps} (Owner: ${o.managementActionPlan.responsibleOwner}, Target: ${o.managementActionPlan.targetDate})`,
            ''
          );
        });
      } else {
        intelligence.potentialFindings.forEach((pf, i) => {
          lines.push(
            `### Potential Finding ${i + 1}: ${pf.title} [${pf.severity}]`,
            `- **Condition:** ${pf.condition}`,
            `- **Criteria:** ${pf.criteria}`,
            `- **Cause:** ${pf.cause}`,
            `- **Effect:** ${pf.effect}`,
            ''
          );
        });
      }
    }
    if (includedSections.includes('Overall Audit Conclusion')) {
      lines.push('## 6. Overall Audit Conclusion', overallConclusion, '');
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${area.areaCode.toLowerCase()}-audit-report.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left Configuration Panel (Hidden in Print) */}
      <div className="xl:col-span-5 bg-white border border-slate-200 rounded-lg p-6 space-y-5 no-print">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Report Configuration</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Customize Audit Committee deliverables and save to Firestore
            </p>
          </div>
          <span className="text-xs font-medium text-slate-700 border border-slate-200 px-2 py-0.5 rounded">
            {status}
          </span>
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

        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-800">Report Sections</label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {REPORT_SECTION_OPTIONS.map((sec) => (
              <label
                key={sec}
                className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer py-1"
              >
                <input
                  type="checkbox"
                  checked={includedSections.includes(sec)}
                  disabled={status === 'Finalized'}
                  onChange={() => toggleSection(sec)}
                  className="rounded border-slate-300 text-blue-900 focus:ring-blue-900"
                />
                <span>{sec}</span>
              </label>
            ))}
          </div>
        </div>

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

        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200">
          <div className="flex items-center gap-2">
            {!readOnly && (
              <>
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
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportMarkdown}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50"
            >
              <Download className="w-3.5 h-3.5" />
              .MD
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / PDF
            </button>
          </div>
        </div>
      </div>

      {/* Right Formal Audit Report Preview */}
      <div className="xl:col-span-7 bg-white border border-slate-200 rounded-lg p-8 space-y-6 print-only-full">
        <div className="border-b border-slate-200 pb-5 space-y-2">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-mono text-slate-500 uppercase tracking-wider">
              Confidential · Internal Audit Report
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
          </div>
        </div>

        {includedSections.includes('Executive Summary') && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-1">
              1. Executive Summary
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
              {executiveSummary}
            </p>
          </section>
        )}

        {includedSections.includes('Audit Objective & Scope') && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-1">
              2. Audit Objective, Scope & Methodology
            </h3>
            <p className="text-sm text-slate-800 font-medium">{intelligence.auditObjective}</p>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
              {scopeAndMethodology}
            </p>
          </section>
        )}

        {includedSections.includes('Process Overview') && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-1">
              3. Process Overview
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
              {intelligence.processDescription}
            </p>
          </section>
        )}

        {includedSections.includes('Risk Assessment Summary') && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-1">
              4. Risk Assessment Summary
            </h3>
            <p className="text-xs font-mono tabular-nums text-slate-600">
              Likelihood: {intelligence.riskAssessment.likelihood}/5 · Impact: {intelligence.riskAssessment.impact}/5 · Control Environment: {intelligence.riskAssessment.controlEnvironmentScore}/5 · Residual Risk: {intelligence.riskAssessment.residualRiskRating}
            </p>
            <p className="text-sm text-slate-700 leading-relaxed">
              {intelligence.riskAssessment.rationale}
            </p>
          </section>
        )}

        {includedSections.includes('Key Controls & Weaknesses') && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-1">
              5. Key Controls & Control Weaknesses
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1.5">
                <p className="font-semibold text-slate-800">Key Controls Evaluated</p>
                {intelligence.keyControls.map((kc) => (
                  <p key={kc.id} className="text-slate-700">
                    <span className="font-mono text-slate-500">{kc.id}</span> {kc.controlName} ({kc.controlType})
                  </p>
                ))}
              </div>
              <div className="space-y-1.5">
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

        {includedSections.includes('Audit Findings & Root Causes') && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-1">
              6. Detailed Audit Findings & Root Causes
            </h3>
            {selectedObservations.length > 0 ? (
              selectedObservations.map((obs, idx) => (
                <div key={obs.id} className="p-4 border border-slate-200 rounded-md space-y-2 text-xs">
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
                  <p className="text-slate-700">
                    <span className="font-semibold text-slate-900">Recommendation: </span>
                    {obs.recommendation}
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

        {includedSections.includes('Recommendations & Management Action Plans') && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-1">
              7. Recommendations & Management Action Plans
            </h3>
            <div className="space-y-2 text-xs">
              {selectedObservations.map((obs, idx) => (
                <div key={obs.id} className="py-1.5 border-b border-slate-100 last:border-b-0">
                  <p className="font-semibold text-slate-900">
                    MAP-{idx + 1}: {obs.managementActionPlan.actionSteps || obs.recommendation}
                  </p>
                  <p className="text-slate-600 mt-0.5">
                    Responsible Owner: {obs.managementActionPlan.responsibleOwner || 'Process Owner'} · Target Date: {obs.managementActionPlan.targetDate || 'TBD'} · Status: {obs.managementActionPlan.status}
                  </p>
                </div>
              ))}
              {selectedObservations.length === 0 &&
                intelligence.recommendations.map((rec) => (
                  <div key={rec.id} className="py-1.5 border-b border-slate-100 last:border-b-0">
                    <p className="font-semibold text-slate-900">
                      {rec.id}: {rec.actionTitle} ({rec.priority})
                    </p>
                    <p className="text-slate-600 mt-0.5">
                      {rec.detailedAction} — Owner: {rec.targetOwner} ({rec.timeline})
                    </p>
                  </div>
                ))}
            </div>
          </section>
        )}

        {includedSections.includes('Overall Audit Conclusion') && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-1">
              8. Overall Audit Conclusion
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
