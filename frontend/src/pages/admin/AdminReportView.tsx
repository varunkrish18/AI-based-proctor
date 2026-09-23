import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, downloadFile } from "../../api/client";
import type { AdminAttemptReport } from "../../types";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export default function AdminReportView() {
  const { examId, attemptId } = useParams();
  const [report, setReport] = useState<AdminAttemptReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<{
    url: string;
    title: string;
    subtitle: string;
  } | null>(null);

  const [evalScore, setEvalScore] = useState<string>("");
  const [evalStatus, setEvalStatus] = useState<string>("VERIFIED");
  const [evalFlagged, setEvalFlagged] = useState<boolean>(false);
  const [evalSaving, setEvalSaving] = useState<boolean>(false);
  const [evalSuccess, setEvalSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!attemptId) return;
    setLoading(true);
    api
      .get<AdminAttemptReport>(`/api/admin/attempts/${attemptId}/report`, "admin")
      .then((rep) => {
        setReport(rep);
        setEvalScore(rep.score !== null && rep.score !== undefined ? String(rep.score) : "");
        setEvalStatus(rep.status || "VERIFIED");
        setEvalFlagged(Boolean(rep.flaggedForReview));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [attemptId]);

  async function handleSaveEvaluation(e: React.FormEvent) {
    e.preventDefault();
    if (!attemptId) return;
    setEvalSaving(true);
    setEvalSuccess(null);
    try {
      const updated = await api.put<AdminAttemptReport>(
        `/api/admin/attempts/${attemptId}/evaluate`,
        {
          score: parseFloat(evalScore) || 0,
          status: evalStatus,
          flaggedForReview: evalFlagged,
        },
        "admin"
      );
      setReport(updated);
      setEvalSuccess("Evaluation and marks saved successfully!");
      setTimeout(() => setEvalSuccess(null), 4000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to save evaluation");
    } finally {
      setEvalSaving(false);
    }
  }

  async function handleExport(format: "pdf" | "csv" | "excel") {
    if (!attemptId) return;
    setDownloading(format);
    try {
      const ext = format === "excel" ? "xlsx" : format;
      await downloadFile(
        `/api/admin/attempts/${attemptId}/report/export?format=${format}`,
        `attempt-${attemptId}-report.${ext}`,
        "admin"
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Export failed");
    } finally {
      setDownloading(null);
    }
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12 text-center text-slate-500">
        <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mb-3"></div>
        <p>Loading full proctoring report…</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-10">
        <Link to={`/admin/exams/${examId}`} className="text-blue-600 hover:underline text-sm mb-4 inline-block">
          ← Back to Exam
        </Link>
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
          {error || "Report not found"}
        </div>
      </div>
    );
  }

  const riskScore = report.currentRiskScore ?? 0;
  const riskColor =
    riskScore >= 75
      ? "text-rose-600 bg-rose-50 border-rose-200"
      : riskScore >= 40
      ? "text-amber-600 bg-amber-50 border-amber-200"
      : "text-emerald-600 bg-emerald-50 border-emerald-200";

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <Link
            to={`/admin/exams/${examId}`}
            className="text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors inline-flex items-center gap-1 mb-1"
          >
            ← Back to Exam Management
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">
            Proctoring Report: Attempt #{report.attemptId}
          </h1>
          <p className="text-sm text-slate-500">
            Exam: <span className="font-semibold text-slate-700">{report.examName}</span>{" "}
            {report.examSubject && `(${report.examSubject})`}
          </p>
        </div>

        {/* Export Toolbar */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 mr-1 font-medium">Export:</span>
          <button
            onClick={() => handleExport("pdf")}
            disabled={downloading !== null}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-md shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {downloading === "pdf" ? "Exporting…" : "📄 PDF"}
          </button>
          <button
            onClick={() => handleExport("excel")}
            disabled={downloading !== null}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-md shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {downloading === "excel" ? "Exporting…" : "📊 Excel"}
          </button>
          <button
            onClick={() => handleExport("csv")}
            disabled={downloading !== null}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold rounded-md shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {downloading === "csv" ? "Exporting…" : "📋 CSV"}
          </button>
        </div>
      </div>

      {/* Hero Overview Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs grid grid-cols-1 md:grid-cols-4 gap-6">
        <div>
          <span className="text-xs uppercase tracking-wider text-slate-400 font-bold">Student</span>
          <p className="text-lg font-semibold text-slate-900 mt-1">{report.studentEmail}</p>
          {report.studentName && <p className="text-sm text-slate-500">{report.studentName}</p>}
          <p className="text-xs text-slate-400 mt-2">Attempt Number: #{report.attemptNumber}</p>
        </div>

        <div>
          <span className="text-xs uppercase tracking-wider text-slate-400 font-bold">Status & Score</span>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase ${
                report.status === "SUBMITTED"
                  ? "bg-green-100 text-green-800"
                  : "bg-blue-100 text-blue-800"
              }`}
            >
              {report.status}
            </span>
            {report.flaggedForReview && (
              <span className="text-xs px-2 py-0.5 rounded font-bold bg-rose-600 text-white uppercase">
                FLAGGED
              </span>
            )}
          </div>
          <p className="text-xl font-bold text-slate-900 mt-2">
            Score: {report.score !== null ? `${report.score} pts` : "Pending"}
          </p>
        </div>

        <div>
          <span className="text-xs uppercase tracking-wider text-slate-400 font-bold">Risk Assessment</span>
          <div className={`mt-2 inline-flex items-center px-3 py-1 rounded-lg border text-xl font-extrabold ${riskColor}`}>
            {riskScore.toFixed(1)} / 100
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            {riskScore >= 75 ? "High risk of academic misconduct" : riskScore >= 40 ? "Moderate suspicious activity" : "Low anomaly level"}
          </p>
        </div>

        <div>
          <span className="text-xs uppercase tracking-wider text-slate-400 font-bold">Timing</span>
          <p className="text-xs text-slate-600 mt-1">
            Started: {report.startTime ? new Date(report.startTime).toLocaleString() : "—"}
          </p>
          <p className="text-xs text-slate-600 mt-1">
            Ended: {report.endTime ? new Date(report.endTime).toLocaleString() : "—"}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Duration limit: {report.examDurationMinutes} minutes
          </p>
        </div>
      </div>

      {/* Admin Evaluation & Marks Awarding Panel */}
      <div className="bg-white border-2 border-blue-200 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>✍️ Admin Evaluation & Marks Awarding</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-100 text-blue-800">
                Official Proctor Verification
              </span>
            </h2>
            <p className="text-xs text-slate-500">
              Verify student proctoring integrity and assign final marks before releasing results.
            </p>
          </div>
          <button
            onClick={() => handleExport("pdf")}
            disabled={downloading !== null}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <span>📁 Put Everything in a File (Download Official PDF)</span>
          </button>
        </div>

        <form onSubmit={handleSaveEvaluation} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-bold text-slate-700">
                Awarded Marks (Score in pts)
              </label>
              {report.answers && report.answers.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const autoSum = report.answers?.reduce((s, a) => s + (Number(a.marksAwarded) || 0), 0) ?? 0;
                    setEvalScore(String(autoSum));
                  }}
                  className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold hover:underline cursor-pointer"
                  title="Copy sum of correct answers"
                >
                  ⚡ Auto: {report.answers.reduce((s, a) => s + (Number(a.marksAwarded) || 0), 0)} pts
                </button>
              )}
            </div>
            <input
              type="number"
              step="0.5"
              min="0"
              required
              value={evalScore}
              onChange={(e) => setEvalScore(e.target.value)}
              placeholder="e.g. 85.0"
              className="w-full text-sm font-semibold border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Evaluation Status
            </label>
            <select
              value={evalStatus}
              onChange={(e) => setEvalStatus(e.target.value)}
              className="w-full text-sm font-semibold border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="VERIFIED">VERIFIED (Integrity confirmed)</option>
              <option value="EVALUATED">EVALUATED (Graded)</option>
              <option value="SUBMITTED">SUBMITTED (Pending review)</option>
              <option value="TERMINATED">TERMINATED (Disqualified)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Review Flag
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 h-10 cursor-pointer">
              <input
                type="checkbox"
                checked={evalFlagged}
                onChange={(e) => setEvalFlagged(e.target.checked)}
                className="w-4 h-4 text-rose-600 rounded"
              />
              <span>Flag for Special Review</span>
            </label>
          </div>

          <div>
            <button
              type="submit"
              disabled={evalSaving}
              className="w-full py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              {evalSaving ? "Saving Marks…" : "✓ Save Marks & Verify"}
            </button>
          </div>
        </form>

        {evalSuccess && (
          <div className="mt-3 p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-lg flex items-center gap-2">
            <span>✓</span> {evalSuccess}
          </div>
        )}
      </div>

      {/* Candidate Exam Submission & Answer Analysis */}
      {report.answers && report.answers.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>📝 Candidate Exam Submission & Answer Analysis</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700">
                  {report.answers.length} Questions
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Review candidate selections against answer keys to verify responses and award marks.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                ✓ {report.answers.filter((a) => a.isCorrect === true).length} Correct
              </span>
              <span className="px-2.5 py-1 rounded-md bg-rose-50 text-rose-700 font-bold border border-rose-200">
                ✗ {report.answers.filter((a) => a.isCorrect === false).length} Incorrect
              </span>
              <span className="px-2.5 py-1 rounded-md bg-slate-50 text-slate-600 font-medium border border-slate-200">
                — {report.answers.filter((a) => a.selectedOption === null || a.selectedOption === undefined).length} Unanswered
              </span>
            </div>
          </div>

          <div className="space-y-4 pt-1">
            {report.answers.map((ans) => {
              const hasAnswered = ans.selectedOption !== null && ans.selectedOption !== undefined;
              const options = [ans.optionA, ans.optionB, ans.optionC, ans.optionD];

              return (
                <div
                  key={ans.questionId}
                  className={`border rounded-xl p-4 transition-all ${
                    ans.isCorrect === true
                      ? "border-emerald-200 bg-emerald-50/20"
                      : hasAnswered
                      ? "border-rose-200 bg-rose-50/20"
                      : "border-slate-200 bg-slate-50/30"
                  }`}
                >
                  <div className="flex justify-between items-start mb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">
                        Question #{ans.displayOrder}
                      </span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                        {ans.marksAwarded ?? 0} / {ans.maxMarks ?? 1} pts
                      </span>
                    </div>
                    <div>
                      {ans.isCorrect === true ? (
                        <span className="text-xs font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                          ✓ Correct (+{ans.marksAwarded} pts)
                        </span>
                      ) : hasAnswered ? (
                        <span className="text-xs font-bold text-rose-700 bg-rose-100 border border-rose-200 px-2.5 py-0.5 rounded-full">
                          ✗ Incorrect (0 pts)
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                          — Not Answered
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-sm font-medium text-slate-800 mb-3">{ans.questionText}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {options.map((optText, idx) => {
                      const isCandidateChoice = ans.selectedOption === idx;
                      const isKey = ans.correctAnswer === idx;

                      let pillStyle = "border-slate-200 bg-white text-slate-700";
                      if (isKey && isCandidateChoice) {
                        pillStyle = "border-emerald-500 bg-emerald-100 text-emerald-900 font-bold ring-1 ring-emerald-500";
                      } else if (isKey) {
                        pillStyle = "border-emerald-400 bg-emerald-50/80 text-emerald-800 font-semibold";
                      } else if (isCandidateChoice) {
                        pillStyle = "border-rose-400 bg-rose-100 text-rose-900 font-bold ring-1 ring-rose-400";
                      }

                      return (
                        <div
                          key={idx}
                          className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 ${pillStyle}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold opacity-75">{String.fromCharCode(65 + idx)}.</span>
                            <span>{optText}</span>
                          </div>
                          <div className="shrink-0 flex items-center gap-1.5 font-bold text-[10px]">
                            {isCandidateChoice && (
                              <span className={isKey ? "text-emerald-700" : "text-rose-700"}>
                                👤 Candidate Choice
                              </span>
                            )}
                            {isKey && (
                              <span className="text-emerald-700">✓ Correct Key</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Event Metrics Counter Row */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <div className="bg-white border border-slate-200 rounded-lg p-3 text-center">
          <span className="text-xs text-slate-400 uppercase font-semibold">Total Events</span>
          <p className="text-xl font-bold text-slate-800 mt-1">{report.totalEvents}</p>
        </div>
        <div className="bg-white border border-red-200 rounded-lg p-3 text-center bg-red-50/30">
          <span className="text-xs text-red-600 uppercase font-semibold">Critical / High</span>
          <p className="text-xl font-bold text-red-700 mt-1">{report.criticalEvents + report.highEvents}</p>
        </div>
        <div className="bg-white border border-amber-200 rounded-lg p-3 text-center bg-amber-50/30">
          <span className="text-xs text-amber-600 uppercase font-semibold">Medium</span>
          <p className="text-xl font-bold text-amber-700 mt-1">{report.mediumEvents}</p>
        </div>
        <div className="bg-white border border-yellow-200 rounded-lg p-3 text-center bg-yellow-50/30">
          <span className="text-xs text-yellow-600 uppercase font-semibold">Low</span>
          <p className="text-xl font-bold text-yellow-700 mt-1">{report.lowEvents}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3 text-center">
          <span className="text-xs text-slate-400 uppercase font-semibold">Info</span>
          <p className="text-xl font-bold text-slate-600 mt-1">{report.infoEvents}</p>
        </div>
        <div className="bg-white border border-purple-200 rounded-lg p-3 text-center bg-purple-50/30">
          <span className="text-xs text-purple-600 uppercase font-semibold">Warnings</span>
          <p className="text-xl font-bold text-purple-700 mt-1">{report.warnings.length}</p>
        </div>
      </div>

      {/* Risk Score Timeline Graph */}
      {report.riskTimeline && report.riskTimeline.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
          <div className="mb-4">
            <h3 className="text-base font-bold text-slate-800">Decayed Risk Score Progression</h3>
            <p className="text-xs text-slate-500">
              Evaluated over time with exponential decay. Spikes indicate anomaly density.
            </p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={report.riskTimeline.map((pt) => ({
                time: new Date(pt.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
                score: pt.score,
                event: pt.eventType || "Anomaly",
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white text-xs p-2 rounded shadow-lg">
                          <p className="font-bold">{data.time}</p>
                          <p className="text-rose-300">Risk Score: {data.score}</p>
                          <p className="text-slate-300">Event: {data.event}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#ef4444"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#ef4444" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Behavioral Warnings Issued */}
      {report.warnings.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-xl p-6 shadow-xs bg-amber-50/20">
          <h3 className="text-base font-bold text-amber-900 mb-3">
            Behavioral Warnings Issued During Session ({report.warnings.length})
          </h3>
          <div className="space-y-2">
            {report.warnings.map((w) => (
              <div
                key={w.id}
                className="bg-white border border-amber-200 rounded-lg p-3 flex justify-between items-center text-sm"
              >
                <div>
                  <span className="font-bold text-amber-800 text-xs px-2 py-0.5 rounded bg-amber-100 mr-2">
                    Level {w.level}
                  </span>
                  <span className="font-medium text-slate-800">{w.message}</span>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <span>Risk: {w.riskScoreAtTime} pts</span> &middot;{" "}
                  <span>{new Date(w.createdAt).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Photo Evidence Gallery */}
      {(() => {
        const photoEvents = report.events.filter((ev) => {
          if (!ev.metadata) return false;
          try {
            const meta = JSON.parse(ev.metadata);
            return Boolean(meta && meta.photo);
          } catch {
            return false;
          }
        });

        if (photoEvents.length === 0) return null;

        return (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <span>📸 Photo Evidence Snapshots ({photoEvents.length})</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-rose-100 text-rose-700">
                    Proctor Review
                  </span>
                </h3>
                <p className="text-xs text-slate-500">
                  Automated snapshots captured during suspicious events (sustained gaze look-away $\ge$5s, prohibited objects, secondary persons).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {photoEvents.map((ev) => {
                let meta: any = {};
                try {
                  meta = JSON.parse(ev.metadata || "{}");
                } catch {}

                return (
                  <div
                    key={ev.id}
                    className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50 shadow-xs flex flex-col hover:border-slate-300 transition-colors"
                  >
                    <div
                      className="relative h-44 bg-black cursor-pointer group overflow-hidden"
                      onClick={() =>
                        setPreviewPhoto({
                          url: meta.photo,
                          title: `${ev.eventType} • Event #${ev.id}`,
                          subtitle: `${new Date(ev.occurredAt).toLocaleString()} • ${
                            meta.reason || "Photo snapshot"
                          }`,
                        })
                      }
                    >
                      <img
                        src={meta.photo}
                        alt="Captured Evidence"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold gap-1.5">
                        <span>🔍 Click to Enlarge</span>
                      </div>
                      <span className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded font-bold bg-black/70 text-white backdrop-blur-xs">
                        {new Date(ev.occurredAt).toLocaleTimeString()}
                      </span>
                      <span className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded font-bold bg-rose-600 text-white shadow-xs">
                        {ev.eventType}
                      </span>
                    </div>

                    <div className="p-3 text-xs flex-1 flex flex-col justify-between">
                      <div className="space-y-1">
                        {meta.direction && (
                          <p className="text-slate-700">
                            <strong>Gaze Direction:</strong>{" "}
                            <span className="font-semibold text-rose-600">{meta.direction}</span>
                          </p>
                        )}
                        {meta.durationSeconds && (
                          <p className="text-slate-600">
                            <strong>Duration:</strong> {meta.durationSeconds}s
                          </p>
                        )}
                        {meta.objects && (
                          <p className="text-rose-600 font-semibold">
                            <strong>Detected Objects:</strong> {meta.objects}
                          </p>
                        )}
                        {meta.faceCount && (
                          <p className="text-purple-600 font-semibold">
                            <strong>Faces in Frame:</strong> {meta.faceCount}
                          </p>
                        )}
                        {meta.reason && (
                          <p className="text-slate-500 italic text-[11px] line-clamp-2">
                            {meta.reason}
                          </p>
                        )}
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-slate-200 flex justify-between items-center text-[11px] text-slate-400">
                        <span>Confidence: {(ev.confidence * 100).toFixed(0)}%</span>
                        <button
                          onClick={() =>
                            setPreviewPhoto({
                              url: meta.photo,
                              title: `${ev.eventType} • Event #${ev.id}`,
                              subtitle: `${new Date(ev.occurredAt).toLocaleString()} • ${
                                meta.reason || "Photo snapshot"
                              }`,
                            })
                          }
                          className="text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                        >
                          Enlarge
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Proctoring Event Log Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Full Proctoring Event Log</h3>
            <p className="text-xs text-slate-500">All browser and computer-vision detected signals</p>
          </div>
          <span className="text-xs text-slate-400 font-medium">{report.events.length} total entries</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold text-xs">ID</th>
                <th className="px-4 py-3 font-semibold text-xs">Event Type</th>
                <th className="px-4 py-3 font-semibold text-xs">Severity</th>
                <th className="px-4 py-3 font-semibold text-xs">Occurred At</th>
                <th className="px-4 py-3 font-semibold text-xs">Confidence</th>
                <th className="px-4 py-3 font-semibold text-xs">Duration</th>
                <th className="px-4 py-3 font-semibold text-xs">Details / Evidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.events.map((ev) => {
                const sevBadge =
                  ev.severity === "CRITICAL"
                    ? "bg-purple-100 text-purple-800 border-purple-200"
                    : ev.severity === "HIGH"
                    ? "bg-rose-100 text-rose-800 border-rose-200"
                    : ev.severity === "MEDIUM"
                    ? "bg-amber-100 text-amber-800 border-amber-200"
                    : ev.severity === "LOW"
                    ? "bg-yellow-100 text-yellow-800 border-yellow-200"
                    : "bg-slate-100 text-slate-700 border-slate-200";

                let parsedMeta: any = null;
                if (ev.metadata) {
                  try {
                    parsedMeta = JSON.parse(ev.metadata);
                  } catch {}
                }
                const hasPhoto = parsedMeta && parsedMeta.photo;

                return (
                  <tr key={ev.id} className="hover:bg-slate-50/60 transition-colors text-xs">
                    <td className="px-4 py-2.5 text-slate-400 font-mono">#{ev.id}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-800">{ev.eventType}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full font-bold border ${sevBadge}`}>
                        {ev.severity}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {new Date(ev.occurredAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 font-mono">
                      {(ev.confidence * 100).toFixed(0)}%
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {ev.durationSeconds ? `${ev.durationSeconds}s` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {hasPhoto ? (
                        <div className="flex items-center gap-2">
                          <img
                            src={parsedMeta.photo}
                            alt="Evidence snapshot"
                            className="w-16 h-12 object-cover rounded border border-slate-300 shadow-xs cursor-pointer hover:scale-105 transition-all"
                            onClick={() =>
                              setPreviewPhoto({
                                url: parsedMeta.photo,
                                title: `${ev.eventType} • Event #${ev.id}`,
                                subtitle: `${new Date(ev.occurredAt).toLocaleString()} • ${
                                  parsedMeta.reason || "Photo snapshot"
                                }`,
                              })
                            }
                          />
                          <div className="text-[11px] leading-tight">
                            <span
                              onClick={() =>
                                setPreviewPhoto({
                                  url: parsedMeta.photo,
                                  title: `${ev.eventType} • Event #${ev.id}`,
                                  subtitle: `${new Date(ev.occurredAt).toLocaleString()} • ${
                                    parsedMeta.reason || "Photo snapshot"
                                  }`,
                                })
                              }
                              className="font-semibold text-blue-600 hover:underline cursor-pointer block"
                            >
                              📸 View Snapshot
                            </span>
                            {parsedMeta.direction && (
                              <span className="text-slate-600">Gaze: {parsedMeta.direction} </span>
                            )}
                            {parsedMeta.objects && (
                              <span className="text-rose-600 font-medium">[{parsedMeta.objects}] </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="font-mono max-w-xs truncate block" title={ev.metadata || ""}>
                          {ev.metadata || "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {report.events.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    No suspicious proctoring events recorded for this session.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Enlarged Photo Modal */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setPreviewPhoto(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 text-white rounded-2xl overflow-hidden max-w-2xl w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
              <div>
                <h3 className="font-bold text-sm">{previewPhoto.title}</h3>
                <p className="text-xs text-slate-400">{previewPhoto.subtitle}</p>
              </div>
              <button
                onClick={() => setPreviewPhoto(null)}
                className="text-slate-400 hover:text-white text-base font-bold px-2 py-1 rounded cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-4 bg-black flex items-center justify-center">
              <img
                src={previewPhoto.url}
                alt="Enlarged evidence"
                className="max-h-[70vh] w-auto object-contain rounded-lg border border-slate-800"
              />
            </div>
            <div className="px-4 py-2.5 bg-slate-800/80 text-xs text-slate-400 flex justify-between items-center">
              <span>High-Resolution Examination Proctoring Evidence</span>
              <button
                onClick={() => setPreviewPhoto(null)}
                className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-medium cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

