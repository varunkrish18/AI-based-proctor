import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, setToken } from "../../api/client";

interface VerifyResponse {
  verified: boolean;
  sessionToken: string | null;
  message: string;
}

export default function ExamVerify() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<VerifyResponse>(`/api/exams/${examId}/verify-student`, { email });
      if (res.verified && res.sessionToken) {
        setToken("student", res.sessionToken);
        navigate(`/exam/${examId}/system-check`);
      } else {
        setError(res.message || "This exam is not assigned to this email address.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <h1 className="text-xl font-bold text-slate-900 mb-2">Verify Your Identity</h1>
      <p className="text-slate-600 text-sm mb-6">
        Enter the email address registered for this examination to continue.
      </p>
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <label className="block text-sm font-medium text-slate-700 mb-1">Registered Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-slate-300 rounded-md px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="student@example.com"
        />
        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-blue-600 text-white py-2 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "Verifying…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
