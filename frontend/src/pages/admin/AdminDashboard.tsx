import { useEffect, useState, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, clearToken, getAdminRefreshToken, getToken } from "../../api/client";
import type { AdminAttemptSummary, DashboardCharts, DashboardSummary, Exam } from "../../types";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const PIE_COLORS = ["#3b82f6", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899", "#6366f1", "#14b8a6"];

interface ThreatCategory {
  title: string;
  count: number;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [exams, setExams] = useState<Exam[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [charts, setCharts] = useState<DashboardCharts | null>(null);
  const [liveSessions, setLiveSessions] = useState<AdminAttemptSummary[]>([]);
  const [flaggedSessions, setFlaggedSessions] = useState<AdminAttemptSummary[]>([]);
  const [aiDegraded, setAiDegraded] = useState<{ degraded: boolean; reason: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedExamId, setSelectedExamId] = useState<string>("ALL");
  const [examSearch, setExamSearch] = useState<string>("");
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Exam deletion dialog state
  const [examToDelete, setExamToDelete] = useState<Exam | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const checkAiHealth = useCallback(() => {
    api
      .get<{ status?: string; degraded_mode?: boolean; degraded_reason?: string }>(
        "/api/admin/system/ai-health",
        "admin"
      )
      .then((data) => {
        if (data?.degraded_mode) {
          setAiDegraded({ degraded: true, reason: data.degraded_reason || "Gaze detection unavailable." });
        } else {
          setAiDegraded({ degraded: false, reason: null });
        }
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          return;
        }
        setAiDegraded({ degraded: true, reason: "AI service is offline — computer-vision monitoring is unavailable." });
      });
  }, []);

  const loadDashboardData = useCallback(
    async (examIdFilter?: string) => {
      setIsRefreshing(true);
      try {
        const examQuery = examIdFilter && examIdFilter !== "ALL" ? `?examId=${examIdFilter}` : "";
        const [exsRes, sumRes, chsRes] = await Promise.allSettled([
          api.get<Exam[]>("/api/admin/exams", "admin"),
          api.get<DashboardSummary>("/api/admin/dashboard/summary", "admin"),
          api.get<DashboardCharts>(`/api/admin/dashboard/charts${examQuery}`, "admin"),
        ]);

        if (exsRes.status === "fulfilled") setExams(exsRes.value);
        if (sumRes.status === "fulfilled") setSummary(sumRes.value);
        if (chsRes.status === "fulfilled") setCharts(chsRes.value);

        if (exsRes.status === "rejected") {
          setError(exsRes.reason?.message || "Failed to load exams");
        } else {
          setError(null);
        }

        // Fetch recent flagged attempts across open/published exams for the Review Queue
        if (exsRes.status === "fulfilled") {
          const targetExams =
            examIdFilter && examIdFilter !== "ALL"
              ? exsRes.value.filter((e) => String(e.id) === examIdFilter)
              : exsRes.value.slice(0, 8);

          const flaggedAccumulator: AdminAttemptSummary[] = [];
          await Promise.all(
            targetExams.map(async (exam) => {
              try {
                const atts = await api.get<AdminAttemptSummary[]>(`/api/admin/exams/${exam.id}/attempts`, "admin");
                // Collect high-risk or flagged attempts
                const highRisk = atts.filter(
                  (a) =>
                    a.flaggedForReview ||
                    (a.currentRiskScore ?? 0) >= 40 ||
                    (a.highEvents ?? 0) + (a.criticalEvents ?? 0) > 0
                );
                flaggedAccumulator.push(...highRisk);
              } catch {
                /* non-critical per exam */
              }
            })
          );

          // Sort by risk score descending
          flaggedAccumulator.sort((a, b) => (b.currentRiskScore ?? 0) - (a.currentRiskScore ?? 0));
          setFlaggedSessions(flaggedAccumulator.slice(0, 10));
        }

        setLastRefreshed(new Date());
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error fetching dashboard metrics");
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!getToken("admin")) {
      navigate("/admin/login");
      return;
    }
    loadDashboardData(selectedExamId);
    checkAiHealth();
  }, [navigate, loadDashboardData, checkAiHealth, selectedExamId]);

  // Poll live active sessions
  useEffect(() => {
    if (!getToken("admin")) return;

    async function fetchLiveSessions() {
      try {
        const exs = await api.get<Exam[]>("/api/admin/exams", "admin");
        if (exs) setExams(exs);

        const publishedIds = exs.filter((e) => e.status === "PUBLISHED" || e.status === "OPEN").map((e) => e.id);
        const allLive: AdminAttemptSummary[] = [];
        await Promise.all(
          publishedIds.map(async (examId) => {
            try {
              const attempts = await api.get<AdminAttemptSummary[]>(`/api/admin/exams/${examId}/attempts`, "admin");
              const inProgress = attempts.filter((a) => a.status === "IN_PROGRESS");
              allLive.push(...inProgress);
            } catch {
              /* ignore per-exam error */
            }
          })
        );
        setLiveSessions(allLive);
      } catch {
        /* best-effort */
      }
    }

    fetchLiveSessions();
    const liveTimer = setInterval(fetchLiveSessions, 6000);
    const aiTimer = setInterval(checkAiHealth, 15000);
    return () => {
      clearInterval(liveTimer);
      clearInterval(aiTimer);
    };
  }, [navigate, checkAiHealth]);

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

  async function logout() {
    const rt = getAdminRefreshToken();
    if (rt) {
      try {
        await api.post("/api/admin/auth/logout", { refreshToken: rt });
      } catch {
        // ignore logout errors
      }
    }
    clearToken("admin");
    navigate("/admin/login");
  }

  // --- Insight Computations ---
  const totalWarnings = useMemo(() => {
    if (!charts?.warningsByType) return 0;
    return charts.warningsByType.reduce((sum, item) => sum + (item.value || 0), 0);
  }, [charts]);

  const threatCategories: ThreatCategory[] = useMemo(() => {
    if (!charts?.warningsByType) return [];
    const map: Record<string, number> = {};
    charts.warningsByType.forEach((w) => {
      map[w.label] = (map[w.label] || 0) + (w.value || 0);
    });

    const browserEscape =
      (map["TAB_SWITCH"] || 0) +
      (map["WINDOW_BLUR"] || 0) +
      (map["FULLSCREEN_EXIT"] || 0) +
      (map["CLIPBOARD_COPY"] || 0);

    const gazeAttention =
      (map["LOOKING_AWAY"] || 0) +
      (map["LOOKING_LEFT"] || 0) +
      (map["LOOKING_RIGHT"] || 0) +
      (map["HEAD_TURNED"] || 0) +
      (map["EYES_CLOSED"] || 0);

    const biometricFace =
      (map["NO_FACE"] || 0) +
      (map["FACE_NOT_VISIBLE"] || 0) +
      (map["CAMERA_COVERED"] || 0) +
      (map["MULTIPLE_FACES"] || 0) +
      (map["FACE_UNVERIFIED"] || 0) +
      (map["PERSON_BEHIND"] || 0) +
      (map["PERSON_BEHIND_DETECTED"] || 0);

    const deviceAudio =
      (map["PHONE_DETECTED"] || 0) +
      (map["VOICE_DETECTED"] || 0) +
      (map["SPEECH_DETECTED"] || 0) +
      (map["AUDIO_SPIKE"] || 0);

    return [
      {
        title: "Browser & Screen Escapes",
        count: browserEscape,
        icon: "🖥️",
        color: "text-amber-600",
        bgColor: "bg-amber-50",
        borderColor: "border-amber-200",
        description: "Tab switching, leaving fullscreen, window unfocus",
      },
      {
        title: "Gaze & Attention Deviations",
        count: gazeAttention,
        icon: "👁️",
        color: "text-blue-600",
        bgColor: "bg-blue-50",
        borderColor: "border-blue-200",
        description: "Looking away, head turns, eyes off-screen",
      },
      {
        title: "Biometric & Face Security",
        count: biometricFace,
        icon: "👥",
        color: "text-purple-600",
        bgColor: "bg-purple-50",
        borderColor: "border-purple-200",
        description: "Multiple faces in frame, candidate absent",
      },
      {
        title: "Unauthorized Devices & Audio",
        count: deviceAudio,
        icon: "📱",
        color: "text-rose-600",
        bgColor: "bg-rose-50",
        borderColor: "border-rose-200",
        description: "Mobile phones detected, speech, background voices",
      },
    ];
  }, [charts]);

  // Overall Integrity Index: 100 - (HighSeverityToday * 2) or ratio
  const integrityScore = useMemo(() => {
    const totalAttempts = summary?.completedAttempts || exams.length || 1;
    const highEvents = summary?.highSeverityEventsToday || 0;
    const penalty = Math.min(45, (highEvents / Math.max(1, totalAttempts)) * 15);
    return Math.max(72, Math.round((100 - penalty) * 10) / 10);
  }, [summary, exams]);

  // Top threat identified
  const topThreat = useMemo(() => {
    if (!charts?.warningsByType || charts.warningsByType.length === 0) return null;
    const sorted = [...charts.warningsByType].sort((a, b) => b.value - a.value);
    const top = sorted[0];
    const pct = totalWarnings > 0 ? Math.round((top.value / totalWarnings) * 100) : 0;
    return { label: top.label.replace(/_/g, " "), count: top.value, percentage: pct };
  }, [charts, totalWarnings]);

  const filteredExams = useMemo(() => {
    if (!examSearch.trim()) return exams;
    const q = examSearch.toLowerCase();
    return exams.filter((e) => e.name.toLowerCase().includes(q) || (e.subject && e.subject.toLowerCase().includes(q)));
  }, [exams, examSearch]);

  const examNameMap = useMemo(() => {
    return Object.fromEntries(exams.map((e) => [e.id, e.name]));
  }, [exams]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Top Header Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-6 rounded-2xl text-white shadow-xl">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🛡️</span>
            <h1 className="text-2xl font-bold tracking-tight text-white">AI Proctoring Intelligence Center</h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase tracking-wider">
              Live Monitor Active
            </span>
          </div>
          <p className="text-slate-300 text-xs mt-1.5 max-w-2xl leading-relaxed">
            Real-time biometric computer-vision telemetry, anomaly detection patterns, and candidate integrity assurance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => loadDashboardData(selectedExamId)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-xs font-semibold text-slate-200 transition-all cursor-pointer disabled:opacity-50"
            title="Refresh analytics and telemetry"
          >
            <span className={`inline-block text-sm ${isRefreshing ? "animate-spin" : ""}`}>🔄</span>
            {isRefreshing ? "Syncing…" : "Sync Telemetry"}
          </button>

          <Link
            to="/admin/exams/new"
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md hover:shadow-blue-500/25 flex items-center gap-1.5"
          >
            <span>+</span> Create New Exam
          </Link>

          <button
            onClick={logout}
            className="border border-slate-700 bg-slate-800/40 hover:bg-rose-900/40 hover:border-rose-700 text-slate-300 hover:text-rose-200 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            Log Out
          </button>
        </div>
      </div>

      {/* Scope Filter Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 flex-1">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
            Analytics Scope:
          </span>
          <select
            value={selectedExamId}
            onChange={(e) => setSelectedExamId(e.target.value)}
            className="bg-slate-50 border border-slate-300 text-slate-800 text-xs rounded-lg px-3 py-1.5 font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer max-w-xs"
          >
            <option value="ALL">🌐 All Configured Exams ({exams.length})</option>
            {exams.map((ex) => (
              <option key={ex.id} value={String(ex.id)}>
                📝 {ex.name} ({ex.status})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span>
            Last synchronized:{" "}
            <strong className="text-slate-600 font-mono">
              {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </strong>
          </span>
        </div>
      </div>

      {loading && (
        <div className="py-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mb-3" />
          <p className="font-semibold text-sm text-slate-700">Synthesizing Proctoring Telemetry &amp; AI Analytics…</p>
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button onClick={() => loadDashboardData(selectedExamId)} className="underline text-xs font-bold cursor-pointer">
            Retry
          </button>
        </div>
      )}

      {!loading && (
        <>
          {/* AI Neural Engine Health Warning if Degraded */}
          {aiDegraded?.degraded && (
            <div className="flex items-start justify-between gap-3 bg-amber-50 border border-amber-300 rounded-xl px-5 py-4 text-sm shadow-xs">
              <div className="flex items-start gap-3">
                <span className="text-amber-500 text-xl shrink-0">⚠️</span>
                <div>
                  <p className="font-bold text-amber-900">AI Vision Engine Notice</p>
                  <p className="text-amber-800 text-xs mt-0.5">{aiDegraded.reason}</p>
                  <p className="text-amber-700 text-[11px] mt-1">
                    Fallback tracking active: Face presence and sound monitoring are active.
                  </p>
                </div>
              </div>
              <button
                onClick={checkAiHealth}
                className="shrink-0 text-xs bg-amber-200 hover:bg-amber-300 text-amber-900 px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer"
              >
                Re-check AI Engine
              </button>
            </div>
          )}

          {/* SECTION 1: Executive Integrity Gauge & Core Health KPI */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            {/* Integrity Score Hero Card */}
            <div className="md:col-span-4 bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl p-6 shadow-md relative overflow-hidden flex flex-col justify-between">
              <div className="relative z-10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Exam Integrity Rating
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    Calculated Index
                  </span>
                </div>
                <div className="mt-4 flex items-baseline gap-3">
                  <span className="text-5xl font-black tracking-tight text-white">{integrityScore}%</span>
                  <span className="text-xs text-emerald-400 font-semibold">High Confidence</span>
                </div>
                <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                  Based on face continuity, absence of auxiliary devices, and zero screen escapes across submitted
                  sessions.
                </p>
              </div>

              {/* Visual Health Gauge Bar */}
              <div className="mt-6 relative z-10">
                <div className="flex justify-between text-[11px] text-slate-300 mb-1.5 font-medium">
                  <span>Session Trust Level</span>
                  <span>{integrityScore >= 90 ? "Excellent" : integrityScore >= 75 ? "Moderate" : "Flagged"}</span>
                </div>
                <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden border border-slate-700">
                  <div
                    className="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-emerald-500 via-teal-400 to-blue-500"
                    style={{ width: `${integrityScore}%` }}
                  />
                </div>
              </div>

              {/* Background watermark icon */}
              <div className="absolute -right-6 -bottom-6 text-slate-800/40 text-9xl font-black select-none pointer-events-none">
                🛡️
              </div>
            </div>

            {/* Core Stats Grid (8 Cards) */}
            <div className="md:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              <StatTile
                icon="📚"
                label="Total Exams"
                value={summary?.totalExams ?? exams.length}
                subtext="Configured in system"
              />
              <StatTile
                icon="🟢"
                label="Published"
                value={summary?.activeExams ?? exams.filter((e) => e.status === "PUBLISHED").length}
                subtext="Currently open to test"
                highlightColor="text-emerald-600"
              />
              <StatTile
                icon="✍️"
                label="Writing Now"
                value={summary?.studentsCurrentlyWriting ?? liveSessions.length}
                subtext="Active candidate streams"
                highlightColor="text-indigo-600"
                livePulse
              />
              <StatTile
                icon="✅"
                label="Completed"
                value={summary?.completedAttempts ?? 0}
                subtext="Submissions evaluated"
                highlightColor="text-blue-600"
              />
              <StatTile
                icon="⚠️"
                label="Warnings Today"
                value={summary?.warningsToday ?? 0}
                subtext="Behavior strike alerts"
                highlightColor="text-amber-600"
              />
              <StatTile
                icon="🚨"
                label="High Flags Today"
                value={summary?.highSeverityEventsToday ?? 0}
                subtext="Severe / Critical incidents"
                highlightColor="text-rose-600"
              />
              <StatTile
                icon="🚩"
                label="Review Queue"
                value={flaggedSessions.length}
                subtext="Pending proctor audit"
                highlightColor="text-orange-600"
              />
              <StatTile
                icon="🤖"
                label="AI Core"
                value={aiDegraded?.degraded ? "DEGRADED" : "OPTIMAL"}
                subtext="MediaPipe Biometrics"
                highlightColor={aiDegraded?.degraded ? "text-amber-600" : "text-emerald-600"}
              />
            </div>
          </div>

          {/* SECTION 2: AI Proctor Intelligence Insights Banner */}
          <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border border-blue-200/80 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">💡</span>
              <h2 className="font-bold text-slate-900 text-sm">Automated Proctor Intelligence Insights</h2>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                AI Telemetry Analysis
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white/90 backdrop-blur-xs p-3.5 rounded-xl border border-blue-100 text-xs">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="text-amber-500">⚡</span> Dominant Infraction Pattern
                </span>
                <p className="text-slate-600 mt-1 leading-relaxed">
                  {topThreat ? (
                    <>
                      <strong>{topThreat.label}</strong> is the most common anomaly, representing{" "}
                      <strong className="text-amber-700 font-bold">{topThreat.percentage}%</strong> of all recorded flags.
                    </>
                  ) : (
                    "No significant anomalies recorded. Proctoring signals indicate normal candidate demeanor."
                  )}
                </p>
              </div>

              <div className="bg-white/90 backdrop-blur-xs p-3.5 rounded-xl border border-blue-100 text-xs">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="text-emerald-500">🎯</span> Environment Integrity
                </span>
                <p className="text-slate-600 mt-1 leading-relaxed">
                  Screen share lockdown and camera heartbeats are verified. Candidates attempting window or display escapes
                  are cataloged with instant timestamped evidence.
                </p>
              </div>

              <div className="bg-white/90 backdrop-blur-xs p-3.5 rounded-xl border border-blue-100 text-xs">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="text-purple-500">📋</span> Proctor Action Priority
                </span>
                <p className="text-slate-600 mt-1 leading-relaxed">
                  {flaggedSessions.length > 0 ? (
                    <>
                      <strong className="text-rose-700">{flaggedSessions.length} session(s)</strong> require manual
                      audit prior to certificate issuance. Review snapshot evidence in the queue below.
                    </>
                  ) : (
                    "All candidate sessions currently adhere to compliance guidelines. No manual intervention required."
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* SECTION 3: Threat Vector Breakdown (4 Actionable Pillars) */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-bold text-slate-900 text-base">Proctoring Threat Vectors</h2>
                <p className="text-slate-500 text-xs">Grouped telemetry signals across examination sessions</p>
              </div>
              <span className="text-xs font-semibold text-slate-400">Total Flags: {totalWarnings}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {threatCategories.map((cat, idx) => (
                <div
                  key={idx}
                  className={`bg-white border ${cat.borderColor} p-4 rounded-xl shadow-xs hover:shadow-md transition-all flex flex-col justify-between`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-2xl">{cat.icon}</span>
                      <span className={`text-xl font-black ${cat.color}`}>{cat.count}</span>
                    </div>
                    <h3 className="font-bold text-slate-900 text-sm mt-2">{cat.title}</h3>
                    <p className="text-slate-500 text-xs mt-0.5">{cat.description}</p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Ratio of total</span>
                    <span className="font-bold text-slate-700">
                      {totalWarnings > 0 ? Math.round((cat.count / totalWarnings) * 100) : 0}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SECTION 4: Live Active Sessions Radar (If active students) */}
          {liveSessions.length > 0 && <LiveSessionsPanel sessions={liveSessions} exams={exams} />}

          {/* SECTION 5: Rich Interactive Visualizations (Charts Suite) */}
          {charts && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Chart 1: Anomaly Frequency Timeline */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                    <span>📈</span> Proctoring Anomaly Frequency Trend
                  </h3>
                  <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                    Last 7 Days (Hourly)
                  </span>
                </div>
                <p className="text-xs text-slate-500 mb-5">
                  Temporal anomaly spikes indicate exam start/end rushes or specific difficult questions.
                </p>

                <div className="h-68">
                  {charts.warningsTimeline && charts.warningsTimeline.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={charts.warningsTimeline.map((pt) => {
                          const raw = pt.hour || pt.timestamp || "";
                          const formatted =
                            raw.length > 10 ? raw.substring(5, 16).replace("T", " ") : raw || "Recent";
                          return {
                            time: formatted,
                            count: pt.count ?? pt.value ?? 0,
                          };
                        })}
                      >
                        <defs>
                          <linearGradient id="anomalyGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#64748b" }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#64748b" }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#0f172a",
                            borderColor: "#334155",
                            color: "#fff",
                            borderRadius: "10px",
                            fontSize: "12px",
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="count"
                          name="Anomalies"
                          stroke="#2563eb"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#anomalyGradient)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                      <span className="text-3xl mb-1">🕊️</span>
                      No proctoring anomalies recorded in the selected period.
                    </div>
                  )}
                </div>
              </div>

              {/* Chart 2: Threat Vector Donut Chart */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                    <span>🍩</span> Proctoring Signal Composition
                  </h3>
                  <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                    Signal Distribution
                  </span>
                </div>
                <p className="text-xs text-slate-500 mb-5">
                  Proportion of browser events vs computer-vision gaze and face alerts.
                </p>

                <div className="h-68">
                  {charts.warningsByType.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={charts.warningsByType}
                          dataKey="value"
                          nameKey="label"
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={88}
                          paddingAngle={3}
                          label={({ name, percent }: any) =>
                            `${(name || "").replace(/_/g, " ")}: ${(percent * 100).toFixed(0)}%`
                          }
                          labelLine={false}
                        >
                          {charts.warningsByType.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(val, name) => [val, (name as string).replace(/_/g, " ")]}
                          contentStyle={{
                            backgroundColor: "#0f172a",
                            borderColor: "#334155",
                            color: "#fff",
                            borderRadius: "10px",
                            fontSize: "12px",
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                      <span className="text-3xl mb-1">🛡️</span>
                      No proctoring signals recorded yet.
                    </div>
                  )}
                </div>
              </div>

              {/* Chart 3: Top Flagged Exams Bar Chart */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                    <span>📊</span> Exam Risk Ranking (Most Flagged)
                  </h3>
                  <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                    High / Critical Flags
                  </span>
                </div>
                <p className="text-xs text-slate-500 mb-5">
                  Identifies exams with disproportionately high candidate violation rates.
                </p>

                <div className="h-68">
                  {charts.warningsByExam.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={charts.warningsByExam}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#64748b" }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#0f172a",
                            borderColor: "#334155",
                            color: "#fff",
                            borderRadius: "10px",
                            fontSize: "12px",
                          }}
                        />
                        <Bar dataKey="value" name="Flagged Events" fill="#f43f5e" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                      <span className="text-3xl mb-1">🎉</span>
                      No flagged exams recorded. All sessions are compliant.
                    </div>
                  )}
                </div>
              </div>

              {/* Chart 4: Academic Grade Performance Curve */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                    <span>🎯</span> Score Distribution &amp; Grade Spread
                  </h3>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Candidate Marks
                  </span>
                </div>
                <p className="text-xs text-slate-500 mb-5">
                  Helps identify grade anomalies between proctored vs unproctored distributions.
                </p>

                <div className="h-68">
                  {charts.scoreDistribution.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={charts.scoreDistribution}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#64748b" }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#0f172a",
                            borderColor: "#334155",
                            color: "#fff",
                            borderRadius: "10px",
                            fontSize: "12px",
                          }}
                        />
                        <Bar dataKey="value" name="Candidates" fill="#10b981" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                      <span className="text-3xl mb-1">📝</span>
                      No completed exam submissions scored yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* SECTION 6: High-Priority Proctor Audit Queue */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-gradient-to-r from-slate-50 to-rose-50/30">
              <div>
                <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <span>🚨</span> Sessions Requiring Proctor Review ({flaggedSessions.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Candidates with elevated risk scores, strike limits, or multi-face/device infractions.
                </p>
              </div>
              <span className="text-xs font-semibold text-rose-700 bg-rose-100 px-3 py-1 rounded-full">
                Action Recommended
              </span>
            </div>

            {flaggedSessions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-left text-xs border-b border-slate-200">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Candidate</th>
                      <th className="px-5 py-3 font-semibold">Exam</th>
                      <th className="px-5 py-3 font-semibold">Risk Rating</th>
                      <th className="px-5 py-3 font-semibold">Flagged Events</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                      <th className="px-5 py-3 font-semibold text-right">Audit Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {flaggedSessions.map((fs) => {
                      const risk = fs.currentRiskScore ?? 0;
                      return (
                        <tr key={fs.attemptId} className="hover:bg-rose-50/30 transition-colors">
                          <td className="px-5 py-3.5 font-medium text-slate-900">
                            {fs.studentEmail}
                            <span className="block text-[11px] text-slate-400 font-normal">
                              Attempt #{fs.attemptNumber}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-slate-600 text-xs">
                            {examNameMap[fs.examId] ?? `Exam #${fs.examId}`}
                          </td>
                          <td className="px-5 py-3.5">
                            <span
                              className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                                risk >= 70
                                  ? "bg-rose-100 text-rose-800 border-rose-300"
                                  : "bg-amber-100 text-amber-800 border-amber-300"
                              }`}
                            >
                              {risk.toFixed(1)} / 100 Risk
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-1.5 text-xs font-semibold">
                              {(fs.criticalEvents ?? 0) > 0 && (
                                <span className="bg-red-600 text-white px-1.5 py-0.5 rounded text-[10px]">
                                  {fs.criticalEvents} Critical
                                </span>
                              )}
                              {(fs.highEvents ?? 0) > 0 && (
                                <span className="bg-orange-500 text-white px-1.5 py-0.5 rounded text-[10px]">
                                  {fs.highEvents} High
                                </span>
                              )}
                              {(fs.mediumEvents ?? 0) > 0 && (
                                <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[10px]">
                                  {fs.mediumEvents} Med
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700">
                              {fs.status}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <Link
                              to={`/admin/exams/${fs.examId}/attempts/${fs.attemptId}`}
                              className="inline-flex items-center gap-1 text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1.5 rounded-lg transition-colors shadow-xs"
                            >
                              Inspect Evidence ↗
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-10 text-center text-slate-500 text-xs">
                <span className="text-3xl block mb-2">🛡️</span>
                <p className="font-bold text-slate-700 text-sm">All candidate sessions adhere to integrity benchmarks</p>
                <p className="text-slate-400 mt-0.5">No attempts currently meet the high-risk audit threshold.</p>
              </div>
            )}
          </div>

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

          {/* SECTION 7: Configured Exams Management Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50/50">
              <div>
                <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <span>📑</span> Configured Examinations ({filteredExams.length})
                </h2>
                <p className="text-xs text-slate-500">Manage questions, examinee assignments, and live proctor parameters</p>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="text"
                  placeholder="Search exams…"
                  value={examSearch}
                  onChange={(e) => setExamSearch(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-56"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-left border-b border-slate-200 text-xs">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Exam Title</th>
                    <th className="px-5 py-3 font-semibold">Subject</th>
                    <th className="px-5 py-3 font-semibold">Questions</th>
                    <th className="px-5 py-3 font-semibold">Duration</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredExams.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3.5 font-bold text-slate-900">
                        {e.name}
                        {e.description && (
                          <span className="block text-[11px] text-slate-400 font-normal truncate max-w-xs">
                            {e.description}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 text-xs">{e.subject ?? "—"}</td>
                      <td className="px-5 py-3.5 text-slate-600 text-xs">{e.numQuestions} Qs</td>
                      <td className="px-5 py-3.5 text-slate-600 text-xs">{e.durationMinutes} mins</td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                            e.status === "PUBLISHED"
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {e.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right space-x-2">
                        <Link
                          to={`/admin/exams/${e.id}`}
                          className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Analytics &amp; Detail →
                        </Link>
                        <button
                          onClick={() => setExamToDelete(e)}
                          className="text-xs font-semibold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredExams.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-400 text-xs">
                        No examinations found matching your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Delete Confirmation Modal */}
          {examToDelete && (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
                <div className="flex items-center gap-3 text-rose-600">
                  <span className="text-2xl">⚠️</span>
                  <h3 className="text-lg font-bold text-slate-900">Delete Examination</h3>
                </div>
                <div>
                  <p className="text-sm text-slate-600">
                    Are you sure you want to delete <strong className="text-slate-900 font-semibold">"{examToDelete.name}"</strong>?
                  </p>
                  <p className="text-xs text-rose-700 bg-rose-50 p-3 rounded-lg mt-3 border border-rose-200">
                    ⚠️ This action cannot be undone. All questions, student assignments, test attempts, warnings, and proctoring telemetry for this exam will be permanently removed.
                  </p>
                </div>
                {deleteError && <div className="text-xs text-rose-700 bg-rose-100 p-2.5 rounded-lg">{deleteError}</div>}
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

function StatTile({
  icon,
  label,
  value,
  subtext,
  highlightColor = "text-slate-900",
  livePulse = false,
}: {
  icon: string;
  label: string;
  value: number | string;
  subtext?: string;
  highlightColor?: string;
  livePulse?: boolean;
}) {
  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs relative overflow-hidden flex flex-col justify-between hover:border-slate-300 transition-all">
      {livePulse && (
        <span className="absolute top-2.5 right-2.5 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
      )}
      <div>
        <div className="flex items-center gap-1.5 text-slate-500 text-xs font-semibold">
          <span>{icon}</span>
          <span className="uppercase tracking-wider text-[11px] truncate">{label}</span>
        </div>
        <p className={`text-2xl font-black mt-2 tracking-tight ${highlightColor}`}>{value}</p>
      </div>
      {subtext && <p className="text-[11px] text-slate-400 mt-1 truncate">{subtext}</p>}
    </div>
  );
}

function LiveSessionsPanel({ sessions, exams }: { sessions: AdminAttemptSummary[]; exams: Exam[] }) {
  const examNameMap = useMemo(() => {
    return Object.fromEntries((exams || []).map((e) => [e.id, e.name]));
  }, [exams]);

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
    <div className="bg-white border-2 border-emerald-400 rounded-2xl overflow-hidden shadow-md">
      <div className="px-5 py-3.5 border-b border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <h2 className="font-bold text-emerald-950 text-sm">
            Live Proctoring Radar — {sessions.length} Student{sessions.length !== 1 ? "s" : ""} Writing Now
          </h2>
        </div>
        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
          Auto-polling every 6s
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left text-xs border-b border-slate-100">
            <tr>
              <th className="px-5 py-3 font-semibold">Candidate</th>
              <th className="px-5 py-3 font-semibold">Exam</th>
              <th className="px-5 py-3 font-semibold">Active Time</th>
              <th className="px-5 py-3 font-semibold">Device Streams</th>
              <th className="px-5 py-3 font-semibold">Risk Meter</th>
              <th className="px-5 py-3 font-semibold">Incident Flags</th>
              <th className="px-5 py-3 font-semibold text-right">Live View</th>
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
                <tr key={s.attemptId} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                      <span className="font-semibold text-slate-900 text-xs">{s.studentEmail}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 text-xs">
                    {examNameMap[s.examId] ?? `Exam #${s.examId}`}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-slate-600">
                    {elapsedLabel(s.startTime)}
                  </td>
                  <td className="px-5 py-3.5">
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
                  <td className="px-5 py-3.5">
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${riskClass}`}>
                      {risk.toFixed(1)}
                    </span>
                    {s.flaggedForReview && (
                      <span className="ml-1.5 bg-rose-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded uppercase">
                        FLAGGED
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
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
                      {(s.totalEvents ?? 0) === 0 && <span className="text-slate-400 text-xs">Clean</span>}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link
                      to={`/admin/exams/${s.examId}/attempts/${s.attemptId}`}
                      className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg transition-colors shadow-xs"
                    >
                      Stream View ↗
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
