import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api, getAdminUserDepartment } from "../../api/client";
import type { AdminUser, Exam, ProfessorUser } from "../../types";

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CourseCoordinatorDashboard() {
  const [activeTab, setActiveTab] = useState<"faculties" | "classes" | "create-class">("faculties");

  // Profile & Data states
  const [profile, setProfile] = useState<AdminUser | null>(null);
  const [faculties, setFaculties] = useState<AdminUser[]>([]);
  const [classes, setClasses] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Visibility states for passwords
  const [visiblePasswords, setVisiblePasswords] = useState<Record<number, boolean>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Create Class / Exam form state
  const now = new Date();
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
  const inOneWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [classForm, setClassForm] = useState<{
    name: string;
    description: string;
    subject: string;
    startAt: string;
    endAt: string;
    numQuestions: number | string;
    randomizeQuestions: boolean;
    randomizeOptions: boolean;
    webcamRequired: boolean;
    microphoneRequired: boolean;
    screenRequired: boolean;
    locationRequired: boolean;
    audioInputLevel: number | string;
    assignedProfessorId: string;
    assignedProfessorEmail: string;
    assignedProfessorName: string;
  }>({
    name: "",
    description: "",
    subject: "",
    startAt: toLocalInputValue(inOneHour),
    endAt: toLocalInputValue(inOneWeek),
    numQuestions: 10,
    randomizeQuestions: true,
    randomizeOptions: true,
    webcamRequired: true,
    microphoneRequired: true,
    screenRequired: true,
    locationRequired: false,
    audioInputLevel: 20,
    assignedProfessorId: "",
    assignedProfessorEmail: "",
    assignedProfessorName: "",
  });
  const [classSubmitting, setClassSubmitting] = useState(false);
  const [classError, setClassError] = useState<string | null>(null);

  // Reassign professor modal state
  const [reassigningExam, setReassigningExam] = useState<Exam | null>(null);
  const [reassignProfEmail, setReassignProfEmail] = useState<string>("");
  const [reassignSubmitting, setReassignSubmitting] = useState(false);

  const fallbackDepartment = getAdminUserDepartment() || "Assigned Department";
  const departmentName = profile?.department || fallbackDepartment;

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch current coordinator profile
      const meData = await api.get<AdminUser>("/api/admin/users/me", "admin");
      setProfile(meData);

      const dept = meData.department || getAdminUserDepartment();

      // 2. Fetch faculties assigned by admin in User Accounts (backend strictly filters to coordinator's department)
      const usersData = await api.get<AdminUser[]>("/api/admin/users", "admin");
      let combinedFaculty: AdminUser[] = [...usersData];

      // 3. Also fetch professors assigned to this department in Professor Login Credentials
      if (dept) {
        try {
          const profs = await api.get<ProfessorUser[]>(
            `/api/admin/professors?department=${encodeURIComponent(dept)}`,
            "admin"
          );
          const existingEmails = new Set(usersData.map((u) => u.email.toLowerCase()));
          profs.forEach((p) => {
            if (!existingEmails.has(p.email.toLowerCase())) {
              combinedFaculty.push({
                id: -p.id,
                email: p.email,
                fullName: p.fullName,
                role: "PROFESSOR",
                department: p.department || dept,
                displayPassword: p.displayPassword || undefined,
                failedAttempts: 0,
                locked: false,
                createdAt: p.createdAt || new Date().toISOString(),
                updatedAt: p.createdAt || new Date().toISOString(),
              });
            }
          });
        } catch {
          // ignore professors query failure if not present
        }
      }

      setFaculties(combinedFaculty);

      // 4. Fetch department classes / exams
      const examsData = await api.get<Exam[]>("/api/admin/exams", "admin");
      setClasses(examsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load coordinator data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function togglePasswordVisibility(id: number) {
    setVisiblePasswords((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => {
      setCopiedField((curr) => (curr === label ? null : curr));
    }, 2000);
  }

  function setClassField<K extends keyof typeof classForm>(key: K, value: (typeof classForm)[K]) {
    setClassForm((f) => ({ ...f, [key]: value }));
  }

  async function handleCreateClass(e: React.FormEvent) {
    e.preventDefault();
    setClassError(null);

    if (!classForm.assignedProfessorEmail) {
      setClassError("Please assign a Professor / Faculty member for this class. The coordinator assigns the professor, who will then manage questions and students.");
      return;
    }

    setClassSubmitting(true);
    try {
      const isAssignAll = classForm.assignedProfessorEmail === "ALL_PROFESSORS";
      const payload = {
        name: classForm.name,
        description: classForm.description,
        subject: classForm.subject || departmentName,
        numQuestions: Math.max(1, Number(classForm.numQuestions) || 10),
        durationMinutes: null, // Untimed class: No fixed time duration like 60 min
        maxAttempts: null, // Infinite attempts
        isClass: true,
        assignedProfessorId: isAssignAll ? undefined : (classForm.assignedProfessorId ? Math.abs(Number(classForm.assignedProfessorId)) : undefined),
        assignedProfessorEmail: isAssignAll ? undefined : (classForm.assignedProfessorEmail || undefined),
        assignedProfessorName: isAssignAll ? undefined : (classForm.assignedProfessorName || undefined),
        randomizeQuestions: classForm.randomizeQuestions,
        randomizeOptions: classForm.randomizeOptions,
        webcamRequired: classForm.webcamRequired,
        microphoneRequired: classForm.microphoneRequired,
        screenRequired: classForm.screenRequired,
        locationRequired: classForm.locationRequired,
        audioInputLevel: Math.max(1, Math.min(100, Number(classForm.audioInputLevel) || 20)),
        startAt: new Date(classForm.startAt).toISOString(),
        endAt: new Date(classForm.endAt).toISOString(),
      };

      const newExam = await api.post<Exam>("/api/admin/exams", payload, "admin");
      if (isAssignAll) {
        await api.post<{ assignedCount: number; message: string }>(
          `/api/admin/exams/${newExam.id}/assign-all-professors`,
          undefined,
          "admin"
        );
        await loadData();
        setSuccessMsg(
          `Class '${newExam.name}' created and assigned to ALL department faculty (${faculties.length} professors)!`
        );
      } else {
        setClasses((prev) => [newExam, ...prev]);
        setSuccessMsg(
          `Class '${newExam.name}' created with infinite attempts and assigned to ${newExam.assignedProfessorName || classForm.assignedProfessorName || "selected professor"}!`
        );
      }
      setActiveTab("classes");
      setTimeout(() => setSuccessMsg(null), 6000);
    } catch (err) {
      setClassError(err instanceof Error ? err.message : "Could not create class / exam.");
    } finally {
      setClassSubmitting(false);
    }
  }

  async function handleAssignAllProfessors(examToAssign: Exam) {
    if (
      !window.confirm(
        `Assign class '${examToAssign.name}' to ALL professors in ${departmentName} (${faculties.length} professors)?\n\nAll professors will see and manage this single unified class. Student data and progress will be gathered in one class without cloning.`
      )
    ) {
      return;
    }
    setReassignSubmitting(true);
    try {
      await api.post<{ assignedCount: number; message: string }>(
        `/api/admin/exams/${examToAssign.id}/assign-all-professors`,
        undefined,
        "admin"
      );
      setSuccessMsg(`✓ Successfully assigned unified class to all ${faculties.length} professors in ${departmentName}!`);
      setReassigningExam(null);
      await loadData();
      setTimeout(() => setSuccessMsg(null), 6000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to assign all professors.");
    } finally {
      setReassignSubmitting(false);
    }
  }

  async function handleReassignProfessor(e: React.FormEvent) {
    e.preventDefault();
    if (!reassigningExam || !reassignProfEmail) return;
    if (reassignProfEmail === "ALL_PROFESSORS") {
      await handleAssignAllProfessors(reassigningExam);
      return;
    }
    setReassignSubmitting(true);
    try {
      const selectedProf = faculties.find((f) => f.email === reassignProfEmail);
      const payload = {
        professorId: selectedProf ? Math.abs(selectedProf.id) : undefined,
        professorEmail: selectedProf ? selectedProf.email : reassignProfEmail,
        professorName: selectedProf ? selectedProf.fullName : undefined,
      };
      const updated = await api.put<Exam>(
        `/api/admin/exams/${reassigningExam.id}/assign-professor`,
        payload,
        "admin"
      );
      setClasses((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setSuccessMsg(`Professor successfully assigned to class '${updated.name}'!`);
      setReassigningExam(null);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to assign professor.");
    } finally {
      setReassignSubmitting(false);
    }
  }

  const filteredFaculties = faculties.filter((f) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      f.fullName.toLowerCase().includes(q) ||
      f.email.toLowerCase().includes(q) ||
      (f.department && f.department.toLowerCase().includes(q))
    );
  });

  const activeCount = faculties.filter((f) => !f.locked).length;
  const lockedCount = faculties.filter((f) => f.locked).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-8">
      {/* Top Banner / Welcome Card */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200 text-xs font-semibold">
              <span>🏛️</span> Department Course Coordinator
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">
              {departmentName}
            </h1>
            <p className="text-slate-300 text-xs md:text-sm leading-relaxed">
              Welcome, <strong className="text-white">{profile?.fullName || "Course Coordinator"}</strong> ({profile?.email}). 
              Oversee the faculty assigned to your department in the Admin Dashboard and manage proctored classes/examinations.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition cursor-pointer border border-white/10"
            >
              <span className={loading ? "animate-spin" : ""}>🔄</span> Refresh
            </button>
            <button
              onClick={() => setActiveTab("create-class")}
              className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition shadow-lg shadow-blue-600/30 flex items-center gap-2 cursor-pointer"
            >
              <span>+</span> Create Class / Exam
            </button>
          </div>
        </div>

        {/* Security / Isolation guarantee pill */}
        <div className="mt-6 pt-4 border-t border-white/10 flex items-center gap-2 text-[11px] text-blue-200">
          <span>🛡️</span>
          <span>
            <strong>Assigned Department View:</strong> Only faculty assigned to {departmentName} by the Administrator in the Admin Dashboard are visible here.
          </span>
        </div>
      </div>

      {/* Metric Cards Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Faculties */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Assigned Faculty</p>
            <h3 className="text-3xl font-black text-slate-900 mt-1">{faculties.length}</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Assigned to {departmentName}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 text-xl font-bold">
            👥
          </div>
        </div>

        {/* Total Classes Created */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Classes &amp; Exams</p>
            <h3 className="text-3xl font-black text-indigo-600 mt-1">{classes.length}</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Created for {departmentName}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 text-xl font-bold">
            📚
          </div>
        </div>

        {/* Active Accounts */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Active Faculty</p>
            <h3 className="text-3xl font-black text-emerald-600 mt-1">{activeCount}</h3>
            <p className="text-[11px] text-emerald-700/70 mt-0.5">
              {lockedCount > 0 ? `${lockedCount} locked / restricted` : "All accounts operational"}
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 text-xl font-bold">
            ●
          </div>
        </div>

        {/* Department Name */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div className="overflow-hidden">
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Your Department</p>
            <h3 className="text-sm font-bold text-slate-800 mt-2 truncate" title={departmentName}>
              {departmentName}
            </h3>
            <p className="text-[11px] text-blue-600 font-semibold mt-0.5">Course Coordinator Portal</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-700 text-xl font-bold shrink-0">
            🏛️
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-xs">
        <button
          onClick={() => setActiveTab("faculties")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === "faculties"
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <span>👨‍🏫</span> Assigned Faculty ({faculties.length})
        </button>

        <button
          onClick={() => setActiveTab("classes")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === "classes"
              ? "bg-indigo-600 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <span>📚</span> Department Classes &amp; Exams ({classes.length})
        </button>

        <button
          onClick={() => setActiveTab("create-class")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === "create-class"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <span>➕</span> Create Class / Exam
        </button>
      </div>

      {/* Success Notification */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 px-4 py-3 rounded-2xl text-xs font-semibold flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <span>✅</span>
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-700 hover:text-emerald-900 font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Error Notification */}
      {error && (
        <div className="bg-rose-50 border border-rose-300 text-rose-800 px-4 py-3 rounded-2xl text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button onClick={loadData} className="underline text-rose-700 hover:text-rose-900 font-bold">
            Retry
          </button>
        </div>
      )}

      {/* ===================== TAB 1: FACULTIES ===================== */}
      {activeTab === "faculties" && (
        <div className="space-y-4">
          {/* Action and Search Bar (NO Assign Faculty button) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2 w-full sm:w-80">
              <span className="text-slate-400">🔍</span>
              <input
                type="text"
                placeholder="Search faculty by name or email…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">
                Showing {filteredFaculties.length} of {faculties.length} assigned faculties
              </span>
            </div>
          </div>

          {/* Loading state */}
          {loading && faculties.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center text-slate-500">
              <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mb-3" />
              <p className="text-xs font-medium text-slate-600">Loading department faculty members…</p>
            </div>
          )}

          {/* Empty state (NO Assign First Faculty button) */}
          {!loading && faculties.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-3xl p-16 text-center text-slate-500 max-w-lg mx-auto">
              <span className="text-4xl block mb-3">👨‍🏫</span>
              <h3 className="text-base font-bold text-slate-800">No faculty members assigned yet</h3>
              <p className="text-xs text-slate-500 mt-1">
                Faculty members assigned to <strong className="text-slate-700">{departmentName}</strong> by the Administrator in the Admin Dashboard will appear here.
              </p>
            </div>
          )}

          {/* Faculty Cards Grid (Read-Only credentials and details view) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredFaculties.map((faculty) => {
              const isPasswordVisible = visiblePasswords[faculty.id] || false;

              return (
                <div
                  key={faculty.id}
                  className="bg-white border border-slate-200 hover:border-blue-300 rounded-2xl p-5 shadow-xs transition-all space-y-4"
                >
                  {/* Header inside faculty card */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-xs">
                        {faculty.fullName ? faculty.fullName.charAt(0).toUpperCase() : faculty.email.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">{faculty.fullName}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                            {faculty.role || "FACULTY"}
                          </span>
                          <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 truncate max-w-[140px]">
                            🏛️ {faculty.department || departmentName}
                          </span>
                          {faculty.locked ? (
                            <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200">
                              🔒 Locked
                            </span>
                          ) : (
                            <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">
                              ● Active
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Login Credentials Box */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5 text-xs">
                    {/* Email line */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="font-semibold text-slate-400 w-16 shrink-0">Email:</span>
                        <span className="font-mono font-medium text-slate-800 truncate select-all">{faculty.email}</span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(faculty.email, `email-${faculty.id}`)}
                        className="shrink-0 px-2 py-1 rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-800 font-semibold text-[11px] transition cursor-pointer"
                      >
                        {copiedField === `email-${faculty.id}` ? "Copied! ✓" : "Copy Email"}
                      </button>
                    </div>

                    {/* Password line */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/60">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="font-semibold text-slate-400 w-16 shrink-0">Password:</span>
                        <span className="font-mono font-bold text-slate-800 truncate select-all">
                          {isPasswordVisible ? faculty.displayPassword || "••••••••" : "••••••••"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => togglePasswordVisibility(faculty.id)}
                          className="px-2 py-1 rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-800 font-semibold text-[11px] transition cursor-pointer"
                          title={isPasswordVisible ? "Hide Password" : "Show Password"}
                        >
                          {isPasswordVisible ? "🙈 Hide" : "👁️ Reveal"}
                        </button>
                        {faculty.displayPassword && (
                          <button
                            onClick={() => copyToClipboard(faculty.displayPassword!, `pwd-${faculty.id}`)}
                            className="px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-semibold text-[11px] transition cursor-pointer"
                          >
                            {copiedField === `pwd-${faculty.id}` ? "Copied! ✓" : "Copy Pwd"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card footer */}
                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                    <span className="text-slate-500 font-medium">Assigned in Admin Dashboard</span>
                    <span>
                      {new Date(faculty.updatedAt || faculty.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===================== TAB 2: CLASSES & EXAMS ===================== */}
      {activeTab === "classes" && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row justify-between items-center gap-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Department Classes &amp; Examinations</h2>
              <p className="text-xs text-slate-500">
                Manage all assessments and proctored classes configured for {departmentName}.
              </p>
            </div>
            <button
              onClick={() => setActiveTab("create-class")}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <span>+</span> Create New Class
            </button>
          </div>

          {classes.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-16 text-center text-slate-500 max-w-lg mx-auto">
              <span className="text-4xl block mb-3">📖</span>
              <h3 className="text-base font-bold text-slate-800">No classes created yet</h3>
              <p className="text-xs text-slate-500 mt-1 mb-6">
                Create your first proctored class or exam for <strong className="text-slate-700">{departmentName}</strong> with full exam management features.
              </p>
              <button
                onClick={() => setActiveTab("create-class")}
                className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition shadow-sm inline-flex items-center gap-2 cursor-pointer"
              >
                <span>+</span> Create First Class / Exam
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {classes.map((c) => (
                <div
                  key={c.id}
                  className="bg-white border border-slate-200 hover:border-indigo-300 rounded-2xl p-5 shadow-xs transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                          c.status === "PUBLISHED"
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            : c.status === "CLOSED"
                            ? "bg-slate-100 text-slate-600 border border-slate-200"
                            : "bg-amber-100 text-amber-800 border border-amber-200"
                        }`}
                      >
                        {c.status}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-400">
                        {new Date(c.startAt).toLocaleDateString()}
                      </span>
                    </div>

                    <h3 className="font-bold text-slate-900 text-sm line-clamp-1" title={c.name}>
                      {c.name}
                    </h3>
                    {c.description && (
                      <p className="text-xs text-slate-500 line-clamp-2">{c.description}</p>
                    )}

                    {/* Assigned Professor Card */}
                    <div className="pt-1">
                      {c.assignedProfessorName || c.assignedProfessorEmail ? (
                        <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-2.5 flex items-center justify-between gap-2">
                          <div className="overflow-hidden">
                            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block flex items-center gap-1">
                              <span>👨‍🏫</span> Assigned Professor
                            </span>
                            <span className="text-xs font-bold text-slate-900 truncate block mt-0.5">
                              {c.assignedProfessorName || c.assignedProfessorEmail}
                            </span>
                            {c.assignedProfessorEmail && (
                              <span className="text-[10px] text-slate-500 font-mono truncate block">
                                {c.assignedProfessorEmail}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col gap-1.5 shrink-0">
                            <button
                              onClick={() => {
                                setReassigningExam(c);
                                setReassignProfEmail(c.assignedProfessorEmail || "");
                              }}
                              className="px-2.5 py-1 rounded-lg bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 text-[10px] font-bold transition cursor-pointer shadow-xs"
                            >
                              Change
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 flex items-center justify-between gap-2">
                          <div>
                            <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">
                              ⚠️ No Professor Assigned
                            </span>
                            <span className="text-[11px] text-amber-900 font-medium block">
                              Assign professor to lead this class
                            </span>
                          </div>
                          <div className="flex flex-col gap-1.5 shrink-0">
                            <button
                              onClick={() => {
                                setReassigningExam(c);
                                setReassignProfEmail("");
                              }}
                              className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold transition cursor-pointer shadow-xs"
                            >
                              + Assign Prof
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Class Mode Features: Infinite Attempts & Untimed Date Duration */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                        ♾️ Infinite Attempts
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                        ⏳ Untimed (No duration limit)
                      </span>
                    </div>

                    <div className="pt-1 text-xs space-y-1 text-slate-600">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Date Window:</span>
                        <span className="font-medium text-slate-800">
                          {new Date(c.startAt).toLocaleDateString()} – {new Date(c.endAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Questions:</span>
                        <span className="font-medium">{c.numQuestions}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 pt-1 text-[11px] text-slate-500">
                      <span>Proctoring:</span>
                      {c.webcamRequired && <span title="Webcam Required">📷</span>}
                      {c.microphoneRequired && <span title="Microphone Required">🎤</span>}
                      {c.screenRequired && <span title="Screen Capture Required">🖥️</span>}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-400">
                      Created by Coordinator
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Link
                        to={`/admin/exams/${c.id}?tab=coordinator-report`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold transition"
                      >
                        📊 Whole Report
                      </Link>
                      <Link
                        to={`/admin/exams/${c.id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition"
                      >
                        ⚙️ Manage
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Reassign Professor Modal */}
          {reassigningExam && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-5 shadow-2xl animate-fadeIn">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Assign Professor to Class
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Class: <strong className="text-slate-800">{reassigningExam.name}</strong>
                    </p>
                  </div>
                  <button
                    onClick={() => setReassigningExam(null)}
                    className="text-slate-400 hover:text-slate-600 text-sm font-bold"
                  >
                    ✕
                  </button>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3.5 text-xs text-blue-900 space-y-1">
                  <p className="font-semibold flex items-center gap-1.5">
                    <span>🏛️</span> Coordinator Assignment Protocol
                  </p>
                  <p className="text-[11px] text-blue-800 leading-relaxed">
                    Course Coordinators assign the <strong>Professor</strong> to manage this class. The assigned professor will configure question sets and enroll/assign students. Coordinators do not assign students.
                  </p>
                </div>

                <form onSubmit={handleReassignProfessor} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Select Department Faculty / Professor *
                    </label>
                    <select
                      required
                      value={reassignProfEmail}
                      onChange={(e) => setReassignProfEmail(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-medium text-slate-800"
                    >
                      <option value="">-- Choose a Professor from {departmentName} --</option>
                      {faculties.length > 0 && (
                        <option value="ALL_PROFESSORS" className="font-bold text-blue-700 bg-blue-50">
                          👥 ★ Assign to ALL Department Faculty ({faculties.length} Professors - Unified Class)
                        </option>
                      )}
                      {faculties.map((f) => (
                        <option key={f.id} value={f.email}>
                          {f.fullName} ({f.email}) {f.role ? `• ${f.role}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setReassigningExam(null)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={reassignSubmitting || !reassignProfEmail}
                      className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      {reassignSubmitting ? "Assigning…" : "Save Assignment"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB 3: CREATE CLASS / EXAM ===================== */}
      {activeTab === "create-class" && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-xs max-w-3xl mx-auto space-y-6">
          <div className="border-b border-slate-200 pb-4 flex justify-between items-start">
            <div>
              <h2 className="text-lg font-black text-slate-900">Create New Class</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure a class for <strong className="text-slate-700">{departmentName}</strong> with infinite attempts and date duration. Assign the professor to lead it.
              </p>
            </div>
            <button
              onClick={() => setActiveTab("classes")}
              className="text-xs font-semibold text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition cursor-pointer"
            >
              Cancel
            </button>
          </div>

          {/* Key Feature Specification Box */}
          <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-slate-50 border border-blue-200/80 rounded-2xl p-4 text-xs text-slate-700 space-y-2 shadow-xs">
            <h4 className="font-bold text-blue-900 flex items-center gap-1.5 text-xs">
              <span>📌</span> Course Coordinator Class Architecture:
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="bg-white/80 p-2.5 rounded-xl border border-blue-100 shadow-2xs">
                <span className="font-bold text-indigo-900 block flex items-center gap-1">
                  <span>♾️</span> Infinite Attempts
                </span>
                <span className="text-[11px] text-slate-500 mt-0.5 block leading-tight">
                  Students have unlimited attempts to practice and master concepts.
                </span>
              </div>
              <div className="bg-white/80 p-2.5 rounded-xl border border-blue-100 shadow-2xs">
                <span className="font-bold text-indigo-900 block flex items-center gap-1">
                  <span>⏳</span> No Time Duration
                </span>
                <span className="text-[11px] text-slate-500 mt-0.5 block leading-tight">
                  No 60-min per-attempt countdown. Valid throughout the scheduled date window.
                </span>
              </div>
              <div className="bg-white/80 p-2.5 rounded-xl border border-blue-100 shadow-2xs">
                <span className="font-bold text-indigo-900 block flex items-center gap-1">
                  <span>👨‍🏫</span> Assign Professor
                </span>
                <span className="text-[11px] text-slate-500 mt-0.5 block leading-tight">
                  You assign the Professor, not the student. The professor enrolls students.
                </span>
              </div>
            </div>
          </div>

          {classError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3.5 rounded-xl font-medium">
              {classError}
            </div>
          )}

          <form onSubmit={handleCreateClass} className="space-y-6">
            {/* General Info */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Class Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Class Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CS201: Data Structures & Algorithms Lab"
                    value={classForm.name}
                    onChange={(e) => setClassField("name", e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Subject / Domain *</label>
                  <input
                    type="text"
                    required
                    placeholder={departmentName}
                    value={classForm.subject}
                    onChange={(e) => setClassField("subject", e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Number of Questions *</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    required
                    value={classForm.numQuestions}
                    onChange={(e) => setClassField("numQuestions", e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                {/* Professor Assignment Selector (Mandatory for Course Coordinator) */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                    <span>Assign Professor / Faculty in Charge *</span>
                    <span className="text-[11px] text-blue-600 font-normal">Coordinator assigns the prof, not student</span>
                  </label>
                  <select
                    required
                    value={classForm.assignedProfessorEmail}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "ALL_PROFESSORS") {
                        setClassForm((prev) => ({
                          ...prev,
                          assignedProfessorId: "",
                          assignedProfessorEmail: "ALL_PROFESSORS",
                          assignedProfessorName: `All Department Faculty (${faculties.length} Professors)`,
                        }));
                        return;
                      }
                      const selectedProf = faculties.find((f) => f.email === val);
                      if (selectedProf) {
                        setClassForm((prev) => ({
                          ...prev,
                          assignedProfessorId: String(selectedProf.id),
                          assignedProfessorEmail: selectedProf.email,
                          assignedProfessorName: selectedProf.fullName,
                        }));
                      } else {
                        setClassForm((prev) => ({
                          ...prev,
                          assignedProfessorId: "",
                          assignedProfessorEmail: "",
                          assignedProfessorName: "",
                        }));
                      }
                    }}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-medium text-slate-800"
                  >
                    <option value="">-- Choose Professor / Faculty Member from {departmentName} --</option>
                    {faculties.length > 0 && (
                      <option value="ALL_PROFESSORS" className="font-bold text-blue-700 bg-blue-50">
                        👥 ★ Assign to ALL Department Faculty ({faculties.length} Professors - Unified Class)
                      </option>
                    )}
                    {faculties.map((f) => (
                      <option key={f.id} value={f.email}>
                        {f.fullName} ({f.email}) {f.role ? `• ${f.role}` : ""}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">
                    The chosen professor will be granted full management access to this class to author questions and assign students.
                  </p>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Description / Syllabus</label>
                  <textarea
                    rows={2}
                    placeholder="Optional syllabus topics, scoring instructions, or candidate guidelines…"
                    value={classForm.description}
                    onChange={(e) => setClassField("description", e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Date Duration Window (No 60 min countdown limit) */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Date Duration Window (No Time Duration Limit)
                </h3>
                <span className="text-[11px] text-indigo-600 font-semibold">
                  Valid across these dates with infinite attempts
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Class Start Date &amp; Time *</label>
                  <input
                    type="datetime-local"
                    required
                    value={classForm.startAt}
                    onChange={(e) => setClassField("startAt", e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Class End Date &amp; Time *</label>
                  <input
                    type="datetime-local"
                    required
                    value={classForm.endAt}
                    onChange={(e) => setClassField("endAt", e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Assessment Integrity / Proctoring Options */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Proctoring Safeguards</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={classForm.webcamRequired}
                    onChange={(e) => setClassField("webcamRequired", e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <p className="font-semibold text-slate-800">📷 Webcam Monitoring</p>
                    <p className="text-[10px] text-slate-500">Live facial presence &amp; multi-face detection</p>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={classForm.microphoneRequired}
                    onChange={(e) => setClassField("microphoneRequired", e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <p className="font-semibold text-slate-800">🎤 Audio Surveillance</p>
                    <p className="text-[10px] text-slate-500">Monitors ambient decibels &amp; conversation spikes</p>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={classForm.screenRequired}
                    onChange={(e) => setClassField("screenRequired", e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <p className="font-semibold text-slate-800">🖥️ Screen Capture &amp; Lock</p>
                    <p className="text-[10px] text-slate-500">Tracks tab switches &amp; full-screen enforcement</p>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={classForm.randomizeQuestions}
                    onChange={(e) => setClassField("randomizeQuestions", e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <p className="font-semibold text-slate-800">🔀 Shuffle Questions</p>
                    <p className="text-[10px] text-slate-500">Randomizes question order per candidate</p>
                  </div>
                </label>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setActiveTab("classes")}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={classSubmitting}
                className="px-6 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                {classSubmitting ? "Creating Class…" : "Create Class (Untimed, Infinite Attempts)"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
