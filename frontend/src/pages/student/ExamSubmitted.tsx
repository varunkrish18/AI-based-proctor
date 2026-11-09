import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

interface AttemptResult {
  attemptId: number;
  status: string;
  startTime: string;
  endTime: string;
  totalQuestions: number;
  answeredQuestions: number;
  submitReason?: string;
}

export default function ExamSubmitted() {
  const { examId } = useParams();
  const [result, setResult] = useState<AttemptResult | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem(`exam_result_${examId}`);
    if (raw) {
      try {
        setResult(JSON.parse(raw));
      } catch {
        /* ignore parse errors */
      }
    }
  }, [examId]);

  const submittedAt = result?.endTime
    ? new Date(result.endTime).toLocaleString()
    : new Date().toLocaleString();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-6 text-center shadow-xs">
        <div className={`inline-flex items-center justify-center w-14 h-14 rounded-full text-3xl mb-3 shadow-inner ${
          result?.submitReason ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600"
        }`}>
          {result?.submitReason ? "⚠️" : "✓"}
        </div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          {result?.submitReason ? "Exam Session Concluded" : "Exam Submitted Successfully"}
        </h1>
        <p className="text-sm text-slate-500 mt-1">Submitted at {submittedAt}</p>
      </div>

      {/* Main Content */}
      <div className="max-w-2xl w-full mx-auto px-4 py-10">
        {/* Automatic Submission Notice if triggered */}
        {result?.submitReason && (
          <div className="bg-red-50 border-2 border-red-300 text-red-950 rounded-2xl p-5 mb-6 shadow-sm flex items-start gap-3.5">
            <span className="text-2xl mt-0.5">🚨</span>
            <div>
              <h4 className="font-extrabold text-base text-red-900">Automatic Session Submission Triggered</h4>
              <p className="text-sm text-red-800 mt-1 font-medium leading-relaxed">
                {result.submitReason}
              </p>
            </div>
          </div>
        )}

        {/* Result Evaluation Notice Banner */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-2xl p-6 sm:p-8 text-center shadow-sm mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold uppercase tracking-wider mb-4">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            Evaluation In Progress
          </div>

          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 mb-3">
            The result will be released after the evaluation.
          </h2>

          <p className="text-slate-600 text-sm sm:text-base leading-relaxed max-w-lg mx-auto">
            Your answers, timing records, and proctoring telemetry have been securely
            transmitted to the examination committee. The official marks and scorecard will be
            published after the comprehensive evaluation is complete.
          </p>
        </div>

        {/* Submission Details Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm mb-8 divide-y divide-slate-100">
          <div className="flex justify-between items-center py-3 first:pt-0">
            <span className="text-sm text-slate-500 font-medium">Attempt Reference</span>
            <span className="text-sm font-mono font-bold text-slate-800">
              #{result?.attemptId || "CONFIRMED"}
            </span>
          </div>

          <div className="flex justify-between items-center py-3">
            <span className="text-sm text-slate-500 font-medium">Submission Status</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
              Pending Evaluation
            </span>
          </div>

          <div className="flex justify-between items-center py-3">
            <span className="text-sm text-slate-500 font-medium">Questions Attempted</span>
            <span className="text-sm font-semibold text-slate-700">
              {result?.answeredQuestions ?? "All recorded"} / {result?.totalQuestions ?? "—"}
            </span>
          </div>

          <div className="flex justify-between items-center py-3 last:pb-0">
            <span className="text-sm text-slate-500 font-medium">Proctoring Telemetry</span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
              <span>🔒 Encrypted & Verified</span>
            </span>
          </div>
        </div>

        {/* Action Button */}
        <div className="text-center">
          <Link
            to="/exams"
            className="inline-flex items-center justify-center px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium text-sm transition-all shadow-sm hover:shadow cursor-pointer"
          >
            ← Return to Examinations
          </Link>
        </div>
      </div>

      {/* Footer note */}
      <div className="py-4 text-center text-xs text-slate-400 border-t border-slate-200 bg-white">
        Secure Examination & Proctoring Platform • Integrity Verification System
      </div>
    </div>
  );
}
