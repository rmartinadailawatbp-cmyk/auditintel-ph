import React, { useMemo, useState } from 'react';
import { BookOpen, Plus, Search, Trash2, X } from 'lucide-react';
import {
  AUDIT_DOMAINS,
  type AuditDomain,
  type KnowledgeItem,
  type KnowledgeItemType,
  type RiskRating,
} from '../types/audit';
import {
  STARTER_PH_KNOWLEDGE_ITEMS,
  type StarterKnowledgeInput,
} from '../data/starterUniverse';
import { RiskIndicator } from './RiskBadge';

interface KnowledgeBaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: KnowledgeItem[];
  onAddItem: (input: StarterKnowledgeInput) => Promise<void>;
  onSeedStarterKnowledge: () => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  readOnly?: boolean;
}

const KB_TYPES: Array<{ value: KnowledgeItemType; label: string }> = [
  { value: 'finding', label: 'Finding Template' },
  { value: 'recommendation', label: 'Recommendation' },
  { value: 'control', label: 'Key Control' },
  { value: 'procedure', label: 'Audit Procedure' },
  { value: 'regulatory_note', label: 'PH Regulatory Note' },
  { value: 'assistant_insight', label: 'Assistant Insight' },
];

export function KnowledgeBaseModal({
  isOpen,
  onClose,
  items,
  onAddItem,
  onSeedStarterKnowledge,
  onDeleteItem,
  readOnly = false,
}: KnowledgeBaseModalProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [showCreate, setShowCreate] = useState(false);

  const [type, setType] = useState<KnowledgeItemType>('regulatory_note');
  const [domain, setDomain] = useState<AuditDomain>('Finance');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [riskRating, setRiskRating] = useState<RiskRating | 'Informational'>('High');
  const [regulatoryRef, setRegulatoryRef] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (typeFilter !== 'ALL' && item.type !== typeFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${item.title} ${item.content} ${item.domain} ${item.regulatoryRef} ${item.tags.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, typeFilter, search]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      await onAddItem({
        type,
        domain,
        title: title.trim(),
        content: content.trim(),
        riskRating,
        regulatoryRef: regulatoryRef.trim(),
        tags: tagsRaw
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 10),
      });
      setTitle('');
      setContent('');
      setRegulatoryRef('');
      setTagsRaw('');
      setShowCreate(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kb-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="kb-modal-title" className="text-lg font-semibold text-slate-900">
              Philippine Audit Knowledge Base ({items.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Persistent Firestore repository automatically injected into AI area generation, observation analysis, and Audit GPT responses.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100"
            aria-label="Close Knowledge Base"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search BIR, SEC, branch, inventory..."
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md w-56"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
            >
              <option value="ALL">All Types</option>
              {KB_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          {!readOnly && (
            <div className="flex items-center gap-2">
              {items.length === 0 && (
                <button
                  type="button"
                  onClick={onSeedStarterKnowledge}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-100 whitespace-nowrap shrink-0"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  Seed PH Audit Standards ({STARTER_PH_KNOWLEDGE_ITEMS.length})
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowCreate(!showCreate)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Knowledge Entry
              </button>
            </div>
          )}
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {!readOnly && showCreate && (
            <form onSubmit={handleSubmit} className="p-5 bg-slate-50 border border-slate-200 rounded-lg space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Entry Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as KnowledgeItemType)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md"
                  >
                    {KB_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Domain</label>
                  <select
                    value={domain}
                    onChange={(e) => setDomain(e.target.value as AuditDomain)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md"
                  >
                    {AUDIT_DOMAINS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Risk / Priority</label>
                  <select
                    value={riskRating}
                    onChange={(e) => setRiskRating(e.target.value as RiskRating | 'Informational')}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md"
                  >
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Moderate">Moderate</option>
                    <option value="Low">Low</option>
                    <option value="Informational">Informational</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Title *</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. BIR Form 2307 Substantiation Rule for Services"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Regulatory / Policy Reference
                  </label>
                  <input
                    type="text"
                    value={regulatoryRef}
                    onChange={(e) => setRegulatoryRef(e.target.value)}
                    placeholder="e.g. NIRC Sec. 34(K) / BIR RR 11-2018"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Detailed Guidance / Rule / Audit Standard *
                </label>
                <textarea
                  rows={3}
                  required
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tags (comma-separated, max 10)
                </label>
                <input
                  type="text"
                  value={tagsRaw}
                  onChange={(e) => setTagsRaw(e.target.value)}
                  placeholder="BIR, Withholding Tax, 2307"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save to Knowledge Base'}
                </button>
              </div>
            </form>
          )}

          {filtered.length === 0 ? (
            <div className="p-10 text-center space-y-3 border border-slate-200 rounded-lg">
              <p className="text-sm text-slate-600">
                Your Firestore Audit Knowledge Base has no matching entries yet.
              </p>
              {!readOnly && (
                <button
                  type="button"
                  onClick={onSeedStarterKnowledge}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  Load Philippine Audit Starter Benchmarks
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
              {filtered.map((item) => (
                <div key={item.id} className="p-5 space-y-2 hover:bg-slate-50/50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-medium text-slate-700">
                          {KB_TYPES.find((t) => t.value === item.type)?.label || item.type}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{item.domain}</span>
                        {item.regulatoryRef && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{item.regulatoryRef}</span>
                          </>
                        )}
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <RiskIndicator rating={item.riskRating} />
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => onDeleteItem(item.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                          title="Delete knowledge item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                    {item.content}
                  </p>
                  {item.tags.length > 0 && (
                    <p className="text-[11px] text-slate-500">
                      Keywords: {item.tags.join(' · ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
