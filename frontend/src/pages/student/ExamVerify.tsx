import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, setToken } from "../../api/client";

interface VerifyResponse {
  verified: boolean;
  sessionToken: string | null;
  message: string;
  webcamRequired?: boolean;
  microphoneRequired?: boolean;
  screenRequired?: boolean;
  locationRequired?: boolean;
}

interface PublicExamDetails {
  id: number;
  name: string;
  subject?: string;
  durationMinutes: number;
  numQuestions: number;
  webcamRequired: boolean;
  microphoneRequired: boolean;
  screenRequired: boolean;
  locationRequired: boolean;
  openToAll: boolean;
}

export default function ExamVerify() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [examMeta, setExamMeta] = useState<PublicExamDetails | null>(null);

  useEffect(() => {
    if (!examId) return;
    api
      .get<PublicExamDetails>(`/api/exams/${examId}`)
      .then((data) => {
        setExamMeta(data);
        sessionStorage.setItem(
          `exam_proctoring_${examId}`,
          JSON.stringify({
            webcamRequired: data.webcamRequired,
            microphoneRequired: data.microphoneRequired,
            screenRequired: data.screenRequired,
            locationRequired: data.locationRequired,
          })
        );
      })
      .catch(() => {});
  }, [examId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<VerifyResponse>(`/api/exams/${examId}/verify-student`, {
        email: email.trim(),
        password: password.trim(),
      });
      if (res.verified && res.sessionToken) {
        setToken("student", res.sessionToken);
        // Persist proctoring requirement config for system check & exam take
        sessionStorage.setItem(
          `exam_proctoring_${examId}`,
          JSON.stringify({
            webcamRequired: res.webcamRequired ?? examMeta?.webcamRequired ?? true,
            microphoneRequired: res.microphoneRequired ?? examMeta?.microphoneRequired ?? true,
            screenRequired: res.screenRequired ?? examMeta?.screenRequired ?? true,
            locationRequired: res.locationRequired ?? examMeta?.locationRequired ?? false,
          })
        );
        navigate(`/exam/${examId}/system-check`);
      } else {
        setError(res.message || "Invalid credentials or exam not assigned to this email.");
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Verification failed. Please check your credentials.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-600 text-white shadow-md mb-3">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Examination Access</h1>
          <p className="text-slate-500 text-xs mt-1">
            Verify your registered email and assigned access password to proceed
          </p>
        </div>

        {/* Exam Preview Card (if loaded) */}
        {examMeta && (
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 mb-5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 text-sm">{examMeta.name}</span>
              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold text-[11px]">
                {examMeta.durationMinutes} mins
              </span>
            </div>
            {examMeta.subject && (
              <p className="text-slate-500 text-[11px] mt-0.5">{examMeta.subject}</p>
            )}
            <div className="mt-3 pt-2.5 border-t border-slate-200 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-slate-500 font-medium">Proctoring Requirements:</span>
              {examMeta.webcamRequired ? (
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
                  📷 Camera Required
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-medium">
                  📷 Camera Not Required
                </span>
              )}
              {examMeta.microphoneRequired ? (
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
                  🎤 Mic Required
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-medium">
                  🎤 Mic Not Required
                </span>
              )}
            </div>
          </div>
        )}

        {/* Verification Form */}
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Registered Candidate Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
              placeholder="candidate@example.com"
              autoComplete="email"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700">
                Exam Access Password
              </label>
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <input
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition tracking-wider"
              placeholder="Enter 8-digit access password"
              autoComplete="current-password"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Generated and provided to you when your email was assigned to this examination.
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-800 text-xs flex items-start gap-2">
              <span className="text-red-500 font-bold">✕</span>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-blue-700 transition disabled:opacity-50 shadow-sm cursor-pointer"
          >
            {submitting ? "Verifying Credentials…" : "Verify & Continue to Exam"}
          </button>
        </form>
      </div>
    </div>
  );
}
