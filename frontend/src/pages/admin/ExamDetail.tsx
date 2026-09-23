import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, downloadFile } from "../../api/client";
import type {
  AdminAttemptSummary,
  Exam,
  ExamAssignmentItem,
  ExamQuestion,
  ProctoringEvent,
  RiskPoint,
  RiskTimelineResponse,
  WarningResponse,
} from "../../types";

type Tab = "questions" | "assign" | "results";

export default function ExamDetail() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [tab, setTab] = useState<Tab>("questions");
  const [error, setError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function reload() {
    Promise.all([
      api.get<Exam>(`/api/admin/exams/${examId}`, "admin"),
      api.get<ExamQuestion[]>(`/api/admin/exams/${examId}/questions`, "admin"),
    ])
      .then(([e, qs]) => {
        setExam(e);
        setQuestions(qs);
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
    <div className="max-w-5xl mx-auto px-4 py-10">
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
        {(["questions", "assign", "results"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px cursor-pointer ${
              tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "questions" ? "Questions" : t === "assign" ? "Assign Students" : "Results & Integrity"}
          </button>
        ))}
      </div>

      {tab === "questions" && (
        <QuestionsTab
          exam={exam}
          questions={questions}
          onAdded={reload}
          onUpdateLimit={handleUpdateLimit}
        />
      )}
      {tab === "assign" && <AssignTab examId={exam.id} />}
      {tab === "results" && <ResultsTab examId={exam.id} />}

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
}: {
  exam: Exam;
  questions: ExamQuestion[];
  onAdded: () => void;
  onUpdateLimit: (newLimit: number) => Promise<void>;
}) {
  const [form, setForm] = useState({ questionText: "", optionA: "", optionB: "", optionC: "", optionD: "", correctAnswer: 0, marks: 1 });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [increasingLimit, setIncreasingLimit] = useState(false);

  // Edit question state
  const [editingQuestion, setEditingQuestion] = useState<ExamQuestion | null>(null);
  const [editForm, setEditForm] = useState({
    questionText: "",
    optionA: "",
    optionB: "",
    optionC: "",
    optionD: "",
    correctAnswer: 0,
    marks: 1,
  });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deletingQuestionId, setDeletingQuestionId] = useState<number | null>(null);

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

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function addQuestion(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/api/admin/exams/${exam.id}/questions`, form, "admin");
      setForm({ questionText: "", optionA: "", optionB: "", optionC: "", optionD: "", correctAnswer: 0, marks: 1 });
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
      questionText: q.questionText,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      correctAnswer: q.correctAnswer,
      marks: q.marks,
    });
    setEditError(null);
  }

  async function handleUpdateQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!editingQuestion) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
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
          </div>
        </div>
      ) : (
        <form onSubmit={addQuestion} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 h-fit shadow-xs">
          <div>
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-900 text-sm">Add Question</h3>
              <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                Question {questions.length + 1} of {exam.numQuestions}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">Create a multiple-choice question for this exam</p>
          </div>
          <textarea
            required
            placeholder="Question text"
            value={form.questionText}
            onChange={(e) => set("questionText", e.target.value)}
            className="input"
            rows={2}
          />
          {(["optionA", "optionB", "optionC", "optionD"] as const).map((key, idx) => (
            <div key={key} className="flex items-center gap-2">
              <input
                type="radio"
                name="correct"
                checked={form.correctAnswer === idx}
                onChange={() => set("correctAnswer", idx)}
                className="cursor-pointer"
                title="Mark as correct answer"
              />
              <span className="text-xs font-bold text-slate-500 w-4">{String.fromCharCode(65 + idx)}.</span>
              <input
                required
                placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
                className="input"
              />
            </div>
          ))}
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600">Marks</label>
            <input
              type="number"
              min={0}
              step="0.5"
              value={form.marks}
              onChange={(e) => set("marks", Number(e.target.value))}
              className="input w-24"
            />
          </div>
          {error && <p className="text-rose-600 text-xs bg-rose-50 p-2 rounded">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {submitting ? "Adding…" : "+ Add Question"}
          </button>
        </form>
      )}

      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-slate-900 text-sm">Question Bank ({questions.length})</h3>
          <span className="text-xs text-slate-400">Total marks: {questions.reduce((acc, q) => acc + (Number(q.marks) || 0), 0)}</span>
        </div>

        {questions.map((q, idx) => (
          <div key={q.id} className="bg-white border border-slate-200 rounded-xl p-4 text-sm shadow-xs space-y-3">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                  Q{idx + 1}
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
          </div>
        ))}

        {questions.length === 0 && (
          <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl bg-white">
            No questions added yet. Use the form to configure questions.
          </div>
        )}
      </div>

      {/* Edit Question Modal */}
      {editingQuestion && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 border border-slate-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Edit / Correct Question</h3>
                <p className="text-xs text-slate-500">Update the question text, options, or correct answer</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingQuestion(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateQuestion} className="space-y-3.5">
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
                  min={0}
                  step="0.5"
                  value={editForm.marks}
                  onChange={(e) => setEditForm((f) => ({ ...f, marks: Number(e.target.value) }))}
                  className="input w-24"
                />
              </div>

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

function AssignTab({ examId }: { examId: number }) {
  const [emails, setEmails] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [assignments, setAssignments] = useState<ExamAssignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");
  const [unassigningId, setUnassigningId] = useState<number | null>(null);

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    const list = emails.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    if (!list.length) return;
    setSubmitting(true);
    try {
      const res = await api.post<{ assigned: number; skipped: number }>(`/api/admin/exams/${examId}/assign`, { emails: list }, "admin");
      setStatus(`✓ Assigned ${res.assigned} student(s) (${res.skipped} already assigned).`);
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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Assign Form */}
      <form onSubmit={submit} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 h-fit shadow-xs">
        <div>
          <h3 className="font-bold text-slate-900 text-sm">Assign Students by Email</h3>
          <p className="text-slate-500 text-xs mt-0.5">
            Enter candidate emails below (one per line, or comma-separated).
          </p>
        </div>
        <textarea
          rows={5}
          required
          placeholder="student1@example.com&#10;student2@example.com"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          className="input font-mono text-xs"
        />
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
          disabled={submitting}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {submitting ? "Assigning…" : "Assign Students"}
        </button>
      </form>

      {/* Assigned Students List */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">
              Assigned Students ({assignments.length})
            </h3>
            <p className="text-slate-500 text-xs">Students authorized to sit for this exam</p>
          </div>
          <button
            onClick={loadAssignments}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
          >
            ↻ Refresh
          </button>
        </div>

        {assignments.length > 5 && (
          <div>
            <input
              type="text"
              placeholder="Search assigned emails…"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="input text-xs py-1.5"
            />
          </div>
        )}

        {loading ? (
          <p className="text-slate-400 text-xs py-4 text-center">Loading assigned students…</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs border border-dashed border-slate-200 rounded-lg">
            {assignments.length === 0
              ? "No students assigned to this exam yet. Use the form on the left to assign students."
              : `No students matching "${searchFilter}".`}
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {filtered.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between p-3 hover:bg-slate-50/60 transition-colors text-xs"
              >
                <div>
                  <p className="font-semibold text-slate-800">{a.studentEmail}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Assigned: {new Date(a.createdAt).toLocaleString()}
                  </p>
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
      .then(setAttempts)
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
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Attempt</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Risk Score</th>
              <th className="px-4 py-3">Review</th>
              <th className="px-4 py-3">Live Media</th>
              <th className="px-4 py-3">Events</th>
              <th className="px-4 py-3 text-right">Action</th>
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
                <tr key={a.attemptId} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">{a.studentEmail}</td>
                  <td className="px-4 py-3 text-slate-600">#{a.attemptNumber}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
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
                  <td className="px-4 py-3 font-semibold text-slate-800">
                    {a.score !== null ? a.score : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${riskBadgeClass}`}>
                      {scoreVal.toFixed(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {a.flaggedForReview ? (
                      <span className="bg-rose-600 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                        FLAGGED
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">Clear</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
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
                  <td className="px-4 py-3">
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
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => loadTimeline(a)}
                        className="text-blue-600 hover:text-blue-800 font-medium text-xs bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 transition-colors cursor-pointer"
                        title="Inline quick timeline"
                      >
                        Quick View
                      </button>
                      <Link
                        to={`/admin/exams/${examId}/attempts/${a.attemptId}`}
                        className="text-blue-700 hover:text-blue-900 font-bold text-xs bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-1 rounded transition-colors"
                        title="Evaluate student answers & assign verified marks"
                      >
                        Evaluate & Marks ↗
                      </Link>
                      <button
                        onClick={() => handleExport(a.attemptId, "pdf")}
                        disabled={exportingId === a.attemptId}
                        className="text-rose-600 hover:text-rose-800 font-semibold text-xs bg-rose-50 px-1.5 py-1 rounded hover:bg-rose-100 transition-colors cursor-pointer disabled:opacity-50"
                        title="Export PDF"
                      >
                        PDF
                      </button>
                      <button
                        onClick={() => handleExport(a.attemptId, "excel")}
                        disabled={exportingId === a.attemptId}
                        className="text-emerald-600 hover:text-emerald-800 font-semibold text-xs bg-emerald-50 px-1.5 py-1 rounded hover:bg-emerald-100 transition-colors cursor-pointer disabled:opacity-50"
                        title="Export Excel"
                      >
                        XLS
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
            <div className="flex items-center gap-2">
              <Link
                to={`/admin/exams/${examId}/attempts/${selectedAttempt.attemptId}`}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-1.5 rounded shadow-xs"
              >
                Full Page Report ↗
              </Link>
              <button
                onClick={() => handleExport(selectedAttempt.attemptId, "pdf")}
                disabled={exportingId === selectedAttempt.attemptId}
                className="text-xs bg-rose-600 hover:bg-rose-700 text-white font-medium px-2.5 py-1.5 rounded shadow-xs cursor-pointer disabled:opacity-50"
              >
                PDF
              </button>
              <button
                onClick={() => handleExport(selectedAttempt.attemptId, "excel")}
                disabled={exportingId === selectedAttempt.attemptId}
                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-2.5 py-1.5 rounded shadow-xs cursor-pointer disabled:opacity-50"
              >
                Excel
              </button>
              <button
                onClick={() => setSelectedAttempt(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-medium ml-2 cursor-pointer"
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

  const validScores = history
    .map((p) => Number(p.score ?? (p as any).riskScore ?? 0))
    .filter((n) => !isNaN(n));
  const maxScore = Math.max(100, ...(validScores.length > 0 ? validScores : [100]));

  const points = history.map((pt, i) => {
    const rawVal = Number(pt.score ?? (pt as any).riskScore ?? 0);
    const scoreVal = isNaN(rawVal) ? 0 : rawVal;
    const x =
      padding.left + (history.length === 1 ? innerWidth / 2 : (i / Math.max(1, history.length - 1)) * innerWidth);
    const y = padding.top + innerHeight - (scoreVal / Math.max(1, maxScore)) * innerHeight;
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

  const thresholdY = padding.top + innerHeight - (75 / Math.max(1, maxScore)) * innerHeight;

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
          const y = padding.top + innerHeight - (val / Math.max(1, maxScore)) * innerHeight;
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
