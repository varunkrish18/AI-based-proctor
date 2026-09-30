import { useState, useEffect } from "react";
import { api, getToken } from "../../api/client";
import type { AdminUser, CreateAdminUserPayload, UpdateAdminUserPayload } from "../../types";

export default function UserManagementTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Visibility states for passwords
  const [visiblePasswords, setVisiblePasswords] = useState<Record<number, boolean>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Create User Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateAdminUserPayload>({
    email: "",
    fullName: "",
    password: "",
    role: "ADMIN",
  });
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showCreatePassword, setShowCreatePassword] = useState(false);

  // Edit User Modal state
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState<UpdateAdminUserPayload>({
    email: "",
    fullName: "",
    role: "ADMIN",
    password: "",
    resetLock: false,
  });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [showEditPassword, setShowEditPassword] = useState(false);

  // Delete User Modal state
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Get current logged-in user email from token subject if possible
  const currentToken = getToken("admin");
  let currentAdminEmail = "";
  if (currentToken) {
    try {
      const payloadBase64 = currentToken.split(".")[1];
      const decodedJson = JSON.parse(atob(payloadBase64));
      currentAdminEmail = decodedJson.sub || "";
    } catch {
      // ignore
    }
  }

  async function fetchUsers() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<AdminUser[]>("/api/admin/users", "admin");
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load user accounts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  function togglePasswordVisibility(userId: number) {
    setVisiblePasswords((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => {
      setCopiedField((curr) => (curr === label ? null : curr));
    }, 2000);
  }

  function generateRandomPassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    let pwd = "";
    for (let i = 0; i < 10; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreateSubmitting(true);
    try {
      const newUser = await api.post<AdminUser>("/api/admin/users", createForm, "admin");
      setUsers((prev) => [...prev, newUser]);
      setShowCreateModal(false);
      setSuccessMsg(`User '${newUser.email}' created successfully! Credentials displayed below.`);
      setCreateForm({ email: "", fullName: "", password: "", role: "ADMIN" });
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create user.");
    } finally {
      setCreateSubmitting(false);
    }
  }

  function openEditModal(user: AdminUser) {
    setEditingUser(user);
    setEditForm({
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      password: user.displayPassword || "",
      resetLock: user.locked,
    });
    setEditError(null);
    setShowEditPassword(false);
  }

  async function handleUpdateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    setEditError(null);
    setEditSubmitting(true);
    try {
      const payload: UpdateAdminUserPayload = {
        email: editForm.email,
        fullName: editForm.fullName,
        role: editForm.role,
        resetLock: editForm.resetLock,
      };
      if (editForm.password && editForm.password.trim() !== "") {
        payload.password = editForm.password.trim();
      }

      const updated = await api.put<AdminUser>(`/api/admin/users/${editingUser.id}`, payload, "admin");
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setEditingUser(null);
      setSuccessMsg(`Credentials for '${updated.email}' updated successfully!`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update user credentials.");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDeleteUser() {
    if (!userToDelete) return;
    setDeleteError(null);
    setDeleteSubmitting(true);
    try {
      await api.delete(`/api/admin/users/${userToDelete.id}`, "admin");
      setUsers((prev) => prev.filter((u) => u.id !== userToDelete.id));
      setSuccessMsg(`User '${userToDelete.email}' was deleted.`);
      setUserToDelete(null);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete user.");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner / Actions Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">👥</span>
            <h2 className="text-xl font-bold text-slate-900">Admin Users &amp; Login Credentials</h2>
            <span className="bg-indigo-50 text-indigo-700 font-bold text-xs px-2.5 py-0.5 rounded-full border border-indigo-200">
              {users.length} {users.length === 1 ? "User" : "Users"}
            </span>
          </div>
          <p className="text-slate-500 text-xs mt-1 max-w-2xl leading-relaxed">
            Manage system administrators, proctors, and examiners. Review active login credentials, reveal passwords, or edit access credentials directly.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
          >
            <span className={loading ? "animate-spin" : ""}>🔄</span> Refresh
          </button>
          <button
            onClick={() => {
              setCreateForm({
                email: "",
                fullName: "",
                password: generateRandomPassword(),
                role: "ADMIN",
              });
              setCreateError(null);
              setShowCreatePassword(true);
              setShowCreateModal(true);
            }}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            <span>+</span> Create Another User
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 px-4 py-3 rounded-xl text-xs font-semibold flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <span>✅</span>
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-700 hover:text-emerald-900 font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Error Notification */}
      {error && (
        <div className="bg-rose-50 border border-rose-300 text-rose-800 px-4 py-3 rounded-xl text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button onClick={() => fetchUsers()} className="underline text-rose-700 hover:text-rose-900 font-bold">
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && users.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full mb-3" />
          <p className="text-xs font-medium text-slate-600">Loading user credentials…</p>
        </div>
      )}

      {/* Users Card Grid */}
      {!loading && users.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500">
          <span className="text-3xl block mb-2">👤</span>
          <p className="text-sm font-semibold text-slate-700">No user accounts found</p>
          <p className="text-xs text-slate-400 mt-1">Create a new user account to get started.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {users.map((user) => {
          const isCurrentUser = currentAdminEmail && user.email.toLowerCase() === currentAdminEmail.toLowerCase();
          const isPasswordVisible = visiblePasswords[user.id] || false;

          return (
            <div
              key={user.id}
              className={`bg-white border rounded-2xl p-5 shadow-xs transition-all relative overflow-hidden ${
                isCurrentUser ? "border-indigo-300 ring-2 ring-indigo-100" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              {/* Header inside card */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-xs">
                    {user.fullName ? user.fullName.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 text-sm">{user.fullName || "Administrator"}</h3>
                      {isCurrentUser && (
                        <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          You (Current Session)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                        Role: {user.role}
                      </span>
                      {user.locked ? (
                        <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-1">
                          🔒 Locked
                        </span>
                      ) : (
                        <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                          ● Active
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => openEditModal(user)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer flex items-center gap-1"
                    title="Edit user credentials and details"
                  >
                    ✏️ Edit Credentials
                  </button>
                  <button
                    onClick={() => setUserToDelete(user)}
                    disabled={Boolean(isCurrentUser)}
                    className={`px-2 py-1.5 rounded-lg text-xs font-semibold transition ${
                      isCurrentUser
                        ? "opacity-30 cursor-not-allowed text-slate-400"
                        : "hover:bg-rose-50 text-rose-600 hover:text-rose-700 cursor-pointer"
                    }`}
                    title={isCurrentUser ? "Cannot delete currently logged-in account" : "Delete user"}
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {/* Login Credentials Box */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5 text-xs">
                {/* Email line */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="font-semibold text-slate-400 w-16 shrink-0">Email:</span>
                    <span className="font-mono font-medium text-slate-800 truncate select-all">{user.email}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(user.email, `email-${user.id}`)}
                    className="shrink-0 px-2 py-1 rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-800 font-semibold text-[11px] transition cursor-pointer"
                  >
                    {copiedField === `email-${user.id}` ? "Copied! ✓" : "Copy Email"}
                  </button>
                </div>

                {/* Password line */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/60">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="font-semibold text-slate-400 w-16 shrink-0">Password:</span>
                    <span className="font-mono font-bold text-slate-800 truncate select-all">
                      {isPasswordVisible ? user.displayPassword || "No plain text available" : "••••••••"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => togglePasswordVisibility(user.id)}
                      className="px-2 py-1 rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-800 font-semibold text-[11px] transition cursor-pointer"
                      title={isPasswordVisible ? "Hide Password" : "Show Password"}
                    >
                      {isPasswordVisible ? "🙈 Hide" : "👁️ Reveal"}
                    </button>
                    {user.displayPassword && (
                      <button
                        onClick={() => copyToClipboard(user.displayPassword!, `pwd-${user.id}`)}
                        className="px-2 py-1 rounded bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-semibold text-[11px] transition cursor-pointer"
                      >
                        {copiedField === `pwd-${user.id}` ? "Copied! ✓" : "Copy Pwd"}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer info */}
              <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                <span>Account ID: #{user.id}</span>
                <span>
                  Updated: {new Date(user.updatedAt || user.createdAt).toLocaleDateString()}{" "}
                  {new Date(user.updatedAt || user.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* CREATE USER MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">✨</span>
                <h3 className="text-base font-bold text-slate-900">Create Another User Account</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Create an additional administrator, proctor, or examiner account. The credentials will be saved and displayed on the portal.
            </p>

            {createError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-xl font-medium">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Exam Proctor / Dr. Alex"
                  value={createForm.fullName}
                  onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address (Login ID)</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. proctor2@proctor.com"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">Login Password</label>
                  <button
                    type="button"
                    onClick={() => {
                      const newPwd = generateRandomPassword();
                      setCreateForm({ ...createForm, password: newPwd });
                      setShowCreatePassword(true);
                    }}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                  >
                    🎲 Generate Strong Pwd
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showCreatePassword ? "text" : "password"}
                    required
                    minLength={6}
                    placeholder="Minimum 6 characters"
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs pr-14 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePassword(!showCreatePassword)}
                    className="absolute right-2 top-2 text-[11px] text-slate-500 hover:text-slate-700 font-medium px-1 cursor-pointer"
                  >
                    {showCreatePassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Access Role</label>
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                >
                  <option value="ADMIN">ADMIN (Full Access)</option>
                  <option value="EXAMINER">EXAMINER (Assessment Reviewer)</option>
                  <option value="PROCTOR">PROCTOR (Live Monitor)</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {createSubmitting ? "Creating…" : "Save & Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT USER CREDENTIALS MODAL */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">✏️</span>
                <h3 className="text-base font-bold text-slate-900">Edit User Credentials</h3>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Modifying credentials for <strong className="text-slate-700 font-mono">{editingUser.email}</strong>.
            </p>

            {editError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-xl font-medium">
                {editError}
              </div>
            )}

            <form onSubmit={handleUpdateUser} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={editForm.fullName}
                  onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    New Password <span className="font-normal text-slate-400">(leave blank to keep current)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const newPwd = generateRandomPassword();
                      setEditForm({ ...editForm, password: newPwd });
                      setShowEditPassword(true);
                    }}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                  >
                    🎲 Suggest New Pwd
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showEditPassword ? "text" : "password"}
                    placeholder="Enter new password to update"
                    value={editForm.password || ""}
                    onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs pr-14 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute right-2 top-2 text-[11px] text-slate-500 hover:text-slate-700 font-medium px-1 cursor-pointer"
                  >
                    {showEditPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Role</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                >
                  <option value="ADMIN">ADMIN</option>
                  <option value="EXAMINER">EXAMINER</option>
                  <option value="PROCTOR">PROCTOR</option>
                </select>
              </div>

              {editingUser.locked && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between">
                  <div className="text-xs text-amber-800">
                    <p className="font-bold">Account is currently locked</p>
                    <p className="text-[11px]">Due to failed login attempts.</p>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-amber-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(editForm.resetLock)}
                      onChange={(e) => setEditForm({ ...editForm, resetLock: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    Unlock Account
                  </label>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {editSubmitting ? "Saving…" : "Update Credentials"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full p-6 space-y-4">
            <div className="text-center">
              <span className="text-3xl block mb-2">🗑️</span>
              <h3 className="text-base font-bold text-slate-900">Delete User Account</h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to remove <strong className="text-slate-800">{userToDelete.email}</strong>? They will no longer be able to log into the admin portal.
              </p>
            </div>

            {deleteError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-xl font-medium">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={deleteSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                {deleteSubmitting ? "Deleting…" : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
