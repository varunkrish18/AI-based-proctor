import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, clearToken, getAdminRefreshToken, getToken } from "../../api/client";
import type { AdminAttemptSummary, DashboardCharts, DashboardSummary, Exam } from "../../types";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const AI_SERVICE_URL = import.meta.env.VITE_AI_SERVICE_URL || "http://localhost:8000";
const PIE_COLORS = ["#3b82f6", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899", "#6366f1", "#14b8a6"];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [exams, setExams] = useState<Exam[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [charts, setCharts] = useState<DashboardCharts | null>(null);
  const [liveSessions, setLiveSessions] = useState<AdminAttemptSummary[]>([]);
  const [aiDegraded, setAiDegraded] = useState<{ degraded: boolean; reason: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [examToDelete, setExamToDelete] = useState<Exam | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function confirmDeleteExam() {
    if (!examToDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/api/admin/exams/${examToDelete.id}`, "admin");
      setExams((prev) => prev.filter((e) => e.id !== examToDelete.id));
      setActionSuccess(`Exam "${examToDelete.name}" was successfully deleted.`);
      setTimeout(() => setActionSuccess(null), 4000);
      setExamToDelete(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete exam.");
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    if (!getToken("admin")) {
      navigate("/admin/login");
      return;
    }

    Promise.allSettled([
      api.get<Exam[]>("/api/admin/exams", "admin"),
      api.get<DashboardSummary>("/api/admin/dashboard/summary", "admin"),
      api.get<DashboardCharts>("/api/admin/dashboard/charts", "admin"),
    ])
      .then(([exsRes, sumRes, chsRes]) => {
        if (exsRes.status === "fulfilled") setExams(exsRes.value);
        if (sumRes.status === "fulfilled") setSummary(sumRes.value);
        if (chsRes.status === "fulfilled") setCharts(chsRes.value);

        if (exsRes.status === "rejected") {
          setError(exsRes.reason?.message || "Failed to load exams");
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    // Check AI service health
    fetch(`${AI_SERVICE_URL}/health`)
      .then((r) => r.json())
      .then((data) => {
        if (data.degraded_mode) {
          setAiDegraded({ degraded: true, reason: data.degraded_reason ?? "Gaze detection unavailable." });
        } else {
          setAiDegraded({ degraded: false, reason: null });
        }
      })
      .catch(() => {
        setAiDegraded({ degraded: true, reason: "AI service is offline — all computer-vision monitoring is disabled." });
      });
  }, [navigate]);

  // Poll live active sessions every 10 seconds
  useEffect(() => {
    if (!getToken("admin")) return;

    async function fetchLiveSessions() {
      try {
        const [exs, sumRes] = await Promise.all([
          api.get<Exam[]>("/api/admin/exams", "admin"),
          api.get<DashboardSummary>("/api/admin/dashboard/summary", "admin").catch(() => null),
        ]);
        if (sumRes) setSummary(sumRes);

        const publishedIds = exs.filter((e) => e.status === "PUBLISHED" || e.status === "OPEN").map((e) => e.id);
        const allLive: AdminAttemptSummary[] = [];
        await Promise.all(
          publishedIds.map(async (examId) => {
            try {
              const attempts = await api.get<AdminAttemptSummary[]>(
                `/api/admin/exams/${examId}/attempts`,
                "admin"
              );
              const inProgress = attempts.filter((a) => a.status === "IN_PROGRESS");
              allLive.push(...inProgress);
            } catch {
              /* best-effort per exam */
            }
          })
        );
        setLiveSessions(allLive);
      } catch {
        /* best-effort live poll */
      }
    }

    fetchLiveSessions();
    liveIntervalRef.current = setInterval(fetchLiveSessions, 5000);
    return () => {
      if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);
    };
  }, [navigate]);

  async function logout() {
    const rt = getAdminRefreshToken();
    if (rt) {
      try {
        await api.post("/api/admin/auth/logout", { refreshToken: rt });
      } catch {
        // ignore errors on logout
      }
    }
    clearToken("admin");
    navigate("/admin/login");
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-10 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Control Center</h1>
          <p className="text-slate-500 text-sm">
            Real-time proctoring telemetry, exam management, and system integrity
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            to="/admin/exams/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-xs"
          >
            + Create Exam
          </Link>
          <button
            onClick={logout}
            className="border border-slate-300 px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Log Out
          </button>
        </div>
      </div>

      {loading && (
        <div className="py-12 text-center text-slate-500">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mb-3"></div>
          <p>Loading analytics & telemetry…</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
          {error}
        </div>
      )}

      {!loading && (
        <>
          {/* AI Degraded Mode Warning Banner */}
          {aiDegraded?.degraded && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-xl px-5 py-4 text-sm">
              <span className="text-amber-500 text-xl shrink-0">⚠️</span>
              <div>
                <p className="font-bold text-amber-900">AI Monitoring Degraded</p>
                <p className="text-amber-800 text-xs mt-0.5">{aiDegraded.reason}</p>
                <p className="text-amber-700 text-xs mt-1">
                  Events such as <strong>LOOKING_LEFT</strong>, <strong>LOOKING_RIGHT</strong>, <strong>HEAD_TURNED</strong> will not fire.
                  Only basic face presence/count detection is active.
                  To fix: provide MediaPipe <code className="bg-amber-100 px-1 rounded">face_detector.task</code> and{" "}
                  <code className="bg-amber-100 px-1 rounded">face_landmarker.task</code> files to the ai-service.
                </p>
              </div>
            </div>
          )}

          {/* Live Active Sessions Panel */}
          {liveSessions.length > 0 && (
            <LiveSessionsPanel sessions={liveSessions} exams={exams} />
          )}

          {/* Key Metrics Row (6 cards) */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard
              label="Total Exams"
              value={summary?.totalExams ?? exams.length}
              subtext="Created to date"
            />
            <StatCard
              label="Active Exams"
              value={summary?.activeExams ?? 0}
              subtext="Currently published"
              color="text-emerald-700"
            />
            <StatCard
              label="Completed"
              value={summary?.completedAttempts ?? 0}
              subtext="Submitted attempts"
              color="text-blue-700"
            />
            <StatCard
              label="Writing Now"
              value={summary?.studentsCurrentlyWriting ?? 0}
              subtext="Active heartbeats"
              color="text-indigo-600"
              badge={summary && summary.studentsCurrentlyWriting > 0 ? "LIVE" : undefined}
            />
            <StatCard
              label="Warnings Today"
              value={summary?.warningsToday ?? 0}
              subtext="Behavior warnings"
              color="text-amber-600"
            />
            <StatCard
              label="High Flags Today"
              value={summary?.highSeverityEventsToday ?? 0}
              subtext="High / Critical events"
              color="text-rose-600"
            />
          </div>

          {/* Charts Grid */}
          {charts && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Chart 1: Warnings Timeline */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
                <h3 className="font-bold text-slate-800 text-sm mb-1">
                  Proctoring Anomaly Activity (Last 7 Days)
                </h3>
                <p className="text-xs text-slate-500 mb-4">Hourly anomaly count across all proctored sessions</p>
                <div className="h-64">
                  {charts.warningsTimeline && charts.warningsTimeline.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={charts.warningsTimeline.map((pt) => {
                          const raw = pt.hour || pt.timestamp || "";
                          const formatted =
                            raw.length > 10 ? raw.substring(5, 16).replace("T", " ") : raw;
                          return {
                            time: formatted || "Recent",
                            count: pt.count ?? pt.value ?? 0,
                          };
                        })}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#64748b" }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#64748b" }} />
                        <Tooltip />
                        <Line
                          type="monotone"
                          dataKey="count"
                          name="Events"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          dot={{ r: 2 }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                      No proctoring anomalies recorded in the last 7 days.
                    </div>
                  )}
                </div>
              </div>

              {/* Chart 2: Signal Breakdown by Event Type */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
                <h3 className="font-bold text-slate-800 text-sm mb-1">
                  Suspicious Events by Signal Type
                </h3>
                <p className="text-xs text-slate-500 mb-4">Distribution of browser-native & CV signals</p>
                <div className="h-64">
                  {charts.warningsByType.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={charts.warningsByType}
                          dataKey="value"
                          nameKey="label"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={(entry: any) => `${entry.name || entry.label || ""}: ${entry.value}`}
                        >
                          {charts.warningsByType.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                      No proctoring signals recorded yet.
                    </div>
                  )}
                </div>
              </div>

              {/* Chart 3: Warnings by Exam */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
                <h3 className="font-bold text-slate-800 text-sm mb-1">
                  Top Flagged Exams
                </h3>
                <p className="text-xs text-slate-500 mb-4">Total high/critical events aggregated per exam</p>
                <div className="h-64">
                  {charts.warningsByExam.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={charts.warningsByExam}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#64748b" }} />
                        <Tooltip />
                        <Bar dataKey="value" name="Flagged Events" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                      No flagged exams recorded yet.
                    </div>
                  )}
                </div>
              </div>

              {/* Chart 4: Score Distribution */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
                <h3 className="font-bold text-slate-800 text-sm mb-1">
                  Overall Score Distribution
                </h3>
                <p className="text-xs text-slate-500 mb-4">Student test scores grouped in 10-point buckets</p>
                <div className="h-64">
                  {charts.scoreDistribution.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={charts.scoreDistribution}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#64748b" }} />
                        <Tooltip />
                        <Bar dataKey="value" name="Submissions" fill="#10b981" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                      No submitted attempts with scores yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {actionSuccess && (
            <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
              <span>✓ {actionSuccess}</span>
              <button
                onClick={() => setActionSuccess(null)}
                className="text-emerald-600 hover:text-emerald-900 font-bold ml-4 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Exams Management Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h2 className="font-bold text-slate-900 text-sm">Configured Exams</h2>
                <p className="text-xs text-slate-500">Manage questions, student assignments, and proctoring parameters</p>
              </div>
              <span className="text-xs text-slate-400 font-medium">{exams.length} exams</span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold text-xs">Name</th>
                  <th className="px-4 py-3 font-semibold text-xs">Subject</th>
                  <th className="px-4 py-3 font-semibold text-xs">Questions</th>
                  <th className="px-4 py-3 font-semibold text-xs">Duration</th>
                  <th className="px-4 py-3 font-semibold text-xs">Status</th>
                  <th className="px-4 py-3 font-semibold text-xs text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {exams.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-900">{e.name}</td>
                    <td className="px-4 py-3 text-slate-600">{e.subject ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{e.numQuestions}</td>
                    <td className="px-4 py-3 text-slate-600">{e.durationMinutes} min</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                          e.status === "PUBLISHED"
                            ? "bg-green-100 text-green-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {e.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/admin/exams/${e.id}`}
                          className="text-blue-600 font-medium hover:underline text-xs bg-blue-50 px-2.5 py-1 rounded hover:bg-blue-100 transition-colors"
                        >
                          Manage & Proctoring →
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null);
                            setExamToDelete(e);
                          }}
                          className="text-rose-600 hover:text-rose-800 text-xs bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded transition-colors font-medium cursor-pointer"
                          title="Delete this exam"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {exams.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                      No exams configured yet. Click "+ Create Exam" to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Delete Exam Confirmation Modal */}
          {examToDelete && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-lg font-bold">
                    🗑️
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Delete Exam</h3>
                    <p className="text-xs text-slate-500">Confirm permanent deletion</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-slate-700">
                    Are you sure you want to delete <strong className="text-slate-900 font-semibold">"{examToDelete.name}"</strong>?
                  </p>
                  <p className="text-xs text-rose-700 bg-rose-50 p-3 rounded-lg mt-3 border border-rose-200">
                    ⚠️ This action cannot be undone. All questions, student assignments, test attempts, warnings, and proctoring telemetry for this exam will be permanently removed.
                  </p>
                </div>
                {deleteError && (
                  <div className="text-xs text-rose-700 bg-rose-100 p-2.5 rounded-lg">
                    {deleteError}
                  </div>
                )}
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!deleting) setExamToDelete(null);
                    }}
                    disabled={deleting}
                    className="px-4 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmDeleteExam}
                    disabled={deleting}
                    className="px-4 py-2 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
                  >
                    {deleting ? (
                      <>
                        <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Deleting…
                      </>
                    ) : (
                      "Yes, Delete Exam"
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LiveSessionsPanel({ sessions, exams }: { sessions: AdminAttemptSummary[]; exams: Exam[] }) {
  const examNameMap = Object.fromEntries((exams || []).map((e) => [e.id, e.name]));

  function elapsedLabel(startTime?: string | null) {
    if (!startTime) return "—";
    const ts = new Date(startTime).getTime();
    if (isNaN(ts) || ts <= 0) return "—";
    const diffMs = Math.max(0, Date.now() - ts);
    const m = Math.floor(diffMs / 60000);
    const s = Math.floor((diffMs % 60000) / 1000);
    return `${m}m ${s}s`;
  }

  return (
    <div className="bg-white border-2 border-emerald-400 rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 py-3.5 border-b border-emerald-200 bg-emerald-50 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <h2 className="font-bold text-emerald-900 text-sm">
            Live Monitoring — {sessions.length} Student{sessions.length !== 1 ? "s" : ""} Currently Writing
          </h2>
        </div>
        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
          Auto-refreshes every 10s
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left text-xs">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Student</th>
              <th className="px-4 py-2.5 font-semibold">Exam</th>
              <th className="px-4 py-2.5 font-semibold">Elapsed</th>
              <th className="px-4 py-2.5 font-semibold">Streams</th>
              <th className="px-4 py-2.5 font-semibold">Risk Score</th>
              <th className="px-4 py-2.5 font-semibold">Events</th>
              <th className="px-4 py-2.5 font-semibold text-right">Report</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sessions.map((s) => {
              const risk = s.currentRiskScore ?? 0;
              const riskClass =
                risk >= 75
                  ? "bg-rose-100 text-rose-800 border-rose-300"
                  : risk >= 40
                  ? "bg-amber-100 text-amber-800 border-amber-200"
                  : "bg-emerald-100 text-emerald-800 border-emerald-200";
              const ps = s.proctoringSession;

              return (
                <tr key={s.attemptId} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                      <span className="font-medium text-slate-900">{s.studentEmail}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">
                    {examNameMap[s.examId] ?? `Exam #${s.examId}`}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {elapsedLabel(s.startTime)}
                  </td>
                  <td className="px-4 py-3">
                    {ps ? (
                      <div className="flex items-center gap-1.5 text-xs">
                        <span
                          className={`w-2.5 h-2.5 rounded-full border ${
                            ps.webcamStatus === "ACTIVE"
                              ? "bg-emerald-400 border-emerald-500"
                              : "bg-rose-400 border-rose-500"
                          }`}
                          title={`Webcam: ${ps.webcamStatus}`}
                        />
                        <span
                          className={`w-2.5 h-2.5 rounded-full border ${
                            ps.microphoneStatus === "ACTIVE"
                              ? "bg-emerald-400 border-emerald-500"
                              : "bg-rose-400 border-rose-500"
                          }`}
                          title={`Mic: ${ps.microphoneStatus}`}
                        />
                        <span
                          className={`w-2.5 h-2.5 rounded-full border ${
                            ps.screenStatus === "ACTIVE"
                              ? "bg-emerald-400 border-emerald-500"
                              : "bg-rose-400 border-rose-500"
                          }`}
                          title={`Screen: ${ps.screenStatus}`}
                        />
                      </div>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${riskClass}`}>
                      {risk.toFixed(1)}
                    </span>
                    {s.flaggedForReview && (
                      <span className="ml-1.5 bg-rose-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded uppercase">
                        FLAGGED
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {(s.highEvents ?? 0) + (s.criticalEvents ?? 0) > 0 && (
                        <span className="bg-red-100 text-red-700 text-xs px-1.5 py-0.5 rounded font-medium">
                          {(s.highEvents ?? 0) + (s.criticalEvents ?? 0)}H
                        </span>
                      )}
                      {(s.mediumEvents ?? 0) > 0 && (
                        <span className="bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded font-medium">
                          {s.mediumEvents}M
                        </span>
                      )}
                      {(s.totalEvents ?? 0) === 0 && (
                        <span className="text-slate-400 text-xs">Clean</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/admin/exams/${s.examId}/attempts/${s.attemptId}`}
                      className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium px-2.5 py-1 rounded transition-colors"
                    >
                      Live Report ↗
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  subtext,
  color = "text-slate-900",
  badge,
}: {
  label: string;
  value: number;
  subtext?: string;
  color?: string;
  badge?: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs relative">
      {badge && (
        <span className="absolute top-3 right-3 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500 text-white animate-pulse">
          {badge}
        </span>
      )}
      <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-extrabold mt-1 ${color}`}>{value}</p>
      {subtext && <p className="text-[11px] text-slate-400 mt-0.5">{subtext}</p>}
    </div>
  );
}
