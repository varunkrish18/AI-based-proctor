import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import type { Exam } from "../../types";

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CreateExam() {
  const navigate = useNavigate();
  const now = new Date();
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
  const inOneWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [form, setForm] = useState({
    name: "",
    description: "",
    subject: "",
    durationMinutes: 60,
    startAt: toLocalInputValue(inOneHour),
    endAt: toLocalInputValue(inOneWeek),
    numQuestions: 10,
    passingMarks: 5,
    negativeMarking: 0,
    randomizeQuestions: true,
    randomizeOptions: true,
    maxAttempts: 1,
    webcamRequired: true,
    microphoneRequired: true,
    screenRequired: true,
    locationRequired: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        startAt: new Date(form.startAt).toISOString(),
        endAt: new Date(form.endAt).toISOString(),
      };
      const exam = await api.post<Exam>("/api/admin/exams", payload, "admin");
      navigate(`/admin/exams/${exam.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create exam.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-xl font-bold text-slate-900 mb-6">Create Exam</h1>
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-4">
        <Field label="Exam Name">
          <input required value={form.name} onChange={(e) => set("name", e.target.value)} className="input" />
        </Field>
        <Field label="Description">
          <textarea value={form.description} onChange={(e) => set("description", e.target.value)} className="input" rows={3} />
        </Field>
        <Field label="Subject">
          <input value={form.subject} onChange={(e) => set("subject", e.target.value)} className="input" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Duration (minutes)">
            <input type="number" min={1} required value={form.durationMinutes}
              onChange={(e) => set("durationMinutes", Number(e.target.value))} className="input" />
          </Field>
          <Field label="Number of Questions">
            <input type="number" min={1} required value={form.numQuestions}
              onChange={(e) => set("numQuestions", Number(e.target.value))} className="input" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start Date/Time">
            <input type="datetime-local" required value={form.startAt}
              onChange={(e) => set("startAt", e.target.value)} className="input" />
          </Field>
          <Field label="End Date/Time">
            <input type="datetime-local" required value={form.endAt}
              onChange={(e) => set("endAt", e.target.value)} className="input" />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Passing Marks">
            <input type="number" min={0} required value={form.passingMarks}
              onChange={(e) => set("passingMarks", Number(e.target.value))} className="input" />
          </Field>
          <Field label="Negative Marking">
            <input type="number" min={0} step="0.25" value={form.negativeMarking}
              onChange={(e) => set("negativeMarking", Number(e.target.value))} className="input" />
          </Field>
          <Field label="Max Attempts">
            <input type="number" min={1} value={form.maxAttempts}
              onChange={(e) => set("maxAttempts", Number(e.target.value))} className="input" />
          </Field>
        </div>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.randomizeQuestions} onChange={(e) => set("randomizeQuestions", e.target.checked)} />
            Randomize question order
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.randomizeOptions} onChange={(e) => set("randomizeOptions", e.target.checked)} />
            Randomize option order
          </label>
        </div>

        <div className="pt-2 border-t border-slate-100">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Proctoring Requirements</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.webcamRequired} onChange={(e) => set("webcamRequired", e.target.checked)} />
              Require Webcam monitoring
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.microphoneRequired} onChange={(e) => set("microphoneRequired", e.target.checked)} />
              Require Microphone monitoring
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.screenRequired} onChange={(e) => set("screenRequired", e.target.checked)} />
              Require Full Screen Capture
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.locationRequired} onChange={(e) => set("locationRequired", e.target.checked)} />
              Require Location Verification
            </label>
          </div>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button type="submit" disabled={submitting} className="bg-blue-600 text-white px-5 py-2 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50">
          {submitting ? "Creating…" : "Create Exam (Draft)"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      {children}
    </label>
  );
}
