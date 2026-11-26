import React, { useState } from 'react';
import { KeyRound, Loader2, Lock } from 'lucide-react';
import { completeFirstLoginPasswordChange } from '../firebase';
import type { UserProfile } from '../types/audit';

interface ForcePasswordChangeModalProps {
  user: UserProfile;
  onPasswordChanged: () => void;
  onSignOut: () => void;
}

export function ForcePasswordChangeModal({
  user,
  onPasswordChanged,
  onSignOut,
}: ForcePasswordChangeModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setSaving(true);
    try {
      await completeFirstLoginPasswordChange({
        userId: user.userId,
        currentPassword,
        newPassword,
      });
      onPasswordChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-7 space-y-5">
        <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
          <KeyRound className="w-5 h-5 text-blue-900 shrink-0 mt-0.5" />
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              Password Change Required
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Account <span className="font-mono font-medium text-slate-800">@{user.username}</span> must set a new password before accessing AuditIntel PH.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-md">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="force-current-pw"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Current Password *
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                id="force-current-pw"
                type="password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="force-new-pw"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              New Password (min. 6 characters) *
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                id="force-new-pw"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="force-confirm-pw"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Confirm New Password *
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                id="force-confirm-pw"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={onSignOut}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
            >
              Sign Out
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Password & Continue'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
