import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { 
  fetchAdminReports, generateNewQuestions, fetchRfMetrics,
  type AssessmentReportItem 
} from "../../api/assessmentApi";
import { getAdminUserRole } from "../../api/client";

export default function CodingAssessmentReports() {
  const [reports, setReports] = useState<AssessmentReportItem[]>([]);
  const [rfMetrics, setRfMetrics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  
  // Hint Generator state
  const [problemHint, setProblemHint] = useState<string>(
    "Distributed graph cycle detection, binary search trees, sliding window event streaming, and dynamic programming knapsack allocation"
  );
  const [targetCount, setTargetCount] = useState<number>(65);
  const [apiKey, setApiKey] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [genSuccessMsg, setGenSuccessMsg] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterUseCase, setFilterUseCase] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [expandedAnswerId, setExpandedAnswerId] = useState<string | null>(null);

  const userRole = getAdminUserRole() || "STAFF";

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [reportsData, metricsData] = await Promise.all([
        fetchAdminReports(),
        fetchRfMetrics()
      ]);
      setReports(reportsData);
      setRfMetrics(metricsData);
    } catch (err) {
      console.error("Failed to load reports:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateQuestions = async () => {
    if (!problemHint.trim()) {
      alert("Please enter a problem description hint.");
      return;
    }
    try {
      setIsGenerating(true);
      setGenSuccessMsg(null);
      const generated = await generateNewQuestions(problemHint, targetCount, apiKey || undefined);
      setGenSuccessMsg(`Successfully generated ${generated.length} unique questions and classified with Random Forest!`);
      loadData();
    } catch (err: any) {
      alert("Generation failed: " + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // Filtered reports
  const filteredReports = reports.filter((r) => {
    const matchSearch = searchQuery === "" || 
      r.candidateName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.questionTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.questionId.toLowerCase().includes(searchQuery.toLowerCase());
    const matchUseCase = filterUseCase === "all" || r.useCase === filterUseCase;
    const matchStatus = filterStatus === "all" || r.evaluations.status === filterStatus;
    return matchSearch && matchUseCase && matchStatus;
  });

  const uniqueUseCases = Array.from(new Set(reports.map((r) => r.useCase)));

  // Analytics
  const totalSubmissions = reports.length;
  const passedCount = reports.filter((r) => r.evaluations.status === "PASSED").length;
  const avgScore = totalSubmissions > 0 
    ? Math.round(reports.reduce((acc, r) => acc + r.evaluations.scorePercent, 0) / totalSubmissions) 
    : 0;
  const avgTimeSec = totalSubmissions > 0
    ? Math.round(reports.reduce((acc, r) => acc + r.timeConsumedSec, 0) / totalSubmissions)
    : 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-6 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Top Header Card (White Theme) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center text-2xl font-bold">
              📊
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Assessment &amp; Evaluation Intelligence Portal
                </h1>
                <span className="text-[10px] bg-purple-50 text-purple-700 font-bold px-2 py-0.5 rounded-full border border-purple-200 uppercase tracking-wider">
                  {userRole} Access Only
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                AI Question Synthesis • Random Forest Classification • Automated Candidate Evaluation Reports
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              disabled={isLoading}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-300 transition cursor-pointer disabled:opacity-50"
            >
              ↻ Refresh Reports
            </button>
            <Link
              to="/assessment/code-editor"
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm shadow-indigo-600/20 transition flex items-center gap-1.5"
            >
              <span>&lt;/&gt;</span> Open Coding Lab
            </Link>
            <Link
              to="/admin/dashboard"
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition flex items-center gap-1.5"
            >
              <span>🎛️</span> Dashboard
            </Link>
          </div>
        </div>

        {/* Analytics KPI Ribbon (White Theme) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
              Total Submissions
            </div>
            <div className="text-2xl font-black text-slate-900 mt-1">{totalSubmissions}</div>
            <div className="text-[11px] text-slate-400 mt-1">Logged with evaluation traces</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
              Evaluation Pass Rate
            </div>
            <div className="text-2xl font-black text-emerald-600 mt-1">
              {totalSubmissions > 0 ? Math.round((passedCount / totalSubmissions) * 100) : 0}%
            </div>
            <div className="text-[11px] text-slate-400 mt-1">{passedCount} fully verified solutions</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
              Average Time Consumed
            </div>
            <div className="text-2xl font-black text-amber-600 font-mono mt-1">
              {Math.floor(avgTimeSec / 60)}m {(avgTimeSec % 60).toString().padStart(2, "0")}s
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Per completed question</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
              Average Evaluation Score
            </div>
            <div className="text-2xl font-black text-indigo-600 mt-1">{avgScore}%</div>
            <div className="text-[11px] text-slate-400 mt-1">Automated test accuracy</div>
          </div>
        </div>

        {/* SECTION 1: Problem Description Hint & 60+ Question Generator (White Theme) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">✨</span>
              <h2 className="text-base font-bold text-slate-900">
                Problem Description Hint &amp; 60+ Question AI Generator
              </h2>
            </div>
            <span className="text-xs bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full border border-indigo-200 font-bold">
              Gemini AI • Random Forest Assigned
            </span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Enter a conceptual Problem Description Hint or syllabus. The engine extracts the key concepts, generates 
            60+ unique, multi-difficulty coding questions, and automatically assigns each question to an industry use-case 
            using the trained Random Forest algorithm.
          </p>

          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Problem Description Hint
              </label>
              <textarea
                value={problemHint}
                onChange={(e) => setProblemHint(e.target.value)}
                rows={2}
                placeholder="e.g. Graph cycle detection, LRU cache memory, sliding window streaming, and dynamic programming..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Target Unique Question Count (60+)
                </label>
                <input
                  type="number"
                  min={60}
                  max={100}
                  value={targetCount}
                  onChange={(e) => setTargetCount(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Gemini API Key (Optional Override)
                </label>
                <input
                  type="password"
                  placeholder="Uses server GEMINI_API_KEY if blank"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                onClick={handleGenerateQuestions}
                disabled={isGenerating}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-sm shadow-indigo-600/25 transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Extracting Hint &amp; Synthesizing 60+ Questions...</span>
                  </>
                ) : (
                  <>
                    <span>⚡</span>
                    <span>Generate 60+ Unique Questions &amp; Run Random Forest</span>
                  </>
                )}
              </button>

              {genSuccessMsg && (
                <span className="text-xs text-emerald-700 font-bold flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                  <span>✓</span> {genSuccessMsg}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* SECTION 2: Random Forest Model & Use-Case Distribution (White Theme) */}
        {rfMetrics && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <span>🌲</span> Random Forest Classification Model Topology
              </span>
              <span className="text-indigo-600 font-mono font-semibold">
                {rfMetrics.model} • {rfMetrics.n_estimators} Trees • Max Depth {rfMetrics.max_depth}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1">
              {rfMetrics.use_cases.map((uc: string, idx: number) => (
                <div
                  key={idx}
                  className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs flex flex-col justify-between hover:border-indigo-400 transition"
                >
                  <span className="text-[10px] text-indigo-600 font-mono font-bold">Use Case {idx + 1}</span>
                  <span className="font-bold text-slate-800 mt-1 line-clamp-2">{uc}</span>
                  <span className="text-[10px] text-emerald-700 font-semibold mt-2">✓ Verified Cluster</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SECTION 3: Admin Reports Table (White Theme) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Candidate Assessment Submissions Report
              </h2>
              <p className="text-xs text-slate-500">
                Audit Trail: Question • Candidate Answers • Time Consumed • Automated Evaluations
              </p>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Search candidate, question..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />

              <select
                value={filterUseCase}
                onChange={(e) => setFilterUseCase(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="all">All Use Cases</option>
                {uniqueUseCases.map((uc) => (
                  <option key={uc} value={uc}>{uc}</option>
                ))}
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="PASSED">PASSED</option>
                <option value="PARTIAL">PARTIAL</option>
              </select>
            </div>
          </div>

          {/* Reports Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 uppercase tracking-wider font-bold border-b border-slate-200">
                  <th className="py-3 px-4">Candidate &amp; ID</th>
                  <th className="py-3 px-4">Question &amp; Use Case</th>
                  <th className="py-3 px-4">Answers (Code)</th>
                  <th className="py-3 px-4">Time Consumed</th>
                  <th className="py-3 px-4">Evaluations</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-slate-500">
                      Loading assessment reports...
                    </td>
                  </tr>
                ) : filteredReports.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-slate-500">
                      No candidate submissions found matching filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredReports.map((r) => {
                    const isExpanded = expandedAnswerId === r.submissionId;
                    return (
                      <tr key={r.submissionId} className="hover:bg-slate-50 transition">
                        {/* Candidate */}
                        <td className="py-3.5 px-4 align-top">
                          <div className="font-bold text-slate-900">{r.candidateName}</div>
                          <div className="text-[11px] font-mono text-slate-500">{r.candidateId}</div>
                          <div className="text-[10px] text-slate-400 mt-1">{r.submittedAt}</div>
                        </td>

                        {/* Question */}
                        <td className="py-3.5 px-4 align-top max-w-xs">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="font-mono text-[11px] font-bold text-indigo-600">
                              {r.questionId}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold border ${
                                r.difficulty === "Easy"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : r.difficulty === "Medium"
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : "bg-rose-50 text-rose-700 border-rose-200"
                              }`}
                            >
                              {r.difficulty}
                            </span>
                          </div>
                          <div className="font-bold text-slate-800 line-clamp-1">
                            {r.questionTitle}
                          </div>
                          {/* Random Forest Assigned Use Case */}
                          <div className="mt-1 flex items-center gap-1 text-[11px] text-indigo-600 font-medium">
                            <span>🌲</span>
                            <span className="truncate">{r.useCase}</span>
                          </div>
                        </td>

                        {/* Answers (Candidate Code) */}
                        <td className="py-3.5 px-4 align-top">
                          <div className="space-y-1">
                            <button
                              onClick={() => setExpandedAnswerId(isExpanded ? null : r.submissionId)}
                              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                            >
                              <span>{isExpanded ? "▼ Hide Code" : "▶ View Code Solution"}</span>
                              <span className="text-[10px] text-slate-500 font-normal">
                                ({r.answers.split("\n").length} lines)
                              </span>
                            </button>

                            {isExpanded ? (
                              <div className="mt-2 bg-slate-900 border border-slate-700 rounded-xl p-3 font-mono text-[11px] text-emerald-400 whitespace-pre overflow-x-auto max-w-md shadow-inner">
                                {r.answers}
                              </div>
                            ) : (
                              <div className="font-mono text-[11px] text-slate-600 truncate max-w-xs bg-slate-100 px-2 py-1 rounded border border-slate-200">
                                {r.answers.split("\n")[0]}...
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Time Consumed */}
                        <td className="py-3.5 px-4 align-top">
                          <div className="font-mono text-xs font-bold text-amber-700">
                            ⏱ {r.timeConsumedFormatted}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {r.timeConsumedSec.toFixed(1)} seconds
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            Runtime: {r.evaluations.totalRuntimeMs}ms
                          </div>
                        </td>

                        {/* Evaluations */}
                        <td className="py-3.5 px-4 align-top">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                                r.evaluations.status === "PASSED"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-amber-50 text-amber-700 border-amber-200"
                              }`}
                            >
                              {r.evaluations.status}
                            </span>
                            <span className="font-bold text-slate-900 text-xs">
                              {r.evaluations.scorePercent}%
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-1">
                            {r.evaluations.passedCases}/{r.evaluations.totalCases} Test Cases Passed
                          </div>
                          {r.evaluations.evalNotes && (
                            <div className="text-[10px] text-slate-400 mt-0.5 italic max-w-xs">
                              {r.evaluations.evalNotes}
                            </div>
                          )}
                        </td>

                        {/* Action */}
                        <td className="py-3.5 px-4 align-top text-right">
                          <button
                            onClick={() => alert(`Full Evaluation Details for ${r.submissionId}:\nScore: ${r.evaluations.scorePercent}%\nRuntime: ${r.evaluations.totalRuntimeMs}ms\nTime Consumed: ${r.timeConsumedFormatted}\nUse Case: ${r.useCase}`)}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold border border-slate-300 transition cursor-pointer"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
