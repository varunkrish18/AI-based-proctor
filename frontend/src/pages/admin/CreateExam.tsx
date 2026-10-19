import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import type { Exam, StudentUser } from "../../types";
import {
  type ClassSectionItem,
  loadSavedClassSections,
  getStudentsForClassSection,
  matchesYear,
} from "../../utils/sectionUtils";

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CreateExam() {
  const navigate = useNavigate();
  const now = new Date();
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
  const inOneWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [allStudents, setAllStudents] = useState<StudentUser[]>([]);
  const [classSections, setClassSections] = useState<ClassSectionItem[]>([]);
  const [assignSectionImmediately, setAssignSectionImmediately] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string>("ALL");
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");

  const [form, setForm] = useState<{
    name: string;
    description: string;
    subject: string;
    durationMinutes: number | string;
    startAt: string;
    endAt: string;
    numQuestions: number | string;
    passingMarks: number | string;
    negativeMarking: number | string;
    randomizeQuestions: boolean;
    randomizeOptions: boolean;
    maxAttempts: number | string;
    webcamRequired: boolean;
    microphoneRequired: boolean;
    screenRequired: boolean;
    locationRequired: boolean;
    audioInputLevel: number | string;
  }>({
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
    audioInputLevel: 20,
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  useEffect(() => {
    api
      .get<StudentUser[]>("/api/admin/students", "admin")
      .then((data) => {
        setAllStudents(data);
        const sections = loadSavedClassSections(data);
        setClassSections(sections);
        if (sections.length > 0) setSelectedSectionId(sections[0].id);
      })
      .catch(() => {
        const fallback = loadSavedClassSections();
        setClassSections(fallback);
        if (fallback.length > 0) setSelectedSectionId(fallback[0].id);
      });
  }, []);

  const availableSections = useMemo(() => {
    if (selectedYear === "ALL") return classSections;
    return classSections.filter((s) => matchesYear(s.year, selectedYear));
  }, [classSections, selectedYear]);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        durationMinutes: Math.max(1, Number(form.durationMinutes) || 60),
        numQuestions: Math.max(1, Number(form.numQuestions) || 10),
        passingMarks: Math.max(0, Number(form.passingMarks) || 0),
        negativeMarking: Math.max(0, Number(form.negativeMarking) || 0),
        maxAttempts: Math.max(1, Number(form.maxAttempts) || 1),
        audioInputLevel: Math.max(1, Math.min(100, Number(form.audioInputLevel) || 20)),
        startAt: new Date(form.startAt).toISOString(),
        endAt: new Date(form.endAt).toISOString(),
      };
      const exam = await api.post<Exam>("/api/admin/exams", payload, "admin");

      if (assignSectionImmediately && activeSection && sectionStudents.length > 0) {
        const emails = sectionStudents.map((s) => s.email.trim()).filter(Boolean);
        if (emails.length > 0) {
          try {
            await api.post(`/api/admin/exams/${exam.id}/assign`, { emails }, "admin");
          } catch (assignErr) {
            console.warn("Could not auto-assign section students", assignErr);
          }
        }
        navigate(`/admin/exams/${exam.id}?tab=assign`);
        return;
      }

      navigate(`/admin/exams/${exam.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create exam.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Create Exam</h1>
        <p className="text-xs text-slate-500 mt-1">
          Configure your examination settings. If you make any mistakes in time, question limits, attempts, or questions, you can fully edit every parameter at any time.
        </p>
      </div>
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
            <input
              type="number"
              min={1}
              required
              value={form.durationMinutes}
              onChange={(e) => set("durationMinutes", e.target.value)}
              onBlur={() => {
                if (form.durationMinutes === "" || Number(form.durationMinutes) < 1) {
                  set("durationMinutes", 1);
                }
              }}
              className="input"
            />
          </Field>
          <Field label="Number of Questions">
            <input
              type="number"
              min={1}
              required
              value={form.numQuestions}
              onChange={(e) => set("numQuestions", e.target.value)}
              onBlur={() => {
                if (form.numQuestions === "" || Number(form.numQuestions) < 1) {
                  set("numQuestions", 1);
                }
              }}
              className="input"
            />
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
            <input
              type="number"
              min={0}
              required
              value={form.passingMarks}
              onChange={(e) => set("passingMarks", e.target.value)}
              onBlur={() => {
                if (form.passingMarks === "" || Number(form.passingMarks) < 0) {
                  set("passingMarks", 0);
                }
              }}
              className="input"
            />
          </Field>
          <Field label="Negative Marking">
            <input
              type="number"
              min={0}
              step="0.25"
              value={form.negativeMarking}
              onChange={(e) => set("negativeMarking", e.target.value)}
              onBlur={() => {
                if (form.negativeMarking === "" || Number(form.negativeMarking) < 0) {
                  set("negativeMarking", 0);
                }
              }}
              className="input"
            />
          </Field>
          <Field label="Max Attempts">
            <input
              type="number"
              min={1}
              value={form.maxAttempts}
              onChange={(e) => set("maxAttempts", e.target.value)}
              onBlur={() => {
                if (form.maxAttempts === "" || Number(form.maxAttempts) < 1) {
                  set("maxAttempts", 1);
                }
              }}
              className="input"
            />
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

            {form.microphoneRequired && (
              <div className="col-span-2 mt-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold text-slate-700">Microphone Input Level / Gain</span>
                  <span className="text-xs font-mono font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                    {form.audioInputLevel}%
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={5}
                    max={100}
                    step={1}
                    value={Number(form.audioInputLevel) || 20}
                    onChange={(e) => set("audioInputLevel", Number(e.target.value))}
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                  <input
                    type="number"
                    min={5}
                    max={100}
                    value={form.audioInputLevel}
                    onChange={(e) => set("audioInputLevel", e.target.value)}
                    onBlur={() => {
                      const val = Number(form.audioInputLevel);
                      if (form.audioInputLevel === "" || isNaN(val) || val < 1) {
                        set("audioInputLevel", 20);
                      } else if (val > 100) {
                        set("audioInputLevel", 100);
                      }
                    }}
                    className="w-16 px-2 py-1 text-xs border border-slate-300 rounded text-center"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Sets the proctoring audio input sensitivity / gain applied to candidate microphones during the exam (e.g. set to 20 for 20% volume).
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Class Section Pre-Assignment */}
        <div className="pt-3 border-t border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-700">Assign Class Section (Optional)</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Automatically assign students from a class section upon exam creation.
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg transition">
              <input
                type="checkbox"
                checked={assignSectionImmediately}
                onChange={(e) => setAssignSectionImmediately(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 cursor-pointer"
              />
              <span>Assign Section</span>
            </label>
          </div>

          {assignSectionImmediately && (
            <div className="bg-slate-50/90 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Select Year:</label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="input text-xs w-full bg-white"
                  >
                    <option value="ALL">All Years</option>
                    <option value="1st Year">1st Year (I)</option>
                    <option value="2nd Year">2nd Year (II)</option>
                    <option value="3rd Year">3rd Year (III)</option>
                    <option value="4th Year">4th Year (IV)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select Section (From Group Student Registry):
                  </label>
                  <select
                    value={selectedSectionId}
                    onChange={(e) => setSelectedSectionId(e.target.value)}
                    className="input text-xs w-full bg-white font-medium"
                  >
                    {availableSections.length === 0 ? (
                      <option value="">No sections found for {selectedYear}</option>
                    ) : (
                      availableSections.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.className} — {s.department || "Dept"} ({s.startReg || "..."} - {s.endReg || "..."})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {activeSection && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs bg-white border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{activeSection.className}</span>
                    <span className="text-slate-500 font-mono text-[11px]">
                      ({activeSection.startReg} → {activeSection.endReg})
                    </span>
                    <span className="text-slate-600 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                      {activeSection.department || "All Depts"}
                    </span>
                  </div>
                  <span className="text-emerald-800 font-bold bg-emerald-100 px-2.5 py-1 rounded text-xs shrink-0">
                    {sectionStudents.length} students will be assigned
                  </span>
                </div>
              )}
            </div>
          )}
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
