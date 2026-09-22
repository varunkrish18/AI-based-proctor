import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { ExamSummary } from "../types";

const statusStyles: Record<string, string> = {
  OPEN: "bg-green-100 text-green-800",
  UPCOMING: "bg-amber-100 text-amber-800",
  CLOSED: "bg-slate-200 text-slate-600",
};

export default function Exams() {
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ExamSummary[]>("/api/exams/public")
      .then(setExams)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Available Examinations</h1>

      {loading && <p className="text-slate-500">Loading exams…</p>}
      {error && <p className="text-red-600">Could not load exams: {error}</p>}
      {!loading && !error && exams.length === 0 && (
        <p className="text-slate-500">No exams are published yet. Check back later.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {exams.map((exam) => (
          <div key={exam.id} className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm flex flex-col">
            <div className="flex justify-between items-start mb-2">
              <h2 className="font-semibold text-lg text-slate-900">{exam.name}</h2>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusStyles[exam.status] ?? "bg-slate-100 text-slate-600"}`}>
                {exam.status}
              </span>
            </div>
            <p className="text-sm text-slate-500 mb-4">{exam.subject ?? "General"}</p>
            <div className="text-sm text-slate-600 space-y-1 mb-4">
              <p>{exam.numQuestions} questions &middot; {exam.durationMinutes} min</p>
              <p>
                {new Date(exam.startAt).toLocaleString()} &rarr; {new Date(exam.endAt).toLocaleString()}
              </p>
            </div>
            <div className="mt-auto">
              {exam.status === "OPEN" ? (
                <Link
                  to={`/exam/${exam.id}/verify`}
                  className="block text-center bg-blue-600 text-white py-2 rounded-md font-medium hover:bg-blue-700"
                >
                  Start Exam
                </Link>
              ) : (
                <button disabled className="w-full bg-slate-100 text-slate-400 py-2 rounded-md font-medium cursor-not-allowed">
                  {exam.status === "UPCOMING" ? "Not yet open" : "Closed"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
