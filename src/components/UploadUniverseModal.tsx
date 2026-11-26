import React, { useState } from 'react';
import { Download, FileSpreadsheet, Plus, Upload, X } from 'lucide-react';
import {
  AUDIT_DOMAINS,
  RISK_RATINGS,
  type AuditDomain,
  type RiskRating,
} from '../types/audit';
import {
  STARTER_PH_AUDIT_UNIVERSE,
  type StarterAuditAreaInput,
} from '../data/starterUniverse';
import {
  downloadUniverseCsvTemplate,
  parseUniverseFile,
} from '../utils/universeParser';

interface UploadUniverseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportAreas: (areas: StarterAuditAreaInput[]) => Promise<void>;
}

export function UploadUniverseModal({
  isOpen,
  onClose,
  onImportAreas,
}: UploadUniverseModalProps) {
  const [mode, setMode] = useState<'file' | 'manual' | 'starter'>('file');
  const [parsedAreas, setParsedAreas] = useState<StarterAuditAreaInput[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Manual entry state
  const [areaCode, setAreaCode] = useState('');
  const [name, setName] = useState('');
  const [domain, setDomain] = useState<AuditDomain>('Operations');
  const [entityName, setEntityName] = useState('');
  const [inherentRiskTier, setInherentRiskTier] = useState<RiskRating>('High');
  const [regulatoryContext, setRegulatoryContext] = useState('');
  const [description, setDescription] = useState('');
  const [lastAuditDate, setLastAuditDate] = useState('Unscheduled');

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setFileName(file.name);
    try {
      const areas = await parseUniverseFile(file);
      setParsedAreas(areas);
    } catch (err) {
      setParsedAreas([]);
      setError(err instanceof Error ? err.message : 'Unable to parse uploaded file.');
    }
  };

  const handleConfirmFileImport = async () => {
    if (parsedAreas.length === 0) return;
    setIsSaving(true);
    setError('');
    try {
      await onImportAreas(parsedAreas);
      setParsedAreas([]);
      setFileName('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save Audit Universe.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadStarterUniverse = async () => {
    setIsSaving(true);
    setError('');
    try {
      await onImportAreas(STARTER_PH_AUDIT_UNIVERSE);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load starter Audit Universe.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Audit Area name is required.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      await onImportAreas([
        {
          areaCode: areaCode.trim() || `AUD-${Date.now().toString().slice(-3)}`,
          name: name.trim(),
          domain,
          entityName: entityName.trim() || 'Corporate Head Office',
          inherentRiskTier,
          regulatoryContext: regulatoryContext.trim(),
          description: description.trim(),
          lastAuditDate: lastAuditDate.trim() || 'Unscheduled',
        },
      ]);
      setAreaCode('');
      setName('');
      setEntityName('');
      setRegulatoryContext('');
      setDescription('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save Audit Area.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-universe-title"
    >
      <div className="bg-white border border-slate-200 rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="upload-universe-title" className="text-lg font-semibold text-slate-900">
              Audit Universe Intake
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Upload Excel, CSV, or JSON schedules, add an individual auditable unit, or seed the Philippine Corporate Starter Universe.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pt-4 border-b border-slate-200 bg-slate-50/60">
          <div className="flex items-center gap-2 pb-3">
            <button
              type="button"
              onClick={() => {
                setMode('file');
                setError('');
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                mode === 'file'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Upload File (.xlsx / .csv / .json)
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('manual');
                setError('');
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                mode === 'manual'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Add Single Area
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('starter');
                setError('');
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                mode === 'starter'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Philippine Corporate Starter (9 Areas)
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {error && (
            <div className="p-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          {mode === 'file' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-slate-600">
                  Expected columns: <span className="font-mono text-xs text-slate-800">Area Code, Audit Area, Domain, Entity Name, Inherent Risk Tier, Regulatory Context, Description, Last Audit Date</span>
                </p>
                <button
                  type="button"
                  onClick={downloadUniverseCsvTemplate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download CSV Template
                </button>
              </div>

              <label className="block border border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer hover:border-slate-500 hover:bg-slate-50/70 transition-colors">
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.json"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <FileSpreadsheet className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-900">
                  {fileName ? `Selected: ${fileName}` : 'Choose an Audit Universe file (.xlsx, .csv, or .json)'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Up to 60 auditable units per upload batch
                </p>
              </label>

              {parsedAreas.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">
                      Preview ({parsedAreas.length} Audit Areas Ready to Import)
                    </span>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={handleConfirmFileImport}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {isSaving ? 'Saving to Firestore...' : `Import ${parsedAreas.length} Areas`}
                    </button>
                  </div>
                  <div className="border border-slate-200 rounded-md overflow-x-auto max-h-60">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <tr>
                          <th className="py-2 px-3 font-medium">Code</th>
                          <th className="py-2 px-3 font-medium">Audit Area</th>
                          <th className="py-2 px-3 font-medium">Domain</th>
                          <th className="py-2 px-3 font-medium">Entity</th>
                          <th className="py-2 px-3 font-medium">Risk Tier</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsedAreas.map((a, idx) => (
                          <tr key={`${a.areaCode}-${idx}`}>
                            <td className="py-2 px-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                              {a.areaCode}
                            </td>
                            <td className="py-2 px-3 font-medium text-slate-900">{a.name}</td>
                            <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{a.domain}</td>
                            <td className="py-2 px-3 text-slate-600">{a.entityName}</td>
                            <td className="py-2 px-3 text-slate-700 whitespace-nowrap">{a.inherentRiskTier}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {mode === 'manual' && (
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Area Code
                  </label>
                  <input
                    type="text"
                    value={areaCode}
                    onChange={(e) => setAreaCode(e.target.value)}
                    placeholder="e.g. BRN-04"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Audit Area Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Branch Cash Handling & Daily POS Remittance"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Audit Domain
                  </label>
                  <select
                    value={domain}
                    onChange={(e) => setDomain(e.target.value as AuditDomain)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                  >
                    {AUDIT_DOMAINS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Entity / Branch / Department
                  </label>
                  <input
                    type="text"
                    value={entityName}
                    onChange={(e) => setEntityName(e.target.value)}
                    placeholder="e.g. VisMin Retail Operations"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Inherent Risk Tier
                  </label>
                  <select
                    value={inherentRiskTier}
                    onChange={(e) => setInherentRiskTier(e.target.value as RiskRating)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                  >
                    {RISK_RATINGS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Regulatory & Policy Context
                  </label>
                  <input
                    type="text"
                    value={regulatoryContext}
                    onChange={(e) => setRegulatoryContext(e.target.value)}
                    placeholder="e.g. BIR RR 7-2024 (EOPT), PAS 2, SEC MC, Corporate DOA"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Last Audit Cycle
                  </label>
                  <input
                    type="text"
                    value={lastAuditDate}
                    onChange={(e) => setLastAuditDate(e.target.value)}
                    placeholder="e.g. 2025-Q4"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Scope & Process Notes
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe processes, key systems, or known pain points..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {isSaving ? 'Saving...' : 'Add Audit Area'}
                </button>
              </div>
            </form>
          )}

          {mode === 'starter' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-slate-600">
                  Import 9 pre-structured Philippine corporate auditable areas spanning Finance/BIR, Branch Operations, Inventory, Procurement, Treasury, Asset Disposal, Logistics Operations, SEC Compliance, and Data Privacy (RA 10173).
                </p>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleLoadStarterUniverse}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {isSaving ? 'Importing...' : 'Load All 9 Starter Areas'}
                </button>
              </div>

              <div className="border border-slate-200 rounded-md overflow-x-auto max-h-72">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2 px-3 font-medium">Code</th>
                      <th className="py-2 px-3 font-medium">Audit Area</th>
                      <th className="py-2 px-3 font-medium">Domain</th>
                      <th className="py-2 px-3 font-medium">Regulatory Context</th>
                      <th className="py-2 px-3 font-medium">Risk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {STARTER_PH_AUDIT_UNIVERSE.map((item) => (
                      <tr key={item.areaCode}>
                        <td className="py-2 px-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                          {item.areaCode}
                        </td>
                        <td className="py-2 px-3 font-medium text-slate-900">{item.name}</td>
                        <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{item.domain}</td>
                        <td className="py-2 px-3 text-slate-600">{item.regulatoryContext}</td>
                        <td className="py-2 px-3 text-slate-800 whitespace-nowrap">{item.inherentRiskTier}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
