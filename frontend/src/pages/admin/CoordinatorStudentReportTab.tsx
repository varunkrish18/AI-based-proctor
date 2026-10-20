import { useEffect, useState, useMemo } from "react";
import { api } from "../../api/client";
import type { Exam } from "../../types";

export interface CoordinatorStudentReportItem {
  studentId?: number;
  registerNumber: string;
  name: string;
  profName: string;
  department: string;
  totalQuestions: number;
  completedQuestions: number;
  incompleteQuestions: number;
}

export interface CoordinatorStudentReportResponse {
  examId: number;
  examName: string;
  totalCoordinatorQuestions: number;
  students: CoordinatorStudentReportItem[];
}

interface Props {
  exam: Exam;
}

type SortField = "registerNumber" | "name" | "profName" | "department" | "completedQuestions" | "incompleteQuestions";
type SortDirection = "asc" | "desc";

export default function CoordinatorStudentReportTab({ exam }: Props) {
  const [data, setData] = useState<CoordinatorStudentReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & sorting
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [professorFilter, setProfessorFilter] = useState("ALL");
  const [sortField, setSortField] = useState<SortField>("completedQuestions");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  useEffect(() => {
    fetchReport();
  }, [exam.id]);

  async function fetchReport() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<CoordinatorStudentReportResponse>(
        `/api/admin/exams/${exam.id}/coordinator-student-report`,
        "admin"
      );
      setData(res);
    } catch (err: any) {
      setError(err?.message || "Failed to load coordinator student report.");
    } finally {
      setLoading(false);
    }
  }

  // Handle sort toggles
  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection(field === "incompleteQuestions" ? "asc" : "desc");
    }
  }

  // Filter & sort list
  const filteredStudents = useMemo(() => {
    if (!data?.students) return [];

    return data.students
      .filter((s) => {
        if (departmentFilter !== "ALL" && s.department !== departmentFilter) {
          return false;
        }
        if (professorFilter !== "ALL" && s.profName !== professorFilter) {
          return false;
        }
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          const matchReg = s.registerNumber?.toLowerCase().includes(q);
          const matchName = s.name?.toLowerCase().includes(q);
          const matchProf = s.profName?.toLowerCase().includes(q);
          const matchDept = s.department?.toLowerCase().includes(q);
          return matchReg || matchName || matchProf || matchDept;
        }
        return true;
      })
      .sort((a, b) => {
        let valA: any = a[sortField];
        let valB: any = b[sortField];

        if (typeof valA === "string") {
          valA = (valA || "").toLowerCase();
          valB = (valB || "").toLowerCase();
        }

        if (valA < valB) return sortDirection === "asc" ? -1 : 1;
        if (valA > valB) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
  }, [data, search, departmentFilter, professorFilter, sortField, sortDirection]);

  // Unique departments and professors for dropdown filters
  const departments = useMemo(() => {
    if (!data?.students) return [];
    const depts = new Set<string>();
    data.students.forEach((s) => {
      if (s.department) depts.add(s.department);
    });
    return Array.from(depts).sort();
  }, [data]);

  const professors = useMemo(() => {
    if (!data?.students) return [];
    const profs = new Set<string>();
    data.students.forEach((s) => {
      if (s.profName) profs.add(s.profName);
    });
    return Array.from(profs).sort();
  }, [data]);

  // Export to Excel / CSV
  function exportToExcel() {
    if (!filteredStudents.length) return;

    const headers = [
      "Register number",
      "name",
      "Prof name",
      "Department",
      "Total number of question",
      "completed",
      "In complete",
    ];

    const rows = filteredStudents.map((s) => [
      `"${(s.registerNumber || "").replace(/"/g, '""')}"`,
      `"${(s.name || "").replace(/"/g, '""')}"`,
      `"${(s.profName || "").replace(/"/g, '""')}"`,
      `"${(s.department || "").replace(/"/g, '""')}"`,
      s.totalQuestions,
      s.completedQuestions,
      s.incompleteQuestions,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const safeName = (exam.name || "Exam").replace(/[^a-zA-Z0-9_-]/g, "_");
    link.setAttribute("download", `${safeName}_Coordinator_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Export / Print to PDF
  function exportToPdf() {
    window.print();
  }

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 shadow-sm animate-pulse">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="font-semibold text-slate-700">Loading Coordinator Student Report...</p>
        <p className="text-xs text-slate-400 mt-1">
          Compiling coordinator question metrics and section student progress...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-300 rounded-2xl p-6 text-center text-rose-800 shadow-sm">
        <p className="font-bold">Error loading report</p>
        <p className="text-xs mt-1">{error}</p>
        <button
          onClick={fetchReport}
          className="mt-4 px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold cursor-pointer transition shadow-xs"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title & Coordinator Notice Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 rounded-2xl p-6 text-white shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-300 border border-indigo-400/30">
                COURSE COORDINATOR REPORT
              </span>
              <span className="text-xs text-slate-400">
                Total Coordinator Questions:{" "}
                <strong className="text-emerald-400 font-mono text-sm">
                  {data?.totalCoordinatorQuestions ?? 0}
                </strong>
              </span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white">
              Student Completion &amp; Progress Report
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              This report reflects all students across all sections. The <strong>"Total number of question"</strong>{" "}
              metric strictly includes questions assigned by the Course Coordinator, excluding custom questions added by individual professors.
            </p>
          </div>

          {/* Action / Export Buttons */}
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <button
              onClick={exportToExcel}
              className="bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition shadow-sm flex items-center gap-2 cursor-pointer"
              title="Download full report as Excel (.csv)"
            >
              <span>📊</span>
              <span>Download Excel</span>
            </button>
            <button
              onClick={exportToPdf}
              className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition shadow-sm flex items-center gap-2 cursor-pointer"
              title="Print or Save as PDF"
            >
              <span>🖨️</span>
              <span>Download / Print PDF</span>
            </button>
          </div>
        </div>

        {/* Quick Summary Badges */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-850/80 p-2.5 rounded-xl border border-slate-800">
            <div className="text-slate-400">Total Students</div>
            <div className="text-lg font-bold text-white mt-0.5">{data?.students.length ?? 0}</div>
          </div>
          <div className="bg-slate-850/80 p-2.5 rounded-xl border border-slate-800">
            <div className="text-slate-400">Coordinator Questions</div>
            <div className="text-lg font-bold text-indigo-400 mt-0.5">
              {data?.totalCoordinatorQuestions ?? 0}
            </div>
          </div>
          <div className="bg-slate-850/80 p-2.5 rounded-xl border border-slate-800">
            <div className="text-slate-400">Total Completed Qs</div>
            <div className="text-lg font-bold text-emerald-400 mt-0.5">
              {data?.students.reduce((acc, s) => acc + s.completedQuestions, 0) ?? 0}
            </div>
          </div>
          <div className="bg-slate-850/80 p-2.5 rounded-xl border border-slate-800">
            <div className="text-slate-400">Total Incomplete Qs</div>
            <div className="text-lg font-bold text-amber-400 mt-0.5">
              {data?.students.reduce((acc, s) => acc + s.incompleteQuestions, 0) ?? 0}
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Order Controls Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          {/* Search Box */}
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Register No, Name, Prof..."
              className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            />
            <span className="absolute left-2.5 top-2.5 text-slate-400">🔍</span>
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* Department Filter */}
          {departments.length > 0 && (
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="ALL">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}

          {/* Professor Filter */}
          {professors.length > 0 && (
            <select
              value={professorFilter}
              onChange={(e) => setProfessorFilter(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="ALL">All Professors</option>
              {professors.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Sort Controls (Ascending / Descending by Completed or Incomplete) */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <span className="text-slate-500 font-semibold">Sort Order:</span>
          <button
            onClick={() => toggleSort("completedQuestions")}
            className={`px-3 py-1.5 rounded-xl font-bold border transition cursor-pointer flex items-center gap-1.5 ${
              sortField === "completedQuestions"
                ? "bg-emerald-50 border-emerald-500 text-emerald-800"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
            title="Sort by completed questions"
          >
            <span>Completed</span>
            <span>
              {sortField === "completedQuestions" ? (sortDirection === "asc" ? "▲ Asc" : "▼ Desc") : "↕"}
            </span>
          </button>

          <button
            onClick={() => toggleSort("incompleteQuestions")}
            className={`px-3 py-1.5 rounded-xl font-bold border transition cursor-pointer flex items-center gap-1.5 ${
              sortField === "incompleteQuestions"
                ? "bg-amber-50 border-amber-500 text-amber-900"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
            title="Sort by incomplete questions"
          >
            <span>In complete</span>
            <span>
              {sortField === "incompleteQuestions" ? (sortDirection === "asc" ? "▲ Asc" : "▼ Desc") : "↕"}
            </span>
          </button>
        </div>
      </div>

      {/* Main Table: Exact 7 columns as shown in diagram sketch */}
      <div className="bg-white border-2 border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white border-b-2 border-slate-800 text-xs font-black uppercase tracking-wider">
                {/* 1. Register number */}
                <th
                  onClick={() => toggleSort("registerNumber")}
                  className="py-3.5 px-4 border-r border-slate-700 cursor-pointer hover:bg-slate-800 transition"
                  title="Click to sort by Register number"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Register number</span>
                    {sortField === "registerNumber" && (
                      <span>{sortDirection === "asc" ? "▲" : "▼"}</span>
                    )}
                  </div>
                </th>

                {/* 2. name */}
                <th
                  onClick={() => toggleSort("name")}
                  className="py-3.5 px-4 border-r border-slate-700 cursor-pointer hover:bg-slate-800 transition"
                  title="Click to sort by Name"
                >
                  <div className="flex items-center gap-1.5">
                    <span>name</span>
                    {sortField === "name" && (
                      <span>{sortDirection === "asc" ? "▲" : "▼"}</span>
                    )}
                  </div>
                </th>

                {/* 3. Prof name */}
                <th
                  onClick={() => toggleSort("profName")}
                  className="py-3.5 px-4 border-r border-slate-700 cursor-pointer hover:bg-slate-800 transition"
                  title="Click to sort by Professor Name"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Prof name</span>
                    {sortField === "profName" && (
                      <span>{sortDirection === "asc" ? "▲" : "▼"}</span>
                    )}
                  </div>
                </th>

                {/* 4. Department */}
                <th
                  onClick={() => toggleSort("department")}
                  className="py-3.5 px-4 border-r border-slate-700 cursor-pointer hover:bg-slate-800 transition"
                  title="Click to sort by Department"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Department</span>
                    {sortField === "department" && (
                      <span>{sortDirection === "asc" ? "▲" : "▼"}</span>
                    )}
                  </div>
                </th>

                {/* 5. Total number of question */}
                <th className="py-3.5 px-4 border-r border-slate-700 text-center">
                  Total number of question
                </th>

                {/* 6. completed */}
                <th
                  onClick={() => toggleSort("completedQuestions")}
                  className="py-3.5 px-4 border-r border-slate-700 text-center cursor-pointer hover:bg-slate-800 transition text-emerald-300"
                  title="Click to sort by Completed questions (Asc / Desc)"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>completed</span>
                    {sortField === "completedQuestions" && (
                      <span>{sortDirection === "asc" ? "▲" : "▼"}</span>
                    )}
                  </div>
                </th>

                {/* 7. In complete */}
                <th
                  onClick={() => toggleSort("incompleteQuestions")}
                  className="py-3.5 px-4 text-center cursor-pointer hover:bg-slate-800 transition text-amber-300"
                  title="Click to sort by Incomplete questions (Asc / Desc)"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>In complete</span>
                    {sortField === "incompleteQuestions" && (
                      <span>{sortDirection === "asc" ? "▲" : "▼"}</span>
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredStudents.length > 0 ? (
                filteredStudents.map((s, idx) => (
                  <tr
                    key={s.studentId ? `${s.studentId}-${idx}` : `${s.registerNumber}-${idx}`}
                    className="hover:bg-indigo-50/40 transition-colors"
                  >
                    {/* 1. Register number */}
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 border-r border-slate-200">
                      {s.registerNumber}
                    </td>

                    {/* 2. name */}
                    <td className="py-3 px-4 font-semibold text-slate-800 border-r border-slate-200">
                      {s.name}
                    </td>

                    {/* 3. Prof name */}
                    <td className="py-3 px-4 text-slate-700 border-r border-slate-200">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                        <span>{s.profName}</span>
                      </div>
                    </td>

                    {/* 4. Department */}
                    <td className="py-3 px-4 text-slate-600 border-r border-slate-200">
                      {s.department}
                    </td>

                    {/* 5. Total number of question */}
                    <td className="py-3 px-4 text-center font-mono font-bold text-slate-900 border-r border-slate-200 bg-slate-50/60">
                      {s.totalQuestions}
                    </td>

                    {/* 6. completed */}
                    <td className="py-3 px-4 text-center border-r border-slate-200 bg-emerald-50/40">
                      <span className="inline-block px-2.5 py-1 rounded-full font-mono font-black text-xs bg-emerald-100 text-emerald-800 border border-emerald-300">
                        {s.completedQuestions}
                      </span>
                    </td>

                    {/* 7. In complete */}
                    <td className="py-3 px-4 text-center bg-amber-50/30">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full font-mono font-black text-xs ${
                          s.incompleteQuestions === 0
                            ? "bg-slate-100 text-slate-500"
                            : "bg-amber-100 text-amber-900 border border-amber-300"
                        }`}
                      >
                        {s.incompleteQuestions}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <div className="text-3xl mb-2">📋</div>
                    <p className="font-semibold text-slate-600">No student records found</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {search || departmentFilter !== "ALL" || professorFilter !== "ALL"
                        ? "Try adjusting your search or filter selections above."
                        : "No students have been enrolled or attempted this examination yet."}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
