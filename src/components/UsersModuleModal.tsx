import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Edit3,
  KeyRound,
  Loader2,
  Search,
  Shield,
  UserCheck,
  UserPlus,
  UserX,
  X,
} from 'lucide-react';
import type { UserProfile, UserRole, UserStatus } from '../types/audit';
import {
  createAppUserAsAdmin,
  resetAppUserPassword,
  toggleAppUserStatus,
  updateAppUserProfile,
} from '../services/firestoreService';

interface UsersModuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: UserProfile[];
  currentAdminUserId: string;
}

const USER_ROLES: UserRole[] = ['Administrator', 'Auditor', 'Viewer'];
const USER_STATUSES: UserStatus[] = ['Active', 'Disabled'];

function formatFirestoreTimestamp(val: unknown): string {
  if (!val) return 'Never';
  if (typeof val === 'string') {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? val : d.toLocaleDateString();
  }
  if (typeof val === 'object' && val !== null) {
    const ts = val as { seconds?: number; toDate?: () => Date };
    if (typeof ts.toDate === 'function') {
      return ts.toDate().toLocaleDateString();
    }
    if (typeof ts.seconds === 'number') {
      return new Date(ts.seconds * 1000).toLocaleDateString();
    }
  }
  return '—';
}

export function UsersModuleModal({
  isOpen,
  onClose,
  users,
  currentAdminUserId,
}: UsersModuleModalProps) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole>('ALL');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Create User fields (no email required)
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('Auditor');
  const [status, setStatus] = useState<UserStatus>('Active');
  const [requireChangeOnCreate, setRequireChangeOnCreate] = useState(true);
  const [creating, setCreating] = useState(false);

  // Edit User state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('Auditor');
  const [editStatus, setEditStatus] = useState<UserStatus>('Active');
  const [savingEdit, setSavingEdit] = useState(false);

  // Reset Password state
  const [resetTargetUser, setResetTargetUser] = useState<UserProfile | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetRequireChange, setResetRequireChange] = useState(true);
  const [resettingPassword, setResettingPassword] = useState(false);

  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${u.fullName} ${u.username} ${u.role} ${u.status}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [users, roleFilter, search]);

  if (!isOpen) return null;

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setCreating(true);
    try {
      await createAppUserAsAdmin({
        fullName,
        username,
        password,
        role,
        status,
        mustChangePassword: requireChangeOnCreate,
      });
      setNotice(`Account created for ${fullName.trim()} (@${username.trim().toLowerCase()}, ${role}).`);
      setFullName('');
      setUsername('');
      setPassword('');
      setRole('Auditor');
      setStatus('Active');
      setRequireChangeOnCreate(true);
      setShowCreateForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create user.');
    } finally {
      setCreating(false);
    }
  };

  const startEditing = (u: UserProfile) => {
    setError('');
    setNotice('');
    setResetTargetUser(null);
    setEditingUserId(u.userId);
    setEditFullName(u.fullName);
    setEditUsername(u.username);
    setEditRole(u.role);
    setEditStatus(u.status);
  };

  const handleSaveEdit = async (u: UserProfile) => {
    setError('');
    setNotice('');
    if (u.userId === currentAdminUserId && (editRole !== 'Administrator' || editStatus !== 'Active')) {
      setError('You cannot demote or disable your own active Administrator account.');
      return;
    }
    setSavingEdit(true);
    try {
      await updateAppUserProfile({
        userId: u.userId,
        previousUsername: u.username,
        fullName: editFullName,
        username: editUsername,
        role: editRole,
        status: editStatus,
      });
      setEditingUserId(null);
      setNotice(`Updated user settings for ${editFullName.trim()}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update user profile.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleStatus = async (u: UserProfile) => {
    setError('');
    setNotice('');
    if (u.userId === currentAdminUserId) {
      setError('You cannot disable your own active Administrator account.');
      return;
    }
    const nextStatus: UserStatus = u.status === 'Active' ? 'Disabled' : 'Active';
    setBusyUserId(u.userId);
    try {
      await toggleAppUserStatus(u.userId, nextStatus);
      setNotice(
        `${u.fullName} (@${u.username}) has been ${nextStatus === 'Disabled' ? 'disabled' : 'enabled'}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update account status.');
    } finally {
      setBusyUserId(null);
    }
  };

  const openResetPassword = (u: UserProfile) => {
    setError('');
    setNotice('');
    setEditingUserId(null);
    setResetTargetUser(u);
    setResetPasswordValue('');
    setResetRequireChange(true);
  };

  const handleSubmitResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetUser) return;
    setError('');
    setNotice('');
    setResettingPassword(true);
    try {
      await resetAppUserPassword({
        userId: resetTargetUser.userId,
        newPassword: resetPasswordValue,
        mustChangePassword: resetRequireChange,
      });
      setNotice(`Password reset saved for ${resetTargetUser.fullName} (@${resetTargetUser.username}).`);
      setResetTargetUser(null);
      setResetPasswordValue('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password.');
    } finally {
      setResettingPassword(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="users-module-title"
    >
      <div className="bg-white border border-slate-200 rounded-lg w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-blue-900" />
            <div>
              <h2 id="users-module-title" className="text-lg font-semibold text-slate-900">
                Users Module ({users.length})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Application-managed user accounts with bcrypt password hashing, roles, and access status
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100"
            aria-label="Close Users Module"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter & Create Action Bar */}
        <div className="px-6 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, username, role..."
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md w-60"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as 'ALL' | UserRole)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
            >
              <option value="ALL">All Roles</option>
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowCreateForm(!showCreateForm);
              setResetTargetUser(null);
              setError('');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800 whitespace-nowrap shrink-0"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Create User
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {error && (
            <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          {notice && (
            <div className="p-3 text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-md flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          {/* Create User Form */}
          {showCreateForm && (
            <form
              onSubmit={handleCreateUser}
              className="p-5 bg-slate-50 border border-slate-200 rounded-lg space-y-4"
            >
              <div className="border-b border-slate-200 pb-2">
                <h3 className="text-sm font-semibold text-slate-900">Create Application User</h3>
                <p className="text-xs text-slate-500">
                  Stores user record in Firestore with a bcrypt-hashed password
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Juan Dela Cruz"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Username *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. jdelacruz"
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Password (min. 6 chars) *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Temporary password"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
                  >
                    {USER_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as UserStatus)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
                  >
                    {USER_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-700 pb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireChangeOnCreate}
                    onChange={(e) => setRequireChangeOnCreate(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Require password change on first login
                </label>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800 disabled:opacity-50"
                >
                  {creating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Creating User...
                    </>
                  ) : (
                    'Save New User'
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Reset Password Panel */}
          {resetTargetUser && (
            <form
              onSubmit={handleSubmitResetPassword}
              className="p-5 bg-slate-50 border border-slate-200 rounded-lg space-y-4"
            >
              <div className="border-b border-slate-200 pb-2 flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Reset Password for {resetTargetUser.fullName} (@{resetTargetUser.username})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Sets a new bcrypt-hashed password for this account
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setResetTargetUser(null)}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  Close
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    New Password (min. 6 chars) *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={resetPasswordValue}
                    onChange={(e) => setResetPasswordValue(e.target.value)}
                    placeholder="Enter new temporary password"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-700 pb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={resetRequireChange}
                    onChange={(e) => setResetRequireChange(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Require password change on next login
                </label>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResetTargetUser(null)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resettingPassword}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800 disabled:opacity-50"
                >
                  {resettingPassword ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Saving Password...
                    </>
                  ) : (
                    'Update Password'
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Users Table */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                  <tr>
                    <th className="py-3 px-4 font-medium">Full Name</th>
                    <th className="py-3 px-4 font-medium">Username</th>
                    <th className="py-3 px-4 font-medium w-36">Role</th>
                    <th className="py-3 px-4 font-medium w-28">Status</th>
                    <th className="py-3 px-4 font-medium">Created</th>
                    <th className="py-3 px-4 font-medium">Last Login</th>
                    <th className="py-3 px-4 font-medium text-right w-64">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((u) => {
                    const isEditing = editingUserId === u.userId;
                    const isSelf = u.userId === currentAdminUserId;
                    const isBusy = busyUserId === u.userId;

                    if (isEditing) {
                      return (
                        <tr key={u.userId} className="bg-slate-50">
                          <td className="py-3 px-4">
                            <input
                              type="text"
                              value={editFullName}
                              onChange={(e) => setEditFullName(e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <input
                              type="text"
                              value={editUsername}
                              onChange={(e) => setEditUsername(e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-md"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <select
                              value={editRole}
                              disabled={isSelf}
                              onChange={(e) => setEditRole(e.target.value as UserRole)}
                              className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-md disabled:bg-slate-100"
                            >
                              {USER_ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 px-4">
                            <select
                              value={editStatus}
                              disabled={isSelf}
                              onChange={(e) => setEditStatus(e.target.value as UserStatus)}
                              className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-md disabled:bg-slate-100"
                            >
                              {USER_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-500">
                            {formatFirestoreTimestamp(u.createdDate)}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-500">
                            {formatFirestoreTimestamp(u.lastLogin)}
                          </td>
                          <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setEditingUserId(null)}
                              className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={savingEdit}
                              onClick={() => handleSaveEdit(u)}
                              className="px-2.5 py-1 text-xs font-medium text-white bg-blue-900 rounded hover:bg-blue-800 disabled:opacity-50"
                            >
                              {savingEdit ? 'Saving...' : 'Save'}
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={u.userId} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 font-medium text-slate-900">
                          {u.fullName}
                          {isSelf && (
                            <span className="ml-2 text-[11px] font-normal text-slate-500">
                              (You)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-700">
                          @{u.username}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded whitespace-nowrap ${
                              u.role === 'Administrator'
                                ? 'text-blue-900 bg-sky-50 border-sky-200'
                                : u.role === 'Auditor'
                                  ? 'text-slate-800 bg-slate-100 border-slate-200'
                                  : 'text-slate-600 bg-white border-slate-200'
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded whitespace-nowrap ${
                              u.status === 'Active'
                                ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                                : 'text-red-700 bg-red-50 border-red-200'
                            }`}
                          >
                            {u.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-500 tabular-nums">
                          {formatFirestoreTimestamp(u.createdDate)}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-500 tabular-nums">
                          {formatFirestoreTimestamp(u.lastLogin)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => startEditing(u)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50"
                              title="Edit User"
                            >
                              <Edit3 className="w-3 h-3" />
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => openResetPassword(u)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50"
                              title="Reset Password"
                            >
                              <KeyRound className="w-3 h-3" />
                              Reset
                            </button>
                            <button
                              type="button"
                              disabled={isSelf || isBusy}
                              onClick={() => handleToggleStatus(u)}
                              className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium border rounded disabled:opacity-40 ${
                                u.status === 'Active'
                                  ? 'text-red-700 bg-white border-red-200 hover:bg-red-50'
                                  : 'text-emerald-800 bg-white border-emerald-200 hover:bg-emerald-50'
                              }`}
                              title={
                                isSelf
                                  ? 'Cannot disable your own active account'
                                  : u.status === 'Active'
                                    ? 'Disable User'
                                    : 'Enable User'
                              }
                            >
                              {u.status === 'Active' ? (
                                <>
                                  <UserX className="w-3 h-3" />
                                  Disable
                                </>
                              ) : (
                                <>
                                  <UserCheck className="w-3 h-3" />
                                  Enable
                                </>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-xs text-slate-500">
                        No users match your search filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
