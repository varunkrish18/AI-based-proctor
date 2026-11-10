import { useState } from "react";
import { api, isCoordinatorRole, isAdminRole, isProfessorUserRole } from "../../api/client";
import type { Exam } from "../../types";

function toLocalInputValue(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface ExamSettingsTabProps {
  exam: Exam;
  onUpdated: (updated: Exam) => void;
  onSwitchToQuestions?: () => void;
}

export default function ExamSettingsTab({ exam, onUpdated, onSwitchToQuestions }: ExamSettingsTabProps) {
  const isCoordinator = isCoordinatorRole();
  const isAdmin = isAdminRole();
  const isProfessorUser = isProfessorUserRole() || (!isCoordinator && !isAdmin);

  if (isProfessorUser) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs text-center max-w-2xl mx-auto my-8">
        <div className="w-16 h-16 bg-amber-50 rounded-2xl border border-amber-200 flex items-center justify-center mx-auto mb-4 text-3xl">
          🔒
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Exam Settings &amp; Timing Locked</h2>
        <p className="text-sm text-slate-600 mb-6 leading-relaxed">
          Exam settings, question limits, timing, and security parameters are strictly managed by your Course Coordinator.
          As an assigned Professor, you can add questions and assign students in their respective tabs.
        </p>
        {onSwitchToQuestions && (
          <button
            type="button"
            onClick={onSwitchToQuestions}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition shadow-sm cursor-pointer"
          >
            ← Go to Questions Tab
          </button>
        )}
      </div>
    );
  }

  const isClassSettingsLocked = Boolean(exam.isClass) && isProfessorUser;
  const isClassPolicy = isCoordinator || Boolean(exam.isClass);
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
    status: string;
  }>({
    name: exam.name || "",
    description: exam.description || "",
    subject: exam.subject || "",
    durationMinutes: exam.durationMinutes || 60,
    startAt: toLocalInputValue(exam.startAt),
    endAt: toLocalInputValue(exam.endAt),
    numQuestions: exam.numQuestions || 10,
    passingMarks: exam.passingMarks ?? 5,
    negativeMarking: exam.negativeMarking ?? 0,
    randomizeQuestions: exam.randomizeQuestions ?? true,
    randomizeOptions: exam.randomizeOptions ?? true,
    maxAttempts: exam.maxAttempts || 1,
    webcamRequired: exam.webcamRequired ?? true,
    microphoneRequired: exam.microphoneRequired ?? true,
    screenRequired: exam.screenRequired ?? true,
    locationRequired: exam.locationRequired ?? false,
    audioInputLevel: exam.audioInputLevel ?? 20,
    status: exam.status || "DRAFT",
  });

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleReset() {
    setForm({
      name: exam.name || "",
      description: exam.description || "",
      subject: exam.subject || "",
      durationMinutes: exam.durationMinutes || 60,
      startAt: toLocalInputValue(exam.startAt),
      endAt: toLocalInputValue(exam.endAt),
      numQuestions: exam.numQuestions || 10,
      passingMarks: exam.passingMarks ?? 5,
      negativeMarking: exam.negativeMarking ?? 0,
      randomizeQuestions: exam.randomizeQuestions ?? true,
      randomizeOptions: exam.randomizeOptions ?? true,
      maxAttempts: exam.maxAttempts || 1,
      webcamRequired: exam.webcamRequired ?? true,
      microphoneRequired: exam.microphoneRequired ?? true,
      screenRequired: exam.screenRequired ?? true,
      locationRequired: exam.locationRequired ?? false,
      audioInputLevel: exam.audioInputLevel ?? 20,
      status: exam.status || "DRAFT",
    });
    setSaveSuccess(null);
    setSaveError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(null);
    setSaveError(null);

    const startDate = new Date(form.startAt);
    const endDate = new Date(form.endAt);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      setSaveError("Please provide valid start and end dates.");
      setSaving(false);
      return;
    }
    if (endDate <= startDate) {
      setSaveError("End Date/Time must be strictly after Start Date/Time.");
      setSaving(false);
      return;
    }

    try {
      const payload = {
        ...form,
        durationMinutes: isClassPolicy ? null : (form.durationMinutes ? Math.max(1, Number(form.durationMinutes)) : null),
        numQuestions: Math.max(1, Number(form.numQuestions) || 10),
        maxAttempts: isClassPolicy ? null : (form.maxAttempts ? Math.max(1, Number(form.maxAttempts)) : null),
        passingMarks: isClassPolicy ? null : (form.passingMarks !== "" && form.passingMarks != null ? Math.max(0, Number(form.passingMarks)) : null),
        negativeMarking: isClassPolicy ? null : (form.negativeMarking !== "" && form.negativeMarking != null ? Math.max(0, Number(form.negativeMarking)) : null),
        audioInputLevel: Math.max(1, Math.min(100, Number(form.audioInputLevel) || 20)),
        startAt: startDate.toISOString(),
        endAt: endDate.toISOString(),
      };
      const updated = await api.put<Exam>(`/api/admin/exams/${exam.id}`, payload, "admin");
      onUpdated(updated);
      setSaveSuccess("Exam configuration updated successfully! All changes are now live.");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to update exam.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs max-w-4xl space-y-8">
      <div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <span>⚙️</span> Edit Exam Configuration &amp; Parameters
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Correct any mistakes in timings, attempts, question limits, scoring, or proctoring rules.
            </p>
          </div>
          {onSwitchToQuestions && (
            <button
              type="button"
              onClick={onSwitchToQuestions}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              Manage Questions &rarr;
            </button>
          )}
        </div>
      </div>

      {isClassPolicy && (
        <div className="bg-indigo-50/90 border border-indigo-200 rounded-xl p-4 text-xs text-indigo-950 flex items-start gap-3">
          <span className="text-xl">🏫</span>
          <div className="space-y-1">
            <p className="font-bold text-indigo-900">Academic Class Policies Enforced</p>
            <p className="text-indigo-800 leading-relaxed">
              This class has <strong>infinite attempts</strong> and <strong>untimed sessions</strong> (no per-attempt countdown limit). Candidate access is active between the configured Start and End dates.
            </p>
            {exam.assignedProfessorName && (
              <p className="text-indigo-950 font-semibold pt-0.5">
                👨‍🏫 Assigned Faculty: {exam.assignedProfessorName} ({exam.assignedProfessorEmail})
              </p>
            )}
          </div>
        </div>
      )}

      {isClassSettingsLocked && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-xs text-amber-950 flex items-start gap-3 shadow-xs">
          <span className="text-xl">🔒</span>
          <div className="space-y-1">
            <p className="font-bold text-amber-900">Class Settings Locked by Course Coordinator</p>
            <p className="text-amber-850 leading-relaxed">
              As an assigned Professor, you cannot modify class settings (dates, duration, passing marks, or proctoring parameters). You can add new questions and assign students in their respective tabs.
            </p>
          </div>
        </div>
      )}

      {saveSuccess && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
          <span className="flex items-center gap-2 font-medium">
            <span>✓</span> {saveSuccess}
          </span>
          <button onClick={() => setSaveSuccess(null)} className="text-emerald-700 hover:text-emerald-900 font-bold cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {saveError && (
        <div className="bg-rose-50 border border-rose-300 text-rose-800 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
          <span className="flex items-center gap-2 font-medium">
            <span>⚠️</span> {saveError}
          </span>
          <button onClick={() => setSaveError(null)} className="text-rose-700 hover:text-rose-900 font-bold cursor-pointer">
            ✕
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <fieldset disabled={isClassSettingsLocked} className="space-y-6 disabled:opacity-80">
        {/* SECTION 1: General Details */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 pb-2 border-b border-slate-100 flex items-center gap-2">
            <span>📝</span> Basic Information
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Exam Name *</label>
              <input
                required
                type="text"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Midterm Physics Assessment"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="DRAFT">DRAFT (Unpublished / Editing)</option>
                <option value="PUBLISHED">PUBLISHED (Active on Schedule)</option>
                <option value="CLOSED">CLOSED (Completed)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Subject</label>
              <input
                type="text"
                value={form.subject}
                onChange={(e) => set("subject", e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Computer Science / Mathematics"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Brief instructions or notes"
              />
            </div>
          </div>
        </div>

        {/* SECTION 2: Schedule & Timing */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 pb-2 border-b border-slate-100 flex items-center gap-2">
            <span>⏰</span> Time Window &amp; Duration
          </h3>

          <div className={`grid grid-cols-1 ${isClassPolicy ? "md:grid-cols-2" : "md:grid-cols-3"} gap-4`}>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date/Time *</label>
              <input
                type="datetime-local"
                required
                value={form.startAt}
                onChange={(e) => set("startAt", e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[11px] text-slate-400 mt-0.5 block">Exams unlock when network time reaches this point</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">End Date/Time *</label>
              <input
                type="datetime-local"
                required
                value={form.endAt}
                onChange={(e) => set("endAt", e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[11px] text-slate-400 mt-0.5 block">Exams strictly close after this moment</span>
            </div>

            {!isClassPolicy && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Duration (Minutes) *</label>
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
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-[11px] text-slate-400 mt-0.5 block">Candidate countdown timer length</span>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 3: Questions, Scoring & Attempts */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 pb-2 border-b border-slate-100 flex items-center gap-2">
            <span>🎯</span> Questions, Scoring &amp; Attempts
          </h3>

          <div className={`grid grid-cols-1 ${isClassPolicy ? "" : "sm:grid-cols-2 md:grid-cols-4"} gap-4`}>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Question Limit *</label>
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
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
              />
              <span className="text-[11px] text-slate-400 mt-0.5 block">Questions served to student</span>
            </div>

            {!isClassPolicy && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Max Attempts *</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={form.maxAttempts}
                    onChange={(e) => set("maxAttempts", e.target.value)}
                    onBlur={() => {
                      if (form.maxAttempts === "" || Number(form.maxAttempts) < 1) {
                        set("maxAttempts", 1);
                      }
                    }}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                  />
                  <span className="text-[11px] text-slate-400 mt-0.5 block">Allowed student retries</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Passing Marks</label>
                  <input
                    type="number"
                    min={0}
                    value={form.passingMarks}
                    onChange={(e) => set("passingMarks", e.target.value)}
                    onBlur={() => {
                      if (form.passingMarks === "" || Number(form.passingMarks) < 0) {
                        set("passingMarks", 0);
                      }
                    }}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-[11px] text-slate-400 mt-0.5 block">Minimum passing score</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Negative Marking</label>
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
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-[11px] text-slate-400 mt-0.5 block">Deduction per incorrect option</span>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-6 pt-1">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.randomizeQuestions}
                onChange={(e) => set("randomizeQuestions", e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              Randomize Question Order
            </label>

            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.randomizeOptions}
                onChange={(e) => set("randomizeOptions", e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              Randomize Option (A/B/C/D) Order
            </label>
          </div>
        </div>

        {/* SECTION 4: Proctoring Rules */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 pb-2 border-b border-slate-100 flex items-center gap-2">
            <span>🛡️</span> AI Proctoring &amp; Monitoring Rules
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer text-xs font-semibold text-slate-800">
              <input
                type="checkbox"
                checked={form.webcamRequired}
                onChange={(e) => set("webcamRequired", e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <span>Require Webcam &amp; Face Biometrics</span>
            </label>

            <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer text-xs font-semibold text-slate-800">
              <input
                type="checkbox"
                checked={form.microphoneRequired}
                onChange={(e) => set("microphoneRequired", e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <span>Require Microphone Monitoring</span>
            </label>

            <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer text-xs font-semibold text-slate-800">
              <input
                type="checkbox"
                checked={form.screenRequired}
                onChange={(e) => set("screenRequired", e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <span>Require Full Screen Share Lockdown</span>
            </label>

            <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer text-xs font-semibold text-slate-800">
              <input
                type="checkbox"
                checked={form.locationRequired}
                onChange={(e) => set("locationRequired", e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <span>Require Location / GPS Verification</span>
            </label>
          </div>

          {form.microphoneRequired && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs font-bold text-slate-700">Microphone Input Level / Gain Sensitivity</span>
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
                  className="w-16 px-2 py-1 text-xs border border-slate-300 rounded-md text-center font-bold"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Sensitivity threshold for voice &amp; speech detection. Default is 20%.
              </p>
            </div>
          )}
        </div>
        </fieldset>

        {/* Action Buttons */}
        <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
          {isClassSettingsLocked ? (
            <div className="w-full flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
              <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <span>🔒</span> Read-Only Mode: Class settings can only be altered by the Course Coordinator
              </span>
              {onSwitchToQuestions && (
                <button
                  type="button"
                  onClick={onSwitchToQuestions}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  Manage Questions &rarr;
                </button>
              )}
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={handleReset}
                disabled={saving}
                className="px-4 py-2 border border-slate-300 text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                Discard Unsaved Changes
              </button>

              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs hover:shadow transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving Changes…
                  </>
                ) : (
                  "Save Exam Changes ✓"
                )}
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
