import React, { useState } from 'react';
import { Loader2, Lock, User } from 'lucide-react';
import { loginWithUsernameAndPassword } from '../firebase';
import type { UserProfile } from '../types/audit';

interface AuthScreenProps {
  externalError?: string;
  onLoginSuccess: (user: UserProfile) => void;
}

export function AuthScreen({ externalError, onLoginSuccess }: AuthScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const profile = await loginWithUsernameAndPassword(username, password);
      onLoginSuccess(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  const displayError = error || externalError;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Original 3-Zone Top Bar */}
      <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between gap-8">
        <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display">
          AuditIntel PH
        </span>
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <span className="whitespace-nowrap shrink-0">Audit Universe</span>
          <span className="whitespace-nowrap shrink-0">Risk & Control Matrix</span>
          <span className="whitespace-nowrap shrink-0">Observation Engine</span>
          <span className="whitespace-nowrap shrink-0">Report Builder</span>
        </nav>
        <span className="text-xs font-medium text-slate-600 whitespace-nowrap shrink-0">
          Internal Audit Portal
        </span>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-16 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-7 space-y-6">
          <p className="text-xs font-medium text-blue-900 tracking-wide">
            Philippine Corporate Internal Audit Intelligence System
          </p>
          <h1 className="text-4xl font-bold text-slate-900 tracking-tight leading-tight text-balance">
            Audit Universe Intelligence, Workpapers, and Board-Ready Reporting
          </h1>
          <p className="text-base text-slate-600 leading-relaxed max-w-2xl">
            Upload your Audit Universe and select any auditable area to automatically generate Risk Assessments, Control Matrices, Substantive Procedures, Walkthrough Questions, Root Cause Analyses, and Audit Report Narratives grounded in Philippine BIR, SEC, BSP, PFRS, and IIA standards.
          </p>

          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-2.5">
              Specialized Audit Capabilities
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="space-y-1">
                <p className="font-semibold text-slate-900">01. Instant 14-Part Audit Area Generation</p>
                <p className="text-slate-600 leading-relaxed">
                  Objectives, Process Flows, Inherent Risks, 5x5 Scoring, Key Controls, Weaknesses, Procedures, Walkthroughs, and Narratives.
                </p>
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-slate-900">02. Observation-to-Finding Synthesizer</p>
                <p className="text-slate-600 leading-relaxed">
                  Convert raw branch, warehouse, procurement, or tax observations into formal Audit Findings and Management Action Plans.
                </p>
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-slate-900">03. Persistent Firestore Knowledge Base</p>
                <p className="text-slate-600 leading-relaxed">
                  Continuously expand your corporate library across Finance, BIR EOPT, Branch Cash, Inventory, Procurement, Disposal, and Treasury.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-7 space-y-5">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-lg font-semibold text-slate-900">
              Sign In to Workspace
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Enter your Username and Password assigned by your Administrator.
            </p>
          </div>

          {displayError && (
            <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-md">
              {displayError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="login-username"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Username
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  id="login-username"
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  id="login-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800 disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Logging in...
                </>
              ) : (
                'Login'
              )}
            </button>
          </form>

          <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-100 leading-relaxed">
            Application-managed accounts only. Only Administrators can create or reset user accounts inside the Users Module.
          </p>
        </div>
      </main>
    </div>
  );
}
