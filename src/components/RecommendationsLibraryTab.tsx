import React, { useMemo, useState } from 'react';
import { Download, Plus, Search } from 'lucide-react';
import {
  AUDIT_DOMAINS,
  RISK_RATINGS,
  type AuditArea,
  type AuditDomain,
  type AuditObservation,
  type KnowledgeItem,
  type RiskRating,
} from '../types/audit';
import { RiskIndicator } from './RiskBadge';

interface RecommendationsLibraryTabProps {
  selectedArea: AuditArea | null;
  observations: AuditObservation[];
  knowledgeItems: KnowledgeItem[];
  onAddKnowledgeRecommendation: (input: {
    domain: AuditDomain;
    title: string;
    content: string;
    riskRating: RiskRating;
    regulatoryRef: string;
    tags: string[];
  }) => Promise<void>;
  readOnly?: boolean;
}

interface UnifiedRecommendation {
  id: string;
  source: 'Area Intelligence' | 'Observation MAP' | 'Knowledge Base';
  domain: string;
  priority: RiskRating | 'Informational';
  title: string;
  detail: string;
  owner: string;
  timeline: string;
  status: string;
}

export function RecommendationsLibraryTab({
  selectedArea,
  observations,
  knowledgeItems,
  onAddKnowledgeRecommendation,
  readOnly = false,
}: RecommendationsLibraryTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [showAdd, setShowAdd] = useState(false);

  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newDomain, setNewDomain] = useState<AuditDomain>(selectedArea?.domain || 'Operations');
  const [newPriority, setNewPriority] = useState<RiskRating>('High');
  const [newRegRef, setNewRegRef] = useState('');
  const [saving, setSaving] = useState(false);

  const unifiedList = useMemo<UnifiedRecommendation[]>(() => {
    const list: UnifiedRecommendation[] = [];

    if (selectedArea?.intelligence?.recommendations) {
      for (const r of selectedArea.intelligence.recommendations) {
        list.push({
          id: `area-${r.id}`,
          source: 'Area Intelligence',
          domain: selectedArea.domain,
          priority: r.priority,
          title: r.actionTitle,
          detail: `${r.detailedAction}${r.expectedBenefit ? ` Expected benefit: ${r.expectedBenefit}` : ''}`,
          owner: r.targetOwner,
          timeline: r.timeline,
          status: 'Proposed',
        });
      }
    }

    for (const o of observations) {
      if (o.recommendation || o.managementActionPlan.actionSteps) {
        list.push({
          id: `obs-${o.id}`,
          source: 'Observation MAP',
          domain: o.domain,
          priority: o.riskRating,
          title: o.observationTitle,
          detail: `${o.recommendation}${o.managementActionPlan.actionSteps ? ` | Action Plan: ${o.managementActionPlan.actionSteps}` : ''}`,
          owner: o.managementActionPlan.responsibleOwner || 'Process Owner',
          timeline: o.managementActionPlan.targetDate || 'TBD',
          status: o.managementActionPlan.status,
        });
      }
    }

    for (const kb of knowledgeItems) {
      if (kb.type === 'recommendation' || kb.type === 'control') {
        list.push({
          id: `kb-${kb.id}`,
          source: 'Knowledge Base',
          domain: kb.domain,
          priority: kb.riskRating,
          title: kb.title,
          detail: kb.content,
          owner: kb.regulatoryRef || 'Enterprise Standard',
          timeline: 'Standard Control',
          status: 'Library Benchmark',
        });
      }
    }

    return list.filter((item) => {
      if (priorityFilter !== 'ALL' && item.priority !== priorityFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const hay = `${item.title} ${item.detail} ${item.domain} ${item.owner}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [selectedArea, observations, knowledgeItems, priorityFilter, searchTerm]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;
    setSaving(true);
    try {
      await onAddKnowledgeRecommendation({
        domain: newDomain,
        title: newTitle.trim(),
        content: newContent.trim(),
        riskRating: newPriority,
        regulatoryRef: newRegRef.trim(),
        tags: [newDomain],
      });
      setNewTitle('');
      setNewContent('');
      setNewRegRef('');
      setShowAdd(false);
    } finally {
      setSaving(false);
    }
  };

  const handleExportCsv = () => {
    const headers = ['Source', 'Domain', 'Priority', 'Title', 'Recommendation & Action Plan', 'Owner', 'Timeline', 'Status'];
    const escapeCsv = (val: string) => `"${val.replace(/"/g, '""')}"`;
    const rows = unifiedList.map((r) => [
      r.source,
      r.domain,
      r.priority,
      r.title,
      r.detail,
      r.owner,
      r.timeline,
      r.status,
    ]);
    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit-recommendations-library.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Recommendations & Action Plans Library ({unifiedList.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Consolidated remediation controls from Area Intelligence, Field Observation MAPs, and the Audit Knowledge Base
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search recommendations..."
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md w-48 focus:outline-none focus:ring-2 focus:ring-blue-900/20"
              />
            </div>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
            >
              <option value="ALL">All Priorities</option>
              {RISK_RATINGS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
            {!readOnly && (
              <button
                type="button"
                onClick={() => setShowAdd(!showAdd)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Add to Library
              </button>
            )}
          </div>
        </div>

        {!readOnly && showAdd && (
          <form onSubmit={handleAdd} className="p-6 bg-slate-50 border-b border-slate-200 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Recommendation Title *
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Enforce Automated EOPT Sales Invoice Validation at AP Posting"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Domain</label>
                <select
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value as AuditDomain)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
                >
                  {AUDIT_DOMAINS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Priority</label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value as RiskRating)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
                >
                  {RISK_RATINGS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Regulatory / Policy Reference
                </label>
                <input
                  type="text"
                  value={newRegRef}
                  onChange={(e) => setNewRegRef(e.target.value)}
                  placeholder="e.g. BIR RR 7-2024 / Corporate Treasury SOP"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Detailed Corrective Action *
              </label>
              <textarea
                rows={3}
                required
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
              />
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
                {saving ? 'Saving...' : 'Save Recommendation'}
              </button>
            </div>
          </form>
        )}

        {unifiedList.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No recommendations found matching your filter. Select an Audit Area to generate recommendations or log a custom recommendation above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-3 px-4 font-medium w-36">Source</th>
                  <th className="py-3 px-4 font-medium">Recommendation & Remediation Plan</th>
                  <th className="py-3 px-4 font-medium w-40">Owner / Ref</th>
                  <th className="py-3 px-4 font-medium w-28">Timeline</th>
                  <th className="py-3 px-4 font-medium w-32">Priority</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {unifiedList.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 align-top text-xs text-slate-600">
                      <p className="font-medium text-slate-800">{rec.source}</p>
                      <p className="text-slate-500 mt-0.5">{rec.domain}</p>
                    </td>
                    <td className="py-3 px-4 align-top">
                      <p className="font-medium text-slate-900">{rec.title}</p>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">{rec.detail}</p>
                    </td>
                    <td className="py-3 px-4 align-top text-xs text-slate-700">{rec.owner}</td>
                    <td className="py-3 px-4 align-top text-xs text-slate-600 whitespace-nowrap">
                      <p>{rec.timeline}</p>
                      <p className="text-slate-400 mt-0.5">{rec.status}</p>
                    </td>
                    <td className="py-3 px-4 align-top">
                      <RiskIndicator rating={rec.priority} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
