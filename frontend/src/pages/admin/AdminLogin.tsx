import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, setAdminRefreshToken, setToken } from "../../api/client";
import type { AuthResponse } from "../../types";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isExpired = searchParams.get("expired") === "true";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<AuthResponse>("/api/admin/auth/login", { email, password });
      setToken("admin", res.accessToken);
      if (res.refreshToken) {
        setAdminRefreshToken(res.refreshToken);
      }
      navigate("/admin/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <h1 className="text-xl font-bold text-slate-900 mb-6">Admin Login</h1>
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        {isExpired && !error && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 rounded-md mb-4">
            Your admin session expired. Please sign in again.
          </div>
        )}
        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-slate-300 rounded-md px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-slate-300 rounded-md px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-slate-900 text-white py-2 rounded-md font-medium hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
        >
          {submitting ? "Signing in…" : "Sign In"}
        </button>
      </form>

      {/* Available Login Credentials Box */}
      <div className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs">
        <div className="flex items-center gap-1.5 font-bold text-slate-800 mb-2">
          <span>🔑</span>
          <span>Configured Admin Credentials</span>
        </div>
        <p className="text-slate-500 mb-3 text-[11px]">
          Click any account below to autofill and test login credentials:
        </p>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-slate-200">
            <div>
              <p className="font-bold text-slate-800">Primary Admin</p>
              <p className="font-mono text-[11px] text-slate-600">admin@proctor.com / admin123</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEmail("admin@proctor.com");
                setPassword("admin123");
              }}
              className="px-2.5 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-[11px] border border-indigo-200 transition cursor-pointer"
            >
              Fill Admin
            </button>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-slate-200">
            <div>
              <p className="font-bold text-slate-800">Exam Proctor (User 2)</p>
              <p className="font-mono text-[11px] text-slate-600">proctor@proctor.com / proctor123</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEmail("proctor@proctor.com");
                setPassword("proctor123");
              }}
              className="px-2.5 py-1 rounded bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold text-[11px] border border-purple-200 transition cursor-pointer"
            >
              Fill Proctor
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
