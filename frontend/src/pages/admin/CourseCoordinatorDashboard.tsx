import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api, getAdminUserDepartment } from "../../api/client";
import type { AdminUser, CreateAdminUserPayload, UpdateAdminUserPayload, Exam } from "../../types";

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

  // Add Faculty Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState<CreateAdminUserPayload>({
    email: "",
    fullName: "",
    password: "",
    role: "FACULTY",
  });
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [showAddPassword, setShowAddPassword] = useState(false);

  // Edit Faculty Modal state
  const [editingFaculty, setEditingFaculty] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState<UpdateAdminUserPayload>({
    email: "",
    fullName: "",
    password: "",
    resetLock: false,
  });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [showEditPassword, setShowEditPassword] = useState(false);

  // Delete Faculty Modal state
  const [facultyToDelete, setFacultyToDelete] = useState<AdminUser | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Create Class / Exam form state (matching create exam page features)
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
  });
  const [classSubmitting, setClassSubmitting] = useState(false);
  const [classError, setClassError] = useState<string | null>(null);

  const fallbackDepartment = getAdminUserDepartment() || "Assigned Department";
  const departmentName = profile?.department || fallbackDepartment;

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch current coordinator profile
      const meData = await api.get<AdminUser>("/api/admin/users/me", "admin");
      setProfile(meData);

      // 2. Fetch faculties (backend strictly filters to coordinator's department only)
      const usersData = await api.get<AdminUser[]>("/api/admin/users", "admin");
      setFaculties(usersData);

      // 3. Fetch department classes / exams
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

  function generateRandomPassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    let pwd = "";
    for (let i = 0; i < 10; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  }

  async function handleAddFaculty(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    setAddSubmitting(true);
    try {
      const payload: CreateAdminUserPayload = {
        email: addForm.email.trim(),
        fullName: addForm.fullName.trim(),
        password: addForm.password.trim(),
        role: "FACULTY",
        department: departmentName,
      };

      const newFaculty = await api.post<AdminUser>("/api/admin/users", payload, "admin");
      setFaculties((prev) => [...prev, newFaculty]);
      setShowAddModal(false);
      setSuccessMsg(`Faculty member '${newFaculty.fullName}' (${newFaculty.email}) assigned successfully to ${departmentName}!`);
      setAddForm({ email: "", fullName: "", password: "", role: "FACULTY" });
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to assign faculty.");
    } finally {
      setAddSubmitting(false);
    }
  }

  function openEditModal(faculty: AdminUser) {
    setEditingFaculty(faculty);
    setEditForm({
      email: faculty.email,
      fullName: faculty.fullName,
      password: faculty.displayPassword || "",
      resetLock: faculty.locked,
    });
    setEditError(null);
    setShowEditPassword(false);
  }

  async function handleUpdateFaculty(e: React.FormEvent) {
    e.preventDefault();
    if (!editingFaculty) return;
    setEditError(null);
    setEditSubmitting(true);
    try {
      const payload: UpdateAdminUserPayload = {
        email: editForm.email,
        fullName: editForm.fullName,
        resetLock: editForm.resetLock,
      };
      if (editForm.password && editForm.password.trim() !== "") {
        payload.password = editForm.password.trim();
      }

      const updated = await api.put<AdminUser>(`/api/admin/users/${editingFaculty.id}`, payload, "admin");
      setFaculties((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setEditingFaculty(null);
      setSuccessMsg(`Credentials for '${updated.fullName}' updated successfully!`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update faculty credentials.");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDeleteFaculty() {
    if (!facultyToDelete) return;
    setDeleteError(null);
    setDeleteSubmitting(true);
    try {
      await api.delete(`/api/admin/users/${facultyToDelete.id}`, "admin");
      setFaculties((prev) => prev.filter((f) => f.id !== facultyToDelete.id));
      setSuccessMsg(`Faculty account '${facultyToDelete.email}' was removed.`);
      setFacultyToDelete(null);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to remove faculty.");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  function setClassField<K extends keyof typeof classForm>(key: K, value: (typeof classForm)[K]) {
    setClassForm((f) => ({ ...f, [key]: value }));
  }

  async function handleCreateClass(e: React.FormEvent) {
    e.preventDefault();
    setClassError(null);
    setClassSubmitting(true);
    try {
      const payload = {
        name: classForm.name,
        description: classForm.description,
        subject: classForm.subject || departmentName,
        numQuestions: Math.max(1, Number(classForm.numQuestions) || 10),
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
      setClasses((prev) => [newExam, ...prev]);
      setSuccessMsg(`Class / Examination '${newExam.name}' created successfully! You can now configure questions and enroll candidates.`);
      setActiveTab("classes");
      setTimeout(() => setSuccessMsg(null), 6000);
    } catch (err) {
      setClassError(err instanceof Error ? err.message : "Could not create class / exam.");
    } finally {
      setClassSubmitting(false);
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
              Manage department faculties and create proctored classes/examinations with isolated access.
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
              onClick={() => {
                setAddForm({
                  email: "",
                  fullName: "",
                  password: generateRandomPassword(),
                  role: "FACULTY",
                });
                setAddError(null);
                setShowAddPassword(true);
                setShowAddModal(true);
              }}
              className="bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 rounded-xl text-xs font-semibold transition border border-white/20 flex items-center gap-1.5 cursor-pointer"
            >
              <span>+</span> Assign Faculty
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
            <strong>Isolated Departmental Access:</strong> Administrator credentials and other department faculties are strictly restricted and hidden.
          </span>
        </div>
      </div>

      {/* Metric Cards Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Faculties */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Number of Faculties</p>
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
          {/* Action and Search Bar */}
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
                Showing {filteredFaculties.length} of {faculties.length} faculties
              </span>
              <button
                onClick={() => {
                  setAddForm({
                    email: "",
                    fullName: "",
                    password: generateRandomPassword(),
                    role: "FACULTY",
                  });
                  setAddError(null);
                  setShowAddPassword(true);
                  setShowAddModal(true);
                }}
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <span>+</span> Assign Faculty
              </button>
            </div>
          </div>

          {/* Loading state */}
          {loading && faculties.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center text-slate-500">
              <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mb-3" />
              <p className="text-xs font-medium text-slate-600">Loading department faculty members…</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && faculties.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-3xl p-16 text-center text-slate-500 max-w-lg mx-auto">
              <span className="text-4xl block mb-3">👨‍🏫</span>
              <h3 className="text-base font-bold text-slate-800">No faculty members assigned yet</h3>
              <p className="text-xs text-slate-500 mt-1 mb-6">
                You haven't assigned any faculty to <strong className="text-slate-700">{departmentName}</strong>. 
                Click below to add your first faculty member.
              </p>
              <button
                onClick={() => {
                  setAddForm({
                    email: "",
                    fullName: "",
                    password: generateRandomPassword(),
                    role: "FACULTY",
                  });
                  setAddError(null);
                  setShowAddPassword(true);
                  setShowAddModal(true);
                }}
                className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition shadow-sm inline-flex items-center gap-2 cursor-pointer"
              >
                <span>+</span> Assign First Faculty Member
              </button>
            </div>
          )}

          {/* Faculty Cards Grid (NO Faculty ID displayed) */}
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

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => openEditModal(faculty)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer flex items-center gap-1"
                        title="Edit faculty credentials and details"
                      >
                        ✏️ Edit Credentials
                      </button>
                      <button
                        onClick={() => setFacultyToDelete(faculty)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition cursor-pointer"
                        title="Remove faculty from department"
                      >
                        🗑️
                      </button>
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

                  {/* Card footer without Faculty ID */}
                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                    <span className="text-slate-500 font-medium">Department Faculty</span>
                    <span>
                      Updated: {new Date(faculty.updatedAt || faculty.createdAt).toLocaleDateString()}{" "}
                      {new Date(faculty.updatedAt || faculty.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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
                  <div className="space-y-2">
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

                    <div className="pt-2 text-xs space-y-1 text-slate-600">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Subject:</span>
                        <span className="font-medium">{c.subject || departmentName}</span>
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

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">
                      {new Date(c.startAt).toLocaleDateString()}
                    </span>
                    <Link
                      to={`/admin/exams/${c.id}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition"
                    >
                      ⚙️ Manage &amp; Questions
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB 3: CREATE CLASS / EXAM ===================== */}
      {activeTab === "create-class" && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-xs max-w-3xl mx-auto space-y-6">
          <div className="border-b border-slate-200 pb-4 flex justify-between items-start">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Create Class / Examination</h2>
              <p className="text-xs text-slate-500 mt-1">
                Configure full proctoring settings, timing, question bank limits, and passing criteria for {departmentName}.
              </p>
            </div>
            <button
              onClick={() => setActiveTab("classes")}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              ✕ Cancel
            </button>
          </div>

          {classError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3.5 rounded-2xl font-medium">
              {classError}
            </div>
          )}

          <form onSubmit={handleCreateClass} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Class / Examination Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. CS301 - Data Structures & Algorithms (Midterm)"
                value={classForm.name}
                onChange={(e) => setClassField("name", e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Description &amp; Guidelines</label>
              <textarea
                rows={3}
                placeholder="Enter syllabus details, assessment instructions, or department guidelines…"
                value={classForm.description}
                onChange={(e) => setClassField("description", e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Subject / Course Code</label>
                <input
                  type="text"
                  placeholder={`e.g. ${departmentName}`}
                  value={classForm.subject}
                  onChange={(e) => setClassField("subject", e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Number of Questions</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={classForm.numQuestions}
                  onChange={(e) => setClassField("numQuestions", e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date &amp; Time</label>
                <input
                  type="datetime-local"
                  required
                  value={classForm.startAt}
                  onChange={(e) => setClassField("startAt", e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">End Date &amp; Time</label>
                <input
                  type="datetime-local"
                  required
                  value={classForm.endAt}
                  onChange={(e) => setClassField("endAt", e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-6 pt-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={classForm.randomizeQuestions}
                  onChange={(e) => setClassField("randomizeQuestions", e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                Randomize question order for each candidate
              </label>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={classForm.randomizeOptions}
                  onChange={(e) => setClassField("randomizeOptions", e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                Randomize multiple choice options
              </label>
            </div>

            {/* Proctoring Requirements Section */}
            <div className="pt-4 border-t border-slate-200">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                AI &amp; Browser Proctoring Lockdown
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={classForm.webcamRequired}
                    onChange={(e) => setClassField("webcamRequired", e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  Require Webcam Face &amp; Gaze Monitoring
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={classForm.microphoneRequired}
                    onChange={(e) => setClassField("microphoneRequired", e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  Require Microphone Audio Speech Detection
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={classForm.screenRequired}
                    onChange={(e) => setClassField("screenRequired", e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  Require Full Screen Browser Lockdown
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={classForm.locationRequired}
                    onChange={(e) => setClassField("locationRequired", e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  Require Candidate Geo-Location Check
                </label>

                {classForm.microphoneRequired && (
                  <div className="sm:col-span-2 mt-2 bg-slate-50 border border-slate-200 rounded-2xl p-4">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-semibold text-slate-700">Microphone Input Level / Sensitivity Gain</span>
                      <span className="text-xs font-mono font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-lg">
                        {classForm.audioInputLevel}%
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={5}
                        max={100}
                        step={1}
                        value={Number(classForm.audioInputLevel) || 20}
                        onChange={(e) => setClassField("audioInputLevel", Number(e.target.value))}
                        className="w-full accent-blue-600 cursor-pointer"
                      />
                      <input
                        type="number"
                        min={5}
                        max={100}
                        value={classForm.audioInputLevel}
                        onChange={(e) => setClassField("audioInputLevel", e.target.value)}
                        className="w-16 px-2 py-1 text-xs border border-slate-300 rounded-lg text-center font-bold"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Configures candidate microphone gain applied during speech detection. Default 20% is recommended.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setActiveTab("classes")}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={classSubmitting}
                className="px-6 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition shadow-md shadow-blue-600/30 cursor-pointer disabled:opacity-50"
              >
                {classSubmitting ? "Creating Class…" : "Create Class / Exam (Draft)"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ASSIGN FACULTY MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">👨‍🏫</span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Assign Faculty Member</h3>
                  <p className="text-[11px] text-blue-600 font-semibold">{departmentName}</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Create and assign login credentials for a faculty member in your department. They will be able to sign in and manage assessments.
            </p>

            {addError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-xl font-medium">
                {addError}
              </div>
            )}

            <form onSubmit={handleAddFaculty} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Faculty Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Robert Vance"
                  value={addForm.fullName}
                  onChange={(e) => setAddForm({ ...addForm, fullName: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Faculty Email (Login ID)</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. rvance@university.edu"
                  value={addForm.email}
                  onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">Initial Password</label>
                  <button
                    type="button"
                    onClick={() => {
                      const newPwd = generateRandomPassword();
                      setAddForm({ ...addForm, password: newPwd });
                      setShowAddPassword(true);
                    }}
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                  >
                    🎲 Suggest Strong Pwd
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showAddPassword ? "text" : "password"}
                    required
                    minLength={6}
                    placeholder="Minimum 6 characters"
                    value={addForm.password}
                    onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs pr-14 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAddPassword(!showAddPassword)}
                    className="absolute right-2 top-2 text-[11px] text-slate-500 hover:text-slate-700 font-medium px-1 cursor-pointer"
                  >
                    {showAddPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
                <input
                  type="text"
                  disabled
                  value={departmentName}
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-600 font-semibold cursor-not-allowed"
                />
                <p className="text-[10px] text-slate-400 mt-1">Locked to your designated department.</p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addSubmitting}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {addSubmitting ? "Assigning…" : "Save & Assign Faculty"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT FACULTY CREDENTIALS MODAL */}
      {editingFaculty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">✏️</span>
                <h3 className="text-base font-bold text-slate-900">Edit Faculty Details &amp; Credentials</h3>
              </div>
              <button
                onClick={() => setEditingFaculty(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Modifying credentials for <strong className="text-slate-800 font-mono">{editingFaculty.email}</strong>.
            </p>

            {editError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-xl font-medium">
                {editError}
              </div>
            )}

            <form onSubmit={handleUpdateFaculty} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Faculty Full Name</label>
                <input
                  type="text"
                  required
                  value={editForm.fullName}
                  onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Faculty Email Address</label>
                <input
                  type="email"
                  required
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Update Password <span className="font-normal text-slate-400">(leave blank to keep current)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const newPwd = generateRandomPassword();
                      setEditForm({ ...editForm, password: newPwd });
                      setShowEditPassword(true);
                    }}
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                  >
                    🎲 Suggest New Pwd
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showEditPassword ? "text" : "password"}
                    placeholder="Enter new password to update"
                    value={editForm.password || ""}
                    onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs pr-14 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute right-2 top-2 text-[11px] text-slate-500 hover:text-slate-700 font-medium px-1 cursor-pointer"
                  >
                    {showEditPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              {editingFaculty.locked && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between">
                  <div className="text-xs text-amber-800">
                    <p className="font-bold">Faculty account is locked</p>
                    <p className="text-[11px]">Due to repeated failed sign-in attempts.</p>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-amber-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(editForm.resetLock)}
                      onChange={(e) => setEditForm({ ...editForm, resetLock: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    Unlock Account
                  </label>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingFaculty(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {editSubmitting ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE FACULTY MODAL */}
      {facultyToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-sm w-full p-6 space-y-4">
            <div className="text-center">
              <span className="text-3xl block mb-2">🗑️</span>
              <h3 className="text-base font-bold text-slate-900">Remove Faculty Account</h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to remove <strong className="text-slate-800">{facultyToDelete.fullName}</strong> ({facultyToDelete.email}) from {departmentName}?
              </p>
            </div>

            {deleteError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-xl font-medium">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setFacultyToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteFaculty}
                disabled={deleteSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                {deleteSubmitting ? "Removing…" : "Confirm Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
