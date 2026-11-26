import React, { useState } from 'react';
import { BookmarkPlus, CheckCircle2, Loader2, Send, X } from 'lucide-react';
import type {
  AssistantMessage,
  AuditArea,
  AuditDomain,
  AuditObservation,
  KnowledgeItem,
} from '../types/audit';
import { queryAuditAssistant } from '../services/aiService';
import type { StarterKnowledgeInput } from '../data/starterUniverse';

interface AuditAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedArea: AuditArea | null;
  knowledgeItems: KnowledgeItem[];
  observations: AuditObservation[];
  onSaveKnowledgeItem: (input: StarterKnowledgeInput & { sourceAreaId?: string }) => Promise<void>;
  readOnly?: boolean;
}

const STARTER_PROMPTS = [
  'What BIR substantiation & EOPT Act (RA 11976) risks apply to branch petty cash and supplier disbursements?',
  'Design a sampling & surprise count methodology for multi-branch Cash-in-Vault and POS Z-reading reconciliation.',
  'List key fraud indicators in Philippine scrap asset disposal and procurement 3-bid canvassing.',
  'Draft an Audit Committee escalation memo for repeated warehouse inventory shrinkage variances.',
];

export function AuditAssistantDrawer({
  isOpen,
  onClose,
  selectedArea,
  knowledgeItems,
  observations,
  onSaveKnowledgeItem,
  readOnly = false,
}: AuditAssistantDrawerProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const sendPrompt = async (promptText: string) => {
    const text = promptText.trim();
    if (!text || loading) return;
    setError('');

    const userMsg: AssistantMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    try {
      const response = await queryAuditAssistant({
        messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
        selectedArea,
        knowledgeItems,
        observations,
      });

      const assistantMsg: AssistantMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: response.reply,
        timestamp: new Date().toISOString(),
        suggestedKnowledgeItem: response.suggestedKnowledgeItem,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach Internal Audit Assistant.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendPrompt(input);
  };

  const handleSaveSuggestion = async (msg: AssistantMessage) => {
    if (!msg.suggestedKnowledgeItem) return;
    await onSaveKnowledgeItem({
      type: msg.suggestedKnowledgeItem.type,
      domain: (selectedArea?.domain || 'Philippine Corporate') as AuditDomain,
      title: msg.suggestedKnowledgeItem.title,
      content: msg.suggestedKnowledgeItem.content,
      riskRating: msg.suggestedKnowledgeItem.riskRating,
      regulatoryRef: msg.suggestedKnowledgeItem.regulatoryRef,
      tags: msg.suggestedKnowledgeItem.tags,
      sourceAreaId: selectedArea?.id || '',
    });
    setSavedIds((prev) => ({ ...prev, [msg.id]: true }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex justify-end" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl bg-white border-l border-slate-200 h-full flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Philippine Internal Audit Assistant
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {selectedArea
                ? `Context: ${selectedArea.areaCode} · ${selectedArea.name}`
                : 'Grounded in Philippine Corporate, BIR, SEC, BSP & IIA Standards'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100"
            aria-label="Close Assistant"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {messages.length === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 leading-relaxed">
                Ask for Philippine corporate audit procedures, BIR/SEC/BSP compliance interpretations, sampling guidance, root-cause diagnostics, or fraud red flags across operations, inventory, procurement, disposal, treasury, and branch networks.
              </p>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700">Suggested Queries</p>
                <div className="space-y-2">
                  {STARTER_PROMPTS.map((sp) => (
                    <button
                      key={sp}
                      type="button"
                      onClick={() => sendPrompt(sp)}
                      className="w-full text-left p-3 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 transition-colors"
                    >
                      {sp}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`space-y-2 ${
                msg.role === 'user' ? 'pl-8' : 'pr-4'
              }`}
            >
              <div
                className={`p-4 rounded-lg text-sm leading-relaxed whitespace-pre-line ${
                  msg.role === 'user'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-50 border border-slate-200 text-slate-800'
                }`}
              >
                {msg.content}
              </div>

              {msg.role === 'assistant' && msg.suggestedKnowledgeItem && (
                <div className="p-3 border border-slate-200 rounded-md bg-white flex items-start justify-between gap-3">
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">
                      {msg.suggestedKnowledgeItem.title}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {msg.suggestedKnowledgeItem.regulatoryRef || 'Audit Knowledge Insight'}
                    </p>
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      disabled={savedIds[msg.id]}
                      onClick={() => handleSaveSuggestion(msg)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-900 bg-sky-50 border border-sky-200 rounded hover:bg-sky-100 disabled:opacity-60 whitespace-nowrap shrink-0"
                    >
                      {savedIds[msg.id] ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                          Saved to KB
                        </>
                      ) : (
                        <>
                          <BookmarkPlus className="w-3.5 h-3.5" />
                          Save to Knowledge Base
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin text-blue-900" />
              <span>Analyzing against Philippine audit standards and your knowledge base...</span>
            </div>
          )}

          {error && (
            <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-4 border-t border-slate-200 bg-white flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask an audit, BIR, procurement, branch, or inventory question..."
            className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}
