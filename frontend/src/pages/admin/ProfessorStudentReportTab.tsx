import { useEffect, useState, useMemo } from "react";
import { api } from "../../api/client";
import type { Exam } from "../../types";

export interface ProfessorStudentReportItem {
  studentId?: number;
  registerNumber: string;
  name: string;
  totalQuestions: number;
  completedQuestions: number;
  incompleteQuestions: number;
}

export interface ProfessorStudentReportResponse {
  examId: number;
  examName: string;
  totalQuestions: number;
  coordinatorQuestionsCount: number;
  professorQuestionsCount: number;
  students: ProfessorStudentReportItem[];
}

interface Props {
  exam: Exam;
}

type SortField = "registerNumber" | "name" | "completedQuestions" | "incompleteQuestions";
type SortDirection = "asc" | "desc";

export default function ProfessorStudentReportTab({ exam }: Props) {
  const [data, setData] = useState<ProfessorStudentReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search by register and name
  const [search, setSearch] = useState("");

  // Sort order (completed questions, incomplete questions asc/desc)
  const [sortField, setSortField] = useState<SortField>("completedQuestions");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  useEffect(() => {
    fetchReport();
  }, [exam.id]);

  async function fetchReport() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ProfessorStudentReportResponse>(
        `/api/admin/exams/${exam.id}/professor-student-report`,
        "admin"
      );
      setData(res);
    } catch (err: any) {
      setError(err?.message || "Failed to load professor student report.");
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

  // Filter by register number and name, then sort
  const filteredStudents = useMemo(() => {
    if (!data?.students) return [];

    return data.students
      .filter((s) => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        const matchReg = (s.registerNumber || "").toLowerCase().includes(q);
        const matchName = (s.name || "").toLowerCase().includes(q);
        return matchReg || matchName;
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
  }, [data, search, sortField, sortDirection]);

  // Export to Excel / CSV (exact 5 columns from diagram)
  function exportToExcel() {
    if (!filteredStudents.length) return;

    const headers = [
      "Register number",
      "name",
      "Total number of question",
      "completed",
      "In complete",
    ];

    const rows = filteredStudents.map((s) => [
      `"${(s.registerNumber || "").replace(/"/g, '""')}"`,
      `"${(s.name || "").replace(/"/g, '""')}"`,
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
    link.setAttribute("download", `${safeName}_Professor_Student_Report.csv`);
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
        <p className="font-semibold text-slate-700">Loading Student Report...</p>
        <p className="text-xs text-slate-400 mt-1">
          Compiling assigned student progress for your section...
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
      {/* Title & Professor Metrics Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 rounded-2xl p-6 text-white shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-300 border border-indigo-400/30">
                FACULTY SECTION REPORT
              </span>
              <span className="text-xs text-slate-300">
                Total Questions:{" "}
                <strong className="text-emerald-400 font-mono text-sm">
                  {data?.totalQuestions ?? 0}
                </strong>{" "}
                ({data?.coordinatorQuestionsCount ?? 0} Coordinator + {data?.professorQuestionsCount ?? 0} Your Questions)
              </span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white">
              Assigned Students Completion Report
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Showing students assigned to your section. The <strong>"Total number of question"</strong> metric includes both
              questions assigned by the Course Coordinator and questions added by you.
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
            <div className="text-slate-400">Assigned Students</div>
            <div className="text-lg font-bold text-white mt-0.5">{data?.students.length ?? 0}</div>
          </div>
          <div className="bg-slate-850/80 p-2.5 rounded-xl border border-slate-800">
            <div className="text-slate-400">Total Questions</div>
            <div className="text-lg font-bold text-indigo-400 mt-0.5">
              {data?.totalQuestions ?? 0}
            </div>
          </div>
          <div className="bg-slate-850/80 p-2.5 rounded-xl border border-slate-800">
            <div className="text-slate-400">Completed Qs</div>
            <div className="text-lg font-bold text-emerald-400 mt-0.5">
              {data?.students.reduce((acc, s) => acc + s.completedQuestions, 0) ?? 0}
            </div>
          </div>
          <div className="bg-slate-850/80 p-2.5 rounded-xl border border-slate-800">
            <div className="text-slate-400">Incomplete Qs</div>
            <div className="text-lg font-bold text-amber-400 mt-0.5">
              {data?.students.reduce((acc, s) => acc + s.incompleteQuestions, 0) ?? 0}
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Order Controls Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          {/* Search Box: search option by register and name */}
          <div className="relative min-w-[240px] flex-1 max-w-sm">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Register number or Name..."
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
          {search && (
            <span className="text-slate-500 text-xs">
              Found {filteredStudents.length} of {data?.students.length ?? 0} students
            </span>
          )}
        </div>

        {/* Sort Controls (Ascending / Descending by Completed or Incomplete) */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <span className="text-slate-500 font-semibold">Arrange Order:</span>
          <button
            onClick={() => toggleSort("completedQuestions")}
            className={`px-3 py-1.5 rounded-xl font-bold border transition cursor-pointer flex items-center gap-1.5 ${
              sortField === "completedQuestions"
                ? "bg-emerald-50 border-emerald-500 text-emerald-800"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
            title="Sort ascending or descending by completed questions"
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
            title="Sort ascending or descending by incomplete questions"
          >
            <span>In complete</span>
            <span>
              {sortField === "incompleteQuestions" ? (sortDirection === "asc" ? "▲ Asc" : "▼ Desc") : "↕"}
            </span>
          </button>
        </div>
      </div>

      {/* Main Table: Exact 5 columns as shown in professor diagram sketch */}
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

                {/* 3. Total number of question */}
                <th className="py-3.5 px-4 border-r border-slate-700 text-center">
                  Total number of question
                </th>

                {/* 4. completed */}
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

                {/* 5. In complete */}
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

                    {/* 3. Total number of question */}
                    <td className="py-3 px-4 text-center font-mono font-bold text-slate-900 border-r border-slate-200 bg-slate-50/60">
                      {s.totalQuestions}
                    </td>

                    {/* 4. completed */}
                    <td className="py-3 px-4 text-center border-r border-slate-200 bg-emerald-50/40">
                      <span className="inline-block px-2.5 py-1 rounded-full font-mono font-black text-xs bg-emerald-100 text-emerald-800 border border-emerald-300">
                        {s.completedQuestions}
                      </span>
                    </td>

                    {/* 5. In complete */}
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
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <div className="text-3xl mb-2">📋</div>
                    <p className="font-semibold text-slate-600">No student records found</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {search
                        ? "No students match your search filter."
                        : "No students are assigned to this section yet."}
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
