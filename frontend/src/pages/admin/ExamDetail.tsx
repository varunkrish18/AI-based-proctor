import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { api, downloadFile } from "../../api/client";
import ExamSettingsTab from "./ExamSettingsTab";
import type {
  AdminAttemptSummary,
  Exam,
  ExamAssignmentItem,
  ExamQuestion,
  TestCase,
  RunCodeResponse,
  ProctoringEvent,
  RiskPoint,
  RiskTimelineResponse,
  WarningResponse,
} from "../../types";

type Tab = "questions" | "settings" | "assign" | "results" | "qassign";

export default function ExamDetail() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryTab = searchParams.get("tab") as Tab | null;
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [tab, setTab] = useState<Tab>(
    queryTab && ["questions", "settings", "assign", "results", "qassign"].includes(queryTab) ? queryTab : "questions"
  );
  const [error, setError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function handleTabChange(nextTab: Tab) {
    setTab(nextTab);
    setSearchParams({ tab: nextTab });
  }

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
          <h1 className="text-2xl font-bold text-slate-900">{exam.name}</h1>
          <div className="text-slate-500 text-sm flex items-center gap-2 flex-wrap mt-0.5">
            <span>{exam.subject ?? "General"}</span>
            <span>&middot;</span>
            <span className={questions.length > exam.numQuestions ? "text-amber-700 font-semibold" : ""}>
              {questions.length}/{exam.numQuestions} questions added
            </span>
            {questions.length > exam.numQuestions && (
              <button
                type="button"
                onClick={() => handleUpdateLimit(questions.length)}
                className="text-xs bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded cursor-pointer transition-colors"
                title="Update exam limit to match total questions"
              >
                Sync limit to {questions.length}
              </button>
            )}
            <button
              type="button"
              onClick={promptChangeLimit}
              className="text-xs text-blue-600 hover:text-blue-800 underline font-medium cursor-pointer"
            >
              Edit Limit
            </button>
            <span>&middot;</span>
            <span>status: {exam.status}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
          {exam.status === "DRAFT" && (
            <button onClick={publish} className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-green-700 cursor-pointer">
              Publish Exam
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="border border-rose-300 text-rose-600 hover:bg-rose-50 px-3.5 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer"
          >
            Delete Exam
          </button>
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {[
          { id: "questions", label: "Questions" },
          { id: "settings", label: "Exam Settings & Timing" },
          { id: "assign", label: "Assign Students" },
          { id: "results", label: "Results & Integrity" },
          { id: "qassign", label: "📋 Question Assignment" },
        ].map((t) => (
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
      {tab === "assign" && <AssignTab exam={exam} onExamUpdated={setExam} />}
      {tab === "results" && <ResultsTab examId={exam.id} />}
      {tab === "qassign" && <QuestionAssignTab examId={exam.id} examName={exam.name} questionCount={questions.length} />}

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
  const [mcqForm, setMcqForm] = useState({
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
    marks: number;
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
  const [testRunResult, setTestRunResult] = useState<RunCodeResponse | null>(null);
  const [testRunError, setTestRunError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [increasingLimit, setIncreasingLimit] = useState(false);

  // Edit question state
  const [editingQuestion, setEditingQuestion] = useState<ExamQuestion | null>(null);
  const [editForm, setEditForm] = useState<{
    questionType: "MCQ" | "CODING";
    questionText: string;
    marks: number;
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
  const [aiNumQuestions, setAiNumQuestions] = useState(5);
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

  const isLimitReached = questions.length >= exam.numQuestions;
  const isOverLimit = questions.length > exam.numQuestions;

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
      const res = await api.post<RunCodeResponse>(
        "/api/admin/exams/questions/test-run",
        {
          code: codingForm.codeTemplate,
          language: "python",
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

  async function addQuestion(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (questionType === "MCQ") {
        await api.post(`/api/admin/exams/${exam.id}/questions`, {
          ...mcqForm,
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
          marks: codingForm.marks,
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
      await api.put(`/api/admin/exams/${exam.id}/questions/${editingQuestion.id}`, editForm, "admin");
      setEditingQuestion(null);
      onAdded();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update question.");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDeleteQuestion(qId: number) {
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
                    onChange={(e) => setAiNumQuestions(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
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
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Add Question</h3>
              <p className="text-xs text-slate-500 mt-0.5">Select question format: Multiple Choice or LeetCode Coding</p>
            </div>
            <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md">
              Question {questions.length + 1} of {exam.numQuestions}
            </span>
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
                  onChange={(e) => setMcq("marks", Number(e.target.value))}
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
                    onChange={(e) => setCodingForm((f) => ({ ...f, marks: Number(e.target.value) }))}
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
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">
                      Test Cases ({codingForm.testCases.length})
                    </span>
                    <span className="text-[11px] text-slate-500">
                      ({codingForm.testCases.filter((tc) => !tc.isHidden).length} Sample,{" "}
                      {codingForm.testCases.filter((tc) => tc.isHidden).length} Hidden)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={addTestCase}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-2.5 py-1 rounded transition-colors cursor-pointer"
                  >
                    + Add Test Case
                  </button>
                </div>

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
                  <button
                    type="button"
                    onClick={handleAdminTestRun}
                    disabled={testingCode || codingForm.testCases.length === 0}
                    className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {testingCode ? "⏳ Running..." : "▶ Test Run"}
                  </button>
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
          return (
            <div key={q.id} className="bg-white border border-slate-200 rounded-xl p-4 text-sm shadow-xs space-y-3">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
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
                </div>
                <div className="flex items-center gap-1.5">
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
                        onChange={(e) => setEditForm((f) => ({ ...f, marks: Number(e.target.value) }))}
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
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-800">
                        Test Cases ({editForm.testCases.length})
                      </span>
                      <button
                        type="button"
                        onClick={addEditTestCase}
                        className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded cursor-pointer"
                      >
                        + Add Test Case
                      </button>
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
                      onChange={(e) => setEditForm((f) => ({ ...f, marks: Number(e.target.value) }))}
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
      {/* Assign Form */}
      <form onSubmit={submit} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 h-fit shadow-xs">
        <div>
          <h3 className="font-bold text-slate-900 text-sm">Assign Students by Email</h3>
          <p className="text-slate-500 text-xs mt-0.5">
            Enter candidate emails below (one per line, or comma-separated). A random access password will be generated for each student.
          </p>
        </div>
        <textarea
          rows={4}
          placeholder="student1@example.com&#10;student2@example.com"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          className="input font-mono text-xs w-full"
        />

        {/* Excel / CSV File Upload Feature */}
        <div className="border border-dashed border-slate-300 rounded-xl p-4 bg-slate-50/70 hover:bg-slate-50 transition-colors">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">📄</span>
            <h4 className="font-bold text-slate-800 text-xs">
              Upload Excel or CSV File
            </h4>
          </div>
          <p className="text-[11px] text-slate-500 mb-2.5">
            The file should contain only one column of mail IDs. Emails will be extracted automatically.
          </p>
          <div className="flex items-center gap-2">
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer shadow-2xs transition"
            >
              <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {fileUploading ? "Reading file…" : "Choose .xlsx, .xls or .csv"}
            </label>
          </div>
          {fileSuccessMsg && (
            <p className="text-[11px] font-medium text-emerald-700 mt-2 bg-emerald-50 border border-emerald-200 p-2 rounded-lg">
              {fileSuccessMsg}
            </p>
          )}
        </div>

        {status && (
          <p
            className={`text-xs font-medium p-2.5 rounded-lg ${
              status.startsWith("✓")
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-red-50 text-red-700"
            }`}
          >
            {status}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting || (!emails.trim())}
          className="w-full bg-blue-600 text-white px-4 py-2.5 rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
        >
          {submitting ? "Assigning & Generating Passwords…" : "Assign Students"}
        </button>
      </form>

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
  const [exportingId, setExportingId] = useState<number | null>(null);
  const [exportingCumulative, setExportingCumulative] = useState<boolean>(false);
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

  function loadAttempts(email = studentEmailFilter, sev = attemptSeverityFilter, evt = attemptEventTypeFilter) {
    setLoading(true);
    const params = new URLSearchParams();
    if (email.trim()) params.append("studentEmail", email.trim());
    if (sev) params.append("severity", sev);
    if (evt) params.append("eventType", evt);
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

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    loadAttempts();
  }

  function handleClearFilter() {
    setStudentEmailFilter("");
    setAttemptSeverityFilter("");
    setAttemptEventTypeFilter("");
    loadAttempts("", "", "");
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
      <form onSubmit={handleFilterSubmit} className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-wrap items-center gap-3">
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
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer"
        >
          Filter
        </button>
        {(studentEmailFilter || attemptSeverityFilter || attemptEventTypeFilter) && (
          <button
            type="button"
            onClick={handleClearFilter}
            className="border border-slate-300 hover:bg-slate-50 text-slate-600 text-xs font-medium px-3 py-2 rounded-lg transition-colors cursor-pointer"
          >
            Clear
          </button>
        )}
      </form>

      {/* Attempts Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs">
        <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap justify-between items-center gap-3 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-slate-800 text-sm">Student Attempts ({attempts.length})</h3>
            <button
              onClick={() => loadAttempts()}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
            >
              ↻ Refresh
            </button>
          </div>
          <button
            onClick={handleExportCumulativePdf}
            disabled={exportingCumulative || attempts.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-xs transition-all cursor-pointer disabled:opacity-50"
            title="Download cumulative PDF containing all candidate results, verified marks & proctoring audit"
          >
            <span>📄 {exportingCumulative ? "Generating PDF…" : "Export Cumulative Exam PDF (All Students)"}</span>
          </button>
        </div>
        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-left border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 whitespace-nowrap font-semibold">Student</th>
                <th className="px-4 py-3 whitespace-nowrap font-semibold">Attempt</th>
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

                return (
                  <tr key={a.attemptId} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{a.studentEmail}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">#{a.attemptNumber}</td>
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
                          onClick={() => handleExport(a.attemptId, "pdf")}
                          disabled={exportingId === a.attemptId}
                          className="text-rose-700 hover:text-rose-900 font-bold text-xs bg-rose-50 hover:bg-rose-100 border border-rose-300 px-2 py-1 rounded-md transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1 shadow-2xs"
                          title="Export candidate report as PDF"
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
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    No attempts recorded for this exam yet.
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
}

interface StudentAssignmentEntry {
  studentEmail: string;
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
}: {
  examId: number;
  examName: string;
  questionCount: number;
}) {
  const [qps, setQps] = useState<number>(2);
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
    if (qps <= 0 || qps > questionCount) {
      setError(`Questions per student must be between 1 and ${questionCount}.`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.post<QuestionAssignmentReport>(
        `/api/admin/exams/${examId}/assign-questions-randomly`,
        { questionsPerStudent: qps },
        "admin"
      );
      setReport(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assignment failed.");
    } finally {
      setLoading(false);
    }
  }

  function exportCSV() {
    if (!report) return;
    const rows: string[] = [
      "Student Email,Question #,Question ID,Type,Preview,Problem Title,Assigned At",
    ];
    for (const entry of report.assignments) {
      for (const [i, q] of entry.questions.entries()) {
        const preview = (q.questionText ?? "").replace(/"/g, '""').substring(0, 80);
        rows.push(
          `"${entry.studentEmail}",${i + 1},${q.questionId},"${q.questionType}","${preview}","${q.problemTitle ?? ""}","${entry.assignedAt}"`
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
              📋 Random Question Assignment
            </h2>
            <p className="text-sm text-slate-500 mt-1 max-w-xl">
              Randomly map a fixed number of questions from the question bank to each
              assigned student. Each student gets a unique, randomised subset.
              Re-running overwrites any previous assignment.
            </p>
          </div>
          {report && (
            <div className="flex gap-2">
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
                onChange={(e) => setQps(Math.max(1, parseInt(e.target.value, 10) || 1))}
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
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition cursor-pointer flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Assigning…
              </>
            ) : (
              "🎲 Assign Randomly"
            )}
          </button>

          {questionCount === 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
              ⚠️ Add questions to this exam before assigning.
            </p>
          )}
        </div>

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
