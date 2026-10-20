import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, getCurrentUser } from "../api/client";
import { getTrustedEpochMs, syncTrustedTime } from "../utils/networkTime";
import type { ExamSummary } from "../types";

const statusStyles: Record<string, string> = {
  OPEN: "bg-green-100 text-green-800",
  UPCOMING: "bg-amber-100 text-amber-800",
  CLOSED: "bg-slate-200 text-slate-600",
};

export default function Exams() {
  const user = getCurrentUser();
  const isStudent = user?.role?.toUpperCase() === "STUDENT";
  const isProfessor = user?.role?.toUpperCase() === "PROFESSOR" || user?.role?.toUpperCase() === "FACULTY";
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(getTrustedEpochMs());

  useEffect(() => {
    syncTrustedTime().then((time) => setCurrentTimeMs(time));

    api
      .get<ExamSummary[]>("/api/exams/public", "user")
      .then(setExams)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    // Update real-time ticker using monotonic trusted clock
    const timer = setInterval(() => {
      setCurrentTimeMs(getTrustedEpochMs());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {isStudent
            ? "My Assigned Examinations & Classes"
            : isProfessor
            ? "My Assigned & Created Examinations"
            : "Available Examinations"}
        </h1>
        <span className="text-xs text-slate-500 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
          Synced with Verified Network Time
        </span>
      </div>

      {loading && <p className="text-slate-500">Loading exams…</p>}
      {error && <p className="text-red-600">Could not load exams: {error}</p>}
      {!loading && !error && exams.length === 0 && (
        <p className="text-slate-500">
          {isStudent
            ? "No examinations or classes are currently assigned to your account. Check back later or contact your professor."
            : isProfessor
            ? "No examinations or classes are currently assigned to you or created by you. Create a new examination or ask your Course Coordinator to assign a class."
            : "No exams are published yet. Check back later."}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {exams.map((exam) => {
          const startMs = new Date(exam.startAt).getTime();
          const endMs = new Date(exam.endAt).getTime();
          const isUpcoming = currentTimeMs < startMs;
          const isClosed = currentTimeMs > endMs;
          const effectiveStatus = isUpcoming ? "UPCOMING" : isClosed ? "CLOSED" : "OPEN";

          return (
            <div key={exam.id} className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm flex flex-col">
              <div className="flex justify-between items-start mb-2 gap-2">
                <div>
                  <h2 className="font-semibold text-lg text-slate-900">{exam.name}</h2>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {exam.openToAll ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                        🌐 Open to All
                      </span>
                    ) : exam.isClass ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                        🏫 Class
                      </span>
                    ) : isStudent ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                        🎯 Assigned
                      </span>
                    ) : null}
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusStyles[effectiveStatus] ?? "bg-slate-100 text-slate-600"}`}>
                  {effectiveStatus}
                </span>
              </div>
              <p className="text-sm text-slate-500 mb-4">{exam.subject ?? "General"}</p>
              <div className="text-sm text-slate-600 space-y-1 mb-4">
                <p>
                  {exam.numQuestions} questions &middot;{" "}
                  {exam.durationMinutes ? `${exam.durationMinutes} min` : "♾️ Untimed Class (Infinite Attempts)"}
                </p>
                {exam.assignedProfessorName && (
                  <p className="text-xs text-indigo-700 font-semibold flex items-center gap-1">
                    <span>👨‍🏫</span> Faculty: {exam.assignedProfessorName}
                  </p>
                )}
                <p className="text-xs text-slate-500">
                  {new Date(exam.startAt).toLocaleString()} &rarr; {new Date(exam.endAt).toLocaleString()}
                </p>
              </div>
              <div className="mt-auto">
                {effectiveStatus === "OPEN" ? (
                  <Link
                    to={`/exam/${exam.id}/verify`}
                    className="block text-center bg-blue-600 text-white py-2 rounded-md font-medium hover:bg-blue-700 transition-colors"
                  >
                    Start Exam
                  </Link>
                ) : (
                  <button disabled className="w-full bg-slate-100 text-slate-400 py-2 rounded-md font-medium cursor-not-allowed">
                    {effectiveStatus === "UPCOMING" ? "Not yet open" : "Closed"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
