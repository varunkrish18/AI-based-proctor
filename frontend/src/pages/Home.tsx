import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { getCurrentUser, isUserAuthenticated, getMustResetPassword, api } from "../api/client";
import { getTrustedEpochMs, syncTrustedTime } from "../utils/networkTime";
import type { ExamSummary } from "../types";

export default function Home() {
  if (!isUserAuthenticated()) {
    return <Navigate to="/sign-in" replace />;
  }

  if (getMustResetPassword()) {
    return <Navigate to="/reset-password" replace />;
  }

  const user = getCurrentUser();
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [loadingExams, setLoadingExams] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(getTrustedEpochMs());

  useEffect(() => {
    syncTrustedTime().then((time) => setCurrentTimeMs(time));

    const timer = setInterval(() => {
      setCurrentTimeMs(getTrustedEpochMs());
    }, 1000);

    // Fetch exams for student / faculty display
    setLoadingExams(true);
    api
      .get<ExamSummary[]>("/api/exams/public")
      .then((data) => setExams(data || []))
      .catch(() => setExams([]))
      .finally(() => setLoadingExams(false));

    return () => clearInterval(timer);
  }, []);

  const role = user?.role?.toUpperCase() || "STUDENT";
  const isAdmin = role === "ADMIN";
  const isCoordinator = role === "COURSE_COORDINATOR";
  const isProfessor = role === "PROFESSOR" || role === "FACULTY";
  const isStudent = role === "STUDENT";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-16">
      {/* Hero Welcome Banner */}
      <div className="bg-white border-b border-slate-200 px-4 py-8 sm:py-12 shadow-sm">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider border shadow-sm ${
                    isAdmin
                      ? "bg-purple-50 text-purple-700 border-purple-200"
                      : isCoordinator
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : isProfessor
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-amber-50 text-amber-700 border-amber-200"
                  }`}
                >
                  {isAdmin
                    ? "🛡️ System Administrator"
                    : isCoordinator
                    ? "👥 Course Coordinator"
                    : isProfessor
                    ? "👨‍🏫 Professor / Faculty"
                    : "🎒 Student Candidate"}
                </span>

                {user?.department && (
                  <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full border border-slate-200">
                    🏢 {user.department}
                  </span>
                )}

                {user?.identifier && (
                  <span className="text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full border border-indigo-200 font-mono font-medium">
                    🆔 {user.identifier}
                  </span>
                )}
              </div>

              <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                Welcome back, {user?.fullName || "User"}
              </h1>
              <p className="text-sm text-slate-600 max-w-3xl">
                {isAdmin
                  ? "Full control over institution telemetry, user accounts, examinations, and proctoring safeguards."
                  : isCoordinator
                  ? `Department coordinator for ${user?.department || "assigned department"}. Oversee faculty, students, and departmental exams.`
                  : isProfessor
                  ? `Academic educator in ${user?.department || "Department"}. Manage assessments, evaluate student progress, and monitor live test sessions.`
                  : "Access your assigned and upcoming examinations, verify system readiness, and practice in the Online IDE."}
              </p>
            </div>

            <div className="flex flex-col items-start md:items-end bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-xs shadow-inner">
              <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">
                Verified Time
              </span>
              <span className="text-sm font-mono font-bold text-indigo-600 mt-0.5">
                {new Date(currentTimeMs).toLocaleTimeString()}
              </span>
              <span className="text-[11px] text-slate-500">
                {new Date(currentTimeMs).toLocaleDateString(undefined, {
                  weekday: "short",
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-10">
        {/* ========================================================= */}
        {/* ADMIN DASHBOARD VIEW                                      */}
        {/* ========================================================= */}
        {isAdmin && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Administrator Control Center</h2>
                <p className="text-xs text-slate-500">Centralized academic management and proctoring surveillance</p>
              </div>
              <Link
                to="/admin/dashboard"
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
              >
                <span>Open Admin Dashboard</span>
                <span>→</span>
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Link
                to="/admin/dashboard?tab=users"
                className="bg-white border border-slate-200 hover:border-purple-300 p-5 rounded-xl transition-all duration-150 hover:shadow-md group flex flex-col justify-between shadow-sm"
              >
                <div>
                  <div className="w-10 h-10 rounded-lg bg-purple-50 border border-purple-200 text-purple-600 flex items-center justify-center text-lg mb-3">
                    👥
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm group-hover:text-purple-600 transition-colors">
                    User Accounts
                  </h3>
                  <p className="text-xs text-slate-600 mt-1">
                    Manage Admin, Course Coordinator, and Staff credentials and role permissions.
                  </p>
                </div>
                <div className="text-xs font-semibold text-purple-600 mt-4 flex items-center gap-1">
                  Manage Users <span>→</span>
                </div>
              </Link>

              <Link
                to="/admin/dashboard?tab=professors"
                className="bg-white border border-slate-200 hover:border-emerald-300 p-5 rounded-xl transition-all duration-150 hover:shadow-md group flex flex-col justify-between shadow-sm"
              >
                <div>
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center text-lg mb-3">
                    👨‍🏫
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm group-hover:text-emerald-600 transition-colors">
                    Professor Login Credentials
                  </h3>
                  <p className="text-xs text-slate-600 mt-1">
                    Search by staff code, name, filter by department, add professors, and bulk upload CSV.
                  </p>
                </div>
                <div className="text-xs font-semibold text-emerald-600 mt-4 flex items-center gap-1">
                  Manage Professors <span>→</span>
                </div>
              </Link>

              <Link
                to="/admin/dashboard?tab=students"
                className="bg-white border border-slate-200 hover:border-blue-300 p-5 rounded-xl transition-all duration-150 hover:shadow-md group flex flex-col justify-between shadow-sm"
              >
                <div>
                  <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center text-lg mb-3">
                    🎒
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm group-hover:text-blue-600 transition-colors">
                    Student Login Credentials
                  </h3>
                  <p className="text-xs text-slate-600 mt-1">
                    Manage register numbers, search student roster, filter by department, and bulk upload.
                  </p>
                </div>
                <div className="text-xs font-semibold text-blue-600 mt-4 flex items-center gap-1">
                  Manage Students <span>→</span>
                </div>
              </Link>

              <Link
                to="/admin/exams/new"
                className="bg-white border border-slate-200 hover:border-indigo-300 p-5 rounded-xl transition-all duration-150 hover:shadow-md group flex flex-col justify-between shadow-sm"
              >
                <div>
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center text-lg mb-3">
                    ➕
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm group-hover:text-indigo-600 transition-colors">
                    Create Examination
                  </h3>
                  <p className="text-xs text-slate-600 mt-1">
                    Configure MCQ and Coding assessments with automated AI proctoring configurations.
                  </p>
                </div>
                <div className="text-xs font-semibold text-indigo-600 mt-4 flex items-center gap-1">
                  New Exam <span>→</span>
                </div>
              </Link>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* COURSE COORDINATOR VIEW                                   */}
        {/* ========================================================= */}
        {isCoordinator && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Course Coordinator Workspace</h2>
                <p className="text-xs text-slate-500">
                  Department: <span className="text-indigo-600 font-semibold">{user?.department || "All"}</span>
                </p>
              </div>
              <Link
                to="/admin/dashboard"
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
              >
                <span>Department Portal</span>
                <span>→</span>
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              <Link
                to="/admin/dashboard"
                className="bg-white border border-slate-200 hover:border-blue-300 p-5 rounded-xl transition-all duration-150 hover:shadow-md group flex flex-col justify-between shadow-sm"
              >
                <div>
                  <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center text-lg mb-3">
                    📋
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm group-hover:text-blue-600 transition-colors">
                    Department Examinations
                  </h3>
                  <p className="text-xs text-slate-600 mt-1">
                    View, schedule, and review exams conducted for {user?.department || "your department"}.
                  </p>
                </div>
                <div className="text-xs font-semibold text-blue-600 mt-4 flex items-center gap-1">
                  View Scheduled Exams <span>→</span>
                </div>
              </Link>

              <Link
                to="/admin/dashboard?tab=professors"
                className="bg-white border border-slate-200 hover:border-emerald-300 p-5 rounded-xl transition-all duration-150 hover:shadow-md group flex flex-col justify-between shadow-sm"
              >
                <div>
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center text-lg mb-3">
                    👨‍🏫
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm group-hover:text-emerald-600 transition-colors">
                    Department Faculty &amp; Professors
                  </h3>
                  <p className="text-xs text-slate-600 mt-1">
                    Inspect professor credentials, course allocations, and active staff codes.
                  </p>
                </div>
                <div className="text-xs font-semibold text-emerald-600 mt-4 flex items-center gap-1">
                  Review Faculty <span>→</span>
                </div>
              </Link>

              <Link
                to="/ide"
                className="bg-white border border-slate-200 hover:border-indigo-300 p-5 rounded-xl transition-all duration-150 hover:shadow-md group flex flex-col justify-between shadow-sm"
              >
                <div>
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center text-lg mb-3">
                    💻
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm group-hover:text-indigo-600 transition-colors">
                    Online Coding Playground
                  </h3>
                  <p className="text-xs text-slate-600 mt-1">
                    Test problem testcases, run custom code in Java, Python, C++, and verify execution benchmarks.
                  </p>
                </div>
                <div className="text-xs font-semibold text-indigo-600 mt-4 flex items-center gap-1">
                  Launch IDE <span>→</span>
                </div>
              </Link>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* PROFESSOR VIEW                                            */}
        {/* ========================================================= */}
        {isProfessor && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Professor &amp; Faculty Portal</h2>
                <p className="text-xs text-slate-500">
                  Department: <span className="text-emerald-600 font-semibold">{user?.department || "Department"}</span> • Staff Code: <span className="font-mono text-slate-700">{user?.identifier || "N/A"}</span>
                </p>
              </div>
              <Link
                to="/admin/dashboard"
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
              >
                <span>Professor Dashboard</span>
                <span>→</span>
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Link
                to="/admin/dashboard?tab=exams"
                className="bg-white border border-slate-200 hover:border-emerald-300 p-5 rounded-xl transition-all duration-150 hover:shadow-md group flex flex-col justify-between shadow-sm"
              >
                <div>
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center text-lg mb-3">
                    📝
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm group-hover:text-emerald-600 transition-colors">
                    Assigned Examinations
                  </h3>
                  <p className="text-xs text-slate-600 mt-1">
                    Manage question sets, configure test cases, and publish assessments.
                  </p>
                </div>
                <div className="text-xs font-semibold text-emerald-600 mt-4 flex items-center gap-1">
                  Manage Exams <span>→</span>
                </div>
              </Link>

              <Link
                to="/admin/dashboard?tab=proctoring"
                className="bg-white border border-slate-200 hover:border-indigo-300 p-5 rounded-xl transition-all duration-150 hover:shadow-md group flex flex-col justify-between shadow-sm"
              >
                <div>
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center text-lg mb-3">
                    🛡️
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm group-hover:text-indigo-600 transition-colors">
                    Live Proctoring Feed
                  </h3>
                  <p className="text-xs text-slate-600 mt-1">
                    Inspect active candidate sessions, multi-face detections, and proctoring telemetry.
                  </p>
                </div>
                <div className="text-xs font-semibold text-indigo-600 mt-4 flex items-center gap-1">
                  Surveillance Console <span>→</span>
                </div>
              </Link>

              <Link
                to="/ide"
                className="bg-white border border-slate-200 hover:border-purple-300 p-5 rounded-xl transition-all duration-150 hover:shadow-md group flex flex-col justify-between shadow-sm"
              >
                <div>
                  <div className="w-10 h-10 rounded-lg bg-purple-50 border border-purple-200 text-purple-600 flex items-center justify-center text-lg mb-3">
                    💻
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm group-hover:text-purple-600 transition-colors">
                    Online IDE &amp; Sandbox
                  </h3>
                  <p className="text-xs text-slate-600 mt-1">
                    Develop and verify coding question solutions across Python, Java, and C++.
                  </p>
                </div>
                <div className="text-xs font-semibold text-purple-600 mt-4 flex items-center gap-1">
                  Launch Sandbox <span>→</span>
                </div>
              </Link>

              <Link
                to="/admin/dashboard?tab=students"
                className="bg-white border border-slate-200 hover:border-amber-300 p-5 rounded-xl transition-all duration-150 hover:shadow-md group flex flex-col justify-between shadow-sm"
              >
                <div>
                  <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center text-lg mb-3">
                    🎒
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm group-hover:text-amber-600 transition-colors">
                    Student Roster
                  </h3>
                  <p className="text-xs text-slate-600 mt-1">
                    View student register numbers, test attempts, and department candidates.
                  </p>
                </div>
                <div className="text-xs font-semibold text-amber-600 mt-4 flex items-center gap-1">
                  View Students <span>→</span>
                </div>
              </Link>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* STUDENT VIEW                                              */}
        {/* ========================================================= */}
        {isStudent && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-900">My Academic Examinations</h2>
                <p className="text-xs text-slate-500">
                  Registered Register No: <span className="font-mono text-amber-600 font-bold">{user?.identifier || "N/A"}</span>
                  {user?.department ? ` • ${user.department}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to="/instructions"
                  className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-medium px-3.5 py-2 rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
                >
                  <span>📖 Instructions</span>
                </Link>
                <Link
                  to="/ide"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
                >
                  <span>💻 Practice IDE</span>
                </Link>
              </div>
            </div>

            {/* Assessment Quick Launch Cards */}
            {loadingExams ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                Loading available examinations...
              </div>
            ) : exams.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center shadow-sm">
                <span className="text-3xl mb-2 block">📋</span>
                <p className="text-sm font-semibold text-slate-800">No Examinations Scheduled</p>
                <p className="text-xs text-slate-500 mt-1">
                  There are currently no active or upcoming exams published for your cohort. Please check back later.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {exams.map((exam) => {
                  const startMs = new Date(exam.startAt).getTime();
                  const endMs = new Date(exam.endAt).getTime();
                  const isUpcoming = currentTimeMs < startMs;
                  const isClosed = currentTimeMs > endMs;
                  const isOpen = !isUpcoming && !isClosed;

                  return (
                    <div
                      key={exam.id}
                      className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-5 shadow-sm hover:shadow-md flex flex-col justify-between transition-all"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                              isOpen
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : isUpcoming
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : "bg-slate-100 text-slate-600 border border-slate-200"
                            }`}
                          >
                            {isOpen ? "● OPEN NOW" : isUpcoming ? "UPCOMING" : "CLOSED"}
                          </span>
                          {exam.durationMinutes && (
                            <span className="text-xs text-slate-500 font-mono">
                              ⏱️ {exam.durationMinutes} mins
                            </span>
                          )}
                        </div>

                        <h3 className="font-bold text-slate-900 text-base mb-1">{exam.name}</h3>
                        {exam.subject && (
                          <p className="text-xs text-indigo-600 font-medium mb-2">{exam.subject}</p>
                        )}
                        <p className="text-xs text-slate-500 line-clamp-2 mb-4">
                          {exam.numQuestions} Questions • Monitored Session
                        </p>
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                        <div className="text-[11px] text-slate-500">
                          {isOpen ? (
                            <span className="text-emerald-600 font-medium">Ready to take</span>
                          ) : isUpcoming ? (
                            <span>Starts {new Date(exam.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                          ) : (
                            <span>Ended</span>
                          )}
                        </div>

                        {isOpen ? (
                          <Link
                            to={`/exam/${exam.id}/verify`}
                            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg shadow-sm transition-all"
                          >
                            Start Exam →
                          </Link>
                        ) : (
                          <Link
                            to={`/exam/${exam.id}/verify`}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs px-3 py-1.5 rounded-lg transition-colors"
                          >
                            View Details
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Quick Readiness Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center text-lg">
                  🛡️
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">System &amp; Hardware Readiness Check</h4>
                  <p className="text-xs text-slate-600">
                    Ensure your camera, microphone, and browser full-screen permissions are functioning properly before taking exams.
                  </p>
                </div>
              </div>
              <Link
                to="/instructions"
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 shrink-0"
              >
                Read Setup Checklist <span>→</span>
              </Link>
            </div>
          </div>
        )}

        {/* Global Online IDE Teaser for all logged-in roles */}
        <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-white border border-indigo-100 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
              Integrated Development Environment
            </span>
            <h3 className="text-lg font-bold text-slate-900">Interactive Multi-Language Online IDE</h3>
            <p className="text-xs text-slate-600 max-w-xl">
              Write, compile, and execute code in Python, Java, and C++ with custom standard input, real-time syntax checking, and sub-second execution.
            </p>
          </div>
          <Link
            to="/ide"
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-md shadow-indigo-600/20 transition-all shrink-0 flex items-center gap-2"
          >
            <span>Launch Online IDE</span>
            <span>🚀</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
