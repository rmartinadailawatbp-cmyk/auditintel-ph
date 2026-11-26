import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { AuditAreaIntelligence, InherentRiskItem, RiskRating } from '../types/audit';
import { RiskIndicator } from './RiskBadge';

interface RiskAssessmentTabProps {
  intelligence: AuditAreaIntelligence;
  onUpdateIntelligence: (updated: AuditAreaIntelligence) => Promise<void>;
  readOnly?: boolean;
}

export function RiskAssessmentTab({
  intelligence,
  onUpdateIntelligence,
  readOnly = false,
}: RiskAssessmentTabProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [likelihood, setLikelihood] = useState(4);
  const [impact, setImpact] = useState(4);
  const [regulatoryRef, setRegulatoryRef] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAddRisk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const nextRisk: InherentRiskItem = {
        id: `IR-${intelligence.inherentRisks.length + 1}`,
        title: title.trim(),
        description: description.trim(),
        likelihood,
        impact,
        regulatoryRef: regulatoryRef.trim() || 'Corporate Policy / IIA IPPF',
      };
      await onUpdateIntelligence({
        ...intelligence,
        inherentRisks: [...intelligence.inherentRisks, nextRisk],
      });
      setTitle('');
      setDescription('');
      setRegulatoryRef('');
      setShowAdd(false);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveRisk = async (id: string) => {
    await onUpdateIntelligence({
      ...intelligence,
      inherentRisks: intelligence.inherentRisks.filter((r) => r.id !== id),
    });
  };

  const handleUpdateOverallRating = async (rating: RiskRating) => {
    await onUpdateIntelligence({
      ...intelligence,
      riskRating: rating,
    });
  };

  // Build 5x5 matrix cell risk count
  const getCellStyle = (l: number, i: number) => {
    const score = l * i;
    if (score >= 16) return 'bg-red-50 text-red-900 border-red-200';
    if (score >= 10) return 'bg-amber-50 text-amber-900 border-amber-200';
    if (score >= 5) return 'bg-sky-50 text-sky-900 border-sky-200';
    return 'bg-emerald-50 text-emerald-900 border-emerald-200';
  };

  return (
    <div className="space-y-8">
      {/* Top Assessment & 5x5 Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Inherent & Residual Risk Assessment
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                COSO & IIA Risk-Based Scoring Matrix
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Area Rating:</span>
              <select
                disabled={readOnly}
                value={intelligence.riskRating}
                onChange={(e) => handleUpdateOverallRating(e.target.value as RiskRating)}
                className="px-2.5 py-1 text-xs font-medium border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-900/20"
              >
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Moderate">Moderate</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 py-2">
            <div>
              <p className="text-xs text-slate-500">Likelihood</p>
              <p className="text-lg font-semibold font-mono tabular-nums text-slate-900">
                {intelligence.riskAssessment.likelihood} / 5
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Impact</p>
              <p className="text-lg font-semibold font-mono tabular-nums text-slate-900">
                {intelligence.riskAssessment.impact} / 5
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Control Maturity</p>
              <p className="text-lg font-semibold font-mono tabular-nums text-slate-900">
                {intelligence.riskAssessment.controlEnvironmentScore} / 5
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-slate-700">Residual Risk Rating:</span>
              <RiskIndicator rating={intelligence.riskAssessment.residualRiskRating} />
            </div>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
              {intelligence.riskAssessment.rationale}
            </p>
          </div>
        </div>

        {/* 5x5 Matrix */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-6 space-y-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">5x5 Risk Distribution Grid</h4>
            <p className="text-xs text-slate-500">
              Rows: Likelihood (5 High to 1 Low) · Columns: Impact (1 Low to 5 High)
            </p>
          </div>
          <div className="grid grid-cols-6 gap-1 text-center text-xs">
            <div className="p-1 text-[11px] font-medium text-slate-400">L \ I</div>
            {[1, 2, 3, 4, 5].map((imp) => (
              <div key={imp} className="p-1 font-mono tabular-nums font-medium text-slate-500">
                I{imp}
              </div>
            ))}
            {[5, 4, 3, 2, 1].map((lik) => (
              <React.Fragment key={lik}>
                <div className="p-1.5 font-mono tabular-nums font-medium text-slate-500 flex items-center justify-center">
                  L{lik}
                </div>
                {[1, 2, 3, 4, 5].map((imp) => {
                  const risksInCell = intelligence.inherentRisks.filter(
                    (r) => r.likelihood === lik && r.impact === imp
                  );
                  const isCurrentArea =
                    intelligence.riskAssessment.likelihood === lik &&
                    intelligence.riskAssessment.impact === imp;
                  return (
                    <div
                      key={`${lik}-${imp}`}
                      className={`p-1.5 border rounded font-mono tabular-nums min-h-[38px] flex flex-col items-center justify-center ${getCellStyle(
                        lik,
                        imp
                      )} ${isCurrentArea ? 'ring-2 ring-slate-900 font-bold' : ''}`}
                      title={`Likelihood ${lik} x Impact ${imp} = ${lik * imp}`}
                    >
                      <span>{risksInCell.length > 0 ? `${risksInCell.length}R` : lik * imp}</span>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Inherent Risks Register */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Inherent Risks Register ({intelligence.inherentRisks.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Key operational, financial, fraud, and Philippine regulatory exposures prior to control mitigation
            </p>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={() => setShowAdd(!showAdd)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Inherent Risk
            </button>
          )}
        </div>

        {!readOnly && showAdd && (
          <form onSubmit={handleAddRisk} className="p-6 bg-slate-50 border-b border-slate-200 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Risk Title *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Unsubstantiated Input VAT from Non-EOPT Receipts"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Likelihood (1-5)</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={likelihood}
                  onChange={(e) => setLikelihood(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Impact (1-5)</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={impact}
                  onChange={(e) => setImpact(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md font-mono tabular-nums"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Risk Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Explain the exposure mechanism and potential financial/compliance impact..."
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Regulatory / Policy Ref</label>
                <input
                  type="text"
                  value={regulatoryRef}
                  onChange={(e) => setRegulatoryRef(e.target.value)}
                  placeholder="e.g. BIR RR 7-2024"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-1.5 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Risk to Firestore'}
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="py-3 px-4 font-medium w-24">Risk ID</th>
                <th className="py-3 px-4 font-medium">Inherent Risk & Exposure</th>
                <th className="py-3 px-4 font-medium w-48">Regulatory / Policy Ref</th>
                <th className="py-3 px-4 font-medium text-right w-20">L</th>
                <th className="py-3 px-4 font-medium text-right w-20">I</th>
                <th className="py-3 px-4 font-medium text-right w-24">Score</th>
                <th className="py-3 px-4 font-medium w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {intelligence.inherentRisks.map((risk) => {
                const score = risk.likelihood * risk.impact;
                return (
                  <tr key={risk.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 align-top whitespace-nowrap">
                      {risk.id}
                    </td>
                    <td className="py-3 px-4 align-top">
                      <p className="font-medium text-slate-900">{risk.title}</p>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">{risk.description}</p>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 align-top">
                      {risk.regulatoryRef}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-700 align-top">
                      {risk.likelihood}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-700 align-top">
                      {risk.impact}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs font-semibold align-top">
                      <span
                        className={
                          score >= 16
                            ? 'text-red-700'
                            : score >= 10
                              ? 'text-amber-700'
                              : 'text-slate-700'
                        }
                      >
                        {score} / 25
                      </span>
                    </td>
                    <td className="py-3 px-4 align-top text-right">
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => handleRemoveRisk(risk.id)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                          title="Remove risk"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
