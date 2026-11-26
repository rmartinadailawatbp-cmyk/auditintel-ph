import { useState } from 'react';
import { Check, Edit3, PlusCircle, Save } from 'lucide-react';
import type { AuditArea, AuditAreaIntelligence } from '../types/audit';
import { RiskIndicator } from './RiskBadge';

interface OverviewTabProps {
  area: AuditArea;
  intelligence: AuditAreaIntelligence;
  onUpdateIntelligence: (updated: AuditAreaIntelligence) => Promise<void>;
  onJumpToObservations: () => void;
  readOnly?: boolean;
}

export function OverviewTab({
  area,
  intelligence,
  onUpdateIntelligence,
  onJumpToObservations,
  readOnly = false,
}: OverviewTabProps) {
  const [editing, setEditing] = useState(false);
  const [auditObjective, setAuditObjective] = useState(intelligence.auditObjective);
  const [processDescription, setProcessDescription] = useState(intelligence.processDescription);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdateIntelligence({
        ...intelligence,
        auditObjective,
        processDescription,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* 4-Column Flat KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-slate-200 rounded-lg bg-white divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="p-4 space-y-1">
          <p className="text-xs font-medium text-slate-500">Overall Risk Rating</p>
          <div className="pt-0.5">
            <RiskIndicator rating={intelligence.riskRating} />
          </div>
          <p className="text-xs text-slate-500 tabular-nums pt-1">
            Residual: {intelligence.riskAssessment.residualRiskRating}
          </p>
        </div>

        <div className="p-4 space-y-1">
          <p className="text-xs font-medium text-slate-500">Inherent Score (L x I)</p>
          <p className="text-xl font-semibold text-slate-900 font-mono tabular-nums">
            {intelligence.riskAssessment.likelihood * intelligence.riskAssessment.impact} / 25
          </p>
          <p className="text-xs text-slate-500 tabular-nums">
            L:{intelligence.riskAssessment.likelihood} · I:{intelligence.riskAssessment.impact} · Controls:{intelligence.riskAssessment.controlEnvironmentScore}/5
          </p>
        </div>

        <div className="p-4 space-y-1">
          <p className="text-xs font-medium text-slate-500">Controls & Weaknesses</p>
          <p className="text-xl font-semibold text-slate-900 font-mono tabular-nums">
            {intelligence.keyControls.length} Controls
          </p>
          <p className="text-xs text-slate-500 tabular-nums">
            {intelligence.controlWeaknesses.length} identified gaps
          </p>
        </div>

        <div className="p-4 space-y-1">
          <p className="text-xs font-medium text-slate-500">Audit Program Scope</p>
          <p className="text-xl font-semibold text-slate-900 font-mono tabular-nums">
            {intelligence.auditProcedures.length} Steps
          </p>
          <p className="text-xs text-slate-500 tabular-nums">
            {intelligence.walkthroughQuestions.length} walkthrough queries
          </p>
        </div>
      </div>

      {/* Audit Objective & Process Description */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Audit Objective & Process Narrative
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {area.entityName} · {area.regulatoryContext || 'IIA IPPF & Philippine Corporate Standards'}
            </p>
          </div>
          {!readOnly && (!editing ? (
            <button
              type="button"
              onClick={() => {
                setAuditObjective(intelligence.auditObjective);
                setProcessDescription(intelligence.processDescription);
                setEditing(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit Narrative
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-700">Audit Objective</h4>
            {editing ? (
              <textarea
                rows={6}
                value={auditObjective}
                onChange={(e) => setAuditObjective(e.target.value)}
                className="w-full p-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20"
              />
            ) : (
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                {intelligence.auditObjective}
              </p>
            )}
          </div>

          <div className="lg:col-span-2 space-y-2">
            <h4 className="text-xs font-semibold text-slate-700">Process Description</h4>
            {editing ? (
              <textarea
                rows={6}
                value={processDescription}
                onChange={(e) => setProcessDescription(e.target.value)}
                className="w-full p-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20"
              />
            ) : (
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                {intelligence.processDescription}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Root Cause Analysis Breakdown */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Root Cause Analysis Framework
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Systemic failure drivers across People, Process, Technology, Policy, and Philippine Regulation
            </p>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={onJumpToObservations}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Log Field Observation
            </button>
          )}
        </div>

        <p className="text-sm text-slate-700 leading-relaxed">
          {intelligence.rootCauseAnalysis.summary}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pt-2">
          {[
            { label: 'People & Accountability', text: intelligence.rootCauseAnalysis.people },
            { label: 'Process & Execution', text: intelligence.rootCauseAnalysis.process },
            { label: 'Systems & Technology', text: intelligence.rootCauseAnalysis.technology },
            { label: 'Policy & Governance', text: intelligence.rootCauseAnalysis.policyGovernance },
            { label: 'External & Regulatory (PH)', text: intelligence.rootCauseAnalysis.externalRegulatory },
          ].map((dim) => (
            <div key={dim.label} className="pt-3 border-t border-slate-100 space-y-1.5">
              <h4 className="text-xs font-semibold text-slate-900">{dim.label}</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                {dim.text || 'No systemic factor specified.'}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Audit Report Narratives Preview */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
        <h3 className="text-base font-semibold text-slate-900 border-b border-slate-100 pb-3">
          Draft Audit Report Narratives
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-700">Executive Summary</h4>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
              {intelligence.auditReportNarratives.executiveSummary}
            </p>
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold text-slate-700">Scope & Methodology</h4>
              <p className="text-sm text-slate-600 leading-relaxed">
                {intelligence.auditReportNarratives.scopeAndMethodology}
              </p>
            </div>
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold text-slate-700">Overall Conclusion</h4>
              <p className="text-sm text-slate-600 leading-relaxed">
                {intelligence.auditReportNarratives.overallConclusion}
              </p>
            </div>
          </div>
        </div>

        {intelligence.auditReportNarratives.keyHighlights.length > 0 && (
          <div className="pt-4 border-t border-slate-100 space-y-2">
            <h4 className="text-xs font-semibold text-slate-700">Key Audit Highlights</h4>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {intelligence.auditReportNarratives.keyHighlights.map((hl, idx) => (
                <li key={idx} className="flex items-start gap-2 text-xs text-slate-700">
                  <Check className="w-3.5 h-3.5 text-blue-900 shrink-0 mt-0.5" />
                  <span>{hl}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
