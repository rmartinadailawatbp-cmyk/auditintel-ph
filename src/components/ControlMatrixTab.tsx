import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type {
  AuditAreaIntelligence,
  ControlWeaknessItem,
  KeyControlItem,
  RiskRating,
} from '../types/audit';
import { RiskIndicator } from './RiskBadge';

interface ControlMatrixTabProps {
  intelligence: AuditAreaIntelligence;
  onUpdateIntelligence: (updated: AuditAreaIntelligence) => Promise<void>;
  readOnly?: boolean;
}

export function ControlMatrixTab({
  intelligence,
  onUpdateIntelligence,
  readOnly = false,
}: ControlMatrixTabProps) {
  const [showAddControl, setShowAddControl] = useState(false);
  const [controlName, setControlName] = useState('');
  const [controlDesc, setControlDesc] = useState('');
  const [controlOwner, setControlOwner] = useState('');
  const [frequency, setFrequency] = useState('Monthly');
  const [controlType, setControlType] = useState<'Preventive' | 'Detective' | 'Corrective'>('Preventive');
  const [automation, setAutomation] = useState<'Automated' | 'IT-Dependent' | 'Manual'>('Manual');

  const [showAddWeakness, setShowAddWeakness] = useState(false);
  const [weaknessTitle, setWeaknessTitle] = useState('');
  const [gapDesc, setGapDesc] = useState('');
  const [severity, setSeverity] = useState<RiskRating>('High');
  const [affectedControlRef, setAffectedControlRef] = useState('KC-1');

  const handleAddControl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!controlName.trim()) return;
    const item: KeyControlItem = {
      id: `KC-${intelligence.keyControls.length + 1}`,
      controlName: controlName.trim(),
      description: controlDesc.trim(),
      controlOwner: controlOwner.trim() || 'Process Owner',
      frequency,
      controlType,
      automation,
      objectiveRef: intelligence.controlObjectives[0]?.id || 'CO-1',
    };
    await onUpdateIntelligence({
      ...intelligence,
      keyControls: [...intelligence.keyControls, item],
    });
    setControlName('');
    setControlDesc('');
    setControlOwner('');
    setShowAddControl(false);
  };

  const handleAddWeakness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!weaknessTitle.trim()) return;
    const item: ControlWeaknessItem = {
      id: `CW-${intelligence.controlWeaknesses.length + 1}`,
      weaknessTitle: weaknessTitle.trim(),
      gapDescription: gapDesc.trim(),
      severity,
      affectedControlRef: affectedControlRef.trim() || 'KC-1',
    };
    await onUpdateIntelligence({
      ...intelligence,
      controlWeaknesses: [...intelligence.controlWeaknesses, item],
    });
    setWeaknessTitle('');
    setGapDesc('');
    setShowAddWeakness(false);
  };

  return (
    <div className="space-y-8">
      {/* Control Objectives */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-base font-semibold text-slate-900">
            Control Objectives ({intelligence.controlObjectives.length})
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Target assurance outcomes mapped to inherent risks
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="py-2.5 px-4 font-medium w-28">Objective ID</th>
                <th className="py-2.5 px-4 font-medium">Control Objective</th>
                <th className="py-2.5 px-4 font-medium w-32">Mapped Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {intelligence.controlObjectives.map((co) => (
                <tr key={co.id} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">{co.id}</td>
                  <td className="py-2.5 px-4 text-slate-800">{co.objective}</td>
                  <td className="py-2.5 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">{co.riskRef}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Key Controls Matrix */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Key Controls Matrix ({intelligence.keyControls.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Preventive, detective, and corrective controls mapped to process owners and automation level
            </p>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={() => setShowAddControl(!showAddControl)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Key Control
            </button>
          )}
        </div>

        {!readOnly && showAddControl && (
          <form onSubmit={handleAddControl} className="p-6 bg-slate-50 border-b border-slate-200 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Control Name *</label>
                <input
                  type="text"
                  required
                  value={controlName}
                  onChange={(e) => setControlName(e.target.value)}
                  placeholder="e.g. Three-Way Match Prior to AP Voucher Posting"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Control Owner</label>
                <input
                  type="text"
                  value={controlOwner}
                  onChange={(e) => setControlOwner(e.target.value)}
                  placeholder="e.g. Accounts Payable Supervisor"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Control Activity Description</label>
                <input
                  type="text"
                  value={controlDesc}
                  onChange={(e) => setControlDesc(e.target.value)}
                  placeholder="Describe how the control operates and what evidence is retained..."
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Type / Automation</label>
                <div className="flex gap-2">
                  <select
                    value={controlType}
                    onChange={(e) => setControlType(e.target.value as KeyControlItem['controlType'])}
                    className="w-1/2 px-2 py-2 text-xs bg-white border border-slate-200 rounded-md"
                  >
                    <option value="Preventive">Preventive</option>
                    <option value="Detective">Detective</option>
                    <option value="Corrective">Corrective</option>
                  </select>
                  <select
                    value={automation}
                    onChange={(e) => setAutomation(e.target.value as KeyControlItem['automation'])}
                    className="w-1/2 px-2 py-2 text-xs bg-white border border-slate-200 rounded-md"
                  >
                    <option value="Manual">Manual</option>
                    <option value="IT-Dependent">IT-Dependent</option>
                    <option value="Automated">Automated</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Frequency</label>
                <input
                  type="text"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  placeholder="Daily / Per Transaction / Monthly"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddControl(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800"
              >
                Save Control
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="py-3 px-4 font-medium w-24">ID</th>
                <th className="py-3 px-4 font-medium">Key Control & Design</th>
                <th className="py-3 px-4 font-medium w-44">Owner</th>
                <th className="py-3 px-4 font-medium w-32">Frequency</th>
                <th className="py-3 px-4 font-medium w-40">Nature</th>
                <th className="py-3 px-4 font-medium w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {intelligence.keyControls.map((kc) => (
                <tr key={kc.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-mono text-xs text-slate-600 align-top whitespace-nowrap">
                    {kc.id}
                  </td>
                  <td className="py-3 px-4 align-top">
                    <p className="font-medium text-slate-900">{kc.controlName}</p>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">{kc.description}</p>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-700 align-top">{kc.controlOwner}</td>
                  <td className="py-3 px-4 text-xs text-slate-600 align-top whitespace-nowrap">{kc.frequency}</td>
                  <td className="py-3 px-4 text-xs text-slate-700 align-top whitespace-nowrap">
                    {kc.controlType} · {kc.automation}
                  </td>
                  <td className="py-3 px-4 align-top text-right">
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateIntelligence({
                            ...intelligence,
                            keyControls: intelligence.keyControls.filter((c) => c.id !== kc.id),
                          })
                        }
                        className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                        title="Remove control"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Control Weaknesses */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Control Weaknesses & Vulnerability Points ({intelligence.controlWeaknesses.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Design gaps and common operating failure modes in Philippine corporate environments
            </p>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={() => setShowAddWeakness(!showAddWeakness)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Control Weakness
            </button>
          )}
        </div>

        {!readOnly && showAddWeakness && (
          <form onSubmit={handleAddWeakness} className="p-6 bg-slate-50 border-b border-slate-200 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Weakness Title *</label>
                <input
                  type="text"
                  required
                  value={weaknessTitle}
                  onChange={(e) => setWeaknessTitle(e.target.value)}
                  placeholder="e.g. Manual Excel Reconciliation Without Maker-Checker"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Severity</label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as RiskRating)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
                >
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Moderate">Moderate</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Affected Control ID</label>
                <input
                  type="text"
                  value={affectedControlRef}
                  onChange={(e) => setAffectedControlRef(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Gap Description</label>
              <input
                type="text"
                value={gapDesc}
                onChange={(e) => setGapDesc(e.target.value)}
                placeholder="Explain how the control can be bypassed or fail..."
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddWeakness(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800"
              >
                Save Weakness
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="py-3 px-4 font-medium w-24">ID</th>
                <th className="py-3 px-4 font-medium">Weakness & Control Gap</th>
                <th className="py-3 px-4 font-medium w-32">Control Ref</th>
                <th className="py-3 px-4 font-medium w-32">Severity</th>
                <th className="py-3 px-4 font-medium w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {intelligence.controlWeaknesses.map((cw) => (
                <tr key={cw.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-mono text-xs text-slate-600 align-top whitespace-nowrap">
                    {cw.id}
                  </td>
                  <td className="py-3 px-4 align-top">
                    <p className="font-medium text-slate-900">{cw.weaknessTitle}</p>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">{cw.gapDescription}</p>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-600 align-top whitespace-nowrap">
                    {cw.affectedControlRef}
                  </td>
                  <td className="py-3 px-4 align-top">
                    <RiskIndicator rating={cw.severity} />
                  </td>
                  <td className="py-3 px-4 align-top text-right">
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateIntelligence({
                            ...intelligence,
                            controlWeaknesses: intelligence.controlWeaknesses.filter((w) => w.id !== cw.id),
                          })
                        }
                        className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                        title="Remove weakness"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
