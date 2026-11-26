import React, { useMemo, useState } from 'react';
import {
  BookmarkPlus,
  CheckCircle2,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  AuditArea,
  AuditObservation,
  KnowledgeItem,
  ManagementActionPlan,
  ObservationStatus,
  RiskRating,
} from '../types/audit';
import { analyzeObservation } from '../services/aiService';
import { RiskIndicator } from './RiskBadge';

interface FindingsLibraryTabProps {
  selectedArea: AuditArea | null;
  observations: AuditObservation[];
  knowledgeItems: KnowledgeItem[];
  onSaveObservation: (input: {
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
  }) => Promise<void>;
  onUpdateObservationStatus: (obsId: string, status: ObservationStatus) => Promise<void>;
  onDeleteObservation: (obsId: string) => Promise<void>;
  onPromoteToKnowledge: (obs: AuditObservation) => Promise<void>;
  readOnly?: boolean;
}

export function FindingsLibraryTab({
  selectedArea,
  observations,
  knowledgeItems,
  onSaveObservation,
  onUpdateObservationStatus,
  onDeleteObservation,
  onPromoteToKnowledge,
  readOnly = false,
}: FindingsLibraryTabProps) {
  // Observation Entry & AI Synthesis State
  const [obsTitle, setObsTitle] = useState('');
  const [obsText, setObsText] = useState('');
  const [evidenceRef, setEvidenceRef] = useState('');
  const [sampleTested, setSampleTested] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiError, setAiError] = useState('');

  // Draft Synthesized Fields
  const [auditFinding, setAuditFinding] = useState('');
  const [riskStatement, setRiskStatement] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [riskRating, setRiskRating] = useState<RiskRating>('High');
  const [actionSteps, setActionSteps] = useState('');
  const [responsibleOwner, setResponsibleOwner] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);

  // Library Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [ratingFilter, setRatingFilter] = useState<string>('ALL');
  const [scopeFilter, setScopeFilter] = useState<'area' | 'all'>('area');
  const [promotedIds, setPromotedIds] = useState<Record<string, boolean>>({});

  const handleSynthesize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!obsText.trim()) {
      setAiError('Please enter raw field observation details before analyzing.');
      return;
    }
    setAiError('');
    setIsAnalyzing(true);
    try {
      const result = await analyzeObservation({
        areaName: selectedArea?.name || 'General Philippine Corporate Audit',
        domain: selectedArea?.domain || 'Philippine Corporate',
        regulatoryContext: selectedArea?.regulatoryContext || '',
        observationTitle: obsTitle.trim() || 'Field Audit Observation',
        observationText: obsText.trim(),
        evidenceRef: evidenceRef.trim(),
        sampleTested: sampleTested.trim(),
        knowledgeItems,
      });
      setAuditFinding(result.auditFinding);
      setRiskStatement(result.riskStatement);
      setRootCause(result.rootCause);
      setRecommendation(result.recommendation);
      setRiskRating(result.riskRating);
      setActionSteps(result.managementActionPlan.actionSteps);
      setResponsibleOwner(result.managementActionPlan.responsibleOwner);
      setTargetDate(result.managementActionPlan.targetDate);
      setHasDraft(true);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unable to synthesize observation.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveToFirestore = async () => {
    if (!obsText.trim()) return;
    setIsSaving(true);
    setAiError('');
    try {
      await onSaveObservation({
        areaId: selectedArea?.id || '',
        areaName: selectedArea?.name || 'General Audit Area',
        domain: selectedArea?.domain || 'Philippine Corporate',
        observationTitle: obsTitle.trim() || 'Field Audit Observation',
        observationText: obsText.trim(),
        evidenceRef: evidenceRef.trim(),
        sampleTested: sampleTested.trim(),
        auditFinding: auditFinding.trim(),
        riskStatement: riskStatement.trim(),
        rootCause: rootCause.trim(),
        recommendation: recommendation.trim(),
        riskRating,
        managementActionPlan: {
          actionSteps: actionSteps.trim(),
          responsibleOwner: responsibleOwner.trim(),
          targetDate: targetDate.trim(),
          status: 'Open',
        },
        status: 'Validated',
      });
      setObsTitle('');
      setObsText('');
      setEvidenceRef('');
      setSampleTested('');
      setAuditFinding('');
      setRiskStatement('');
      setRootCause('');
      setRecommendation('');
      setActionSteps('');
      setResponsibleOwner('');
      setTargetDate('');
      setHasDraft(false);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed to save observation.');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredObservations = useMemo(() => {
    return observations.filter((o) => {
      if (scopeFilter === 'area' && selectedArea && o.areaId !== selectedArea.id) return false;
      if (ratingFilter !== 'ALL' && o.riskRating !== ratingFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const hay = `${o.observationTitle} ${o.auditFinding} ${o.rootCause} ${o.areaName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [observations, scopeFilter, selectedArea, ratingFilter, searchTerm]);

  const potentialFindings = selectedArea?.intelligence?.potentialFindings || [];
  const kbFindings = knowledgeItems.filter((k) => k.type === 'finding');

  return (
    <div className="space-y-8">
      {/* Observation-to-Finding AI Synthesizer */}
      {!readOnly && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-semibold text-slate-900">
              Field Observation & AI Finding Synthesizer
            </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Enter raw fieldwork exceptions for {selectedArea ? `${selectedArea.areaCode} · ${selectedArea.name}` : 'your engagement'} — AI generates Audit Finding, Risk Statement, Root Cause, Recommendation, Risk Rating, and Management Action Plan.
          </p>
        </div>

        {aiError && (
          <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-md">
            {aiError}
          </div>
        )}

        <form onSubmit={handleSynthesize} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Observation Title *
              </label>
              <input
                type="text"
                required
                value={obsTitle}
                onChange={(e) => setObsTitle(e.target.value)}
                placeholder="e.g. Unliquidated Fuel Advances Over 45 Days"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Sample Tested / Scope
              </label>
              <input
                type="text"
                value={sampleTested}
                onChange={(e) => setSampleTested(e.target.value)}
                placeholder="e.g. 40 cash advance vouchers (Q1 2026)"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Evidence / Workpaper Ref
              </label>
              <input
                type="text"
                value={evidenceRef}
                onChange={(e) => setEvidenceRef(e.target.value)}
                placeholder="e.g. WP-OPS-07-04 / Aging Schedule"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Raw Field Observation Notes *
            </label>
            <textarea
              rows={3}
              required
              value={obsText}
              onChange={(e) => setObsText(e.target.value)}
              placeholder="Describe what you observed in fieldwork: e.g., '14 of 40 Cebu hub delivery drivers held PHP 185,400 in unliquidated fuel cash advances aged 45 to 112 days. 6 liquidation packets attached non-VAT acknowledgment receipts instead of BIR-compliant Sales Invoices.'"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20"
            />
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="submit"
              disabled={isAnalyzing}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Synthesizing Finding...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  Synthesize Audit Finding
                </>
              )}
            </button>
          </div>
        </form>

        {hasDraft && (
          <div className="pt-5 border-t border-slate-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <h4 className="text-sm font-semibold text-slate-900">
                  Generated Audit Finding Package
                </h4>
                <RiskIndicator rating={riskRating} />
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={riskRating}
                  onChange={(e) => setRiskRating(e.target.value as RiskRating)}
                  className="px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-md bg-white"
                >
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Moderate">Moderate</option>
                  <option value="Low">Low</option>
                </select>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSaveToFirestore}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {isSaving ? 'Saving...' : 'Save to Firestore Findings Library'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Audit Finding</label>
                <textarea
                  rows={4}
                  value={auditFinding}
                  onChange={(e) => setAuditFinding(e.target.value)}
                  className="w-full p-2.5 text-xs border border-slate-200 rounded-md leading-relaxed"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Risk Statement</label>
                <textarea
                  rows={4}
                  value={riskStatement}
                  onChange={(e) => setRiskStatement(e.target.value)}
                  className="w-full p-2.5 text-xs border border-slate-200 rounded-md leading-relaxed"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Root Cause</label>
                <textarea
                  rows={3}
                  value={rootCause}
                  onChange={(e) => setRootCause(e.target.value)}
                  className="w-full p-2.5 text-xs border border-slate-200 rounded-md leading-relaxed"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Recommendation</label>
                <textarea
                  rows={3}
                  value={recommendation}
                  onChange={(e) => setRecommendation(e.target.value)}
                  className="w-full p-2.5 text-xs border border-slate-200 rounded-md leading-relaxed"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Management Action Plan (Steps)
                </label>
                <input
                  type="text"
                  value={actionSteps}
                  onChange={(e) => setActionSteps(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Owner</label>
                  <input
                    type="text"
                    value={responsibleOwner}
                    onChange={(e) => setResponsibleOwner(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Target Date</label>
                  <input
                    type="text"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-md"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Saved Observation-Derived Findings (Firestore) */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Logged Observation Findings ({filteredObservations.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Persisted field findings with Risk Statements, Root Causes, and Management Action Plans
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter findings..."
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md w-48 focus:outline-none focus:ring-2 focus:ring-blue-900/20"
              />
            </div>
            <select
              value={ratingFilter}
              onChange={(e) => setRatingFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
            >
              <option value="ALL">All Ratings</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Moderate">Moderate</option>
              <option value="Low">Low</option>
            </select>
            {selectedArea && (
              <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md">
                <button
                  type="button"
                  onClick={() => setScopeFilter('area')}
                  className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap shrink-0 ${
                    scopeFilter === 'area' ? 'bg-white text-slate-900' : 'text-slate-600'
                  }`}
                >
                  This Area
                </button>
                <button
                  type="button"
                  onClick={() => setScopeFilter('all')}
                  className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap shrink-0 ${
                    scopeFilter === 'all' ? 'bg-white text-slate-900' : 'text-slate-600'
                  }`}
                >
                  All Universe
                </button>
              </div>
            )}
          </div>
        </div>

        {filteredObservations.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No logged observation findings match your filter. Enter a field observation above to synthesize and store your first finding.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredObservations.map((obs) => (
              <div key={obs.id} className="p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-medium text-slate-700">{obs.areaName}</span>
                      <span aria-hidden="true">·</span>
                      <span>{obs.domain}</span>
                      {obs.sampleTested && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Sample: {obs.sampleTested}</span>
                        </>
                      )}
                    </div>
                    <h4 className="text-base font-semibold text-slate-900">
                      {obs.observationTitle}
                    </h4>
                  </div>

                  <div className="flex items-center gap-2">
                    <RiskIndicator rating={obs.riskRating} />
                    <select
                      disabled={readOnly || obs.status === 'Closed'}
                      value={obs.status}
                      onChange={(e) =>
                        onUpdateObservationStatus(obs.id, e.target.value as ObservationStatus)
                      }
                      className="px-2.5 py-1 text-xs font-medium border border-slate-200 rounded-md bg-white disabled:bg-slate-100 disabled:text-slate-500"
                      title={
                        readOnly
                          ? 'Viewer accounts have read-only access.'
                          : obs.status === 'Closed'
                            ? 'Closed findings are locked per audit governance rules.'
                            : 'Update finding workflow status'
                      }
                    >
                      <option value="Draft">Draft</option>
                      <option value="Validated">Validated</option>
                      <option value="Reported">Reported</option>
                      <option value="Closed">Closed (Locked)</option>
                    </select>
                    {!readOnly && (
                      <>
                        <button
                          type="button"
                          onClick={async () => {
                            await onPromoteToKnowledge(obs);
                            setPromotedIds((prev) => ({ ...prev, [obs.id]: true }));
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
                          title="Save to reusable Knowledge Base"
                        >
                          {promotedIds[obs.id] ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                              Saved to KB
                            </>
                          ) : (
                            <>
                              <BookmarkPlus className="w-3.5 h-3.5" />
                              Save to KB
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteObservation(obs.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                          title="Delete observation"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed">
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-800">Audit Finding</p>
                    <p className="text-slate-700">{obs.auditFinding || obs.observationText}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-800">Risk Statement</p>
                    <p className="text-slate-700">{obs.riskStatement}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-800">Root Cause</p>
                    <p className="text-slate-700">{obs.rootCause}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-800">Recommendation & Action Plan</p>
                    <p className="text-slate-700">{obs.recommendation}</p>
                    {obs.managementActionPlan.actionSteps && (
                      <p className="text-slate-500 pt-1">
                        MAP: {obs.managementActionPlan.actionSteps} ({obs.managementActionPlan.responsibleOwner || 'Unassigned'} · {obs.managementActionPlan.targetDate || 'TBD'})
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Area Potential Findings & Knowledge Base Reference Findings */}
      {(potentialFindings.length > 0 || kbFindings.length > 0) && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-base font-semibold text-slate-900">
              Reference Potential Findings & Knowledge Base Templates ({potentialFindings.length + kbFindings.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Predictive Condition-Criteria-Cause-Effect scenarios and saved firm benchmarks
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {potentialFindings.map((pf) => (
              <div key={pf.id} className="p-5 space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-500">{pf.id}</span>
                    <h4 className="text-sm font-semibold text-slate-900">{pf.title}</h4>
                  </div>
                  <RiskIndicator rating={pf.severity} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-600">
                  <p><span className="font-semibold text-slate-800">Condition:</span> {pf.condition}</p>
                  <p><span className="font-semibold text-slate-800">Criteria:</span> {pf.criteria}</p>
                  <p><span className="font-semibold text-slate-800">Cause:</span> {pf.cause}</p>
                  <p><span className="font-semibold text-slate-800">Effect:</span> {pf.effect}</p>
                </div>
              </div>
            ))}
            {kbFindings.map((kb) => (
              <div key={kb.id} className="p-5 space-y-1.5 bg-slate-50/40">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-xs text-slate-500">
                    Knowledge Base · {kb.domain} · {kb.regulatoryRef || 'Internal Benchmark'}
                  </div>
                  <RiskIndicator rating={kb.riskRating} />
                </div>
                <h4 className="text-sm font-semibold text-slate-900">{kb.title}</h4>
                <p className="text-xs text-slate-600 leading-relaxed">{kb.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
