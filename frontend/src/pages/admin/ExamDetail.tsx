import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { api, downloadFile, isCoordinatorRole, isAdminRole, isProfessorUserRole } from "../../api/client";
import ExamSettingsTab from "./ExamSettingsTab";
import CoordinatorStudentReportTab from "./CoordinatorStudentReportTab";
import ProfessorStudentReportTab from "./ProfessorStudentReportTab";
import type {
  AdminAttemptSummary,
  Exam,
  ExamAssignmentItem,
  ExamQuestion,
  StudentUser,
  TestCase,
  RunCodeResponse,
  ProctoringEvent,
  RiskPoint,
  RiskTimelineResponse,
  WarningResponse,
} from "../../types";
import {
  type ClassSectionItem,
  loadSavedClassSections,
  getStudentsForClassSection,
  matchesYear,
} from "../../utils/sectionUtils";

type Tab = "questions" | "settings" | "coordinator-report" | "professor-report" | "assign" | "results" | "qassign";

export default function ExamDetail() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isCoordinator = isCoordinatorRole();
  const isAdmin = isAdminRole();
  const isProfessorUser = isProfessorUserRole() || (!isCoordinator && !isAdmin);
  const allowedTabs: Tab[] = isCoordinator
    ? ["questions", "settings", "coordinator-report"]
    : isProfessorUser
    ? ["questions", "professor-report", "assign", "results", "qassign"]
    : ["questions", "settings", "coordinator-report", "professor-report", "assign", "results", "qassign"];

  const queryTab = searchParams.get("tab") as Tab | null;
  const [exam, setExam] = useState<Exam | null>(null);
  const isClassSettingsLocked = isProfessorUser;
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [tab, setTab] = useState<Tab>(() => {
    if (queryTab && allowedTabs.includes(queryTab)) return queryTab;
    return "questions";
  });
  const [error, setError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [timingAdjusting, setTimingAdjusting] = useState(false);
  const [showTerminateModal, setShowTerminateModal] = useState(false);
  const [liveTimingToast, setLiveTimingToast] = useState<string | null>(null);

  async function handleAdjustTime(mins: number) {
    if (!exam) return;
    setTimingAdjusting(true);
    try {
      const updated = await api.post<Exam>(
        `/api/admin/exams/${exam.id}/adjust-timing`,
        { addMinutes: mins },
        "admin"
      );
      setExam(updated);
      setLiveTimingToast(`⏱️ Exam duration extended (+${mins} mins)! Active student screens will reflect this immediately without refresh.`);
      setTimeout(() => setLiveTimingToast(null), 6000);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to adjust exam timing.");
    } finally {
      setTimingAdjusting(false);
    }
  }

  async function handleTerminateNow() {
    if (!exam) return;
    setTimingAdjusting(true);
    try {
      const updated = await api.post<Exam>(
        `/api/admin/exams/${exam.id}/terminate-now`,
        undefined,
        "admin"
      );
      setExam(updated);
      setShowTerminateModal(false);
      setLiveTimingToast("🛑 Exam concluded immediately! All active student sessions are now terminating automatically without refresh.");
      setTimeout(() => setLiveTimingToast(null), 6000);
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to terminate exam.");
    } finally {
      setTimingAdjusting(false);
    }
  }

  function handleTabChange(nextTab: Tab) {
    if (isCoordinator && (nextTab === "assign" || nextTab === "results" || nextTab === "qassign" || nextTab === "professor-report")) {
      nextTab = "questions";
    }
    if (isProfessorUser && (nextTab === "settings" || nextTab === "coordinator-report")) {
      nextTab = "questions";
    }
    setTab(nextTab);
    setSearchParams({ tab: nextTab });
  }

  useEffect(() => {
    if (isCoordinator && (tab === "assign" || tab === "results" || tab === "qassign" || tab === "professor-report")) {
      setTab("questions");
      setSearchParams({ tab: "questions" });
    }
    if (isProfessorUser && (tab === "settings" || tab === "coordinator-report")) {
      setTab("questions");
      setSearchParams({ tab: "questions" });
    }
  }, [isCoordinator, isProfessorUser, tab, setSearchParams]);

  function reload() {
    Promise.all([
      api.get<Exam>(`/api/admin/exams/${examId}`, "admin"),
      api.get<ExamQuestion[]>(`/api/admin/exams/${examId}/questions`, "admin"),
    ])
      .then(([e, qs]) => {
        setExam(e);
        setQuestions(qs);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    if (!examId) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  async function publish() {
    try {
      const updated = await api.post<Exam>(`/api/admin/exams/${examId}/publish`, undefined, "admin");
      setExam(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not publish exam.");
    }
  }

  async function handleDeleteExam() {
    setDeleting(true);
    try {
      await api.delete(`/api/admin/exams/${examId}`, "admin");
      navigate("/admin/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete exam.");
      setShowDeleteModal(false);
      setDeleting(false);
    }
  }

  async function handleUpdateLimit(newLimit: number) {
    if (newLimit <= 0) return;
    try {
      const updated = await api.patch<Exam>(`/api/admin/exams/${examId}/limit`, { numQuestions: newLimit }, "admin");
      setExam(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update question limit.");
    }
  }

  function promptChangeLimit() {
    if (!exam) return;
    const val = window.prompt("Enter new question limit for this exam:", String(exam.numQuestions));
    if (!val) return;
    const n = parseInt(val, 10);
    if (isNaN(n) || n <= 0) {
      alert("Please enter a valid positive number.");
      return;
    }
    handleUpdateLimit(n);
  }

  if (error) return <p className="max-w-3xl mx-auto px-4 py-10 text-red-600">{error}</p>;
  if (!exam) return <p className="max-w-3xl mx-auto px-4 py-10 text-slate-500">Loading…</p>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button onClick={() => navigate("/admin/dashboard")} className="text-sm text-slate-500 hover:underline mb-4 cursor-pointer">
        ← Back to Dashboard
      </button>
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h1 className="text-2xl font-bold text-slate-900">{exam.name}</h1>
            {exam.isClass && (
              <span className="bg-indigo-100 text-indigo-800 text-xs px-2.5 py-0.5 rounded-full font-bold">
                🏫 Class
              </span>
            )}
            {exam.assignedProfessorName && (
              <span className="bg-purple-100 text-purple-800 text-xs px-2.5 py-0.5 rounded-full font-medium">
                👨‍🏫 Assigned Professor: {exam.assignedProfessorName}
              </span>
            )}
          </div>
          <div className="text-slate-500 text-sm flex items-center gap-2 flex-wrap mt-0.5">
            <span>{exam.subject ?? "General"}</span>
            <span>&middot;</span>
            <span className={questions.length > exam.numQuestions ? "text-amber-700 font-semibold" : ""}>
              {questions.length}/{exam.numQuestions} questions added
            </span>
            {!isProfessorUser && questions.length > exam.numQuestions && (
              <button
                type="button"
                onClick={() => handleUpdateLimit(questions.length)}
                className="text-xs bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded cursor-pointer transition-colors"
                title="Update exam limit to match total questions"
              >
                Sync limit to {questions.length}
              </button>
            )}
            {!isProfessorUser && (
              <button
                type="button"
                onClick={promptChangeLimit}
                className="text-xs text-blue-600 hover:text-blue-800 underline font-medium cursor-pointer"
              >
                Edit Limit
              </button>
            )}
            <span>&middot;</span>
            <span>status: {exam.status}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isProfessorUser ? (
            <>
              <button
                type="button"
                onClick={() => handleTabChange("settings")}
                className={`px-3.5 py-2 rounded-md text-sm font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  tab === "settings"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100"
                }`}
              >
                <span>⚙️</span> Edit Exam Settings
              </button>
              <button
                type="button"
                onClick={() => handleTabChange("coordinator-report")}
                className={`px-3.5 py-2 rounded-md text-sm font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  tab === "coordinator-report"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "border border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100"
                }`}
              >
                <span>📊</span> Class Student Report
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200 shadow-2xs">
                🔒 Settings &amp; Timing locked by Coordinator
              </span>
              <button
                type="button"
                onClick={() => handleTabChange("professor-report")}
                className={`px-3.5 py-2 rounded-md text-sm font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  tab === "professor-report"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "border border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100"
                }`}
              >
                <span>📊</span> Student Report
              </button>
            </div>
          )}
          {!isProfessorUser && exam.status === "DRAFT" && (
            <button onClick={publish} className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-green-700 cursor-pointer">
              Publish Exam
            </button>
          )}
          {!isProfessorUser && (
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="border border-rose-300 text-rose-600 hover:bg-rose-50 px-3.5 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer"
            >
              Delete Exam
            </button>
          )}
        </div>
      </div>

      {/* Live Timing / Concluded notification toast */}
      {liveTimingToast && (
        <div className="mb-4 bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-3 rounded-xl text-sm font-semibold flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <span>✨</span>
            <span>{liveTimingToast}</span>
          </div>
          <button onClick={() => setLiveTimingToast(null)} className="text-emerald-700 hover:text-emerald-950 font-bold cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* Live Examiner Real-Time Timing & Termination Controls Bar */}
      <div className="mb-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-900/60 rounded-2xl p-4 sm:p-5 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative flex h-3.5 w-3.5 shrink-0">
            {exam.status === "CLOSED" ? (
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500"></span>
            ) : (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
              </>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                Live Proctoring &amp; Timing Sync
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                exam.status === "CLOSED"
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                  : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
              }`}>
                {exam.status === "CLOSED" ? "Concluded / Closed" : "Live & Active"}
              </span>
            </div>
            <div className="text-xs sm:text-sm font-medium text-slate-300 mt-0.5">
              {exam.durationMinutes ? (
                <>
                  Duration: <span className="text-white font-bold">{exam.durationMinutes} mins</span> &middot;{" "}
                </>
              ) : (
                <>
                  <span className="text-indigo-300 font-semibold">♾️ Untimed Class (Infinite Attempts)</span> &middot;{" "}
                </>
              )}
              Scheduled End:{" "}
              <span className="text-white font-mono font-semibold">
                {exam.endAt ? new Date(exam.endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : "N/A"}
              </span>
              {exam.assignedProfessorName && (
                <>
                  {" "}&middot; Faculty: <span className="text-indigo-200 font-semibold">{exam.assignedProfessorName}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {isProfessorUser ? (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 bg-slate-800/90 px-3.5 py-2 rounded-xl border border-slate-700/80 text-amber-300 text-xs font-semibold">
                <span>🔒 Exam Schedule &amp; Timing locked by Course Coordinator</span>
              </div>
              <button
                onClick={() => handleTabChange("professor-report")}
                className={`text-xs font-bold px-3 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 border ${
                  tab === "professor-report"
                    ? "bg-blue-600 border-blue-500 text-white shadow-xs"
                    : "bg-slate-800 hover:bg-slate-700 border-slate-600 text-blue-300"
                }`}
                title="View Student Report"
              >
                <span>📊</span> Student Report
              </button>
            </div>
          ) : isClassSettingsLocked ? (
            <div className="flex items-center gap-1.5 bg-indigo-950/60 px-3 py-1.5 rounded-xl border border-indigo-700/60 text-indigo-300 text-xs font-medium">
              <span>🏫 Class Managed by Course Coordinator (Active)</span>
            </div>
          ) : exam.status !== "CLOSED" ? (
            <>
              {exam.durationMinutes ? (
                <div className="flex items-center gap-1.5 bg-slate-800/90 p-1.5 rounded-xl border border-slate-700/80">
                  <span className="text-xs text-slate-300 font-semibold px-1.5">⏱️ Extend Time:</span>
                  {[5, 10, 15, 30].map((mins) => (
                    <button
                      key={mins}
                      disabled={timingAdjusting}
                      onClick={() => handleAdjustTime(mins)}
                      className="px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white transition shadow-xs cursor-pointer disabled:opacity-50"
                      title={`Instantly add ${mins} minutes to exam timer for all candidates`}
                    >
                      +{mins}m
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-indigo-950/60 px-3 py-1.5 rounded-xl border border-indigo-700/60 text-indigo-300 text-xs font-medium">
                  <span>♾️ Untimed Class Active</span>
                </div>
              )}

              <button
                onClick={() => setShowTerminateModal(true)}
                disabled={timingAdjusting}
                className="bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <span>⏹️</span> End Exam Now
              </button>
            </>
          ) : (
            <span className="text-xs text-rose-300 bg-rose-950/40 border border-rose-800/60 px-3 py-1.5 rounded-lg font-medium">
              Exam has ended. Student attempts are closed.
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {[
          { id: "questions", label: "Questions" },
          { id: "settings", label: "Exam Settings & Timing" },
          { id: "professor-report", label: "📊 Student Report" },
          { id: "coordinator-report", label: "📊 Class Student Report" },
          { id: "assign", label: "Assign Students" },
          { id: "results", label: "Results & Integrity" },
          { id: "qassign", label: "📋 Question Assignment" },
        ]
          .filter((t) => {
            if (isCoordinator) return t.id === "questions" || t.id === "settings" || t.id === "coordinator-report";
            if (isProfessorUser) return t.id !== "settings" && t.id !== "coordinator-report";
            return t.id !== "coordinator-report";
          })
          .map((t) => (
          <button
            key={t.id}
            onClick={() => handleTabChange(t.id as Tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px cursor-pointer flex items-center gap-1.5 ${
              tab === t.id ? "border-blue-600 text-blue-600 font-bold" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.id === "settings" && <span>⚙️</span>}
            {t.label}
          </button>
        ))}
      </div>

      {tab === "questions" && (
        <QuestionsTab
          exam={exam}
          questions={questions}
          onAdded={reload}
          onUpdateLimit={handleUpdateLimit}
          onSwitchToSettings={() => handleTabChange("settings")}
        />
      )}
      {tab === "settings" && (
        <ExamSettingsTab
          exam={exam}
          onUpdated={(updated) => {
            setExam(updated);
            reload();
          }}
          onSwitchToQuestions={() => handleTabChange("questions")}
        />
      )}
      {tab === "coordinator-report" && (
        <CoordinatorStudentReportTab exam={exam} />
      )}
      {tab === "professor-report" && (
        <ProfessorStudentReportTab exam={exam} />
      )}
      {!isCoordinator && tab === "assign" && <AssignTab exam={exam} onExamUpdated={setExam} />}
      {!isCoordinator && tab === "results" && <ResultsTab examId={exam.id} />}
      {!isCoordinator && tab === "qassign" && (
        <QuestionAssignTab
          examId={exam.id}
          examName={exam.name}
          questionCount={questions.length}
          openToAll={exam.openToAll}
        />
      )}

      {/* Delete Exam Confirmation Modal */}
      {showDeleteModal && (
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
                Are you sure you want to delete <strong className="text-slate-900 font-semibold">"{exam.name}"</strong>?
              </p>
              <p className="text-xs text-rose-700 bg-rose-50 p-3 rounded-lg mt-3 border border-rose-200">
                ⚠️ All questions, assignments, student attempts, and proctoring records for this exam will be permanently removed.
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (!deleting) setShowDeleteModal(false);
                }}
                disabled={deleting}
                className="px-4 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteExam}
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

      {/* Terminate Exam Now Confirmation Modal */}
      {showTerminateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-rose-200">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-2xl font-bold">
                🛑
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">End Exam Immediately?</h3>
                <p className="text-xs text-slate-500">Conclude exam for all candidates right now</p>
              </div>
            </div>
            <p className="text-xs text-slate-700 bg-rose-50 border border-rose-200 p-3.5 rounded-xl leading-relaxed">
              ⚠️ All currently active student exam sessions will be <strong>immediately submitted and terminated without needing a page refresh</strong>.
              New students will not be allowed to start.
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowTerminateModal(false)}
                disabled={timingAdjusting}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleTerminateNow}
                disabled={timingAdjusting}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-rose-600 text-white hover:bg-rose-700 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {timingAdjusting ? "Concluding Exam..." : "Yes, End Exam Immediately"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionsTab({
  exam,
  questions,
  onAdded,
  onUpdateLimit,
  onSwitchToSettings,
}: {
  exam: Exam;
  questions: ExamQuestion[];
  onAdded: () => void;
  onUpdateLimit: (newLimit: number) => Promise<void>;
  onSwitchToSettings?: () => void;
}) {
  const [questionType, setQuestionType] = useState<"MCQ" | "CODING">("MCQ");

  // MCQ Form
  const [mcqForm, setMcqForm] = useState<{
    questionText: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    correctAnswer: number;
    marks: number | string;
  }>({
    questionText: "",
    optionA: "",
    optionB: "",
    optionC: "",
    optionD: "",
    correctAnswer: 0,
    marks: 1,
  });

  function setMcq<K extends keyof typeof mcqForm>(key: K, val: (typeof mcqForm)[K]) {
    setMcqForm((f) => ({ ...f, [key]: val }));
  }

  // Coding Question Form
  const [codingForm, setCodingForm] = useState<{
    problemTitle: string;
    questionText: string;
    marks: number | string;
    constraints: string;
    allowedLanguages: string;
    codeTemplate: string;
    testCases: TestCase[];
  }>({
    problemTitle: "",
    questionText: "",
    marks: 10,
    constraints: "1 <= n <= 10^5\nTime Limit: 5.0 seconds\nMemory Limit: 256 MB",
    allowedLanguages: "c,python,java",
    codeTemplate: `import sys

def solve():
    input_data = sys.stdin.read().strip()
    if not input_data:
        return
    # Your solution here
    print(input_data)

if __name__ == '__main__':
    solve()
`,
    testCases: [
      {
        input: "3\n1 2 3",
        expectedOutput: "6",
        isHidden: false,
        explanation: "Sum of elements 1 + 2 + 3 = 6",
      },
      {
        input: "5\n10 20 30 40 50",
        expectedOutput: "150",
        isHidden: true,
        explanation: "",
      },
    ],
  });

  // Test Run in Admin
  const [testingCode, setTestingCode] = useState(false);
  const [testRunLanguage, setTestRunLanguage] = useState<string>("c");
  const [testRunResult, setTestRunResult] = useState<RunCodeResponse | null>(null);
  const [testRunError, setTestRunError] = useState<string | null>(null);

  // Bulk Questions Upload state (.xlsx, .xls, .csv)
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkParsing, setBulkParsing] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSuccessMsg, setBulkSuccessMsg] = useState<string | null>(null);
  const [parsedBulkQuestions, setParsedBulkQuestions] = useState<any[]>([]);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const createTestCaseFileInputRef = useRef<HTMLInputElement>(null);
  const editTestCaseFileInputRef = useRef<HTMLInputElement>(null);
  const [testCaseUploadMsg, setTestCaseUploadMsg] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [increasingLimit, setIncreasingLimit] = useState(false);

  // Edit question state
  const [editingQuestion, setEditingQuestion] = useState<ExamQuestion | null>(null);
  const [editForm, setEditForm] = useState<{
    questionType: "MCQ" | "CODING";
    questionText: string;
    marks: number | string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    correctAnswer: number;
    problemTitle: string;
    constraints: string;
    allowedLanguages: string;
    codeTemplate: string;
    testCases: TestCase[];
  }>({
    questionType: "MCQ",
    questionText: "",
    marks: 1,
    optionA: "",
    optionB: "",
    optionC: "",
    optionD: "",
    correctAnswer: 0,
    problemTitle: "",
    constraints: "",
    allowedLanguages: "c,python,java",
    codeTemplate: "",
    testCases: [],
  });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deletingQuestionId, setDeletingQuestionId] = useState<number | null>(null);

  // AI Question Generation Modal state
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiTopics, setAiTopics] = useState(exam.subject ? `${exam.subject}` : "");
  const [aiNumQuestions, setAiNumQuestions] = useState<number | string>(5);
  const [aiQuestionType, setAiQuestionType] = useState<"MIXED" | "MCQ" | "CODING">("MIXED");
  const [aiDifficulty, setAiDifficulty] = useState("Medium");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuccessMsg, setAiSuccessMsg] = useState<string | null>(null);

  async function handleAiGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!aiTopics.trim()) {
      setAiError("Please enter the portions or main topics of the exam.");
      return;
    }
    setAiGenerating(true);
    setAiError(null);
    try {
      const generated = await api.post<ExamQuestion[]>(
        `/api/admin/exams/${exam.id}/ai-generate-questions`,
        {
          topics: aiTopics.trim(),
          numQuestions: Number(aiNumQuestions),
          questionType: aiQuestionType,
          difficulty: aiDifficulty,
        },
        "admin"
      );
      setShowAiModal(false);
      setAiSuccessMsg(`✨ Successfully generated and added ${generated.length} question(s) with test cases!`);
      setTimeout(() => setAiSuccessMsg(null), 6000);
      onAdded();
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Failed to generate questions with AI.");
    } finally {
      setAiGenerating(false);
    }
  }

  const isCoordinator = isCoordinatorRole();
  const isAdmin = isAdminRole();
  const isProfessorUser = isProfessorUserRole() || (!isCoordinator && !isAdmin);
  const isClassMode = Boolean(exam.isClass);
  const isLimitReached = !isProfessorUser && !isClassMode && questions.length >= exam.numQuestions;
  const isOverLimit = !isProfessorUser && !isClassMode && questions.length > exam.numQuestions;

  async function handleQuickIncrease() {
    setIncreasingLimit(true);
    try {
      await onUpdateLimit(Math.max(questions.length + 1, exam.numQuestions + 1));
    } finally {
      setIncreasingLimit(false);
    }
  }

  async function handleQuickSync() {
    setIncreasingLimit(true);
    try {
      await onUpdateLimit(questions.length);
    } finally {
      setIncreasingLimit(false);
    }
  }

  function addTestCase() {
    setCodingForm((f) => ({
      ...f,
      testCases: [
        ...f.testCases,
        {
          input: "",
          expectedOutput: "",
          isHidden: false,
          explanation: "",
          displayOrder: f.testCases.length,
        },
      ],
    }));
  }

  function removeTestCase(idx: number) {
    setCodingForm((f) => ({
      ...f,
      testCases: f.testCases.filter((_, i) => i !== idx),
    }));
  }

  function updateTestCase(idx: number, field: keyof TestCase, val: any) {
    setCodingForm((f) => ({
      ...f,
      testCases: f.testCases.map((tc, i) => (i === idx ? { ...tc, [field]: val } : tc)),
    }));
  }

  function loadTwoSumPreset() {
    setCodingForm({
      problemTitle: "Two Sum",
      questionText: `Given an array of integers nums and an integer target, return the indices of the two numbers such that they add up to target.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.`,
      marks: 10,
      constraints: "2 <= nums.length <= 10^4\n-10^9 <= nums[i] <= 10^9\n-10^9 <= target <= 10^9\nOnly one valid answer exists.",
      allowedLanguages: "c,python,java",
      codeTemplate: `import sys

def solve():
    lines = sys.stdin.read().strip().splitlines()
    if not lines:
        return
    nums = [int(x) for x in lines[0].split()]
    target = int(lines[1].strip())
    
    seen = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in seen:
            print(f"{seen[complement]} {i}")
            return
        seen[num] = i

if __name__ == '__main__':
    solve()
`,
      testCases: [
        {
          input: "2 7 11 15\n9",
          expectedOutput: "0 1",
          isHidden: false,
          explanation: "nums[0] + nums[1] == 9, we return 0 1.",
        },
        {
          input: "3 2 4\n6",
          expectedOutput: "1 2",
          isHidden: false,
          explanation: "nums[1] + nums[2] == 6, we return 1 2.",
        },
        {
          input: "3 3\n6",
          expectedOutput: "0 1",
          isHidden: true,
          explanation: "",
        },
      ],
    });
  }

  function loadPythonTemplate() {
    setCodingForm((f) => ({
      ...f,
      codeTemplate: `import sys

def solve():
    # Read from stdin
    input_data = sys.stdin.read().strip()
    if not input_data:
        return
    # Your solution here
    print(input_data)

if __name__ == '__main__':
    solve()
`,
    }));
    setTestRunLanguage("python");
  }

  function loadCTemplate() {
    setCodingForm((f) => ({
      ...f,
      codeTemplate: `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main() {
    // Read input from stdin
    char buffer[1024];
    while (fgets(buffer, sizeof(buffer), stdin)) {
        // Your C solution here
        printf("%s", buffer);
    }
    return 0;
}
`,
    }));
    setTestRunLanguage("c");
  }

  function loadJavaTemplate() {
    setCodingForm((f) => ({
      ...f,
      codeTemplate: `import java.util.*;
import java.io.*;

public class Solution {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        while (scanner.hasNextLine()) {
            String line = scanner.nextLine();
            // Your Java solution here
            System.out.println(line);
        }
        scanner.close();
    }
}
`,
    }));
    setTestRunLanguage("java");
  }

  async function handleAdminTestRun() {
    if (codingForm.testCases.length === 0) {
      alert("Please add at least one test case before test running.");
      return;
    }
    setTestingCode(true);
    setTestRunError(null);
    setTestRunResult(null);
    try {
      const detectedLang =
        testRunLanguage ||
        (codingForm.codeTemplate.includes("#include") ? "c" :
         codingForm.codeTemplate.includes("public class") ? "java" : "python");

      const res = await api.post<RunCodeResponse>(
        "/api/admin/exams/questions/test-run",
        {
          code: codingForm.codeTemplate,
          language: detectedLang,
          testCases: codingForm.testCases,
        },
        "admin"
      );
      setTestRunResult(res);
    } catch (err) {
      setTestRunError(err instanceof Error ? err.message : "Test run failed.");
    } finally {
      setTestingCode(false);
    }
  }

  function downloadSampleQuestionsExcel() {
    const sampleRows = [
      {
        "Question Type": "MCQ",
        "Question Text": "What is the time complexity of searching in a balanced Binary Search Tree?",
        "Option A": "O(1)",
        "Option B": "O(log n)",
        "Option C": "O(n)",
        "Option D": "O(n log n)",
        "Correct Answer": "B",
        "Marks": 1,
        "Problem Title": "",
        "Constraints": "",
        "Allowed Languages": "",
        "Code Template": "",
        "Sample Input": "",
        "Sample Output": "",
        "Sample Explanation": "",
      },
      {
        "Question Type": "MCQ",
        "Question Text": "Which function dynamically allocates memory in the C programming language?",
        "Option A": "calloc()",
        "Option B": "malloc()",
        "Option C": "realloc()",
        "Option D": "All of the above",
        "Correct Answer": "D",
        "Marks": 1,
        "Problem Title": "",
        "Constraints": "",
        "Allowed Languages": "",
        "Code Template": "",
        "Sample Input": "",
        "Sample Output": "",
        "Sample Explanation": "",
      },
      {
        "Question Type": "CODING",
        "Question Text": "Write a C program to read two integers from standard input and print their sum.",
        "Option A": "",
        "Option B": "",
        "Option C": "",
        "Option D": "",
        "Correct Answer": "",
        "Marks": 5,
        "Problem Title": "Sum of Two Numbers (C / Python)",
        "Constraints": "-10^5 <= a, b <= 10^5\nTime Limit: 2.0s\nMemory Limit: 128MB",
        "Allowed Languages": "c,python,java",
        "Code Template": "#include <stdio.h>\n\nint main() {\n    int a, b;\n    if (scanf(\"%d %d\", &a, &b) == 2) {\n        printf(\"%d\\n\", a + b);\n    }\n    return 0;\n}",
        "Sample Input": "3 7",
        "Sample Output": "10",
        "Sample Explanation": "3 + 7 = 10",
      },
      {
        "Question Type": "CODING",
        "Question Text": "Given an integer N, print all numbers from 1 to N separated by spaces.",
        "Option A": "",
        "Option B": "",
        "Option C": "",
        "Option D": "",
        "Correct Answer": "",
        "Marks": 10,
        "Problem Title": "Print 1 to N",
        "Constraints": "1 <= N <= 100",
        "Allowed Languages": "c,python,java",
        "Code Template": "import sys\n\ndef solve():\n    n = int(sys.stdin.read().strip())\n    print(' '.join(str(i) for i in range(1, n + 1)))\n\nif __name__ == '__main__':\n    solve()",
        "Sample Input": "5",
        "Sample Output": "1 2 3 4 5",
        "Sample Explanation": "Prints 1 through 5",
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Questions");
    XLSX.writeFile(wb, "bulk_questions_sample_template.xlsx");
  }

  function downloadSampleQuestionsCsv() {
    const sampleRows = [
      {
        "Question Type": "MCQ",
        "Question Text": "What is the time complexity of searching in a balanced Binary Search Tree?",
        "Option A": "O(1)",
        "Option B": "O(log n)",
        "Option C": "O(n)",
        "Option D": "O(n log n)",
        "Correct Answer": "B",
        "Marks": 1,
        "Problem Title": "",
        "Constraints": "",
        "Allowed Languages": "",
        "Code Template": "",
        "Sample Input": "",
        "Sample Output": "",
        "Is Hidden": "",
        "Sample Explanation": "",
      },
      {
        "Question Type": "CODING",
        "Question Text": "Write a program to read two integers and print their sum.",
        "Option A": "",
        "Option B": "",
        "Option C": "",
        "Option D": "",
        "Correct Answer": "",
        "Marks": 5,
        "Problem Title": "Sum of Two Numbers",
        "Constraints": "-10^5 <= a, b <= 10^5",
        "Allowed Languages": "c,python,java",
        "Code Template": "#include <stdio.h>\nint main() {\n    int a, b;\n    if (scanf(\"%d %d\", &a, &b) == 2) printf(\"%d\\n\", a + b);\n    return 0;\n}",
        "Sample Input": "4 6",
        "Sample Output": "10",
        "Is Hidden": "false",
        "Sample Explanation": "Sample 1: 4 + 6 = 10",
      },
      {
        "Question Type": "CODING",
        "Question Text": "",
        "Option A": "",
        "Option B": "",
        "Option C": "",
        "Option D": "",
        "Correct Answer": "",
        "Marks": "",
        "Problem Title": "Sum of Two Numbers",
        "Constraints": "",
        "Allowed Languages": "",
        "Code Template": "",
        "Sample Input": "10 20",
        "Sample Output": "30",
        "Is Hidden": "false",
        "Sample Explanation": "Sample 2: 10 + 20 = 30",
      },
      {
        "Question Type": "CODING",
        "Question Text": "",
        "Option A": "",
        "Option B": "",
        "Option C": "",
        "Option D": "",
        "Correct Answer": "",
        "Marks": "",
        "Problem Title": "Sum of Two Numbers",
        "Constraints": "",
        "Allowed Languages": "",
        "Code Template": "",
        "Sample Input": "-5 5",
        "Sample Output": "0",
        "Is Hidden": "true",
        "Sample Explanation": "Hidden test case: cancellation",
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Questions");
    XLSX.writeFile(wb, "bulk_questions_sample_template.csv", { bookType: "csv" });
  }

  function downloadSampleTestCasesCsv() {
    const sampleCases = [
      { "Input": "4 6", "Expected Output": "10", "Is Hidden": false, "Explanation": "Sample 1: 4 + 6 = 10" },
      { "Input": "10 20", "Expected Output": "30", "Is Hidden": false, "Explanation": "Sample 2: 10 + 20 = 30" },
      { "Input": "-5 5", "Expected Output": "0", "Is Hidden": false, "Explanation": "Zero sum verification" },
      { "Input": "0 0", "Expected Output": "0", "Is Hidden": true, "Explanation": "Hidden: zero identity" },
      { "Input": "100000 100000", "Expected Output": "200000", "Is Hidden": true, "Explanation": "Hidden: upper bound" },
      { "Input": "-100000 -100000", "Expected Output": "-200000", "Is Hidden": true, "Explanation": "Hidden: lower bound" },
      { "Input": "-100 200", "Expected Output": "100", "Is Hidden": true, "Explanation": "Hidden: mixed signs" },
      { "Input": "1 -1", "Expected Output": "0", "Is Hidden": true, "Explanation": "Hidden: cancellation" },
      { "Input": "999 1", "Expected Output": "1000", "Is Hidden": true, "Explanation": "Hidden: carry transition" },
      { "Input": "123 456", "Expected Output": "579", "Is Hidden": true, "Explanation": "Hidden: arbitrary numbers" },
      { "Input": "50 -50", "Expected Output": "0", "Is Hidden": true, "Explanation": "Hidden: exact opposites" },
      { "Input": "-1 0", "Expected Output": "-1", "Is Hidden": true, "Explanation": "Hidden: negative zero addition" },
      { "Input": "0 1", "Expected Output": "1", "Is Hidden": true, "Explanation": "Hidden: zero positive addition" },
      { "Input": "42 58", "Expected Output": "100", "Is Hidden": true, "Explanation": "Hidden: round number sum" },
      { "Input": "12345 67890", "Expected Output": "80235", "Is Hidden": true, "Explanation": "Hidden: large distinct values" },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleCases);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "TestCases");
    XLSX.writeFile(wb, "sample_15_test_cases.csv", { bookType: "csv" });
  }

  async function parseTestCasesFromFile(file: File): Promise<TestCase[]> {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) throw new Error("The file has no sheets.");
    const sheet = workbook.Sheets[firstSheetName];
    const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (rawRows.length === 0) {
      throw new Error("No data rows found in the test cases file.");
    }

    const resultCases: TestCase[] = [];

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const norm: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) {
        const keyNorm = k.toLowerCase().trim().replace(/[\s_-]+/g, "");
        norm[keyNorm] = String(v ?? "").trim();
      }

      // Check direct input / output on this row
      const inVal = norm["input"] || norm["sampleinput"] || norm["stdin"] || norm["testinput"] || norm["testcaseinput"] || norm["inputdata"] || norm["in"] || "";
      const outVal = norm["expectedoutput"] || norm["output"] || norm["sampleoutput"] || norm["stdout"] || norm["testoutput"] || norm["testcaseoutput"] || norm["expected"] || norm["out"] || "";
      const explVal = norm["sampleexplanation"] || norm["explanation"] || norm["notes"] || norm["desc"] || "";
      const hiddenRaw = (norm["ishidden"] || norm["hidden"] || norm["private"] || norm["secret"] || norm["is_hidden"] || "").toLowerCase();
      const isHidden = hiddenRaw === "true" || hiddenRaw === "1" || hiddenRaw === "yes" || hiddenRaw === "hidden";

      if (inVal !== "" || outVal !== "") {
        resultCases.push({
          input: inVal,
          expectedOutput: outVal,
          isHidden: isHidden,
          explanation: explVal,
          displayOrder: resultCases.length,
        });
      }

      // Also check numbered columns on this row (Input 1, Output 1, Input 2, Output 2... up to 50)
      for (let k = 1; k <= 50; k++) {
        const inK = norm[`input${k}`] || norm[`sampleinput${k}`] || norm[`stdin${k}`] || norm[`testcaseinput${k}`] || norm[`tc${k}input`];
        const outK = norm[`output${k}`] || norm[`sampleoutput${k}`] || norm[`expectedoutput${k}`] || norm[`stdout${k}`] || norm[`testcaseoutput${k}`] || norm[`tc${k}output`];
        const explK = norm[`explanation${k}`] || norm[`sampleexplanation${k}`] || norm[`notes${k}`] || "";
        const hidK = (norm[`hidden${k}`] || norm[`ishidden${k}`] || norm[`private${k}`] || "").toLowerCase();
        const isHidK = hidK === "true" || hidK === "1" || hidK === "yes" || hidK === "hidden";

        if (inK !== undefined || outK !== undefined) {
          resultCases.push({
            input: String(inK ?? "").trim(),
            expectedOutput: String(outK ?? "").trim(),
            isHidden: isHidK,
            explanation: String(explK ?? "").trim(),
            displayOrder: resultCases.length,
          });
        }
      }
    }

    if (resultCases.length === 0) {
      throw new Error("No test cases found. Ensure columns include 'Input' and 'Expected Output' (or 'Sample Input' / 'Sample Output').");
    }

    return resultCases;
  }

  async function handleCreateTestCaseFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseTestCasesFromFile(file);
      setCodingForm((f) => ({
        ...f,
        testCases: parsed,
      }));
      setTestCaseUploadMsg(`✅ Successfully imported all ${parsed.length} test cases from ${file.name}!`);
      setTimeout(() => setTestCaseUploadMsg(null), 6000);
    } catch (err: any) {
      alert(err instanceof Error ? err.message : "Failed to parse test cases file.");
    } finally {
      e.target.value = "";
    }
  }

  async function handleEditTestCaseFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseTestCasesFromFile(file);
      setEditForm((f) => ({
        ...f,
        testCases: parsed,
      }));
      alert(`✅ Successfully imported all ${parsed.length} test cases from ${file.name}!`);
    } catch (err: any) {
      alert(err instanceof Error ? err.message : "Failed to parse test cases file.");
    } finally {
      e.target.value = "";
    }
  }

  function extractTestCasesFromNorm(norm: Record<string, string>): TestCase[] {
    const cases: TestCase[] = [];

    // 1. Direct input/output
    const inVal = norm["sampleinput"] || norm["input"] || norm["stdin"] || norm["testinput"] || norm["testcaseinput"] || norm["in"] || "";
    const outVal = norm["sampleoutput"] || norm["output"] || norm["expectedoutput"] || norm["stdout"] || norm["testoutput"] || norm["expected"] || norm["out"] || "";
    const explVal = norm["sampleexplanation"] || norm["explanation"] || norm["notes"] || norm["desc"] || "";
    const hidRaw = (norm["ishidden"] || norm["hidden"] || norm["private"] || norm["secret"] || norm["is_hidden"] || "").toLowerCase();
    const isHidden = hidRaw === "true" || hidRaw === "1" || hidRaw === "yes" || hidRaw === "hidden";

    if (inVal !== "" || outVal !== "") {
      cases.push({
        input: inVal,
        expectedOutput: outVal,
        isHidden,
        explanation: explVal,
        displayOrder: 0,
      });
    }

    // 2. Numbered columns (Input 1, Output 1, Input 2, Output 2 ... up to 50)
    for (let k = 1; k <= 50; k++) {
      const inK = norm[`input${k}`] || norm[`sampleinput${k}`] || norm[`stdin${k}`] || norm[`testcaseinput${k}`] || norm[`tc${k}input`];
      const outK = norm[`output${k}`] || norm[`sampleoutput${k}`] || norm[`expectedoutput${k}`] || norm[`stdout${k}`] || norm[`testcaseoutput${k}`] || norm[`tc${k}output`];
      const explK = norm[`explanation${k}`] || norm[`sampleexplanation${k}`] || norm[`notes${k}`] || "";
      const hiddenK = (norm[`hidden${k}`] || norm[`ishidden${k}`] || norm[`private${k}`] || "").toLowerCase();
      const isHiddenK = hiddenK === "true" || hiddenK === "1" || hiddenK === "yes" || hiddenK === "hidden";

      if (inK !== undefined || outK !== undefined) {
        cases.push({
          input: String(inK ?? "").trim(),
          expectedOutput: String(outK ?? "").trim(),
          isHidden: isHiddenK,
          explanation: String(explK ?? "").trim(),
          displayOrder: cases.length,
        });
      }
    }

    // 3. JSON in testcases column
    const jsonRaw = norm["testcases"] || norm["testcase"] || norm["cases"] || "";
    if (jsonRaw && (jsonRaw.startsWith("[") || jsonRaw.startsWith("{"))) {
      try {
        const parsed = JSON.parse(jsonRaw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (typeof item === "object" && item !== null) {
              cases.push({
                input: String(item.input ?? item.stdin ?? "").trim(),
                expectedOutput: String(item.expectedOutput ?? item.output ?? item.stdout ?? "").trim(),
                isHidden: Boolean(item.isHidden ?? item.hidden),
                explanation: String(item.explanation ?? "").trim(),
                displayOrder: cases.length,
              });
            }
          }
        }
      } catch {
        // ignore invalid JSON
      }
    }

    return cases;
  }

  async function handleBulkFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkFile(file);
    setBulkError(null);
    setBulkSuccessMsg(null);
    setBulkParsing(true);
    setParsedBulkQuestions([]);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error("The uploaded file has no sheets.");
      const sheet = workbook.Sheets[firstSheetName];
      const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (rawRows.length === 0) {
        throw new Error("No data rows found in the uploaded file.");
      }

      const allNormRows = rawRows.map((row) => {
        const norm: Record<string, string> = {};
        for (const [k, v] of Object.entries(row)) {
          const keyNorm = k.toLowerCase().trim().replace(/[\s_-]+/g, "");
          norm[keyNorm] = String(v ?? "").trim();
        }
        return norm;
      });

      // 1. Check if the entire file is a dedicated Test Cases CSV file (e.g. 15 rows of inputs/outputs)
      const hasMcqSignals = allNormRows.some(
        (r) => r["optiona"] || r["optionb"] || r["correctanswer"] || (r["questiontype"] || "").toUpperCase() === "MCQ"
      );
      const rowsWithQuestionText = allNormRows.filter(
        (r) => r["questiontext"] || r["question"] || r["statement"] || r["problemstatement"]
      );

      const totalTestCasesFoundInFile = allNormRows.reduce((cnt, r) => {
        const hasDirect = Boolean((r["input"] || r["sampleinput"] || r["stdin"]) || (r["output"] || r["sampleoutput"] || r["expectedoutput"] || r["stdout"]));
        return cnt + (hasDirect ? 1 : 0);
      }, 0);

      if (!hasMcqSignals && totalTestCasesFoundInFile > 1 && rowsWithQuestionText.length <= 1) {
        // This is a dedicated test-cases file!
        const testCases: TestCase[] = [];
        let problemTitle = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
        let questionText = "Solve the coding challenge and verify against all automated test cases.";
        let marks = 10;
        let constraints = "Time Limit: 5.0 seconds\nMemory Limit: 256 MB";
        let allowedLanguages = "c,python,java";
        let codeTemplate = `#include <stdio.h>\n\nint main() {\n    // Read input\n    return 0;\n}`;

        // If row 0 has metadata, extract it
        if (allNormRows[0]) {
          const r0 = allNormRows[0];
          if (r0["problemtitle"] || r0["title"]) problemTitle = r0["problemtitle"] || r0["title"];
          if (r0["questiontext"] || r0["question"] || r0["statement"]) questionText = r0["questiontext"] || r0["question"] || r0["statement"];
          if (r0["marks"] || r0["score"]) marks = Number(r0["marks"] || r0["score"]) || 10;
          if (r0["constraints"]) constraints = r0["constraints"];
          if (r0["allowedlanguages"]) allowedLanguages = r0["allowedlanguages"];
          if (r0["codetemplate"]) codeTemplate = r0["codetemplate"];
        }

        for (let i = 0; i < allNormRows.length; i++) {
          const r = allNormRows[i];
          const inVal = r["input"] || r["sampleinput"] || r["stdin"] || r["testinput"] || r["testcaseinput"] || r["in"] || "";
          const outVal = r["expectedoutput"] || r["output"] || r["sampleoutput"] || r["stdout"] || r["testoutput"] || r["expected"] || r["out"] || "";
          const explVal = r["sampleexplanation"] || r["explanation"] || r["notes"] || "";
          const hidRaw = (r["ishidden"] || r["hidden"] || r["private"] || "").toLowerCase();
          const isHidden = hidRaw === "true" || hidRaw === "1" || hidRaw === "yes" || hidRaw === "hidden";

          if (inVal !== "" || outVal !== "") {
            testCases.push({
              input: inVal,
              expectedOutput: outVal,
              isHidden,
              explanation: explVal,
              displayOrder: testCases.length,
            });
          }
        }

        if (testCases.length > 0) {
          const parsed = [{
            questionType: "CODING",
            problemTitle,
            questionText,
            marks,
            constraints,
            allowedLanguages,
            codeTemplate,
            testCases,
          }];
          setParsedBulkQuestions(parsed);
          setBulkSuccessMsg(`✨ Successfully detected all ${testCases.length} test cases! Packaged into Coding Question '${problemTitle}' ready to import.`);
          return;
        }
      }

      // 2. Standard or Mixed Bulk Questions Parser with multi-row and multi-column test cases grouping
      const parsed: any[] = [];
      let currentCodingQuestion: any = null;

      for (let i = 0; i < allNormRows.length; i++) {
        const norm = allNormRows[i];
        const qTypeRaw = (norm["questiontype"] || norm["type"] || "").toUpperCase();
        const qText = norm["questiontext"] || norm["question"] || norm["statement"] || norm["problemstatement"] || "";
        const title = norm["problemtitle"] || norm["title"] || "";

        // Check if this row is an extra test case row for the preceding coding question
        const rowHasInputOutput = Boolean(
          norm["sampleinput"] || norm["input"] || norm["stdin"] ||
          norm["sampleoutput"] || norm["output"] || norm["expectedoutput"] || norm["stdout"]
        );

        const isSameQuestionAsCurrent = currentCodingQuestion && (
          (!qText && !title && rowHasInputOutput) || // blank question text following coding question
          (title && title.toLowerCase() === currentCodingQuestion.problemTitle.toLowerCase()) ||
          (qText && qText.toLowerCase() === currentCodingQuestion.questionText.toLowerCase())
        );

        if (isSameQuestionAsCurrent && currentCodingQuestion) {
          // Append test case(s) from this row to current coding question
          const rowCases = extractTestCasesFromNorm(norm);
          for (const tc of rowCases) {
            tc.displayOrder = currentCodingQuestion.testCases.length;
            currentCodingQuestion.testCases.push(tc);
          }
          continue;
        }

        // Otherwise, this must be a new question
        if (!qText && !title) continue; // Skip empty rows

        const marks = Number(norm["marks"] || norm["score"] || norm["points"]) || (qTypeRaw.includes("CODE") ? 5 : 1);
        const isCoding = qTypeRaw.includes("CODE") || Boolean(norm["codetemplate"] || norm["template"] || norm["sampleinput"] || norm["input"] || title);

        if (isCoding) {
          const problemTitle = title || qText.slice(0, 50);
          const constraints = norm["constraints"] || "Time Limit: 5.0 seconds\nMemory Limit: 256 MB";
          const allowedLanguages = norm["allowedlanguages"] || norm["languages"] || "c,python,java";
          const codeTemplate = norm["codetemplate"] || norm["template"] || norm["startercode"] || `#include <stdio.h>\n\nint main() {\n    return 0;\n}`;

          // Extract all test cases from this row (single or numbered columns Input 1..N)
          const testCases = extractTestCasesFromNorm(norm);

          if (testCases.length === 0) {
            testCases.push({
              input: "1",
              expectedOutput: "1",
              isHidden: false,
              explanation: "Default sample verification",
              displayOrder: 0,
            });
          }

          currentCodingQuestion = {
            questionType: "CODING",
            problemTitle,
            questionText: qText || problemTitle,
            marks,
            constraints,
            allowedLanguages,
            codeTemplate,
            testCases,
          };
          parsed.push(currentCodingQuestion);
        } else {
          // MCQ Question
          currentCodingQuestion = null;
          const optionA = norm["optiona"] || norm["a"] || "";
          const optionB = norm["optionb"] || norm["b"] || "";
          const optionC = norm["optionc"] || norm["c"] || "";
          const optionD = norm["optiond"] || norm["d"] || "";

          let correctIdx = 0;
          const ansRaw = (norm["correctanswer"] || norm["answer"] || norm["correct"] || "").toUpperCase();
          if (ansRaw === "A" || ansRaw === "0") correctIdx = 0;
          else if (ansRaw === "B" || ansRaw === "1") correctIdx = 1;
          else if (ansRaw === "C" || ansRaw === "2") correctIdx = 2;
          else if (ansRaw === "D" || ansRaw === "3") correctIdx = 3;
          else if (ansRaw === "4") correctIdx = 3;

          parsed.push({
            questionType: "MCQ",
            questionText: qText,
            optionA: optionA || "Option A",
            optionB: optionB || "Option B",
            optionC: optionC || "Option C",
            optionD: optionD || "Option D",
            correctAnswer: correctIdx,
            marks,
          });
        }
      }

      if (parsed.length === 0) {
        throw new Error("No valid questions or test cases could be parsed from the file. Please check column headers.");
      }

      const totalTestCases = parsed.reduce((sum, q) => sum + (q.testCases?.length || 0), 0);
      setParsedBulkQuestions(parsed);
      setBulkSuccessMsg(
        `Parsed ${parsed.length} question(s) (${parsed.filter((p) => p.questionType === "MCQ").length} MCQ, ${
          parsed.filter((p) => p.questionType === "CODING").length
        } Coding with ${totalTestCases} total test case(s)). Review preview below and click 'Confirm & Import'.`
      );
    } catch (err: any) {
      setBulkError(err instanceof Error ? err.message : "Failed to parse questions file.");
    } finally {
      setBulkParsing(false);
    }
  }

  async function handleBulkUploadSubmit() {
    if (parsedBulkQuestions.length === 0) return;
    setBulkSubmitting(true);
    setBulkError(null);
    try {
      await api.post(`/api/admin/exams/${exam.id}/questions/bulk`, parsedBulkQuestions, "admin");
      setShowBulkUploadModal(false);
      setParsedBulkQuestions([]);
      setBulkFile(null);
      onAdded();
      alert(`Successfully added ${parsedBulkQuestions.length} questions to exam!`);
    } catch (err: any) {
      setBulkError(err instanceof Error ? err.message : "Bulk upload failed.");
    } finally {
      setBulkSubmitting(false);
    }
  }

  async function addQuestion(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (questionType === "MCQ") {
        await api.post(`/api/admin/exams/${exam.id}/questions`, {
          ...mcqForm,
          marks: Number(mcqForm.marks) || 1,
          questionType: "MCQ",
        }, "admin");
        setMcqForm({
          questionText: "",
          optionA: "",
          optionB: "",
          optionC: "",
          optionD: "",
          correctAnswer: 0,
          marks: 1,
        });
      } else {
        if (codingForm.testCases.length === 0) {
          throw new Error("Coding questions require at least one test case.");
        }
        await api.post(`/api/admin/exams/${exam.id}/questions`, {
          questionType: "CODING",
          problemTitle: codingForm.problemTitle,
          questionText: codingForm.questionText,
          marks: Number(codingForm.marks) || 10,
          constraints: codingForm.constraints,
          allowedLanguages: codingForm.allowedLanguages,
          codeTemplate: codingForm.codeTemplate,
          testCases: codingForm.testCases,
        }, "admin");
        setCodingForm((f) => ({
          ...f,
          problemTitle: "",
          questionText: "",
        }));
      }
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add question.");
    } finally {
      setSubmitting(false);
    }
  }

  function startEditing(q: ExamQuestion) {
    const isCoordinatorQuestion = Boolean(q.createdByCoordinator) || q.createdByRole === "COURSE_COORDINATOR";
    if (isClassMode && isProfessorUser && isCoordinatorQuestion) {
      alert("This question was provided by the Course Coordinator and cannot be modified.");
      return;
    }
    setEditingQuestion(q);
    setEditForm({
      questionType: (q.questionType as "MCQ" | "CODING") || "MCQ",
      questionText: q.questionText || "",
      marks: Number(q.marks) || 1,
      optionA: q.optionA || "",
      optionB: q.optionB || "",
      optionC: q.optionC || "",
      optionD: q.optionD || "",
      correctAnswer: q.correctAnswer ?? 0,
      problemTitle: q.problemTitle || "",
      constraints: q.constraints || "",
      allowedLanguages: q.allowedLanguages || "c,python,java",
      codeTemplate: q.codeTemplate || "",
      testCases: (q.testCases || []).map((tc, i) => ({
        id: tc.id,
        input: tc.input || "",
        expectedOutput: tc.expectedOutput || "",
        isHidden: Boolean(tc.isHidden),
        explanation: tc.explanation || "",
        displayOrder: tc.displayOrder ?? i,
      })),
    });
    setEditError(null);
  }

  function addEditTestCase() {
    setEditForm((f) => ({
      ...f,
      testCases: [
        ...f.testCases,
        {
          input: "",
          expectedOutput: "",
          isHidden: false,
          explanation: "",
          displayOrder: f.testCases.length,
        },
      ],
    }));
  }

  function removeEditTestCase(idx: number) {
    setEditForm((f) => ({
      ...f,
      testCases: f.testCases.filter((_, i) => i !== idx),
    }));
  }

  function updateEditTestCase(idx: number, field: keyof TestCase, val: any) {
    setEditForm((f) => ({
      ...f,
      testCases: f.testCases.map((tc, i) => (i === idx ? { ...tc, [field]: val } : tc)),
    }));
  }

  async function handleUpdateQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!editingQuestion) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      if (editForm.questionType === "CODING" && editForm.testCases.length === 0) {
        throw new Error("Coding questions require at least one test case.");
      }
      await api.put(`/api/admin/exams/${exam.id}/questions/${editingQuestion.id}`, {
        ...editForm,
        marks: Number(editForm.marks) || 1,
      }, "admin");
      setEditingQuestion(null);
      onAdded();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update question.");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDeleteQuestion(qId: number) {
    const targetQ = questions.find((q) => q.id === qId);
    if (targetQ) {
      const isCoordinatorQuestion = Boolean(targetQ.createdByCoordinator) || targetQ.createdByRole === "COURSE_COORDINATOR";
      if (isClassMode && isProfessorUser && isCoordinatorQuestion) {
        alert("This question was provided by the Course Coordinator and cannot be deleted.");
        return;
      }
    }
    if (!window.confirm("Are you sure you want to delete this question?")) return;
    setDeletingQuestionId(qId);
    try {
      await api.delete(`/api/admin/exams/${exam.id}/questions/${qId}`, "admin");
      onAdded();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete question.");
    } finally {
      setDeletingQuestionId(null);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* AI Question Generation Top Banner */}
      <div className="lg:col-span-2 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-900/50 rounded-2xl p-5 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-xl">✨</span>
            <h3 className="font-bold text-sm sm:text-base text-white">AI Question &amp; Test Case Generator</h3>
            <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
              Google Gemini Powered
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
            Specify the exam portions or syllabus topics, select question count and type (MCQ, Coding, or Mixed). The AI generates questions with full test cases and automatically updates the exam.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setAiError(null);
            setShowAiModal(true);
          }}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm hover:shadow-indigo-500/25 flex items-center gap-2 cursor-pointer shrink-0"
        >
          <span>✨</span> AI Generate Questions
        </button>
      </div>

      {/* Success Notification Banner */}
      {aiSuccessMsg && (
        <div className="lg:col-span-2 bg-emerald-50 border border-emerald-300 text-emerald-800 px-4 py-3 rounded-xl text-xs font-semibold flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <span>✅</span>
            <span>{aiSuccessMsg}</span>
          </div>
          <button onClick={() => setAiSuccessMsg(null)} className="text-emerald-700 hover:text-emerald-900 font-bold">
            ✕
          </button>
        </div>
      )}

      {/* AI GENERATE QUESTIONS MODAL */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xl">✨</span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Generate Exam Questions</h3>
                  <p className="text-[11px] text-slate-500">Google Gemini LLM Exam Engine</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !aiGenerating && setShowAiModal(false)}
                disabled={aiGenerating}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg cursor-pointer disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            {aiError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
                {aiError}
              </div>
            )}

            <form onSubmit={handleAiGenerate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Exam Portions / Main Topics <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={aiTopics}
                  onChange={(e) => setAiTopics(e.target.value)}
                  placeholder="e.g. Binary Search Trees, Heaps, Dynamic Programming, Graph Traversals (BFS/DFS)"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Specify chapters, syllabus portions, or topics. The AI will generate technical questions with options and test cases.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Number of Questions
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={aiNumQuestions}
                    onChange={(e) => setAiNumQuestions(e.target.value)}
                    onBlur={() => {
                      const val = Number(aiNumQuestions);
                      if (aiNumQuestions === "" || isNaN(val) || val < 1) setAiNumQuestions(1);
                      else if (val > 20) setAiNumQuestions(20);
                    }}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Question Type
                  </label>
                  <select
                    value={aiQuestionType}
                    onChange={(e) => setAiQuestionType(e.target.value as any)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                  >
                    <option value="MIXED">⚡ Mixed (MCQ + Coding)</option>
                    <option value="MCQ">📋 Multiple Choice Only</option>
                    <option value="CODING">💻 Coding &amp; Test Cases Only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Difficulty
                  </label>
                  <select
                    value={aiDifficulty}
                    onChange={(e) => setAiDifficulty(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                  >
                    <option value="Medium">Medium (Standard)</option>
                    <option value="Easy">Easy (Foundational)</option>
                    <option value="Hard">Hard (Competitive)</option>
                    <option value="Balanced">Balanced Mix</option>
                  </select>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-600 space-y-1">
                <div className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <span>ℹ️</span> Automated Exam Updates:
                </div>
                <p>
                  Generated questions and test cases will be validated and appended directly to the database. If this exceeds the current question limit ({exam.numQuestions}), the limit will be updated automatically.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAiModal(false)}
                  disabled={aiGenerating}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={aiGenerating}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {aiGenerating ? (
                    <>
                      <div className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
                      <span>Generating with Gemini AI…</span>
                    </>
                  ) : (
                    <>
                      <span>✨</span>
                      <span>Generate &amp; Save Questions</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isLimitReached ? (
        <div className="bg-white border border-amber-200 rounded-xl p-6 shadow-xs space-y-4 h-fit">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-base">
              {isOverLimit ? "⚠️" : "✓"}
            </span>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                {isOverLimit ? "Question Limit Exceeded" : "Question Limit Reached"}
              </h3>
              <p className="text-xs text-slate-500">
                {questions.length} of {exam.numQuestions} questions configured
              </p>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            {isOverLimit ? (
              <>
                This exam is configured for <strong>{exam.numQuestions}</strong> question(s), but currently has{" "}
                <strong>{questions.length}</strong> in the question bank. You can sync the limit to match or delete extra questions.
              </>
            ) : (
              <>
                All <strong>{exam.numQuestions}</strong> required question(s) have been added. To modify questions, you can{" "}
                <strong>Edit / Correct</strong> or <strong>Delete</strong> existing questions in the bank.
              </>
            )}
          </p>

          <div className="pt-2 border-t border-slate-100 flex items-center gap-2 flex-wrap">
            {isOverLimit ? (
              <button
                type="button"
                onClick={handleQuickSync}
                disabled={increasingLimit}
                className="text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                {increasingLimit ? "Updating…" : `Update Limit to ${questions.length} Questions`}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleQuickIncrease}
                disabled={increasingLimit}
                className="text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                {increasingLimit ? "Updating…" : `+ Increase Limit to ${questions.length + 1} Questions`}
              </button>
            )}
            {onSwitchToSettings && (
              <button
                type="button"
                onClick={onSwitchToSettings}
                className="text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 px-3.5 py-2 rounded-lg transition-colors cursor-pointer"
              >
                ⚙️ Exam Settings (Timing, Attempts, etc.)
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 h-fit shadow-xs">
          <div className="flex justify-between items-center gap-2 flex-wrap">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Add Question</h3>
              <p className="text-xs text-slate-500 mt-0.5">Select question format or bulk import from spreadsheet</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setShowBulkUploadModal(true);
                  setBulkError(null);
                  setBulkSuccessMsg(null);
                  setParsedBulkQuestions([]);
                  setBulkFile(null);
                }}
                className="text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                title="Bulk import questions from Excel (.xlsx, .xls) or CSV (.csv)"
              >
                <span>📊</span>
                <span>Bulk Upload (Excel / CSV)</span>
              </button>
              <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md">
                Question {questions.length + 1} of {exam.numQuestions}
              </span>
            </div>
          </div>

          {/* Type Selector Tabs */}
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-lg text-xs font-semibold">
            <button
              type="button"
              onClick={() => setQuestionType("MCQ")}
              className={`py-2 rounded-md transition-all cursor-pointer ${
                questionType === "MCQ" ? "bg-white text-blue-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              🔘 Multiple Choice (MCQ)
            </button>
            <button
              type="button"
              onClick={() => setQuestionType("CODING")}
              className={`py-2 rounded-md transition-all cursor-pointer ${
                questionType === "CODING" ? "bg-white text-indigo-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              💻 Coding Question (LeetCode-style)
            </button>
          </div>

          {questionType === "MCQ" ? (
            <form onSubmit={addQuestion} className="space-y-3">
              <textarea
                required
                placeholder="Question text (e.g. What is the time complexity of binary search?)"
                value={mcqForm.questionText}
                onChange={(e) => setMcq("questionText", e.target.value)}
                className="input"
                rows={2}
              />
              {(["optionA", "optionB", "optionC", "optionD"] as const).map((key, idx) => (
                <div key={key} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correct"
                    checked={mcqForm.correctAnswer === idx}
                    onChange={() => setMcq("correctAnswer", idx)}
                    className="cursor-pointer"
                    title="Mark as correct answer"
                  />
                  <span className="text-xs font-bold text-slate-500 w-4">{String.fromCharCode(65 + idx)}.</span>
                  <input
                    required
                    placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                    value={mcqForm[key]}
                    onChange={(e) => setMcq(key, e.target.value)}
                    className="input"
                  />
                </div>
              ))}
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-600">Marks</label>
                <input
                  type="number"
                  min={0.5}
                  step="0.5"
                  value={mcqForm.marks}
                  onChange={(e) => setMcq("marks", e.target.value)}
                  onBlur={() => {
                    if (mcqForm.marks === "" || Number(mcqForm.marks) <= 0) {
                      setMcq("marks", 1);
                    }
                  }}
                  className="input w-24"
                />
              </div>
              {error && <p className="text-rose-600 text-xs bg-rose-50 p-2 rounded">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer w-full"
              >
                {submitting ? "Adding…" : "+ Add MCQ Question"}
              </button>
            </form>
          ) : (
            <form onSubmit={addQuestion} className="space-y-4">
              <div className="flex justify-between items-center bg-indigo-50/70 border border-indigo-100 rounded-lg p-2.5">
                <span className="text-xs text-indigo-800 font-medium">LeetCode Coding Question Builder</span>
                <button
                  type="button"
                  onClick={loadTwoSumPreset}
                  className="text-xs font-semibold text-indigo-700 bg-white hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded transition-colors cursor-pointer"
                >
                  ⚡ Load Two Sum Preset
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Problem Title</label>
                  <input
                    required
                    placeholder="e.g. Two Sum, Valid Anagram"
                    value={codingForm.problemTitle}
                    onChange={(e) => setCodingForm((f) => ({ ...f, problemTitle: e.target.value }))}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Marks</label>
                  <input
                    type="number"
                    min={1}
                    step="1"
                    value={codingForm.marks}
                    onChange={(e) => setCodingForm((f) => ({ ...f, marks: e.target.value }))}
                    onBlur={() => {
                      if (codingForm.marks === "" || Number(codingForm.marks) < 1) {
                        setCodingForm((f) => ({ ...f, marks: 1 }));
                      }
                    }}
                    className="input"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Problem Description</label>
                <textarea
                  required
                  placeholder="Problem statement, input format, output format..."
                  value={codingForm.questionText}
                  onChange={(e) => setCodingForm((f) => ({ ...f, questionText: e.target.value }))}
                  className="input"
                  rows={4}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Constraints</label>
                <textarea
                  placeholder="e.g. 1 <= nums.length <= 10^4\n-10^9 <= nums[i] <= 10^9"
                  value={codingForm.constraints}
                  onChange={(e) => setCodingForm((f) => ({ ...f, constraints: e.target.value }))}
                  className="input font-mono text-xs"
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Allowed Programming Languages
                </label>
                <div className="flex items-center gap-4 text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                  {[
                    { id: "c", label: "C (GCC)" },
                    { id: "python", label: "Python 3" },
                    { id: "java", label: "Java 21" },
                  ].map(({ id, label }) => {
                    const currentLangs = (codingForm.allowedLanguages || "c,python,java")
                      .split(",")
                      .map((l) => l.trim().toLowerCase());
                    const checked = currentLangs.includes(id);
                    return (
                      <label key={id} className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-700 select-none">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            let next: string[];
                            if (e.target.checked) {
                              next = [...currentLangs, id];
                            } else {
                              next = currentLangs.filter((l) => l !== id);
                              if (next.length === 0) next = [id];
                            }
                            setCodingForm((f) => ({ ...f, allowedLanguages: next.join(",") }));
                          }}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span>{label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Starter Code / Solution Template
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-500">Insert preset:</span>
                    <button
                      type="button"
                      onClick={loadPythonTemplate}
                      className="text-[11px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded cursor-pointer transition-colors"
                    >
                      Python
                    </button>
                    <button
                      type="button"
                      onClick={loadCTemplate}
                      className="text-[11px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded cursor-pointer transition-colors"
                    >
                      C
                    </button>
                    <button
                      type="button"
                      onClick={loadJavaTemplate}
                      className="text-[11px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded cursor-pointer transition-colors"
                    >
                      Java
                    </button>
                  </div>
                </div>
                <textarea
                  placeholder="Template code provided to students..."
                  value={codingForm.codeTemplate}
                  onChange={(e) => setCodingForm((f) => ({ ...f, codeTemplate: e.target.value }))}
                  className="input font-mono text-xs bg-slate-900 text-emerald-400 p-3 leading-relaxed"
                  rows={6}
                />
              </div>

              {/* Test Cases Builder */}
              <div className="space-y-2 border-t border-slate-200 pt-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">
                      Test Cases ({codingForm.testCases.length})
                    </span>
                    <span className="text-[11px] text-slate-500">
                      ({codingForm.testCases.filter((tc) => !tc.isHidden).length} Sample,{" "}
                      {codingForm.testCases.filter((tc) => tc.isHidden).length} Hidden)
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <input
                      type="file"
                      ref={createTestCaseFileInputRef}
                      accept=".csv,.xlsx,.xls"
                      onChange={handleCreateTestCaseFileUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => createTestCaseFileInputRef.current?.click()}
                      className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                      title="Upload CSV / Excel containing test cases (Input, Expected Output, Hidden, Explanation)"
                    >
                      <span>📥</span> Import CSV ({codingForm.testCases.length} loaded)
                    </button>
                    <button
                      type="button"
                      onClick={downloadSampleTestCasesCsv}
                      className="text-xs font-medium text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-2 py-1 rounded transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                      title="Download sample 15 test cases CSV template"
                    >
                      <span>📄</span> 15 Cases Template
                    </button>
                    <button
                      type="button"
                      onClick={addTestCase}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-2.5 py-1 rounded transition-colors cursor-pointer"
                    >
                      + Add Test Case
                    </button>
                  </div>
                </div>

                {testCaseUploadMsg && (
                  <div className="text-xs p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium">
                    {testCaseUploadMsg}
                  </div>
                )}

                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {codingForm.testCases.map((tc, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border text-xs space-y-2.5 transition-all ${
                        tc.isHidden ? "bg-slate-50 border-slate-300" : "bg-blue-50/30 border-blue-200"
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-700">Case #{idx + 1}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              tc.isHidden ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {tc.isHidden ? "🔒 Hidden (Grading only)" : "👁️ Sample (Visible to Student)"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-1.5 cursor-pointer text-slate-600 text-[11px]">
                            <input
                              type="checkbox"
                              checked={tc.isHidden}
                              onChange={(e) => updateTestCase(idx, "isHidden", e.target.checked)}
                              className="rounded border-slate-300"
                            />
                            Hidden
                          </label>
                          <button
                            type="button"
                            onClick={() => removeTestCase(idx)}
                            className="text-rose-500 hover:text-rose-700 font-bold text-sm cursor-pointer"
                            title="Delete test case"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-0.5">Input (stdin)</label>
                          <textarea
                            rows={2}
                            value={tc.input}
                            onChange={(e) => updateTestCase(idx, "input", e.target.value)}
                            placeholder="Input data"
                            className="input font-mono text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-0.5">Expected Output</label>
                          <textarea
                            rows={2}
                            value={tc.expectedOutput}
                            onChange={(e) => updateTestCase(idx, "expectedOutput", e.target.value)}
                            placeholder="Expected stdout"
                            className="input font-mono text-xs"
                          />
                        </div>
                      </div>

                      {!tc.isHidden && (
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-0.5">Explanation (optional)</label>
                          <input
                            type="text"
                            value={tc.explanation || ""}
                            onChange={(e) => updateTestCase(idx, "explanation", e.target.value)}
                            placeholder="Explanation shown with sample test case"
                            className="input text-xs"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                  {codingForm.testCases.length === 0 && (
                    <div className="text-center p-4 border border-dashed border-slate-300 rounded-lg text-slate-400 text-xs">
                      No test cases configured. Click "+ Add Test Case" to add one.
                    </div>
                  )}
                </div>
              </div>

              {/* Admin Test Run Sandbox */}
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/60 space-y-2">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-xs font-semibold text-slate-800">Sandbox Verification</span>
                    <p className="text-[11px] text-slate-500">Test execute template solution against all test cases</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={testRunLanguage}
                      onChange={(e) => setTestRunLanguage(e.target.value)}
                      className="bg-white border border-slate-300 rounded px-2 py-1 text-xs font-semibold text-slate-700 cursor-pointer shadow-2xs"
                      title="Select compiler / runtime for test execution"
                    >
                      <option value="c">C (GCC)</option>
                      <option value="python">Python 3</option>
                      <option value="java">Java 21</option>
                    </select>
                    <button
                      type="button"
                      onClick={handleAdminTestRun}
                      disabled={testingCode || codingForm.testCases.length === 0}
                      className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {testingCode ? "⏳ Running..." : "▶ Test Run"}
                    </button>
                  </div>
                </div>

                {testRunError && (
                  <p className="text-rose-600 text-xs bg-rose-50 border border-rose-200 p-2 rounded">
                    {testRunError}
                  </p>
                )}

                {testRunResult && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-200">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-slate-700">
                        Result: {testRunResult.passedCases} / {testRunResult.totalCases} Passed
                      </span>
                      <span className="text-slate-500 font-mono text-[11px]">
                        {testRunResult.executionTimeMs} ms
                      </span>
                    </div>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {testRunResult.results.map((res, i) => (
                        <div
                          key={i}
                          className={`p-2 rounded text-[11px] border font-mono ${
                            res.passed
                              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                              : "bg-rose-50 border-rose-200 text-rose-800"
                          }`}
                        >
                          <div className="flex justify-between font-bold">
                            <span>Case #{res.testCaseIndex + 1}</span>
                            <span>{res.status} ({res.executionTimeMs}ms)</span>
                          </div>
                          {!res.passed && (
                            <div className="mt-1 space-y-0.5">
                              <div>Expected: {res.expectedOutput}</div>
                              <div>Actual: {res.actualOutput || res.errorMessage || "<none>"}</div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {error && <p className="text-rose-600 text-xs bg-rose-50 p-2 rounded">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer w-full"
              >
                {submitting ? "Adding…" : "+ Add Coding Question"}
              </button>
            </form>
          )}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-slate-900 text-sm">Question Bank ({questions.length})</h3>
          <span className="text-xs text-slate-400">Total marks: {questions.reduce((acc, q) => acc + (Number(q.marks) || 0), 0)}</span>
        </div>

        {questions.map((q, idx) => {
          const isCoding = q.questionType === "CODING";
          const isCoordinatorQuestion = Boolean(q.createdByCoordinator) || q.createdByRole === "COURSE_COORDINATOR";
          const isProtectedFromProf = isClassMode && isProfessorUser && isCoordinatorQuestion;

          return (
            <div key={q.id} className="bg-white border border-slate-200 rounded-xl p-4 text-sm shadow-xs space-y-3">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                    Q{idx + 1}
                  </span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded ${
                      isCoding
                        ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                        : "bg-blue-50 text-blue-700 border border-blue-200"
                    }`}
                  >
                    {isCoding ? "💻 CODING" : "🔘 MCQ"}
                  </span>
                  <span className="text-xs text-slate-400 font-medium">
                    {q.marks} mark{q.marks !== 1 ? "s" : ""}
                  </span>
                  {isCoordinatorQuestion && (
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded flex items-center gap-1 shadow-2xs">
                      <span>🔒</span> Provided by Course Coordinator
                    </span>
                  )}
                  {!isCoordinatorQuestion && isClassMode && (
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded flex items-center gap-1 shadow-2xs">
                      <span>✍️</span> Added by Faculty
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {isProtectedFromProf ? (
                    <span className="text-[11px] font-semibold text-slate-400 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded select-none flex items-center gap-1" title="Coordinator questions cannot be modified by assigned professors">
                      <span>🔒</span> Locked
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => startEditing(q)}
                        className="text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded transition-colors cursor-pointer"
                      >
                        Edit / Correct
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteQuestion(q.id)}
                        disabled={deletingQuestionId === q.id}
                        className="text-xs font-medium text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {deletingQuestionId === q.id ? "…" : "Delete"}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {isCoding ? (
                <div className="space-y-2">
                  <h4 className="font-bold text-slate-900 text-sm">{q.problemTitle || "Coding Problem"}</h4>
                  <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed line-clamp-3">
                    {q.questionText}
                  </p>
                  {q.constraints && (
                    <div className="p-2 bg-slate-50 border border-slate-200 rounded text-[11px] font-mono text-slate-600">
                      <strong>Constraints:</strong> {q.constraints}
                    </div>
                  )}
                  <div className="flex items-center gap-3 pt-1 text-xs text-slate-500">
                    <span className="font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                      {q.testCases?.length || 0} Test Cases (
                      {q.testCases?.filter((tc) => !tc.isHidden).length || 0} sample,{" "}
                      {q.testCases?.filter((tc) => tc.isHidden).length || 0} hidden)
                    </span>
                    <span>Languages: {(q.allowedLanguages || "c,python,java").toUpperCase()}</span>
                  </div>
                </div>
              ) : (
                <>
                  <p className="font-medium text-slate-800 text-sm leading-relaxed">{q.questionText}</p>
                  <ul className="space-y-1.5 text-xs text-slate-600">
                    {[q.optionA, q.optionB, q.optionC, q.optionD].map((opt, i) => (
                      <li
                        key={i}
                        className={`p-2 rounded-lg flex items-center justify-between ${
                          i === q.correctAnswer
                            ? "bg-emerald-50 text-emerald-900 font-semibold border border-emerald-200"
                            : "bg-slate-50"
                        }`}
                      >
                        <span>
                          <strong className="mr-1.5">{String.fromCharCode(65 + i)}.</strong>
                          {opt}
                        </span>
                        {i === q.correctAnswer && (
                          <span className="text-emerald-600 font-bold text-[11px] shrink-0">✓ Correct</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          );
        })}

        {questions.length === 0 && (
          <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl bg-white">
            No questions added yet. Use the form to configure questions.
          </div>
        )}
      </div>

      {/* Edit Question Modal */}
      {editingQuestion && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 space-y-4 border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Edit {editForm.questionType === "CODING" ? "Coding Problem" : "MCQ Question"}
                </h3>
                <p className="text-xs text-slate-500">Update problem details, options, or test cases</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingQuestion(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateQuestion} className="space-y-4">
              {editForm.questionType === "CODING" ? (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Problem Title</label>
                      <input
                        required
                        value={editForm.problemTitle}
                        onChange={(e) => setEditForm((f) => ({ ...f, problemTitle: e.target.value }))}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Marks</label>
                      <input
                        type="number"
                        min={1}
                        step="1"
                        value={editForm.marks}
                        onChange={(e) => setEditForm((f) => ({ ...f, marks: e.target.value }))}
                        onBlur={() => {
                          if (editForm.marks === "" || Number(editForm.marks) < 1) {
                            setEditForm((f) => ({ ...f, marks: 1 }));
                          }
                        }}
                        className="input"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Problem Statement</label>
                    <textarea
                      required
                      rows={3}
                      value={editForm.questionText}
                      onChange={(e) => setEditForm((f) => ({ ...f, questionText: e.target.value }))}
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Constraints</label>
                    <textarea
                      rows={2}
                      value={editForm.constraints}
                      onChange={(e) => setEditForm((f) => ({ ...f, constraints: e.target.value }))}
                      className="input font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Allowed Programming Languages
                    </label>
                    <div className="flex items-center gap-4 text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                      {[
                        { id: "c", label: "C (GCC)" },
                        { id: "python", label: "Python 3" },
                        { id: "java", label: "Java 21" },
                      ].map(({ id, label }) => {
                        const currentLangs = (editForm.allowedLanguages || "c,python,java")
                          .split(",")
                          .map((l) => l.trim().toLowerCase());
                        const checked = currentLangs.includes(id);
                        return (
                          <label key={id} className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-700 select-none">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                let next: string[];
                                if (e.target.checked) {
                                  next = [...currentLangs, id];
                                } else {
                                  next = currentLangs.filter((l) => l !== id);
                                  if (next.length === 0) next = [id];
                                }
                                setEditForm((f) => ({ ...f, allowedLanguages: next.join(",") }));
                              }}
                              className="rounded text-blue-600 focus:ring-blue-500"
                            />
                            <span>{label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Code Template</label>
                    <textarea
                      rows={4}
                      value={editForm.codeTemplate}
                      onChange={(e) => setEditForm((f) => ({ ...f, codeTemplate: e.target.value }))}
                      className="input font-mono text-xs bg-slate-900 text-emerald-400 p-2"
                    />
                  </div>

                  <div className="space-y-2 border-t border-slate-100 pt-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-800">
                        Test Cases ({editForm.testCases.length})
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <input
                          type="file"
                          ref={editTestCaseFileInputRef}
                          accept=".csv,.xlsx,.xls"
                          onChange={handleEditTestCaseFileUpload}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => editTestCaseFileInputRef.current?.click()}
                          className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 px-2 py-1 rounded cursor-pointer flex items-center gap-1 shadow-2xs"
                          title="Upload CSV / Excel containing test cases"
                        >
                          <span>📥</span> Import CSV ({editForm.testCases.length} loaded)
                        </button>
                        <button
                          type="button"
                          onClick={downloadSampleTestCasesCsv}
                          className="text-xs font-medium text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-2 py-1 rounded cursor-pointer"
                          title="Download sample 15 test cases CSV template"
                        >
                          <span>📄</span> 15 Cases Template
                        </button>
                        <button
                          type="button"
                          onClick={addEditTestCase}
                          className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded cursor-pointer"
                        >
                          + Add Test Case
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 max-h-52 overflow-y-auto">
                      {editForm.testCases.map((tc, idx) => (
                        <div key={idx} className="p-2.5 rounded border border-slate-200 bg-slate-50 space-y-2 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="font-bold">Case #{idx + 1}</span>
                            <div className="flex items-center gap-2">
                              <label className="flex items-center gap-1 cursor-pointer text-slate-600">
                                <input
                                  type="checkbox"
                                  checked={tc.isHidden}
                                  onChange={(e) => updateEditTestCase(idx, "isHidden", e.target.checked)}
                                />
                                Hidden
                              </label>
                              <button
                                type="button"
                                onClick={() => removeEditTestCase(idx)}
                                className="text-rose-500 font-bold ml-2 cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <textarea
                              rows={2}
                              value={tc.input}
                              onChange={(e) => updateEditTestCase(idx, "input", e.target.value)}
                              placeholder="Input"
                              className="input font-mono text-xs"
                            />
                            <textarea
                              rows={2}
                              value={tc.expectedOutput}
                              onChange={(e) => updateEditTestCase(idx, "expectedOutput", e.target.value)}
                              placeholder="Expected Output"
                              className="input font-mono text-xs"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Question Text</label>
                    <textarea
                      required
                      rows={3}
                      value={editForm.questionText}
                      onChange={(e) => setEditForm((f) => ({ ...f, questionText: e.target.value }))}
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Options (Select radio button for the correct option)
                    </label>
                    {(["optionA", "optionB", "optionC", "optionD"] as const).map((key, idx) => (
                      <div key={key} className="flex items-center gap-2 mb-2">
                        <input
                          type="radio"
                          name="editCorrect"
                          checked={editForm.correctAnswer === idx}
                          onChange={() => setEditForm((f) => ({ ...f, correctAnswer: idx }))}
                          className="cursor-pointer"
                          title="Set as correct answer"
                        />
                        <span className="text-xs font-bold text-slate-500 w-4">{String.fromCharCode(65 + idx)}.</span>
                        <input
                          required
                          placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                          value={editForm[key]}
                          onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                          className="input"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="text-xs font-semibold text-slate-700">Marks</label>
                    <input
                      type="number"
                      min={0.5}
                      step="0.5"
                      value={editForm.marks}
                      onChange={(e) => setEditForm((f) => ({ ...f, marks: e.target.value }))}
                      onBlur={() => {
                        if (editForm.marks === "" || Number(editForm.marks) <= 0) {
                          setEditForm((f) => ({ ...f, marks: 1 }));
                        }
                      }}
                      className="input w-24"
                    />
                  </div>
                </>
              )}

              {editError && <p className="text-rose-600 text-xs bg-rose-50 p-2 rounded">{editError}</p>}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingQuestion(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  {editSubmitting ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Upload Questions Modal (.xlsx, .xls, .csv) */}
      {showBulkUploadModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto font-sans">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-6 space-y-4 border border-slate-200 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <span>📊</span> Bulk Upload Questions (Excel &amp; CSV)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Upload multiple Multiple Choice (MCQ) and Coding questions at once from an Excel workbook (.xlsx, .xls) or CSV spreadsheet.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowBulkUploadModal(false);
                  setParsedBulkQuestions([]);
                  setBulkFile(null);
                  setBulkError(null);
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {/* Template Download Section */}
            <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div>
                <div className="font-semibold text-blue-900 flex items-center gap-1.5">
                  <span>📥</span> Download sample format templates
                </div>
                <p className="text-blue-700 text-[11px] mt-0.5">
                  Pre-configured headers with sample MCQ &amp; LeetCode Coding questions ready to fill in.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={downloadSampleQuestionsExcel}
                  className="bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 font-semibold px-3 py-1.5 rounded-lg shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span>📗</span> Download Excel (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={downloadSampleQuestionsCsv}
                  className="bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 font-semibold px-3 py-1.5 rounded-lg shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span>📄</span> Download CSV (.csv)
                </button>
                <button
                  type="button"
                  onClick={downloadSampleTestCasesCsv}
                  className="bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 font-semibold px-3 py-1.5 rounded-lg shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
                  title="Download sample CSV with 15 test cases"
                >
                  <span>🧪</span> 15 Cases CSV (.csv)
                </button>
              </div>
            </div>

            {/* File Dropzone / Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                Select or Drop Question File (.xlsx, .xls, .csv)
              </label>
              <div className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-xl p-6 text-center bg-slate-50/50 hover:bg-emerald-50/20 transition-all relative">
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleBulkFileSelect}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="space-y-1.5 pointer-events-none">
                  <div className="text-3xl">📂</div>
                  <div className="text-xs font-semibold text-slate-700">
                    {bulkFile ? bulkFile.name : "Click to browse or drag & drop questions file here"}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Supports Microsoft Excel (.xlsx, .xls) and Comma-Separated Values (.csv)
                  </p>
                </div>
              </div>
            </div>

            {/* Parsing State & Errors */}
            {bulkParsing && (
              <div className="p-3 text-xs bg-slate-100 text-slate-600 rounded-lg animate-pulse flex items-center gap-2">
                <span>⏳</span> Reading and validating questions spreadsheet…
              </div>
            )}

            {bulkError && (
              <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg">
                ⚠️ {bulkError}
              </div>
            )}

            {bulkSuccessMsg && (
              <div className="p-3 text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg font-medium">
                ✓ {bulkSuccessMsg}
              </div>
            )}

            {/* Questions Preview Table */}
            {parsedBulkQuestions.length > 0 && (
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-800">
                    Parsed Questions Preview ({parsedBulkQuestions.length} total)
                  </span>
                  <div className="flex items-center gap-3 text-slate-500 text-[11px]">
                    <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-semibold">
                      {parsedBulkQuestions.filter(q => q.questionType === "MCQ").length} MCQ
                    </span>
                    <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-semibold">
                      {parsedBulkQuestions.filter(q => q.questionType === "CODING").length} Coding
                    </span>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="p-2.5 w-12 text-center">#</th>
                        <th className="p-2.5 w-20">Type</th>
                        <th className="p-2.5">Question / Problem Title</th>
                        <th className="p-2.5 w-24">Marks</th>
                        <th className="p-2.5 w-32">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {parsedBulkQuestions.slice(0, 50).map((pq, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/70">
                          <td className="p-2.5 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                          <td className="p-2.5">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              pq.questionType === "CODING"
                                ? "bg-indigo-100 text-indigo-800"
                                : "bg-blue-100 text-blue-800"
                            }`}>
                              {pq.questionType}
                            </span>
                          </td>
                          <td className="p-2.5 text-slate-800 font-medium max-w-xs truncate">
                            {pq.questionType === "CODING" ? pq.problemTitle : pq.questionText}
                          </td>
                          <td className="p-2.5 font-mono text-slate-600">{pq.marks} pts</td>
                          <td className="p-2.5 text-slate-500 text-[11px]">
                            {pq.questionType === "CODING"
                              ? `${pq.testCases?.length || 0} Testcase(s) (${pq.testCases?.filter((t: any) => !t.isHidden).length || 0} Sample, ${pq.testCases?.filter((t: any) => t.isHidden).length || 0} Hidden)`
                              : `Ans: ${String.fromCharCode(65 + (pq.correctAnswer || 0))}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsedBulkQuestions.length > 50 && (
                  <p className="text-[11px] text-slate-400 text-center">
                    Showing first 50 of {parsedBulkQuestions.length} questions. All will be imported.
                  </p>
                )}
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowBulkUploadModal(false);
                  setParsedBulkQuestions([]);
                  setBulkFile(null);
                  setBulkError(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkUploadSubmit}
                disabled={bulkSubmitting || parsedBulkQuestions.length === 0}
                className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                {bulkSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Importing Questions…</span>
                  </>
                ) : (
                  <>
                    <span>✓</span>
                    <span>Confirm &amp; Import ({parsedBulkQuestions.length}) Questions</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AssignTab({ exam, onExamUpdated }: { exam: Exam; onExamUpdated?: (exam: Exam) => void }) {
  const examId = exam.id;
  const [openToAll, setOpenToAll] = useState(Boolean(exam.openToAll));
  const [togglingOpen, setTogglingOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [emails, setEmails] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [assignments, setAssignments] = useState<ExamAssignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");
  const [unassigningId, setUnassigningId] = useState<number | null>(null);
  const [recentCredentials, setRecentCredentials] = useState<Array<{ email: string; password: string }> | null>(null);
  const [fileUploading, setFileUploading] = useState(false);
  const [fileSuccessMsg, setFileSuccessMsg] = useState<string | null>(null);
  const [copiedPasswordId, setCopiedPasswordId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Class Section & Year state (strictly from Group Student registry)
  const [assignMode, setAssignMode] = useState<"section" | "manual" | "file">("section");
  const [allStudents, setAllStudents] = useState<StudentUser[]>([]);
  const [classSections, setClassSections] = useState<ClassSectionItem[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>("ALL");
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");
  const [previewSearch, setPreviewSearch] = useState<string>("");

  useEffect(() => {
    api
      .get<StudentUser[]>("/api/admin/students", "admin")
      .then((data) => {
        setAllStudents(data);
        const sections = loadSavedClassSections(data);
        setClassSections(sections);
        if (sections.length > 0) {
          setSelectedSectionId(sections[0].id);
        }
      })
      .catch((err) => {
        console.warn("Could not load students for class sections", err);
        const fallback = loadSavedClassSections();
        setClassSections(fallback);
        if (fallback.length > 0) {
          setSelectedSectionId(fallback[0].id);
        }
      });
  }, []);

  // Listen for storage changes from the Group Student page
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "proctor_class_sections_registry_v2") {
        const sections = loadSavedClassSections(allStudents);
        setClassSections(sections);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [allStudents]);

  const availableSections = useMemo(() => {
    if (selectedYear === "ALL") return classSections;
    return classSections.filter((s) => matchesYear(s.year, selectedYear));
  }, [classSections, selectedYear]);

  // Keep selectedSectionId valid when availableSections change
  useEffect(() => {
    if (availableSections.length > 0) {
      if (!availableSections.some((s) => s.id === selectedSectionId)) {
        setSelectedSectionId(availableSections[0].id);
      }
    } else {
      setSelectedSectionId("");
    }
  }, [availableSections, selectedSectionId]);

  const activeSection = useMemo(() => {
    return classSections.find((s) => s.id === selectedSectionId) || null;
  }, [classSections, selectedSectionId]);

  const sectionStudents = useMemo(() => {
    if (!activeSection) return [];
    return getStudentsForClassSection(activeSection, allStudents);
  }, [activeSection, allStudents]);

  const assignedEmailSet = useMemo(() => {
    return new Set(assignments.map((a) => (a.studentEmail || "").toLowerCase().trim()));
  }, [assignments]);

  const sectionNewStudents = useMemo(() => {
    return sectionStudents.filter((s) => !assignedEmailSet.has((s.email || "").toLowerCase().trim()));
  }, [sectionStudents, assignedEmailSet]);

  const filteredPreviewStudents = useMemo(() => {
    const q = previewSearch.toLowerCase().trim();
    if (!q) return sectionStudents;
    return sectionStudents.filter(
      (s) =>
        (s.registerNumber || "").toLowerCase().includes(q) ||
        (s.fullName || "").toLowerCase().includes(q) ||
        (s.email || "").toLowerCase().includes(q)
    );
  }, [sectionStudents, previewSearch]);

  async function assignSectionStudents() {
    if (!activeSection) return;
    const emailsToAssign = sectionStudents.map((s) => s.email.trim()).filter(Boolean);
    if (emailsToAssign.length === 0) {
      setStatus(`No registered students found in Section "${activeSection.className}" to assign.`);
      return;
    }
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await api.post<{
        assigned: number;
        skipped: number;
        credentials?: Array<{ email: string; password: string }>;
      }>(`/api/admin/exams/${examId}/assign`, { emails: emailsToAssign }, "admin");

      setStatus(
        `✓ Assigned ${res.assigned} student(s) from Section "${activeSection.className}" (${res.skipped} already assigned). Random passwords generated.`
      );
      if (res.credentials && res.credentials.length > 0) {
        setRecentCredentials(res.credentials);
      }
      loadAssignments();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to assign students from section.");
    } finally {
      setSubmitting(false);
    }
  }

  const studentLink = `${window.location.origin}/exam/${exam.id}`;

  useEffect(() => {
    setOpenToAll(Boolean(exam.openToAll));
  }, [exam.openToAll]);

  function loadAssignments() {
    setLoading(true);
    api
      .get<ExamAssignmentItem[]>(`/api/admin/exams/${examId}/assignments`, "admin")
      .then(setAssignments)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadAssignments();
  }, [examId]);

  async function toggleOpenToAll() {
    setTogglingOpen(true);
    const target = !openToAll;
    try {
      let updated: Exam;
      try {
        updated = await api.post<Exam>(
          `/api/admin/exams/${examId}/open-to-all`,
          { openToAll: target },
          "admin"
        );
      } catch (err: any) {
        if (err?.message?.includes("No static resource") || err?.status === 404) {
          updated = await api.put<Exam>(
            `/api/admin/exams/${examId}`,
            {
              name: exam.name,
              durationMinutes: exam.durationMinutes,
              numQuestions: exam.numQuestions,
              openToAll: target,
            },
            "admin"
          );
        } else {
          throw err;
        }
      }
      setOpenToAll(Boolean(updated.openToAll));
      if (onExamUpdated) onExamUpdated(updated);
      setStatus(
        target
          ? "✓ Exam is now OPEN TO ALL. Any candidate can write this exam!"
          : "✓ Exam is now RESTRICTED. Only assigned candidates can write."
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to toggle open access mode.";
      if (msg.includes("No static resource") || msg.includes("404")) {
        alert("The backend needs a restart to activate this new feature. In your backend terminal, press Ctrl+C and run: .\\mvnw.cmd spring-boot:run");
      } else {
        alert(msg);
      }
    } finally {
      setTogglingOpen(false);
    }
  }

  function copyExamLink() {
    navigator.clipboard.writeText(studentLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileSuccessMsg(null);
    setFileUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error("Uploaded file has no worksheets.");
      const sheet = workbook.Sheets[firstSheetName];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i;
      const extracted: string[] = [];

      for (const row of rows) {
        if (!row || !row.length) continue;
        for (const cell of row) {
          if (cell != null) {
            const str = String(cell).trim();
            const match = str.match(emailRegex);
            if (match) {
              extracted.push(match[0].toLowerCase());
            }
          }
        }
      }

      const unique = Array.from(new Set(extracted));
      if (unique.length === 0) {
        throw new Error("No valid email addresses found in the uploaded file.");
      }

      setEmails((prev) => {
        const existing = prev.split(/[\n,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
        const merged = Array.from(new Set([...existing, ...unique]));
        return merged.join("\n");
      });

      setFileSuccessMsg(`✓ Extracted ${unique.length} email ID(s) from "${file.name}". Click "Assign Students" to generate their access passwords.`);
    } catch (err: any) {
      alert(err instanceof Error ? err.message : "Failed to parse file.");
    } finally {
      setFileUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function exportCredentialsCsv() {
    if (!assignments.length) return;
    const rows = [
      ["Student Email", "Exam Access Password", "Assigned Date"],
      ...assignments.map((a) => [a.studentEmail, a.accessPassword || "", new Date(a.createdAt).toLocaleString()])
    ];
    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.map((c) => `"${c}"`).join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `exam_${examId}_student_credentials.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function copyAllCredentials() {
    if (!assignments.length) return;
    const text = assignments.map((a) => `${a.studentEmail}\t${a.accessPassword || "N/A"}`).join("\n");
    navigator.clipboard.writeText(text);
    alert(`Copied ${assignments.length} student access credentials to clipboard!`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    setFileSuccessMsg(null);
    const list = emails.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    if (!list.length) return;
    setSubmitting(true);
    try {
      const res = await api.post<{
        assigned: number;
        skipped: number;
        credentials?: Array<{ email: string; password: string }>;
      }>(`/api/admin/exams/${examId}/assign`, { emails: list }, "admin");
      setStatus(`✓ Assigned ${res.assigned} student(s) (${res.skipped} already assigned). Random passwords generated.`);
      if (res.credentials && res.credentials.length > 0) {
        setRecentCredentials(res.credentials);
      }
      setEmails("");
      loadAssignments();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Assignment failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function unassignStudent(id: number, email: string) {
    if (!window.confirm(`Unassign student ${email}?`)) return;
    setUnassigningId(id);
    try {
      await api.delete(`/api/admin/exams/${examId}/assignments/${id}`, "admin");
      setAssignments((prev) => prev.filter((a) => a.id !== id));
      setStatus(`✓ Unassigned ${email}.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to unassign student.");
    } finally {
      setUnassigningId(null);
    }
  }

  const filtered = assignments.filter((a) =>
    a.studentEmail.toLowerCase().includes(searchFilter.toLowerCase().trim())
  );

  return (
    <div className="space-y-6">
      {/* Open to All Feature Card */}
      <div
        className={`border rounded-2xl p-6 transition-all duration-200 shadow-xs ${
          openToAll
            ? "bg-gradient-to-br from-emerald-50/90 via-teal-50/60 to-emerald-50/90 border-emerald-300"
            : "bg-slate-50/90 border-slate-200"
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
                openToAll
                  ? "bg-emerald-600 text-white shadow-emerald-200"
                  : "bg-slate-200 text-slate-600"
              }`}
            >
              {openToAll ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="font-bold text-slate-900 text-base">
                  {openToAll ? "Open to All Candidates (Public Exam)" : "Restricted Access (Invite-Only)"}
                </h3>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase ${
                    openToAll
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                      : "bg-slate-200 text-slate-700 border border-slate-300"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      openToAll ? "bg-emerald-500 animate-pulse" : "bg-slate-500"
                    }`}
                  />
                  {openToAll ? "Open Access Active" : "Invite-Only"}
                </span>
              </div>
              <p className="text-slate-600 text-xs mt-1 max-w-2xl leading-relaxed">
                {openToAll
                  ? "Anyone with an email address can access and write this examination without prior assignment. When students verify on the exam portal, they are automatically enrolled and will show up in the student list below."
                  : "Only students whose email addresses are explicitly assigned below can take this exam. Enable 'Open to All' if you want any candidate to be able to sit for this exam."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              disabled={togglingOpen}
              onClick={toggleOpenToAll}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-2 ${
                openToAll
                  ? "bg-white text-emerald-800 border border-emerald-300 hover:bg-emerald-50"
                  : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200"
              }`}
            >
              {togglingOpen ? (
                "Updating..."
              ) : openToAll ? (
                <>
                  <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Disable Open to All
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Enable Open to All
                </>
              )}
            </button>
          </div>
        </div>

        {/* Shareable Link Box */}
        <div className="mt-4 pt-4 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-600 truncate">
            <span className="font-semibold text-slate-700 shrink-0">Student Exam Link:</span>
            <code className="bg-white/80 px-2.5 py-1 rounded-md border border-slate-200 font-mono text-[11px] text-slate-800 truncate select-all">
              {studentLink}
            </code>
          </div>
          <button
            type="button"
            onClick={copyExamLink}
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors shrink-0 shadow-2xs cursor-pointer flex items-center gap-1.5"
          >
            {copiedLink ? (
              <>
                <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-emerald-700 font-bold">Link Copied!</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>Copy Exam Link</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Recent Credentials Banner (When students are newly assigned) */}
      {recentCredentials && recentCredentials.length > 0 && (
        <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🔑</span>
              <div>
                <h4 className="font-bold text-emerald-950 text-sm">
                  Generated Exam Access Passwords ({recentCredentials.length})
                </h4>
                <p className="text-emerald-700 text-xs">
                  Each student must enter their assigned email and random password to start the exam.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const text = recentCredentials.map((c) => `${c.email}\t${c.password}`).join("\n");
                  navigator.clipboard.writeText(text);
                  alert("Copied credentials to clipboard!");
                }}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-700 transition cursor-pointer shadow-xs"
              >
                📋 Copy Credentials
              </button>
              <button
                type="button"
                onClick={() => setRecentCredentials(null)}
                className="text-xs text-slate-500 hover:text-slate-800 font-medium px-2 py-1 cursor-pointer"
              >
                ✕ Dismiss
              </button>
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto divide-y divide-emerald-200/60 bg-white/80 rounded-xl border border-emerald-200">
            {recentCredentials.map((c, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                <span className="font-medium text-slate-800">{c.email}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded font-bold tracking-wider">
                    {c.password}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(c.password);
                      alert(`Password for ${c.email} copied!`);
                    }}
                    className="text-[11px] text-blue-600 hover:underline cursor-pointer"
                  >
                    Copy
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Assign Options Box */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 h-fit shadow-xs">
        {/* Assignment Mode Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80">
          <button
            type="button"
            onClick={() => {
              setAssignMode("section");
              setStatus(null);
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              assignMode === "section"
                ? "bg-white text-blue-700 shadow-xs border border-slate-200"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>🏫</span>
            <span>By Class & Section</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setAssignMode("manual");
              setStatus(null);
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              assignMode === "manual"
                ? "bg-white text-blue-700 shadow-xs border border-slate-200"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>✉️</span>
            <span>Manual Emails</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setAssignMode("file");
              setStatus(null);
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              assignMode === "file"
                ? "bg-white text-blue-700 shadow-xs border border-slate-200"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>📄</span>
            <span>Upload File</span>
          </button>
        </div>

        {/* MODE 1: BY CLASS SECTION & YEAR */}
        {assignMode === "section" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Assign by Class Section & Year</h3>
                <p className="text-slate-500 text-xs mt-0.5">
                  Select the Year and Section of the class. Only sections configured in the Group Student registry are available.
                </p>
              </div>
              <Link
                to="/admin?tab=students"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 transition shrink-0"
                title="Open Group Student Page in new tab to add or configure sections"
              >
                <span>⚙️ Group Registry</span>
                <span className="text-[10px]">↗</span>
              </Link>
            </div>

            {/* Step 1: Select Year */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                1. Select Class Year:
              </label>
              <div className="grid grid-cols-5 gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200">
                {[
                  { id: "ALL", label: "All Years" },
                  { id: "1st Year", label: "1st Year (I)" },
                  { id: "2nd Year", label: "2nd Year (II)" },
                  { id: "3rd Year", label: "3rd Year (III)" },
                  { id: "4th Year", label: "4th Year (IV)" },
                ].map((y) => (
                  <button
                    key={y.id}
                    type="button"
                    onClick={() => setSelectedYear(y.id)}
                    className={`py-1.5 px-1 rounded-lg text-[11px] font-bold text-center transition-all cursor-pointer ${
                      selectedYear === y.id
                        ? "bg-blue-600 text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                    }`}
                  >
                    {y.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2: Select Section (Strictly from Group Student page) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                2. Select Class Section:
                <span className="text-[11px] font-normal text-slate-500 ml-1.5">
                  ({availableSections.length} section{availableSections.length === 1 ? "" : "s"} available for {selectedYear === "ALL" ? "all years" : selectedYear})
                </span>
              </label>

              {availableSections.length === 0 ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                  <p className="font-semibold">⚠️ No sections registered for {selectedYear}.</p>
                  <p className="mt-0.5 text-[11px]">
                    Go to the <Link to="/admin?tab=students" target="_blank" className="underline font-bold">Group Student page</Link> to configure class sections.
                  </p>
                </div>
              ) : (
                <select
                  value={selectedSectionId}
                  onChange={(e) => setSelectedSectionId(e.target.value)}
                  className="input text-xs w-full font-medium py-2 bg-white"
                >
                  {availableSections.map((sec) => (
                    <option key={sec.id} value={sec.id}>
                      {sec.className} — {sec.department || "Dept"} ({sec.startReg || "..."} to {sec.endReg || "..."})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Step 3: Section Details & Matching Students Preview Card */}
            {activeSection && (
              <div className="bg-slate-50/90 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">
                        {activeSection.className}
                      </span>
                      <span className="text-[11px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-semibold">
                        {activeSection.year || "Year"}
                      </span>
                      <span className="text-[11px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded">
                        {activeSection.department || "All Depts"}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1 flex items-center gap-2">
                      <span>Register Range:</span>
                      <code className="bg-white border border-slate-200 px-1.5 py-0.5 rounded font-mono text-slate-800 font-bold">
                        {activeSection.startReg || "Start"} → {activeSection.endReg || "End"}
                      </code>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                    <span className="text-[11px] bg-emerald-100 text-emerald-800 font-bold px-2 py-1 rounded">
                      {sectionStudents.length} Students Enrolled
                    </span>
                  </div>
                </div>

                {/* Assignment Status Pill Breakdown */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">Ready to Assign:</span>
                    <span className="font-bold text-emerald-600 text-sm">{sectionNewStudents.length}</span>
                    <span className="text-[11px] text-slate-400 ml-1">students</span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">Already Assigned:</span>
                    <span className="font-bold text-slate-700 text-sm">{sectionStudents.length - sectionNewStudents.length}</span>
                    <span className="text-[11px] text-slate-400 ml-1">students</span>
                  </div>
                </div>

                {/* Students Preview List with Search */}
                {sectionStudents.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-slate-700">
                        Class List Preview ({filteredPreviewStudents.length}/{sectionStudents.length}):
                      </span>
                      {sectionStudents.length > 5 && (
                        <input
                          type="text"
                          placeholder="Search in section..."
                          value={previewSearch}
                          onChange={(e) => setPreviewSearch(e.target.value)}
                          className="input text-[11px] py-0.5 px-2 w-36 bg-white"
                        />
                      )}
                    </div>

                    <div className="max-h-40 overflow-y-auto divide-y divide-slate-200/80 bg-white rounded-lg border border-slate-200 text-xs">
                      {filteredPreviewStudents.map((st) => {
                        const isAssigned = assignedEmailSet.has((st.email || "").toLowerCase().trim());
                        return (
                          <div key={st.id} className="flex items-center justify-between px-3 py-1.5">
                            <div className="flex items-center gap-2 truncate pr-2">
                              <span className="font-mono text-blue-700 font-bold shrink-0">
                                {st.registerNumber}
                              </span>
                              <span className="text-slate-800 font-medium truncate">{st.fullName}</span>
                              <span className="text-slate-400 text-[11px] truncate">({st.email})</span>
                            </div>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded font-bold shrink-0 ${
                                isAssigned
                                  ? "bg-slate-100 text-slate-600 border border-slate-200"
                                  : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                              }`}
                            >
                              {isAssigned ? "Assigned" : "Ready"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                    <p className="font-semibold">ℹ️ No registered students match this section range.</p>
                    <p className="mt-0.5 text-[11px] text-amber-700">
                      Students registered in the database whose register numbers fall between <strong>{activeSection.startReg}</strong> and <strong>{activeSection.endReg}</strong> ({activeSection.year}) will appear here automatically.
                    </p>
                  </div>
                )}

                {/* Section Assign Action Button */}
                <button
                  type="button"
                  onClick={assignSectionStudents}
                  disabled={submitting || sectionStudents.length === 0}
                  className="w-full bg-blue-600 text-white px-4 py-2.5 rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer shadow-xs flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    "Assigning Section & Generating Passwords…"
                  ) : (
                    <>
                      <span>🏫</span>
                      <span>
                        Assign {sectionStudents.length} Students from {activeSection.className}
                      </span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* MODE 2: ENTER EMAILS MANUALLY */}
        {assignMode === "manual" && (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Assign Students by Email</h3>
              <p className="text-slate-500 text-xs mt-0.5">
                Enter candidate emails below (one per line, or comma-separated). A random access password will be generated for each student.
              </p>
            </div>
            <textarea
              rows={5}
              placeholder="student1@example.com&#10;student2@example.com"
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              className="input font-mono text-xs w-full"
            />
            <button
              type="submit"
              disabled={submitting || (!emails.trim())}
              className="w-full bg-blue-600 text-white px-4 py-2.5 rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {submitting ? "Assigning & Generating Passwords…" : "Assign Students"}
            </button>
          </form>
        )}

        {/* MODE 3: UPLOAD EXCEL / CSV FILE */}
        {assignMode === "file" && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Upload Excel or CSV File</h3>
              <p className="text-slate-500 text-xs mt-0.5">
                Upload a spreadsheet containing student email addresses. Emails will be extracted automatically.
              </p>
            </div>

            <div className="border border-dashed border-slate-300 rounded-xl p-5 bg-slate-50/70 hover:bg-slate-50 transition-colors text-center">
              <span className="text-2xl block mb-2">📄</span>
              <p className="text-xs font-semibold text-slate-700 mb-1">
                Select your spreadsheet (.xlsx, .xls, .csv)
              </p>
              <p className="text-[11px] text-slate-500 mb-3">
                The file can contain a column of student email addresses.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
                id="assign-file-input"
              />
              <label
                htmlFor="assign-file-input"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer shadow-2xs transition"
              >
                <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {fileUploading ? "Reading file…" : "Choose .xlsx, .xls or .csv"}
              </label>

              {fileSuccessMsg && (
                <div className="text-[11px] font-medium text-emerald-700 mt-3 bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg text-left">
                  {fileSuccessMsg}
                </div>
              )}
            </div>

            {emails.trim() && (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Extracted Emails ({emails.split(/[\n,]+/).filter(Boolean).length}):
                </label>
                <textarea
                  rows={3}
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                  className="input font-mono text-xs w-full bg-slate-50"
                />
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting}
                  className="w-full bg-blue-600 text-white px-4 py-2.5 rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {submitting ? "Assigning & Generating Passwords…" : `Assign Extracted Students`}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Global Status Message */}
        {status && (
          <p
            className={`text-xs font-medium p-2.5 rounded-lg ${
              status.startsWith("✓")
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {status}
          </p>
        )}
      </div>

      {/* Assigned Students List */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">
              Assigned Students ({assignments.length})
            </h3>
            <p className="text-slate-500 text-xs">Students authorized with generated access passwords</p>
          </div>
          <div className="flex items-center gap-2">
            {assignments.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={copyAllCredentials}
                  className="text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded font-medium transition cursor-pointer"
                  title="Copy all emails and passwords"
                >
                  📋 Copy All
                </button>
                <button
                  type="button"
                  onClick={exportCredentialsCsv}
                  className="text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded font-medium transition cursor-pointer"
                  title="Download student credentials as CSV"
                >
                  📥 Export CSV
                </button>
              </>
            )}
            <button
              onClick={loadAssignments}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {assignments.length > 5 && (
          <div>
            <input
              type="text"
              placeholder="Search assigned emails…"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="input text-xs py-1.5 w-full"
            />
          </div>
        )}

        {loading ? (
          <p className="text-slate-400 text-xs py-4 text-center">Loading assigned students…</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs border border-dashed border-slate-200 rounded-lg">
            {assignments.length === 0
              ? "No students assigned to this exam yet. Use the form on the left or upload an Excel/CSV file to assign students."
              : `No students matching "${searchFilter}".`}
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {filtered.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between p-3 hover:bg-slate-50/60 transition-colors text-xs"
              >
                <div className="space-y-0.5">
                  <p className="font-semibold text-slate-800">{a.studentEmail}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">Password:</span>
                    <span className="font-mono bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded text-[11px] font-bold tracking-wider">
                      {a.accessPassword || "—"}
                    </span>
                    {a.accessPassword && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(a.accessPassword || "");
                          setCopiedPasswordId(a.id);
                          setTimeout(() => setCopiedPasswordId(null), 1500);
                        }}
                        className="text-[11px] text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                      >
                        {copiedPasswordId === a.id ? "✓ Copied" : "Copy"}
                      </button>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => unassignStudent(a.id, a.studentEmail)}
                  disabled={unassigningId === a.id}
                  className="text-rose-600 hover:text-rose-800 text-[11px] font-medium bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded transition-colors cursor-pointer disabled:opacity-50"
                  title="Remove student assignment"
                >
                  {unassigningId === a.id ? "…" : "Remove"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
  );
}

type DateFilterType = "ALL" | "TODAY" | "YESTERDAY" | "LAST_7_DAYS" | "CUSTOM";

function getDateBounds(
  filter: DateFilterType,
  customFrom?: string,
  customTo?: string
): { from?: string; to?: string } {
  const now = new Date();
  if (filter === "TODAY") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { from: start.toISOString(), to: end.toISOString() };
  }
  if (filter === "YESTERDAY") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
    return { from: start.toISOString(), to: end.toISOString() };
  }
  if (filter === "LAST_7_DAYS") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { from: start.toISOString(), to: end.toISOString() };
  }
  if (filter === "CUSTOM") {
    let fromIso: string | undefined;
    let toIso: string | undefined;
    if (customFrom) {
      const s = new Date(customFrom + "T00:00:00");
      if (!isNaN(s.getTime())) fromIso = s.toISOString();
    }
    if (customTo) {
      const e = new Date(customTo + "T23:59:59.999");
      if (!isNaN(e.getTime())) toIso = e.toISOString();
    }
    return { from: fromIso, to: toIso };
  }
  return {};
}

function formatAttemptTime(isoString?: string | null): { relative: string; date: string; time: string } {
  if (!isoString) return { relative: "", date: "—", time: "" };
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return { relative: "", date: String(isoString), time: "" };

    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();

    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const isYesterday =
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear();

    const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const dateStr = d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });

    if (isToday) {
      return { relative: "Today", date: dateStr, time: timeStr };
    }
    if (isYesterday) {
      return { relative: "Yesterday", date: dateStr, time: timeStr };
    }
    return { relative: "", date: dateStr, time: timeStr };
  } catch {
    return { relative: "", date: String(isoString), time: "" };
  }
}

function ResultsTab({ examId }: { examId: number }) {
  const [attempts, setAttempts] = useState<AdminAttemptSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedAttempt, setSelectedAttempt] = useState<AdminAttemptSummary | null>(null);
  const [events, setEvents] = useState<ProctoringEvent[]>([]);
  const [riskTimeline, setRiskTimeline] = useState<RiskTimelineResponse | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const timelineSectionRef = useRef<HTMLDivElement | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; title: string; subtitle: string } | null>(null);

  // Search & filter bar state
  const [studentEmailFilter, setStudentEmailFilter] = useState<string>("");
  const [attemptSeverityFilter, setAttemptSeverityFilter] = useState<string>("");
  const [attemptEventTypeFilter, setAttemptEventTypeFilter] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<DateFilterType>("ALL");
  const [customFromDate, setCustomFromDate] = useState<string>("");
  const [customToDate, setCustomToDate] = useState<string>("");
  const [exportingId, setExportingId] = useState<number | null>(null);
  const [exportingCumulative, setExportingCumulative] = useState<boolean>(false);
  const [exportingQuestionPdf, setExportingQuestionPdf] = useState<boolean>(false);
  const [exportingStrikesPdf, setExportingStrikesPdf] = useState<boolean>(false);
  const [exportingAttemptQuestionPdfId, setExportingAttemptQuestionPdfId] = useState<number | null>(null);
  const [exportingAttemptStrikesPdfId, setExportingAttemptStrikesPdfId] = useState<number | null>(null);
  const [quickScore, setQuickScore] = useState<string>("");
  const [savingQuickScore, setSavingQuickScore] = useState<boolean>(false);

  async function handleExportCumulativePdf() {
    setExportingCumulative(true);
    try {
      await downloadFile(
        `/api/admin/exams/${examId}/report/cumulative-pdf`,
        `exam-${examId}-cumulative-results.pdf`,
        "admin"
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to export cumulative PDF");
    } finally {
      setExportingCumulative(false);
    }
  }

  async function handleExportQuestionCompletionPdf() {
    setExportingQuestionPdf(true);
    try {
      await downloadFile(
        `/api/admin/exams/${examId}/report/question-completion-pdf`,
        `exam-${examId}-question-completion.pdf`,
        "admin"
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to export question completion PDF");
    } finally {
      setExportingQuestionPdf(false);
    }
  }

  async function handleExportWarningStrikesPdf() {
    setExportingStrikesPdf(true);
    try {
      await downloadFile(
        `/api/admin/exams/${examId}/report/warning-strikes-pdf`,
        `exam-${examId}-warning-strikes.pdf`,
        "admin"
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to export warning strikes PDF");
    } finally {
      setExportingStrikesPdf(false);
    }
  }

  async function handleExportAttemptQuestionPdf(attemptId: number) {
    setExportingAttemptQuestionPdfId(attemptId);
    try {
      await downloadFile(
        `/api/admin/attempts/${attemptId}/report/question-completion-pdf`,
        `attempt-${attemptId}-question-completion.pdf`,
        "admin"
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to export attempt question completion PDF");
    } finally {
      setExportingAttemptQuestionPdfId(null);
    }
  }

  async function handleExportAttemptStrikesPdf(attemptId: number) {
    setExportingAttemptStrikesPdfId(attemptId);
    try {
      await downloadFile(
        `/api/admin/attempts/${attemptId}/report/warning-strikes-pdf`,
        `attempt-${attemptId}-warning-strikes.pdf`,
        "admin"
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to export attempt warning strikes PDF");
    } finally {
      setExportingAttemptStrikesPdfId(null);
    }
  }

  async function handleQuickEvaluate() {
    if (!selectedAttempt) return;
    setSavingQuickScore(true);
    try {
      await api.put(
        `/api/admin/attempts/${selectedAttempt.attemptId}/evaluate`,
        {
          score: parseFloat(quickScore) || 0,
          status: "VERIFIED",
        },
        "admin"
      );
      setAttempts((prev) =>
        prev.map((a) =>
          a.attemptId === selectedAttempt.attemptId
            ? { ...a, score: parseFloat(quickScore) || 0, status: "VERIFIED" }
            : a
        )
      );
      setSelectedAttempt((prev) =>
        prev ? { ...prev, score: parseFloat(quickScore) || 0, status: "VERIFIED" } : null
      );
      alert("Marks awarded and attempt marked as VERIFIED!");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to save marks");
    } finally {
      setSavingQuickScore(false);
    }
  }

  function loadAttempts(
    email = studentEmailFilter,
    sev = attemptSeverityFilter,
    evt = attemptEventTypeFilter,
    dFilter = dateFilter,
    cFrom = customFromDate,
    cTo = customToDate
  ) {
    setLoading(true);
    const params = new URLSearchParams();
    if (email.trim()) params.append("studentEmail", email.trim());
    if (sev) params.append("severity", sev);
    if (evt) params.append("eventType", evt);

    const { from, to } = getDateBounds(dFilter, cFrom, cTo);
    if (from) params.append("from", from);
    if (to) params.append("to", to);

    const query = params.toString() ? `?${params.toString()}` : "";

    api
      .get<AdminAttemptSummary[]>(`/api/admin/exams/${examId}/attempts${query}`, "admin")
      .then((data) => {
        setAttempts(data);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  function handleQuickDateSelect(d: DateFilterType) {
    setDateFilter(d);
    if (d !== "CUSTOM") {
      loadAttempts(studentEmailFilter, attemptSeverityFilter, attemptEventTypeFilter, d, customFromDate, customToDate);
    }
  }

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    loadAttempts();
  }

  function handleClearFilter() {
    setStudentEmailFilter("");
    setAttemptSeverityFilter("");
    setAttemptEventTypeFilter("");
    setDateFilter("ALL");
    setCustomFromDate("");
    setCustomToDate("");
    loadAttempts("", "", "", "ALL", "", "");
  }

  async function handleExport(attemptId: number, format: "pdf" | "csv" | "excel") {
    setExportingId(attemptId);
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
      setExportingId(null);
    }
  }

  useEffect(() => {
    loadAttempts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  function loadTimeline(attempt: AdminAttemptSummary, sev = severityFilter, type = typeFilter) {
    setSelectedAttempt(attempt);
    setQuickScore(attempt.score !== null && attempt.score !== undefined ? String(attempt.score) : "");
    setEventsLoading(true);
    setTimelineError(null);
    setTimeout(() => {
      timelineSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);

    const params = new URLSearchParams();
    if (sev) params.append("severity", sev);
    if (type) params.append("type", type);
    const query = params.toString() ? `?${params.toString()}` : "";

    Promise.all([
      api.get<ProctoringEvent[]>(`/api/admin/attempts/${attempt.attemptId}/events${query}`, "admin"),
      api.get<RiskTimelineResponse>(`/api/admin/attempts/${attempt.attemptId}/risk-timeline`, "admin"),
    ])
      .then(([evs, rtl]) => {
        setEvents(evs);
        setRiskTimeline(rtl);
      })
      .catch((e) => setTimelineError(e.message))
      .finally(() => setEventsLoading(false));
  }

  function handleFilterChange(sev: string, type: string) {
    setSeverityFilter(sev);
    setTypeFilter(type);
    if (selectedAttempt) {
      loadTimeline(selectedAttempt, sev, type);
    }
  }

  if (loading) return <p className="text-slate-500 py-6">Loading attempt results…</p>;
  if (error) return <p className="text-red-600 py-6">{error}</p>;

  return (
    <div className="space-y-6">
      {/* Overview stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500 uppercase font-semibold">Total Attempts</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{attempts.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500 uppercase font-semibold">Submitted</p>
          <p className="text-xl font-bold text-green-700 mt-1">
            {attempts.filter((a) => a.status === "SUBMITTED").length}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500 uppercase font-semibold">In Progress</p>
          <p className="text-xl font-bold text-blue-600 mt-1">
            {attempts.filter((a) => a.status === "IN_PROGRESS").length}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500 uppercase font-semibold">Flagged For Review</p>
          <p className="text-xl font-bold text-rose-600 mt-1">
            {attempts.filter((a) => a.flaggedForReview).length}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500 uppercase font-semibold">High / Crit Flags</p>
          <p className="text-xl font-bold text-amber-600 mt-1">
            {attempts.reduce((acc, a) => acc + a.highEvents + a.criticalEvents, 0)}
          </p>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <form onSubmit={handleFilterSubmit} className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Filter by student email…"
              value={studentEmailFilter}
              onChange={(e) => setStudentEmailFilter(e.target.value)}
              className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <select
              value={attemptSeverityFilter}
              onChange={(e) => setAttemptSeverityFilter(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Severities</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
              <option value="INFO">INFO</option>
            </select>
          </div>
          <div>
            <select
              value={attemptEventTypeFilter}
              onChange={(e) => setAttemptEventTypeFilter(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Signal Types</option>
              <option value="FACE_NOT_VISIBLE">FACE_NOT_VISIBLE</option>
              <option value="MULTIPLE_FACES">MULTIPLE_FACES</option>
              <option value="LOOKING_LEFT">LOOKING_LEFT</option>
              <option value="LOOKING_RIGHT">LOOKING_RIGHT</option>
              <option value="LOOKING_UP">LOOKING_UP</option>
              <option value="LOOKING_DOWN">LOOKING_DOWN</option>
              <option value="HEAD_TURNED">HEAD_TURNED</option>
              <option value="TAB_SWITCH">TAB_SWITCH</option>
              <option value="FULLSCREEN_EXIT">FULLSCREEN_EXIT</option>
              <option value="WINDOW_BLUR">WINDOW_BLUR</option>
              <option value="LOCATION_MISMATCH">LOCATION_MISMATCH</option>
            </select>
          </div>
          <div>
            <select
              value={dateFilter}
              onChange={(e) => {
                const val = e.target.value as DateFilterType;
                setDateFilter(val);
                if (val !== "CUSTOM") {
                  loadAttempts(studentEmailFilter, attemptSeverityFilter, attemptEventTypeFilter, val, customFromDate, customToDate);
                }
              }}
              className="text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            >
              <option value="ALL">📅 All Dates</option>
              <option value="TODAY">📅 Today</option>
              <option value="YESTERDAY">📅 Yesterday</option>
              <option value="LAST_7_DAYS">📅 Last 7 Days</option>
              <option value="CUSTOM">📅 Custom Range…</option>
            </select>
          </div>
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            Filter
          </button>
          {(studentEmailFilter || attemptSeverityFilter || attemptEventTypeFilter || dateFilter !== "ALL" || customFromDate || customToDate) && (
            <button
              type="button"
              onClick={handleClearFilter}
              className="border border-slate-300 hover:bg-slate-50 text-slate-600 text-xs font-medium px-3 py-2 rounded-lg transition-colors cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        {/* Quick Date Pills & Custom Range Inputs */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-medium mr-1 flex items-center gap-1">
              <span>🕒</span>
              <span>Filter Date:</span>
            </span>
            <button
              type="button"
              onClick={() => handleQuickDateSelect("ALL")}
              className={`px-2.5 py-1 rounded-md font-medium text-xs transition-colors cursor-pointer border ${
                dateFilter === "ALL"
                  ? "bg-blue-600 text-white border-blue-600 shadow-2xs font-bold"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
              }`}
            >
              All Time
            </button>
            <button
              type="button"
              onClick={() => handleQuickDateSelect("TODAY")}
              className={`px-2.5 py-1 rounded-md font-medium text-xs transition-colors cursor-pointer border ${
                dateFilter === "TODAY"
                  ? "bg-blue-600 text-white border-blue-600 shadow-2xs font-bold"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
              }`}
            >
              🌟 Today
            </button>
            <button
              type="button"
              onClick={() => handleQuickDateSelect("YESTERDAY")}
              className={`px-2.5 py-1 rounded-md font-medium text-xs transition-colors cursor-pointer border ${
                dateFilter === "YESTERDAY"
                  ? "bg-blue-600 text-white border-blue-600 shadow-2xs font-bold"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
              }`}
            >
              ⏪ Yesterday
            </button>
            <button
              type="button"
              onClick={() => handleQuickDateSelect("LAST_7_DAYS")}
              className={`px-2.5 py-1 rounded-md font-medium text-xs transition-colors cursor-pointer border ${
                dateFilter === "LAST_7_DAYS"
                  ? "bg-blue-600 text-white border-blue-600 shadow-2xs font-bold"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
              }`}
            >
              Last 7 Days
            </button>
          </div>

          {dateFilter === "CUSTOM" && (
            <div className="flex items-center gap-2">
              <span className="text-slate-500">From:</span>
              <input
                type="date"
                value={customFromDate}
                onChange={(e) => setCustomFromDate(e.target.value)}
                className="border border-slate-300 rounded px-2 py-1 text-xs bg-white"
              />
              <span className="text-slate-500">To:</span>
              <input
                type="date"
                value={customToDate}
                onChange={(e) => setCustomToDate(e.target.value)}
                className="border border-slate-300 rounded px-2 py-1 text-xs bg-white"
              />
              <button
                type="button"
                onClick={() => loadAttempts()}
                className="bg-blue-600 text-white text-xs px-2.5 py-1 rounded font-medium hover:bg-blue-700 cursor-pointer"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      </form>

      {/* Attempts Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs">
        <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap justify-between items-center gap-3 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
              <span>Student Attempts ({attempts.length})</span>
              {dateFilter === "TODAY" && (
                <span className="text-xs font-semibold text-blue-700 bg-blue-100 border border-blue-200 px-2.5 py-0.5 rounded-full">
                  🌟 Today
                </span>
              )}
              {dateFilter === "YESTERDAY" && (
                <span className="text-xs font-semibold text-purple-700 bg-purple-100 border border-purple-200 px-2.5 py-0.5 rounded-full">
                  ⏪ Yesterday
                </span>
              )}
              {dateFilter === "LAST_7_DAYS" && (
                <span className="text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full">
                  Last 7 Days
                </span>
              )}
            </h3>
            <button
              onClick={() => loadAttempts()}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
            >
              ↻ Refresh
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExportCumulativePdf}
              disabled={exportingCumulative || attempts.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-xs transition-all cursor-pointer disabled:opacity-50"
              title="Download cumulative PDF containing all candidate results, verified marks & proctoring audit"
            >
              <span>📄 {exportingCumulative ? "Generating PDF…" : "Cumulative Exam PDF"}</span>
            </button>
            <button
              onClick={handleExportQuestionCompletionPdf}
              disabled={exportingQuestionPdf || attempts.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition-all cursor-pointer disabled:opacity-50"
              title="Download PDF containing student name, register number, mail ID & question completion status (1 page per student)"
            >
              <span>📋 {exportingQuestionPdf ? "Generating PDF…" : "Question Completion (1-Page / Student)"}</span>
            </button>
            <button
              onClick={handleExportWarningStrikesPdf}
              disabled={exportingStrikesPdf || attempts.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-xs transition-all cursor-pointer disabled:opacity-50"
              title="Download Warning Strikes PDF describing students involved in strikes with student name & register number"
            >
              <span>⚠️ {exportingStrikesPdf ? "Generating PDF…" : "Warning Strikes Report (PDF)"}</span>
            </button>
          </div>
        </div>
        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-left border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 whitespace-nowrap font-semibold">Student</th>
                <th className="px-4 py-3 whitespace-nowrap font-semibold">Attempt</th>
                <th className="px-4 py-3 whitespace-nowrap font-semibold">Started</th>
                <th className="px-4 py-3 whitespace-nowrap font-semibold">Status</th>
                <th className="px-4 py-3 whitespace-nowrap font-semibold">Score</th>
                <th className="px-4 py-3 whitespace-nowrap font-semibold">Risk Score</th>
                <th className="px-4 py-3 whitespace-nowrap font-semibold">Review</th>
                <th className="px-4 py-3 whitespace-nowrap font-semibold">Live Media</th>
                <th className="px-4 py-3 whitespace-nowrap font-semibold">Events</th>
                <th className="px-4 py-3 text-right whitespace-nowrap font-semibold min-w-[340px]">Actions & Export</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {attempts.map((a) => {
                const scoreVal = a.currentRiskScore ?? 0;
                const riskBadgeClass =
                  scoreVal >= 75
                    ? "bg-rose-100 text-rose-800 border-rose-200"
                    : scoreVal >= 40
                    ? "bg-amber-100 text-amber-800 border-amber-200"
                    : "bg-emerald-100 text-emerald-800 border-emerald-200";

                const dateInfo = formatAttemptTime(a.startTime);

                return (
                  <tr key={a.attemptId} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{a.studentEmail}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">#{a.attemptNumber}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">
                      <div className="flex flex-col">
                        <span className="flex items-center gap-1 font-medium text-slate-800">
                          {dateInfo.relative ? (
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                dateInfo.relative === "Today"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-purple-100 text-purple-700"
                              }`}
                            >
                              {dateInfo.relative}
                            </span>
                          ) : null}
                          <span>{dateInfo.date}</span>
                        </span>
                        <span className="text-[11px] text-slate-400">{dateInfo.time}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                          a.status === "SUBMITTED"
                            ? "bg-green-100 text-green-700"
                            : a.status === "IN_PROGRESS"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">
                      {a.score !== null ? a.score : "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${riskBadgeClass}`}>
                        {scoreVal.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {a.flaggedForReview ? (
                        <span className="bg-rose-600 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                          FLAGGED
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">Clear</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {a.proctoringSession ? (
                        <div className="flex items-center gap-1.5 text-xs">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              a.proctoringSession.webcamStatus === "ACTIVE"
                                ? "bg-emerald-500"
                                : "bg-slate-300"
                            }`}
                            title={`Cam: ${a.proctoringSession.webcamStatus}`}
                          />
                          <span
                            className={`w-2 h-2 rounded-full ${
                              a.proctoringSession.microphoneStatus === "ACTIVE"
                                ? "bg-emerald-500"
                                : "bg-slate-300"
                            }`}
                            title={`Mic: ${a.proctoringSession.microphoneStatus}`}
                          />
                          <span
                            className={`w-2 h-2 rounded-full ${
                              a.proctoringSession.screenStatus === "ACTIVE"
                                ? "bg-emerald-500"
                                : "bg-slate-300"
                            }`}
                            title={`Screen: ${a.proctoringSession.screenStatus}`}
                          />
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {a.highEvents + a.criticalEvents > 0 && (
                          <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-medium">
                            {a.highEvents + a.criticalEvents} High
                          </span>
                        )}
                        {a.mediumEvents > 0 && (
                          <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full font-medium">
                            {a.mediumEvents} Med
                          </span>
                        )}
                        {a.lowEvents > 0 && (
                          <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded-full font-medium">
                            {a.lowEvents} Low
                          </span>
                        )}
                        {a.totalEvents === 0 && (
                          <span className="text-xs text-slate-400 font-medium">Clean</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => loadTimeline(a)}
                          className="text-blue-700 hover:text-blue-900 font-medium text-xs bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-1 rounded-md transition-colors cursor-pointer"
                          title="Inline quick timeline"
                        >
                          Quick View
                        </button>
                        <Link
                          to={`/admin/exams/${examId}/attempts/${a.attemptId}`}
                          className="text-white hover:bg-blue-700 font-semibold text-xs bg-blue-600 px-2.5 py-1 rounded-md transition-colors inline-flex items-center gap-1 shadow-2xs"
                          title="Evaluate student answers & assign verified marks"
                        >
                          <span>Evaluate & Marks</span>
                          <span>↗</span>
                        </Link>
                        <button
                          onClick={() => handleExportAttemptQuestionPdf(a.attemptId)}
                          disabled={exportingAttemptQuestionPdfId === a.attemptId}
                          className="text-indigo-700 hover:text-indigo-900 font-bold text-xs bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 px-2 py-1 rounded-md transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1 shadow-2xs"
                          title="Export 1-Page Question Completion PDF (Student Name, Reg No, Mail ID & Status)"
                        >
                          <span>📋</span>
                          <span>{exportingAttemptQuestionPdfId === a.attemptId ? "..." : "1-Page PDF"}</span>
                        </button>
                        <button
                          onClick={() => handleExportAttemptStrikesPdf(a.attemptId)}
                          disabled={exportingAttemptStrikesPdfId === a.attemptId}
                          className="text-amber-700 hover:text-amber-900 font-bold text-xs bg-amber-50 hover:bg-amber-100 border border-amber-300 px-2 py-1 rounded-md transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1 shadow-2xs"
                          title="Export Warning Strikes Audit PDF for this candidate"
                        >
                          <span>⚠️</span>
                          <span>{exportingAttemptStrikesPdfId === a.attemptId ? "..." : "Strikes PDF"}</span>
                        </button>
                        <button
                          onClick={() => handleExport(a.attemptId, "pdf")}
                          disabled={exportingId === a.attemptId}
                          className="text-rose-700 hover:text-rose-900 font-bold text-xs bg-rose-50 hover:bg-rose-100 border border-rose-300 px-2 py-1 rounded-md transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1 shadow-2xs"
                          title="Export candidate full proctoring report as PDF"
                        >
                          <span>📄</span>
                          <span>{exportingId === a.attemptId ? "..." : "PDF"}</span>
                        </button>
                        <button
                          onClick={() => handleExport(a.attemptId, "excel")}
                          disabled={exportingId === a.attemptId}
                          className="text-emerald-700 hover:text-emerald-900 font-bold text-xs bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 px-2 py-1 rounded-md transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1 shadow-2xs"
                          title="Export candidate report as Excel"
                        >
                          <span>📊</span>
                          <span>{exportingId === a.attemptId ? "..." : "XLS"}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {attempts.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                    No attempts found matching the selected filters
                    {dateFilter === "TODAY"
                      ? " for today"
                      : dateFilter === "YESTERDAY"
                      ? " for yesterday"
                      : dateFilter === "LAST_7_DAYS"
                      ? " in the last 7 days"
                      : ""}
                    .
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drill-down Integrity & Proctoring Timeline */}
      {selectedAttempt && (
        <div ref={timelineSectionRef} className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-6 scroll-mt-20">
          <div className="flex justify-between items-start border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="font-bold text-slate-900 text-lg">
                  Integrity Report: {selectedAttempt.studentEmail}
                </h3>
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                  Attempt #{selectedAttempt.attemptNumber}
                </span>
                {riskTimeline?.flaggedForReview && (
                  <span className="bg-rose-600 text-white text-xs font-bold px-2 py-0.5 rounded tracking-wide">
                    FLAGGED FOR REVIEW
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Started: {new Date(selectedAttempt.startTime).toLocaleTimeString()} &middot;{" "}
                {selectedAttempt.endTime
                  ? `Ended: ${new Date(selectedAttempt.endTime).toLocaleTimeString()}`
                  : "Currently In Progress"}{" "}
                &middot; Score: {selectedAttempt.score ?? "—"} &middot; Current Risk Score:{" "}
                <strong className="text-slate-800">{Number(riskTimeline?.currentRiskScore ?? 0).toFixed(1)}</strong>
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                to={`/admin/exams/${examId}/attempts/${selectedAttempt.attemptId}`}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold px-3 py-1.5 rounded-lg shadow-2xs inline-flex items-center gap-1"
              >
                <span>Full Page Report</span>
                <span>↗</span>
              </Link>
              <button
                onClick={() => handleExportAttemptQuestionPdf(selectedAttempt.attemptId)}
                disabled={exportingAttemptQuestionPdfId === selectedAttempt.attemptId}
                className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-300 font-bold px-3 py-1.5 rounded-lg shadow-2xs cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                title="Export 1-Page Question Completion PDF"
              >
                <span>📋</span>
                <span>{exportingAttemptQuestionPdfId === selectedAttempt.attemptId ? "Exporting…" : "1-Page PDF"}</span>
              </button>
              <button
                onClick={() => handleExportAttemptStrikesPdf(selectedAttempt.attemptId)}
                disabled={exportingAttemptStrikesPdfId === selectedAttempt.attemptId}
                className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-300 font-bold px-3 py-1.5 rounded-lg shadow-2xs cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                title="Export Warning Strikes PDF"
              >
                <span>⚠️</span>
                <span>{exportingAttemptStrikesPdfId === selectedAttempt.attemptId ? "Exporting…" : "Strikes PDF"}</span>
              </button>
              <button
                onClick={() => handleExport(selectedAttempt.attemptId, "pdf")}
                disabled={exportingId === selectedAttempt.attemptId}
                className="text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-bold px-3 py-1.5 rounded-lg shadow-2xs cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                title="Export Attempt PDF"
              >
                <span>📄</span>
                <span>{exportingId === selectedAttempt.attemptId ? "Exporting…" : "PDF"}</span>
              </button>
              <button
                onClick={() => handleExport(selectedAttempt.attemptId, "excel")}
                disabled={exportingId === selectedAttempt.attemptId}
                className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 font-bold px-3 py-1.5 rounded-lg shadow-2xs cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                title="Export Attempt Excel"
              >
                <span>📊</span>
                <span>{exportingId === selectedAttempt.attemptId ? "Exporting…" : "Excel"}</span>
              </button>
              <button
                onClick={() => setSelectedAttempt(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold ml-2 cursor-pointer px-2 py-1"
              >
                ✕ Close
              </button>
            </div>
          </div>
          {timelineError && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-xs">
              {timelineError}
            </div>
          )}

          {/* Quick Marks & Verification Bar */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-blue-900">✍️ Verified Marks:</span>
              <input
                type="number"
                step="0.5"
                min="0"
                value={quickScore}
                onChange={(e) => setQuickScore(e.target.value)}
                placeholder="Marks..."
                className="w-24 px-2 py-1 bg-white border border-blue-300 rounded font-semibold text-slate-800"
              />
              <button
                type="button"
                onClick={handleQuickEvaluate}
                disabled={savingQuickScore}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded shadow-xs cursor-pointer disabled:opacity-50"
              >
                {savingQuickScore ? "Saving…" : "✓ Save Marks & Verify"}
              </button>
            </div>
            <button
              onClick={() => handleExport(selectedAttempt.attemptId, "pdf")}
              disabled={exportingId === selectedAttempt.attemptId}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded shadow-xs cursor-pointer flex items-center gap-1"
            >
              <span>📁 Put Everything in a File (Export PDF)</span>
            </button>
          </div>

          {/* SVG Risk Score Line Chart */}
          {riskTimeline && (
            <RiskScoreChart history={riskTimeline.scoreHistory} />
          )}

          {/* Warnings History */}
          {riskTimeline && riskTimeline.warnings && riskTimeline.warnings.length > 0 && (
            <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900 mb-2.5">
                Issued Warnings ({riskTimeline.warnings.length})
              </h4>
              <div className="space-y-2">
                {riskTimeline.warnings.map((w: WarningResponse) => (
                  <div
                    key={w.id}
                    className="bg-white border border-amber-200 rounded p-2.5 flex items-start justify-between gap-4 text-xs shadow-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                            w.level === 1
                              ? "bg-blue-100 text-blue-800"
                              : w.level === 2
                              ? "bg-amber-100 text-amber-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          Tier {w.level} Warning
                        </span>
                        <span className="text-slate-400 font-mono">
                          {new Date(w.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-slate-800 font-medium">{w.message}</p>
                    </div>
                    <span className="text-slate-500 font-semibold shrink-0">
                      Score: {Number(w.riskScoreAtTime ?? 0).toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Photo Evidence Gallery for Human Proctor Monitoring */}
          {(() => {
            const photoEvents = events.filter((ev) => ev.metadata && ev.metadata.includes('"photo"'));
            if (photoEvents.length === 0) return null;
            return (
              <div className="bg-slate-900 text-white rounded-xl p-5 border border-slate-800 shadow-md">
                <div className="flex items-center justify-between mb-3.5">
                  <div className="flex items-center gap-2">
                    <span className="text-base">📸</span>
                    <h4 className="text-sm font-bold uppercase tracking-wider text-slate-100">
                      Photo Evidence Gallery ({photoEvents.length} Snapshots)
                    </h4>
                  </div>
                  <span className="text-xs bg-slate-800 text-emerald-400 font-medium px-2.5 py-0.5 rounded-full border border-slate-700">
                    Proctor Monitoring Active
                  </span>
                </div>
                <p className="text-xs text-slate-400 mb-4">
                  Visual evidence captured automatically when candidate looked away for 5+ seconds, or when objects or persons appeared in the background. Click any image to enlarge.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {photoEvents.map((pe) => {
                    let photoUrl = "";
                    let parsed: any = null;
                    try {
                      parsed = JSON.parse(pe.metadata || "{}");
                      photoUrl = parsed.photo || "";
                    } catch {}
                    if (!photoUrl) return null;
                    return (
                      <div
                        key={pe.id}
                        onClick={() =>
                          setPreviewPhoto({
                            url: photoUrl,
                            title: `${pe.eventType} • Event #${pe.id}`,
                            subtitle: `${new Date(pe.occurredAt).toLocaleTimeString()} • ${
                              parsed?.reason || parsed?.objects || pe.eventType
                            }`,
                          })
                        }
                        className="group relative bg-slate-800 rounded-lg overflow-hidden border border-slate-700 cursor-pointer hover:border-blue-500 hover:ring-2 hover:ring-blue-400/40 transition-all"
                      >
                        <img
                          src={photoUrl}
                          alt="Evidence"
                          className="w-full aspect-video object-cover group-hover:scale-105 transition-transform"
                        />
                        <div className="p-1.5 bg-slate-850 text-[10px]">
                          <p className="font-semibold text-slate-200 truncate">{pe.eventType}</p>
                          <p className="text-slate-400 text-[9px] font-mono">
                            {new Date(pe.occurredAt).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Timeline Filter Controls */}
          <div className="flex flex-wrap gap-3 items-center text-sm bg-slate-50 p-3 rounded-lg">
            <span className="text-xs font-semibold text-slate-500 uppercase">Filter Severity:</span>
            {["", "HIGH", "MEDIUM", "LOW", "INFO"].map((sev) => (
              <button
                key={sev}
                onClick={() => handleFilterChange(sev, typeFilter)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  severityFilter === sev
                    ? "bg-slate-800 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {sev || "All"}
              </button>
            ))}

            <span className="text-xs font-semibold text-slate-500 uppercase ml-auto">Event Type:</span>
            <select
              value={typeFilter}
              onChange={(e) => handleFilterChange(severityFilter, e.target.value)}
              className="input text-xs py-1 px-2 w-52"
            >
              <option value="">All Types</option>
              <option value="TAB_SWITCH">TAB_SWITCH</option>
              <option value="LOOKING_AWAY_SNAPSHOT">LOOKING_AWAY_SNAPSHOT</option>
              <option value="OBJECT_DETECTED">OBJECT_DETECTED</option>
              <option value="PERSON_BEHIND_DETECTED">PERSON_BEHIND_DETECTED</option>
              <option value="CELL_PHONE_DETECTED">CELL_PHONE_DETECTED</option>
              <option value="PROHIBITED_OBJECT_DETECTED">PROHIBITED_OBJECT_DETECTED</option>
              <option value="FULLSCREEN_EXIT">FULLSCREEN_EXIT</option>
              <option value="VOICE_DETECTED">VOICE_DETECTED</option>
              <option value="SCREEN_CAPTURE_STOPPED">SCREEN_CAPTURE_STOPPED</option>
              <option value="WEBCAM_LOST">WEBCAM_LOST</option>
              <option value="MICROPHONE_LOST">MICROPHONE_LOST</option>
              <option value="FACE_NOT_VISIBLE">FACE_NOT_VISIBLE</option>
              <option value="MULTIPLE_FACES">MULTIPLE_FACES</option>
            </select>
          </div>

          {/* Timeline List */}
          {eventsLoading ? (
            <p className="text-slate-400 text-sm py-4">Loading timeline events…</p>
          ) : events.length === 0 ? (
            <p className="text-slate-400 text-sm py-6 text-center">
              No events matched the selected filters.
            </p>
          ) : (
            <div className="relative pl-6 space-y-4 border-l-2 border-slate-200 mt-4">
              {events.map((ev) => {
                let parsedMeta: any = null;
                if (ev.metadata) {
                  try {
                    parsedMeta = JSON.parse(ev.metadata);
                  } catch {}
                }
                const hasPhoto = parsedMeta && parsedMeta.photo;

                return (
                  <div key={ev.id} className="relative group">
                    {/* Timeline dot */}
                    <div
                      className={`absolute -left-[31px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white ${
                        ev.severity === "CRITICAL" || ev.severity === "HIGH"
                          ? "bg-red-500 ring-2 ring-red-200"
                          : ev.severity === "MEDIUM"
                          ? "bg-amber-500 ring-2 ring-amber-200"
                          : ev.severity === "LOW"
                          ? "bg-yellow-400"
                          : "bg-blue-400"
                      }`}
                    />
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm">
                      <div className="flex justify-between items-center mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">{ev.eventType}</span>
                          <SeverityBadge severity={ev.severity} />
                        </div>
                        <span className="text-xs text-slate-400 font-mono">
                          {new Date(ev.occurredAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 flex gap-4">
                        {ev.durationSeconds !== null && (
                          <span>
                            <strong className="text-slate-700">Duration:</strong> {ev.durationSeconds}s
                          </span>
                        )}
                        <span>
                          <strong className="text-slate-700">Confidence:</strong> {ev.confidence}
                        </span>
                      </div>

                      {/* Photo evidence preview card */}
                      {hasPhoto ? (
                        <div className="mt-2.5 flex flex-col sm:flex-row items-start gap-3 bg-white p-2.5 rounded-lg border border-slate-200">
                          <img
                            src={parsedMeta.photo}
                            alt="Snapshot evidence"
                            className="w-32 h-24 object-cover rounded-md border border-slate-300 shadow-xs cursor-pointer hover:opacity-90 hover:scale-105 transition-all shrink-0"
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
                          <div className="flex-1 text-xs">
                            <div className="flex items-center gap-1.5 font-bold text-slate-800">
                              <span>📸 Captured Photo Evidence</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold cursor-pointer">
                                Click image to enlarge
                              </span>
                            </div>
                            {parsedMeta.direction && (
                              <p className="text-slate-600 mt-1">
                                <strong>Gaze Direction:</strong> {parsedMeta.direction}
                              </p>
                            )}
                            {parsedMeta.durationSeconds && (
                              <p className="text-slate-600">
                                <strong>Sustained Duration:</strong> {parsedMeta.durationSeconds}s
                              </p>
                            )}
                            {parsedMeta.objects && (
                              <p className="text-rose-600 font-semibold">
                                <strong>Detected Objects:</strong> {parsedMeta.objects}
                              </p>
                            )}
                            {parsedMeta.faceCount && (
                              <p className="text-purple-600 font-semibold">
                                <strong>Faces Count:</strong> {parsedMeta.faceCount}
                              </p>
                            )}
                            {parsedMeta.reason && (
                              <p className="text-slate-500 mt-1 italic">{parsedMeta.reason}</p>
                            )}
                          </div>
                        </div>
                      ) : ev.metadata ? (
                        <pre className="mt-2 text-xs bg-white border border-slate-200 rounded p-2 text-slate-600 overflow-x-auto">
                          {ev.metadata}
                        </pre>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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

function RiskScoreChart({ history }: { history: RiskPoint[] }) {
  if (!history || history.length === 0) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
        <p className="text-slate-400 text-xs">No proctoring event points recorded yet for this session.</p>
      </div>
    );
  }

  const width = 640;
  const height = 150;
  const padding = { top: 15, right: 20, bottom: 25, left: 35 };

  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  // Risk score is strictly calculated and scaled out of 100
  const maxScore = 100;

  const points = history.map((pt, i) => {
    const rawVal = Number(pt.score ?? (pt as any).riskScore ?? 0);
    const scoreVal = Math.max(0, Math.min(100, isNaN(rawVal) ? 0 : rawVal));
    const x =
      padding.left + (history.length === 1 ? innerWidth / 2 : (i / Math.max(1, history.length - 1)) * innerWidth);
    const y = padding.top + innerHeight - (scoreVal / maxScore) * innerHeight;
    return { x, y, scoreVal, ...pt };
  });

  const pathD = points.reduce(
    (acc, pt, i) => `${acc} ${i === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`,
    ""
  );

  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];
  const areaD = `${pathD} L ${(lastPoint?.x ?? 0).toFixed(1)} ${
    padding.top + innerHeight
  } L ${(firstPoint?.x ?? 0).toFixed(1)} ${padding.top + innerHeight} Z`;

  const thresholdY = padding.top + innerHeight - (75 / maxScore) * innerHeight;

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Risk Score Timeline (Time-Decayed Dynamics)
        </h4>
        <span className="text-[11px] text-slate-400 font-medium">Flagging Threshold: 75 pts</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
        {/* Y Grid lines */}
        {[0, 25, 50, 75, 100].map((val) => {
          const y = padding.top + innerHeight - (val / maxScore) * innerHeight;
          return (
            <g key={val}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#f1f5f9" strokeWidth="1" />
              <text x={padding.left - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#94a3b8" fontFamily="monospace">
                {val}
              </text>
            </g>
          );
        })}

        {/* 75-point Review Threshold line */}
        <line
          x1={padding.left}
          y1={thresholdY}
          x2={width - padding.right}
          y2={thresholdY}
          stroke="#f87171"
          strokeDasharray="4 3"
          strokeWidth="1.2"
        />
        <text
          x={width - padding.right - 4}
          y={thresholdY - 4}
          textAnchor="end"
          fontSize="9"
          fill="#ef4444"
          fontWeight="600"
        >
          Review Level (75)
        </text>

        {/* Area fill */}
        <defs>
          <linearGradient id="riskAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#riskAreaGrad)" />

        {/* Line */}
        <path d={pathD} fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Points */}
        {points.map((pt, i) => (
          <circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r={pt.scoreVal >= 75 ? 4.5 : 3}
            fill={pt.scoreVal >= 75 ? "#ef4444" : "#2563eb"}
            stroke="#ffffff"
            strokeWidth="1.5"
          >
            <title>{`${pt.eventType || "Event"}: ${pt.scoreVal.toFixed(1)} (${new Date(
              pt.timestamp
            ).toLocaleTimeString()})`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    CRITICAL: "bg-rose-100 text-rose-800 border-rose-200",
    HIGH: "bg-red-100 text-red-800 border-red-200",
    MEDIUM: "bg-amber-100 text-amber-800 border-amber-200",
    LOW: "bg-yellow-100 text-yellow-800 border-yellow-200",
    INFO: "bg-blue-100 text-blue-800 border-blue-200",
  };
  const cls = map[severity] ?? "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold border ${cls}`}>
      {severity}
    </span>
  );
}

// ---------------------------------------------------------------------------
// QuestionAssignTab  –  Random question assignment per student + report view
// ---------------------------------------------------------------------------

interface AssignedQuestionSummary {
  questionId: number;
  displayOrder: number;
  questionType: string;
  questionText: string;
  problemTitle: string | null;
  marks?: number;
}

interface StudentAssignmentEntry {
  studentEmail: string;
  accessPassword?: string | null;
  questions: AssignedQuestionSummary[];
  assignedAt: string;
}

interface QuestionAssignmentReport {
  examId: number;
  examName: string;
  totalQuestions: number;
  questionsPerStudent: number;
  totalStudents: number;
  assignments: StudentAssignmentEntry[];
}

function QuestionAssignTab({
  examId,
  examName,
  questionCount,
  openToAll,
}: {
  examId: number;
  examName: string;
  questionCount: number;
  openToAll?: boolean;
}) {
  const [qps, setQps] = useState<number | string>(2);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<QuestionAssignmentReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Load existing report on mount
  useEffect(() => {
    api
      .get<QuestionAssignmentReport>(
        `/api/admin/exams/${examId}/question-assignment-report`,
        "admin"
      )
      .then((r) => {
        if (r.assignments.length > 0) {
          setReport(r);
          setQps(r.questionsPerStudent || 2);
        }
      })
      .catch(() => {}); // silently ignore – means no assignments yet
  }, [examId]);

  async function handleAssign() {
    const numQps = Number(qps);
    if (!numQps || numQps <= 0 || numQps > questionCount) {
      setError(`Questions per student must be between 1 and ${questionCount}.`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = { questionsPerStudent: numQps };
      const result = await api.post<QuestionAssignmentReport>(
        `/api/admin/exams/${examId}/assign-questions-randomly`,
        payload,
        "admin"
      );
      setReport(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assignment failed.");
    } finally {
      setLoading(false);
    }
  }

  function exportPDF() {
    if (!report || report.assignments.length === 0) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Popup blocked! Please allow popups for this site to generate and print the PDF report.");
      return;
    }

    const pagesHtml = report.assignments.map((entry, idx) => {
      const qRows = entry.questions.map((q, qIndex) => `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 10px 12px; font-weight: bold; text-align: center; width: 45px; color: #1e293b;">${qIndex + 1}</td>
          <td style="padding: 10px 12px; width: 95px;">
            <span style="display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; ${
              q.questionType === 'CODING'
                ? 'background: #e0e7ff; color: #3730a3; border: 1px solid #c7d2fe;'
                : 'background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1;'
            }">
              ${q.questionType}
            </span>
          </td>
          <td style="padding: 10px 12px;">
            <div style="font-weight: 700; color: #0f172a; margin-bottom: 3px; font-size: 13px;">
              ${q.problemTitle ? q.problemTitle.replace(/</g, "&lt;").replace(/>/g, "&gt;") : `Question #${q.displayOrder || qIndex + 1}`}
            </div>
            <div style="font-size: 12px; color: #475569; line-height: 1.45;">
              ${(q.questionText ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;")}
            </div>
          </td>
          <td style="padding: 10px 12px; text-align: center; width: 60px; font-weight: 700; color: #1e293b;">
            ${q.marks ?? 1}
          </td>
        </tr>
      `).join("");

      return `
        <div class="candidate-page">
          <div>
            <!-- Header -->
            <div style="border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start;">
              <div>
                <div style="font-size: 19px; font-weight: 900; color: #0f172a; letter-spacing: -0.5px;">AI EXAM & PROCTORING PORTAL</div>
                <div style="font-size: 13px; font-weight: 700; color: #2563eb; margin-top: 2px;">CANDIDATE QUESTION PAPER ASSIGNMENT REPORT</div>
                <div style="font-size: 12px; color: #64748b; margin-top: 2px;">Exam: <strong>${examName}</strong> (ID: ${examId})</div>
              </div>
              <div style="text-align: right;">
                <div style="display: inline-block; background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 6px;">
                  Candidate ${idx + 1} of ${report.assignments.length}
                </div>
                <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">Assigned: ${new Date(entry.assignedAt).toLocaleString()}</div>
              </div>
            </div>

            <!-- Candidate Details Card -->
            <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px 18px; margin-bottom: 18px;">
              <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <tr>
                  <td style="width: 50%; padding-bottom: 8px;">
                    <span style="color: #64748b; font-size: 11px; font-weight: 700; text-transform: uppercase;">Candidate Email</span><br/>
                    <strong style="color: #0f172a; font-size: 15px;">${entry.studentEmail}</strong>
                  </td>
                  <td style="width: 50%; padding-bottom: 8px;">
                    <span style="color: #64748b; font-size: 11px; font-weight: 700; text-transform: uppercase;">Exam Access Password</span><br/>
                    <strong style="color: #0f172a; font-size: 15px; font-family: monospace; letter-spacing: 1px;">${entry.accessPassword || "Auto Login / Verified"}</strong>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top: 6px;">
                    <span style="color: #64748b; font-size: 11px; font-weight: 700; text-transform: uppercase;">Total Questions Assigned</span><br/>
                    <strong style="color: #2563eb; font-size: 14px;">${entry.questions.length} Randomly Assigned Questions</strong>
                  </td>
                  <td style="padding-top: 6px;">
                    <span style="color: #64748b; font-size: 11px; font-weight: 700; text-transform: uppercase;">Paper Authenticity</span><br/>
                    <span style="color: #16a34a; font-weight: 700; font-size: 12px;">✓ Unique Question Randomization Confirmed</span>
                  </td>
                </tr>
              </table>
            </div>

            <!-- Questions Table -->
            <div style="margin-bottom: 15px;">
              <div style="font-size: 12px; font-weight: 800; color: #334155; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">
                Assigned Examination Questions (1 Page Report):
              </div>
              <table style="width: 100%; border-collapse: collapse; font-size: 12.5px; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
                <thead>
                  <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1; text-align: left; font-size: 11px; color: #475569; text-transform: uppercase;">
                    <th style="padding: 9px 12px; text-align: center;">#</th>
                    <th style="padding: 9px 12px;">Type</th>
                    <th style="padding: 9px 12px;">Question / Problem Details</th>
                    <th style="padding: 9px 12px; text-align: center;">Marks</th>
                  </tr>
                </thead>
                <tbody>
                  ${qRows}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Footer (One page per student) -->
          <div style="border-top: 1px solid #e2e8f0; padding-top: 10px; margin-top: auto; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #94a3b8;">
            <div>Confidential Examination Material • Dedicated Student Paper • Unauthorized copying prohibited</div>
            <div>Candidate: <strong>${entry.studentEmail}</strong> • Page 1 of 1</div>
          </div>
        </div>
      `;
    }).join("");

    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Question_Assignment_Report_${examName.replace(/[^a-zA-Z0-9]/g, "_")}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 12mm 15mm;
            }
            * {
              box-sizing: border-box;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #1e293b;
              margin: 0;
              padding: 0;
              background: #fff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .candidate-page {
              page-break-after: always;
              break-after: page;
              page-break-inside: avoid;
              break-inside: avoid;
              min-height: 96vh;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              padding: 10px 0;
            }
            @media screen {
              body {
                background: #e2e8f0;
                padding: 20px;
              }
              .candidate-page {
                background: white;
                max-width: 800px;
                margin: 0 auto 30px auto;
                padding: 30px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.1);
                border-radius: 8px;
              }
            }
          </style>
        </head>
        <body>
          ${pagesHtml}
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 400);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(fullHtml);
    printWindow.document.close();
  }

  function exportCSV() {
    if (!report) return;
    const rows: string[] = [
      "Student Email,Access Password,Question #,Question ID,Type,Preview,Problem Title,Marks,Assigned At",
    ];
    for (const entry of report.assignments) {
      for (const [i, q] of entry.questions.entries()) {
        const preview = (q.questionText ?? "").replace(/"/g, '""').substring(0, 80);
        rows.push(
          `"${entry.studentEmail}","${entry.accessPassword || ""}",${i + 1},${q.questionId},"${q.questionType}","${preview}","${q.problemTitle ?? ""}",${q.marks ?? 1},"${entry.assignedAt}"`
        );
      }
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `question-assignment-${examName.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportJSON() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `question-assignment-${examName.replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = report
    ? report.assignments.filter((e) =>
        e.studentEmail.toLowerCase().includes(search.toLowerCase())
      )
    : [];

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              📋 Random Question Assignment &amp; 1-Page PDF Reports
            </h2>
            <p className="text-sm text-slate-500 mt-1 max-w-xl">
              Specify how many random questions from the question bank each student should receive.
              For Open-to-All exams, whoever enters the exam automatically receives this number of random questions.
              Generates a dedicated PDF report with exactly 1 candidate per page.
            </p>
          </div>
          {report && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={exportPDF}
                className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold px-3.5 py-1.5 rounded-lg shadow-xs transition cursor-pointer"
              >
                📄 Print / Save PDF (1 Page Per Student)
              </button>
              <button
                onClick={exportCSV}
                className="flex items-center gap-1.5 text-xs border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer"
              >
                ⬇️ Export CSV
              </button>
              <button
                onClick={exportJSON}
                className="flex items-center gap-1.5 text-xs border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer"
              >
                ⬇️ Export JSON
              </button>
            </div>
          )}
        </div>

        {/* Config row */}
        <div className="mt-5 flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Questions per student
            </label>
            <div className="flex items-center gap-2">
              <input
                id="qps-input"
                type="number"
                min={1}
                max={questionCount}
                value={qps}
                onChange={(e) => setQps(e.target.value)}
                onBlur={() => {
                  const val = Number(qps);
                  if (qps === "" || isNaN(val) || val < 1) {
                    setQps(1);
                  } else if (val > questionCount) {
                    setQps(questionCount);
                  } else {
                    setQps(val);
                  }
                }}
                className="w-24 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <span className="text-xs text-slate-400">
                of {questionCount} total
              </span>
            </div>
          </div>

          <button
            onClick={handleAssign}
            disabled={loading || questionCount === 0}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition cursor-pointer flex items-center gap-2 shadow-xs"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Saving…
              </>
            ) : (
              openToAll ? "🎲 Allocate Questions for Open Exam" : "🎲 Assign Random Questions"
            )}
          </button>

          {questionCount === 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
              ⚠️ Add questions to this exam before assigning.
            </p>
          )}
        </div>

        {openToAll && (
          <div className="mt-4 flex items-center gap-2 text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 px-4 py-2.5 rounded-xl font-medium">
            <span className="text-base">🌐</span>
            <span>
              <strong>Open to All (Public Exam) Active:</strong> Whoever enters this exam will automatically receive <strong>{qps} random questions</strong> from the question bank. As students verify and enter, their individual assignments will appear in the report below.
            </span>
          </div>
        )}

        {error && (
          <p className="mt-3 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2">
            {error}
          </p>
        )}
      </div>

      {/* Report */}
      {report && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          {/* Stats banner */}
          <div className="bg-indigo-50 border-b border-indigo-100 px-6 py-4 flex items-center gap-6 flex-wrap">
            <Stat label="Total Questions in Bank" value={report.totalQuestions} />
            <Stat label="Questions per Student" value={report.questionsPerStudent} />
            <Stat label="Students Assigned" value={report.totalStudents} />
          </div>

          {/* Search */}
          <div className="px-6 py-3 border-b border-slate-100">
            <input
              type="search"
              placeholder="Search by student email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full max-w-sm border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            />
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-semibold">Student</th>
                  <th className="text-left px-4 py-3 font-semibold">#</th>
                  <th className="text-left px-4 py-3 font-semibold">Q&nbsp;ID</th>
                  <th className="text-left px-4 py-3 font-semibold">Type</th>
                  <th className="text-left px-4 py-3 font-semibold">Question Preview</th>
                  <th className="text-left px-4 py-3 font-semibold">Assigned At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center text-slate-400 py-10">
                      No results found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((entry) =>
                    entry.questions.map((q, qi) => (
                      <tr
                        key={`${entry.studentEmail}-${q.questionId}`}
                        className={qi === 0 ? "bg-white" : "bg-slate-50/40"}
                      >
                        {qi === 0 && (
                          <td
                            rowSpan={entry.questions.length}
                            className="px-4 py-3 font-medium text-slate-800 align-top border-r border-slate-100"
                          >
                            <span className="flex items-center gap-1.5">
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold shrink-0">
                                {entry.studentEmail[0].toUpperCase()}
                              </span>
                              {entry.studentEmail}
                            </span>
                          </td>
                        )}
                        <td className="px-4 py-2 text-slate-500">{qi + 1}</td>
                        <td className="px-4 py-2 font-mono text-indigo-700">#{q.questionId}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                              q.questionType === "CODING"
                                ? "bg-violet-100 text-violet-700"
                                : "bg-sky-100 text-sky-700"
                            }`}
                          >
                            {q.questionType}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-slate-600 max-w-sm">
                          {q.problemTitle && (
                            <span className="font-semibold text-slate-700 block text-xs mb-0.5">
                              {q.problemTitle}
                            </span>
                          )}
                          <span className="line-clamp-2 text-xs">{q.questionText}</span>
                        </td>
                        {qi === 0 && (
                          <td
                            rowSpan={entry.questions.length}
                            className="px-4 py-3 text-slate-400 text-xs align-top whitespace-nowrap"
                          >
                            {new Date(entry.assignedAt).toLocaleString()}
                          </td>
                        )}
                      </tr>
                    ))
                  )
                )}
              </tbody>
            </table>
          </div>

          {/* Footer note */}
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-500">
            Students will receive exactly these questions when they start the exam. Re-clicking
            "Assign Randomly" will re-shuffle and overwrite all assignments.
          </div>
        </div>
      )}

      {!report && !loading && (
        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-12 text-center">
          <p className="text-4xl mb-3">🎲</p>
          <p className="text-slate-600 font-semibold">No assignments yet</p>
          <p className="text-slate-400 text-sm mt-1">
            Configure the number of questions per student above and click{" "}
            <strong>Assign Randomly</strong> to generate the assignment map.
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-bold text-indigo-700">{value}</p>
      <p className="text-xs text-indigo-500 font-medium">{label}</p>
    </div>
  );
}
