import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import type {
  AuditAreaIntelligence,
  AuditProcedureItem,
  WalkthroughQuestionItem,
} from '../types/audit';

interface AuditProceduresTabProps {
  intelligence: AuditAreaIntelligence;
  onUpdateIntelligence: (updated: AuditAreaIntelligence) => Promise<void>;
  readOnly?: boolean;
}

export function AuditProceduresTab({
  intelligence,
  onUpdateIntelligence,
  readOnly = false,
}: AuditProceduresTabProps) {
  const [showAddProc, setShowAddProc] = useState(false);
  const [procType, setProcType] = useState<AuditProcedureItem['procedureType']>('Inspection');
  const [objective, setObjective] = useState('');
  const [stepDetail, setStepDetail] = useState('');
  const [sampleSizeGuidance, setSampleSizeGuidance] = useState('25 transactions');
  const [expectedEvidence, setExpectedEvidence] = useState('');

  const [showAddWalkthrough, setShowAddWalkthrough] = useState(false);
  const [intervieweeRole, setIntervieweeRole] = useState('');
  const [question, setQuestion] = useState('');
  const [expectedResponse, setExpectedResponse] = useState('');
  const [redFlagIndicator, setRedFlagIndicator] = useState('');

  const handleStatusChange = async (
    procId: string,
    nextStatus: AuditProcedureItem['testingStatus']
  ) => {
    const updated = intelligence.auditProcedures.map((p) =>
      p.id === procId ? { ...p, testingStatus: nextStatus } : p
    );
    await onUpdateIntelligence({
      ...intelligence,
      auditProcedures: updated,
    });
  };

  const handleAddProcedure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stepDetail.trim()) return;
    const item: AuditProcedureItem = {
      id: `AP-${intelligence.auditProcedures.length + 1}`,
      procedureType: procType,
      objective: objective.trim() || 'Verify control operating effectiveness',
      stepDetail: stepDetail.trim(),
      sampleSizeGuidance: sampleSizeGuidance.trim() || '25 items',
      expectedEvidence: expectedEvidence.trim() || 'Signed vouchers and system logs',
      testingStatus: 'Not Started',
    };
    await onUpdateIntelligence({
      ...intelligence,
      auditProcedures: [...intelligence.auditProcedures, item],
    });
    setObjective('');
    setStepDetail('');
    setExpectedEvidence('');
    setShowAddProc(false);
  };

  const handleAddWalkthrough = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    const item: WalkthroughQuestionItem = {
      id: `WQ-${intelligence.walkthroughQuestions.length + 1}`,
      intervieweeRole: intervieweeRole.trim() || 'Process Owner',
      question: question.trim(),
      expectedResponse: expectedResponse.trim(),
      redFlagIndicator: redFlagIndicator.trim(),
    };
    await onUpdateIntelligence({
      ...intelligence,
      walkthroughQuestions: [...intelligence.walkthroughQuestions, item],
    });
    setIntervieweeRole('');
    setQuestion('');
    setExpectedResponse('');
    setRedFlagIndicator('');
    setShowAddWalkthrough(false);
  };

  return (
    <div className="space-y-8">
      {/* Audit Procedures Workpaper */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Audit Program & Fieldwork Procedures ({intelligence.auditProcedures.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Substantive and compliance test steps with live workpaper status persisted to Firestore
            </p>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={() => setShowAddProc(!showAddProc)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Audit Procedure
            </button>
          )}
        </div>

        {!readOnly && showAddProc && (
          <form onSubmit={handleAddProcedure} className="p-6 bg-slate-50 border-b border-slate-200 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Procedure Type</label>
                <select
                  value={procType}
                  onChange={(e) => setProcType(e.target.value as AuditProcedureItem['procedureType'])}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
                >
                  <option value="Inspection">Inspection</option>
                  <option value="Reperformance">Reperformance</option>
                  <option value="Observation">Observation</option>
                  <option value="Analytical">Analytical</option>
                  <option value="Inquiry">Inquiry</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Sample Size Guidance</label>
                <input
                  type="text"
                  value={sampleSizeGuidance}
                  onChange={(e) => setSampleSizeGuidance(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Expected Evidence</label>
                <input
                  type="text"
                  value={expectedEvidence}
                  onChange={(e) => setExpectedEvidence(e.target.value)}
                  placeholder="e.g. BIR Form 2307, Sales Invoice, Bank Statement"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Test Objective</label>
              <input
                type="text"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="e.g. Confirm compliance with EOPT Sales Invoice rules"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Procedure Step Detail *</label>
              <textarea
                rows={2}
                required
                value={stepDetail}
                onChange={(e) => setStepDetail(e.target.value)}
                placeholder="Describe exact audit test steps to perform..."
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddProc(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800"
              >
                Save Procedure
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="py-3 px-4 font-medium w-20">Step</th>
                <th className="py-3 px-4 font-medium w-28">Method</th>
                <th className="py-3 px-4 font-medium">Audit Procedure & Objective</th>
                <th className="py-3 px-4 font-medium w-44">Sampling & Evidence</th>
                <th className="py-3 px-4 font-medium w-44">Workpaper Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {intelligence.auditProcedures.map((proc) => (
                <tr key={proc.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-mono text-xs text-slate-600 align-top whitespace-nowrap">
                    {proc.id}
                  </td>
                  <td className="py-3 px-4 text-xs font-medium text-slate-700 align-top whitespace-nowrap">
                    {proc.procedureType}
                  </td>
                  <td className="py-3 px-4 align-top">
                    <p className="text-xs font-semibold text-slate-900">{proc.objective}</p>
                    <p className="text-xs text-slate-700 mt-1 leading-relaxed">{proc.stepDetail}</p>
                  </td>
                  <td className="py-3 px-4 align-top space-y-1">
                    <p className="text-xs text-slate-700">
                      <span className="font-medium">Sample:</span> {proc.sampleSizeGuidance}
                    </p>
                    <p className="text-xs text-slate-500">
                      <span className="font-medium text-slate-600">Evidence:</span> {proc.expectedEvidence}
                    </p>
                  </td>
                  <td className="py-3 px-4 align-top">
                    <select
                      disabled={readOnly}
                      value={proc.testingStatus}
                      onChange={(e) =>
                        handleStatusChange(
                          proc.id,
                          e.target.value as AuditProcedureItem['testingStatus']
                        )
                      }
                      className={`w-full px-2.5 py-1.5 text-xs font-medium border rounded-md bg-white disabled:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-900/20 ${
                        proc.testingStatus === 'Exception Noted'
                          ? 'border-red-300 text-red-700'
                          : proc.testingStatus === 'Tested - Effective'
                            ? 'border-emerald-300 text-emerald-800'
                            : 'border-slate-200 text-slate-700'
                      }`}
                    >
                      <option value="Not Started">Not Started</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Tested - Effective">Tested - Effective</option>
                      <option value="Exception Noted">Exception Noted</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Walkthrough Questions */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Process Walkthrough Questions ({intelligence.walkthroughQuestions.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Targeted inquiry prompts, expected control responses, and fraud/error red flags
            </p>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={() => setShowAddWalkthrough(!showAddWalkthrough)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Walkthrough Question
            </button>
          )}
        </div>

        {!readOnly && showAddWalkthrough && (
          <form onSubmit={handleAddWalkthrough} className="p-6 bg-slate-50 border-b border-slate-200 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Interviewee Role</label>
                <input
                  type="text"
                  value={intervieweeRole}
                  onChange={(e) => setIntervieweeRole(e.target.value)}
                  placeholder="e.g. Branch Cashier / Warehouse Head"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Walkthrough Question *</label>
                <input
                  type="text"
                  required
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask how exceptions, overrides, or cut-offs are handled..."
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Expected Control Response</label>
                <input
                  type="text"
                  value={expectedResponse}
                  onChange={(e) => setExpectedResponse(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Red Flag Indicator</label>
                <input
                  type="text"
                  value={redFlagIndicator}
                  onChange={(e) => setRedFlagIndicator(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddWalkthrough(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800"
              >
                Save Question
              </button>
            </div>
          </form>
        )}

        <div className="divide-y divide-slate-100">
          {intelligence.walkthroughQuestions.map((wq) => (
            <div key={wq.id} className="p-5 space-y-2 hover:bg-slate-50/50">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-mono font-medium text-slate-700">{wq.id}</span>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-slate-700">{wq.intervieweeRole}</span>
              </div>
              <p className="text-sm font-medium text-slate-900">{wq.question}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 text-xs">
                <div>
                  <span className="font-semibold text-slate-700">Expected Response: </span>
                  <span className="text-slate-600">{wq.expectedResponse}</span>
                </div>
                <div>
                  <span className="font-semibold text-red-700">Red Flag: </span>
                  <span className="text-slate-600">{wq.redFlagIndicator}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
