import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentUser, resetInitialPassword, clearAllAuth } from "../api/client";

export default function ResetPassword() {
  const navigate = useNavigate();
  const user = getCurrentUser();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPassword || newPassword.length < 6) {
      setError("New password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await resetInitialPassword(newPassword);
      // Successfully updated; redirect to home
      navigate("/", { replace: true });
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || "Failed to update password. Please try again.");
      } else {
        setError("Password reset failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancelAndSignOut = () => {
    clearAllAuth();
    navigate("/sign-in", { replace: true });
  };

  return (
    <div className="min-h-[calc(100vh-60px)] bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl shadow-xl p-8 relative">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-2xl shadow-lg shadow-amber-500/20 mb-3">
            🔐
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Set Your New Password</h1>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            This is your first time logging in. For account security, please create a new personal password before entering the portal.
          </p>
        </div>

        {/* User Card */}
        {user && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 mb-5 flex items-center justify-between text-xs">
            <div>
              <div className="font-semibold text-slate-900">{user.fullName}</div>
              <div className="text-slate-500 text-[11px]">
                {user.identifier ? `${user.identifier} • ` : ""}
                {user.email}
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
              {user.role}
            </span>
          </div>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 px-3.5 py-2.5 rounded-xl text-xs mb-5 flex items-start gap-2 shadow-sm animate-in fade-in">
            <span className="text-base leading-none">⚠️</span>
            <div className="flex-1 font-medium">{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              New Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
                autoFocus
                className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all shadow-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-800 transition-colors cursor-pointer text-xs"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Choose a strong password containing letters, numbers, or symbols.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Confirm New Password
            </label>
            <input
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your new password"
              required
              className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all shadow-sm"
            />
          </div>

          <div className="pt-2 space-y-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-semibold py-2.5 px-4 rounded-xl shadow-md shadow-amber-600/20 transition-all duration-150 transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  <span>Saving New Password...</span>
                </>
              ) : (
                <span>Confirm &amp; Proceed to Home</span>
              )}
            </button>

            <button
              type="button"
              onClick={handleCancelAndSignOut}
              className="w-full text-xs text-slate-500 hover:text-slate-800 py-1.5 transition-colors cursor-pointer"
            >
              Cancel &amp; Sign Out
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
