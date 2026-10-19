import React, { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { api, downloadFile } from "../../api/client";
import type { ProfessorUser, CreateProfessorPayload, UpdateProfessorPayload, BulkProfessorUploadResult } from "../../types";

const PRESET_DEPARTMENTS = [
  "Computer Science & Engineering",
  "Information Technology",
  "Electronics & Communication Engineering",
  "Electrical & Electronics Engineering",
  "Mechanical Engineering",
  "Civil Engineering",
  "Artificial Intelligence & Data Science",
];

const PRESET_YEARS = [
  "1st Year",
  "2nd Year",
  "3rd Year",
  "4th Year",
  "All Years",
];

export default function ProfessorManagementTab() {
  const [professors, setProfessors] = useState<ProfessorUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>("ALL");
  const [selectedYearFilter, setSelectedYearFilter] = useState<string>("ALL");

  // Visibility states for passwords
  const [visiblePasswords, setVisiblePasswords] = useState<Record<number, boolean>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Create Professor Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateProfessorPayload>({
    fullName: "",
    department: "Computer Science & Engineering",
    staffCode: "",
    year: "3rd Year",
    email: "",
    password: "",
  });
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showCreatePassword, setShowCreatePassword] = useState(false);

  // Edit Professor Modal state
  const [editingProfessor, setEditingProfessor] = useState<ProfessorUser | null>(null);
  const [editForm, setEditForm] = useState<UpdateProfessorPayload>({
    fullName: "",
    department: "",
    staffCode: "",
    year: "",
    email: "",
    password: "",
  });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [showEditPassword, setShowEditPassword] = useState(false);

  // Delete Professor Modal state
  const [professorToDelete, setProfessorToDelete] = useState<ProfessorUser | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Bulk Upload Modal state
  interface ParsedProfessorRow {
    rowNumber: number;
    fullName: string;
    department: string;
    staffCode: string;
    year: string;
    email: string;
    password?: string;
    isValid: boolean;
    validationError?: string;
    note?: string;
  }

  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedProfessorRow[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkProfessorUploadResult | null>(null);
  const [downloadingSample, setDownloadingSample] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function fetchProfessors() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<ProfessorUser[]>("/api/admin/professors", "admin");
      setProfessors(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load professor credentials.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProfessors();
  }, []);

  function togglePasswordVisibility(profId: number) {
    setVisiblePasswords((prev) => ({
      ...prev,
      [profId]: !prev[profId],
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
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let pwd = "";
    for (let i = 0; i < 8; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  }

  function generateSampleStaffCode(dept: string) {
    const codePrefix = dept.includes("Computer") ? "PROF-CS"
      : dept.includes("Information") ? "PROF-IT"
      : dept.includes("Electronics") ? "PROF-EC"
      : dept.includes("Electrical") ? "PROF-EE"
      : dept.includes("Mechanical") ? "PROF-ME"
      : dept.includes("Civil") ? "PROF-CE"
      : dept.includes("Artificial") ? "PROF-AD"
      : "PROF";
    const randNum = Math.floor(10 + Math.random() * 90);
    return `${codePrefix}-${randNum}`;
  }

  function copyAllCredentials() {
    if (filteredProfessors.length === 0) return;
    const header = "Name\tdepartment\tStaff code\tyear\tmail\tpassword";
    const rows = filteredProfessors.map((p) =>
      `${p.fullName}\t${p.department || "—"}\t${p.staffCode || "—"}\t${p.year || "—"}\t${p.email}\t${p.displayPassword || "—"}`
    );
    const content = [header, ...rows].join("\n");
    navigator.clipboard.writeText(content);
    setSuccessMsg(`Copied credentials for ${filteredProfessors.length} professors to clipboard!`);
    setTimeout(() => setSuccessMsg(null), 4000);
  }

  function exportCredentialsCsv() {
    if (filteredProfessors.length === 0) return;
    const header = "Name,department,Staff code,year,mail,password";
    const escape = (val: string) => `"${(val || "").replace(/"/g, '""')}"`;
    const rows = filteredProfessors.map((p) =>
      [
        escape(p.fullName),
        escape(p.department || ""),
        escape(p.staffCode || ""),
        escape(p.year || ""),
        escape(p.email),
        escape(p.displayPassword || ""),
      ].join(",")
    );
    const csvContent = "data:text/csv;charset=utf-8," + [header, ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `professor_credentials_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function handleCreateProfessor(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreateSubmitting(true);
    try {
      const newProf = await api.post<ProfessorUser>("/api/admin/professors", createForm, "admin");
      setProfessors((prev) => [newProf, ...prev]);
      setShowCreateModal(false);
      setSuccessMsg(`Professor '${newProf.fullName}' (${newProf.staffCode}) registered successfully!`);
      setCreateForm({
        fullName: "",
        department: "Computer Science & Engineering",
        staffCode: "",
        year: "3rd Year",
        email: "",
        password: "",
      });
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to add professor.");
    } finally {
      setCreateSubmitting(false);
    }
  }

  function openEditModal(professor: ProfessorUser) {
    setEditingProfessor(professor);
    setEditForm({
      fullName: professor.fullName,
      department: professor.department || "",
      staffCode: professor.staffCode || "",
      year: professor.year || "",
      email: professor.email,
      password: professor.displayPassword || "",
    });
    setEditError(null);
    setShowEditPassword(false);
  }

  async function handleUpdateProfessor(e: React.FormEvent) {
    e.preventDefault();
    if (!editingProfessor) return;
    setEditError(null);
    setEditSubmitting(true);
    try {
      const updated = await api.put<ProfessorUser>(
        `/api/admin/professors/${editingProfessor.id}`,
        editForm,
        "admin"
      );
      setProfessors((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setEditingProfessor(null);
      setSuccessMsg(`Professor credentials for '${updated.fullName}' updated successfully!`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update professor credentials.");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDeleteProfessor() {
    if (!professorToDelete) return;
    setDeleteError(null);
    setDeleteSubmitting(true);
    try {
      await api.delete(`/api/admin/professors/${professorToDelete.id}`, "admin");
      setProfessors((prev) => prev.filter((p) => p.id !== professorToDelete.id));
      const deletedName = professorToDelete.fullName;
      setProfessorToDelete(null);
      setSuccessMsg(`Professor '${deletedName}' removed successfully.`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete professor.");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  async function downloadSampleTemplate(format: "csv" | "excel") {
    setDownloadingSample(format);
    const filename =
      format === "excel" ? "sample_professor_credentials.xlsx" : "sample_professor_credentials.csv";
    try {
      await downloadFile(`/api/admin/professors/sample-template?format=${format}`, filename, "admin");
    } catch {
      // Client-side fallback using SheetJS
      const sampleData = [
        {
          Name: "Dr. Ramesh Sundaram",
          department: "Computer Science & Engineering",
          "Staff code": "PROF-CS-01",
          year: "3rd Year",
          mail: "ramesh.cs@college.edu",
          password: "profPass123",
        },
        {
          Name: "Dr. Ananya Sharma",
          department: "Information Technology",
          "Staff code": "PROF-IT-02",
          year: "3rd Year",
          mail: "ananya.it@college.edu",
          password: "profPass123",
        },
        {
          Name: "Dr. Karthik Raman",
          department: "Electronics & Communication Engineering",
          "Staff code": "PROF-EC-03",
          year: "2nd Year",
          mail: "karthik.ec@college.edu",
          password: "profPass123",
        },
        {
          Name: "Dr. Meenakshi Sundar",
          department: "Artificial Intelligence & Data Science",
          "Staff code": "PROF-AD-04",
          year: "1st Year",
          mail: "meenakshi.ad@college.edu",
          password: "profPass123",
        },
        {
          Name: "Dr. Rajesh Kumar",
          department: "Mechanical Engineering",
          "Staff code": "PROF-ME-05",
          year: "4th Year",
          mail: "rajesh.me@college.edu",
          password: "",
        },
      ];
      const ws = XLSX.utils.json_to_sheet(sampleData);
      if (format === "csv") {
        const csv = XLSX.utils.sheet_to_csv(ws);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Professors");
        XLSX.writeFile(wb, filename);
      }
    } finally {
      setDownloadingSample(null);
    }
  }

  function handleFileSelected(file: File) {
    setBulkFile(file);
    setBulkError(null);
    setBulkResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          setBulkError("Spreadsheet has no sheets.");
          setParsedRows([]);
          return;
        }
        const sheet = workbook.Sheets[sheetName];
        const jsonRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });
        if (!jsonRows || jsonRows.length === 0) {
          setBulkError("Selected file is empty.");
          setParsedRows([]);
          return;
        }

        const headerRow = (jsonRows[0] || []).map((h) => String(h || "").trim());
        const colMap: Record<string, number> = {};
        headerRow.forEach((h, idx) => {
          const norm = h.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (norm === "name" || norm === "fullname" || norm === "professorname" || norm === "profname") {
            colMap["name"] = idx;
          } else if (norm === "department" || norm === "dept" || norm === "branch") {
            colMap["department"] = idx;
          } else if (
            norm === "staffcode" ||
            norm === "profcode" ||
            norm === "staffid" ||
            norm === "code" ||
            norm === "facultycode"
          ) {
            colMap["staffCode"] = idx;
          } else if (norm === "year" || norm === "academicyear" || norm === "handlingyear" || norm === "batch") {
            colMap["year"] = idx;
          } else if (norm === "mail" || norm === "email" || norm === "emailaddress") {
            colMap["email"] = idx;
          } else if (norm === "password" || norm === "pwd" || norm === "pass") {
            colMap["password"] = idx;
          }
        });

        const rows: ParsedProfessorRow[] = [];
        const seenEmailsInFile = new Set<string>();

        for (let r = 1; r < jsonRows.length; r++) {
          const row = jsonRows[r];
          if (!row || row.every((c) => String(c || "").trim() === "")) continue;

          const getVal = (key: string) => {
            const idx = colMap[key];
            return idx !== undefined && row[idx] !== undefined ? String(row[idx]).trim() : "";
          };

          const name = getVal("name");
          const department = getVal("department");
          const staffCode = getVal("staffCode");
          const year = getVal("year");
          let email = getVal("email");
          const password = getVal("password");

          if (!name && !department && !staffCode && !year && !email && !password) continue;
          if (!name && !staffCode) continue;

          let isValid = true;
          let validationError = "";
          let note = "";

          if (!staffCode) {
            isValid = false;
            validationError = "Staff code is required";
          }

          if (!email) {
            const domain = "college.edu";
            const cleanCode = (staffCode || `prof${r}`).toLowerCase().replace(/[^a-z0-9]/g, "");
            const cleanName = (name || "").toLowerCase().replace(/[^a-z0-9]/g, ".");
            email = cleanName && cleanName !== "professor" ? `${cleanName}.${cleanCode}@${domain}` : `${cleanCode}@${domain}`;
            note = "Auto-assigned unique email";
          } else if (!email.includes("@")) {
            isValid = false;
            validationError = "Invalid email format";
          } else if (seenEmailsInFile.has(email.toLowerCase())) {
            const domain = email.includes("@") ? email.split("@")[1] : "college.edu";
            const cleanCode = (staffCode || `pf${r}`).toLowerCase().replace(/[^a-z0-9]/g, "");
            const cleanName = (name || "").toLowerCase().replace(/[^a-z0-9]/g, ".");
            let candidate = cleanName && cleanName !== "professor" ? `${cleanName}.${cleanCode}@${domain}` : `${cleanCode}@${domain}`;
            let count = 1;
            while (seenEmailsInFile.has(candidate.toLowerCase())) {
              candidate = `${cleanCode}.${count}@${domain}`;
              count++;
            }
            email = candidate;
            note = "Auto-assigned unique email (duplicate in file)";
          }

          seenEmailsInFile.add(email.toLowerCase());

          rows.push({
            rowNumber: r,
            fullName: name || (staffCode ? `Prof ${staffCode}` : (email ? email.split("@")[0] : `Professor ${r}`)),
            department,
            staffCode,
            year,
            email,
            password,
            isValid,
            validationError,
            note,
          });
        }

        if (rows.length === 0) {
          setBulkError("No professor data rows found below the header row.");
        }
        setParsedRows(rows);
      } catch (err) {
        setBulkError(err instanceof Error ? err.message : "Failed to read spreadsheet file.");
        setParsedRows([]);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function handleImportBulk() {
    if (!bulkFile && parsedRows.length === 0) return;
    setBulkSubmitting(true);
    setBulkError(null);
    try {
      let result: BulkProfessorUploadResult;
      const validRows = parsedRows.filter((r) => r.isValid);

      if (validRows.length > 0) {
        const requests: CreateProfessorPayload[] = validRows.map((r) => ({
          fullName: r.fullName,
          department: r.department,
          staffCode: r.staffCode,
          year: r.year,
          email: r.email,
          password: r.password,
        }));
        result = await api.post<BulkProfessorUploadResult>(
          "/api/admin/professors/bulk",
          requests,
          "admin"
        );
      } else if (bulkFile) {
        const formData = new FormData();
        formData.append("file", bulkFile);
        result = await api.uploadMultipart<BulkProfessorUploadResult>(
          "/api/admin/professors/upload",
          formData,
          "admin"
        );
      } else {
        return;
      }

      setBulkResult(result);
      fetchProfessors();
      setSuccessMsg(`Bulk upload complete! ${result.createdCount} created, ${result.updatedCount} updated.`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Bulk upload failed.");
    } finally {
      setBulkSubmitting(false);
    }
  }

  // Derive unique departments list
  const allDepartments = useMemo(() => {
    const set = new Set<string>(PRESET_DEPARTMENTS);
    professors.forEach((p) => {
      if (p.department && p.department.trim()) {
        set.add(p.department.trim());
      }
    });
    return Array.from(set).sort();
  }, [professors]);

  // Filtered professors based on search and filters
  const filteredProfessors = useMemo(() => {
    return professors.filter((p) => {
      // Search by name and prof code (staff code)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = (p.fullName || "").toLowerCase().includes(q);
        const matchesCode = (p.staffCode || "").toLowerCase().includes(q);
        const matchesEmail = (p.email || "").toLowerCase().includes(q);
        if (!matchesName && !matchesCode && !matchesEmail) return false;
      }

      // Department filter
      if (selectedDeptFilter !== "ALL") {
        if (selectedDeptFilter === "NONE") {
          if (p.department && p.department.trim()) return false;
        } else if ((p.department || "").trim().toLowerCase() !== selectedDeptFilter.toLowerCase()) {
          return false;
        }
      }

      // Year filter
      if (selectedYearFilter !== "ALL") {
        if (selectedYearFilter === "NONE") {
          if (p.year && p.year.trim()) return false;
        } else if ((p.year || "").trim().toLowerCase() !== selectedYearFilter.toLowerCase()) {
          return false;
        }
      }

      return true;
    });
  }, [professors, searchQuery, selectedDeptFilter, selectedYearFilter]);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner / Actions Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">👨‍🏫</span>
            <h2 className="text-xl font-bold text-slate-900">Professor Login Credentials</h2>
            <span className="bg-violet-50 text-violet-700 font-bold text-xs px-2.5 py-0.5 rounded-full border border-violet-200">
              {professors.length} {professors.length === 1 ? "Professor" : "Professors"}
            </span>
          </div>
          <p className="text-slate-500 text-xs mt-1 max-w-2xl leading-relaxed">
            Manage professor records, department assignments, staff codes, handling years, and examination portal login credentials. Search by professor name or prof code.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={fetchProfessors}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
            title="Reload professor credentials"
          >
            <span className={loading ? "animate-spin" : ""}>🔄</span> Refresh
          </button>
          <button
            onClick={copyAllCredentials}
            disabled={filteredProfessors.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
            title="Copy visible credentials table to clipboard"
          >
            <span>📋</span> Copy All
          </button>
          <button
            onClick={exportCredentialsCsv}
            disabled={filteredProfessors.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
            title="Download CSV report"
          >
            <span>📥</span> Export CSV
          </button>
          <button
            onClick={() => {
              setBulkFile(null);
              setParsedRows([]);
              setBulkError(null);
              setBulkResult(null);
              setShowBulkModal(true);
            }}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5 cursor-pointer"
            title="Bulk import professors from Excel or CSV spreadsheet"
          >
            <span>📤</span> Bulk Upload (Excel / CSV)
          </button>
          <button
            onClick={() => {
              const defaultDept = "Computer Science & Engineering";
              setCreateForm({
                fullName: "",
                department: defaultDept,
                staffCode: generateSampleStaffCode(defaultDept),
                year: "3rd Year",
                email: "",
                password: generateRandomPassword(),
              });
              setCreateError(null);
              setShowCreatePassword(true);
              setShowCreateModal(true);
            }}
            className="bg-violet-600 hover:bg-violet-500 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            <span>+</span> Add Professor
          </button>
        </div>
      </div>

      {/* Search and Filters Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Search by Name & Prof Code */}
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              🔍
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or prof code..."
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-violet-500 focus:border-violet-500 focus:outline-none transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* Department Filter */}
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-500">Department:</span>
            <select
              value={selectedDeptFilter}
              onChange={(e) => setSelectedDeptFilter(e.target.value)}
              className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-medium focus:ring-2 focus:ring-violet-500 focus:outline-none bg-slate-50"
            >
              <option value="ALL">All Departments</option>
              <option value="NONE">No Department</option>
              {allDepartments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          {/* Academic/Handling Year Filter */}
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-500">Year:</span>
            <select
              value={selectedYearFilter}
              onChange={(e) => setSelectedYearFilter(e.target.value)}
              className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-medium focus:ring-2 focus:ring-violet-500 focus:outline-none bg-slate-50"
            >
              <option value="ALL">All Years</option>
              <option value="NONE">No Year</option>
              {PRESET_YEARS.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="text-slate-400 font-medium">
          Showing <strong className="text-slate-700">{filteredProfessors.length}</strong> of {professors.length} professors
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center justify-between">
          <span>✓ {successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-600 hover:text-emerald-900 ml-2">
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold flex items-center justify-between">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="text-rose-600 hover:text-rose-900 ml-2">
            ✕
          </button>
        </div>
      )}

      {/* Professors Table - strictly adhering to the requested image structure:
          Name | department | Staff code | year | mail | password
      */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 uppercase text-[11px] font-bold tracking-wider">
                <th className="py-3.5 px-4">Name</th>
                <th className="py-3.5 px-4">department</th>
                <th className="py-3.5 px-4">Staff code</th>
                <th className="py-3.5 px-4">year</th>
                <th className="py-3.5 px-4">mail</th>
                <th className="py-3.5 px-4">password</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && professors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <span className="animate-spin text-2xl">🔄</span>
                      <span>Loading professor credentials…</span>
                    </div>
                  </td>
                </tr>
              ) : filteredProfessors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <span className="text-2xl">👨‍🏫</span>
                      <span className="text-slate-600 font-bold">No professor credentials found</span>
                      <span className="text-xs text-slate-400 max-w-sm">
                        {searchQuery || selectedDeptFilter !== "ALL" || selectedYearFilter !== "ALL"
                          ? "Try clearing the search query or department/year filters."
                          : "Click '+ Add Professor' or 'Bulk Upload (Excel / CSV)' to register professor credentials."}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredProfessors.map((p) => {
                  const isPwdVisible = !!visiblePasswords[p.id];
                  const rawPwd = p.displayPassword || "";

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50/70 transition-colors group"
                    >
                      {/* Name */}
                      <td className="py-3 px-4 font-semibold text-slate-800 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-violet-100 text-violet-800 font-bold flex items-center justify-center text-[11px] shrink-0">
                            {(p.fullName || "P").charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block">{p.fullName || "—"}</span>
                          </div>
                        </div>
                      </td>

                      {/* Department */}
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                        {p.department ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            {p.department}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Not Assigned</span>
                        )}
                      </td>

                      {/* Staff code */}
                      <td className="py-3 px-4 font-mono font-bold text-slate-800 whitespace-nowrap">
                        {p.staffCode ? (
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700 border border-slate-200">
                            {p.staffCode}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Year */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {p.year ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            {p.year}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Mail */}
                      <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>{p.email}</span>
                          <button
                            onClick={() => copyToClipboard(p.email, `email-${p.id}`)}
                            className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition cursor-pointer"
                            title="Copy email"
                          >
                            {copiedField === `email-${p.id}` ? (
                              <span className="text-[10px] text-emerald-600 font-bold">✓</span>
                            ) : (
                              <span className="text-[10px]">📋</span>
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Password */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {rawPwd ? (
                          <div className="inline-flex items-center gap-2 bg-slate-100/90 border border-slate-300 rounded-lg px-2.5 py-1">
                            <span className="font-mono font-semibold text-slate-800 select-all tracking-wider">
                              {isPwdVisible ? rawPwd : "••••••••"}
                            </span>
                            <div className="flex items-center gap-1 border-l border-slate-300 pl-1.5">
                              <button
                                type="button"
                                onClick={() => togglePasswordVisibility(p.id)}
                                className="text-slate-500 hover:text-slate-800 text-[11px] px-1 py-0.5 rounded cursor-pointer transition"
                                title={isPwdVisible ? "Hide password" : "Show password"}
                              >
                                {isPwdVisible ? "🙈" : "👁️"}
                              </button>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(rawPwd, `pwd-${p.id}`)}
                                className="text-slate-500 hover:text-slate-800 text-[11px] px-1 py-0.5 rounded cursor-pointer transition"
                                title="Copy password"
                              >
                                {copiedField === `pwd-${p.id}` ? (
                                  <span className="text-emerald-600 font-bold">✓</span>
                                ) : (
                                  "📋"
                                )}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">No Display Password</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEditModal(p)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                            title="Edit professor details & credentials"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => {
                              setProfessorToDelete(p);
                              setDeleteError(null);
                            }}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Delete professor"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Professor Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 animate-scaleUp my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xl">👨‍🏫</span>
                <h3 className="text-base font-bold text-slate-900">Add Professor &amp; Issue Credentials</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold">
                ⚠️ {createError}
              </div>
            )}

            <form onSubmit={handleCreateProfessor} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={createForm.fullName}
                  onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
                  placeholder="e.g. Dr. Ramesh Sundaram"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Department <span className="text-rose-500">*</span>
                </label>
                <select
                  value={createForm.department}
                  onChange={(e) => {
                    const dept = e.target.value;
                    setCreateForm({
                      ...createForm,
                      department: dept,
                      staffCode: createForm.staffCode || generateSampleStaffCode(dept),
                    });
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-500 focus:outline-none bg-white"
                >
                  {PRESET_DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700">
                      Staff Code / Prof Code <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setCreateForm({
                          ...createForm,
                          staffCode: generateSampleStaffCode(createForm.department || "Computer"),
                        })
                      }
                      className="text-[10px] text-violet-600 hover:text-violet-700 font-semibold cursor-pointer"
                    >
                      🎲 Generate
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={createForm.staffCode}
                    onChange={(e) => setCreateForm({ ...createForm, staffCode: e.target.value.toUpperCase() })}
                    placeholder="e.g. PROF-CS-01"
                    className="w-full px-3 py-2 font-mono uppercase border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Year (Academic / Handling)
                  </label>
                  <select
                    value={createForm.year}
                    onChange={(e) => setCreateForm({ ...createForm, year: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-500 focus:outline-none bg-white"
                  >
                    {PRESET_YEARS.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Mail (Login Email) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  placeholder="e.g. ramesh.cs@college.edu"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700">
                    Password <span className="text-slate-400 font-normal">(leave blank to auto-generate)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const newPwd = generateRandomPassword();
                      setCreateForm({ ...createForm, password: newPwd });
                      setShowCreatePassword(true);
                    }}
                    className="text-[10px] text-violet-600 hover:text-violet-700 font-semibold cursor-pointer"
                  >
                    🎲 Generate Password
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showCreatePassword ? "text" : "password"}
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    placeholder="Enter or auto-generate password"
                    className="w-full px-3 py-2 pr-10 font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePassword(!showCreatePassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 text-xs"
                  >
                    {showCreatePassword ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {createSubmitting ? (
                    <>
                      <span className="animate-spin">🔄</span> Registering…
                    </>
                  ) : (
                    "Register Professor"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Professor Modal */}
      {editingProfessor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 animate-scaleUp my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xl">✏️</span>
                <h3 className="text-base font-bold text-slate-900">Edit Professor Credentials</h3>
              </div>
              <button
                onClick={() => setEditingProfessor(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {editError && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold">
                ⚠️ {editError}
              </div>
            )}

            <form onSubmit={handleUpdateProfessor} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editForm.fullName}
                  onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Department
                </label>
                <select
                  value={editForm.department || ""}
                  onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-500 focus:outline-none bg-white"
                >
                  <option value="">No Department Assigned</option>
                  {PRESET_DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Staff Code / Prof Code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.staffCode || ""}
                    onChange={(e) => setEditForm({ ...editForm, staffCode: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 font-mono uppercase border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Year (Academic / Handling)
                  </label>
                  <select
                    value={editForm.year || ""}
                    onChange={(e) => setEditForm({ ...editForm, year: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-500 focus:outline-none bg-white"
                  >
                    <option value="">Not Assigned</option>
                    {PRESET_YEARS.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Mail (Login Email) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700">
                    Reset Password <span className="text-slate-400 font-normal">(leave blank to keep unchanged)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const newPwd = generateRandomPassword();
                      setEditForm({ ...editForm, password: newPwd });
                      setShowEditPassword(true);
                    }}
                    className="text-[10px] text-violet-600 hover:text-violet-700 font-semibold cursor-pointer"
                  >
                    🎲 Generate Password
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showEditPassword ? "text" : "password"}
                    value={editForm.password || ""}
                    onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                    placeholder="Enter new password or leave blank"
                    className="w-full px-3 py-2 pr-10 font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 text-xs"
                  >
                    {showEditPassword ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingProfessor(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {editSubmitting ? (
                    <>
                      <span className="animate-spin">🔄</span> Saving…
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Professor Confirmation Modal */}
      {professorToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 animate-scaleUp">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <span className="text-2xl">⚠️</span>
              <h3 className="text-base font-bold text-slate-900">Delete Professor Account?</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to permanently remove professor credentials for{" "}
              <strong className="text-slate-900 font-bold">{professorToDelete.fullName}</strong>{" "}
              ({professorToDelete.staffCode || professorToDelete.email})?
              This will revoke login credentials and remove the profile.
            </p>

            {deleteError && (
              <div className="mt-3 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold">
                ⚠️ {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 mt-5">
              <button
                type="button"
                onClick={() => setProfessorToDelete(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 transition text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteProfessor}
                disabled={deleteSubmitting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {deleteSubmitting ? (
                  <>
                    <span className="animate-spin">🔄</span> Deleting…
                  </>
                ) : (
                  "Delete Professor"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Upload Modal (Excel / CSV) - exactly like Student credentials */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full p-6 animate-scaleUp my-8 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">📤</span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Bulk Upload Professor Credentials
                  </h3>
                  <p className="text-xs text-slate-500">
                    Upload an Excel (.xlsx, .xls) or CSV file with columns: Name, department, Staff code, year, mail, password.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBulkModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg p-1"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto flex-1 py-4 space-y-4 text-xs">
              {/* Sample Template Download Box */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <span className="font-bold text-slate-800 block text-xs">
                    Need the formatted template?
                  </span>
                  <span className="text-slate-500 text-[11px]">
                    Download a pre-configured template with proper column headers.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => downloadSampleTemplate("csv")}
                    disabled={downloadingSample === "csv"}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 font-semibold text-xs cursor-pointer shadow-2xs"
                  >
                    <span>📄</span>
                    {downloadingSample === "csv" ? "Downloading…" : "Sample CSV"}
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadSampleTemplate("excel")}
                    disabled={downloadingSample === "excel"}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 font-semibold text-xs cursor-pointer shadow-2xs"
                  >
                    <span>📊</span>
                    {downloadingSample === "excel" ? "Downloading…" : "Sample Excel (.xlsx)"}
                  </button>
                </div>
              </div>

              {/* Drag and Drop Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleFileSelected(e.dataTransfer.files[0]);
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2 ${
                  isDragging
                    ? "border-violet-500 bg-violet-50/50"
                    : "border-slate-300 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-50"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileSelected(e.target.files[0]);
                    }
                  }}
                />
                <div className="w-12 h-12 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-2xl font-bold">
                  📤
                </div>
                <div>
                  <span className="font-bold text-slate-800 text-sm block">
                    {bulkFile ? bulkFile.name : "Click to select or drag and drop spreadsheet"}
                  </span>
                  <span className="text-slate-400 text-xs">
                    Supports Microsoft Excel (.xlsx, .xls) and CSV (.csv) files
                  </span>
                </div>
                {bulkFile && (
                  <span className="inline-block mt-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    File attached: {(bulkFile.size / 1024).toFixed(1)} KB
                  </span>
                )}
              </div>

              {/* Bulk Error Alert */}
              {bulkError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold flex items-center justify-between">
                  <span>⚠️ {bulkError}</span>
                  <button onClick={() => setBulkError(null)} className="text-rose-600 hover:text-rose-900 ml-2">
                    ✕
                  </button>
                </div>
              )}

              {/* Bulk Success / Result Summary */}
              {bulkResult && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-2">
                  <div className="font-bold flex items-center gap-1.5 text-emerald-800 text-sm">
                    <span>✓</span> Bulk Import Completed Successfully!
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center pt-1 font-semibold">
                    <div className="bg-white/80 p-2 rounded-lg border border-emerald-200">
                      <div className="text-xs text-slate-500">Processed</div>
                      <div className="text-base font-bold text-slate-800">{bulkResult.totalProcessed}</div>
                    </div>
                    <div className="bg-white/80 p-2 rounded-lg border border-emerald-200">
                      <div className="text-xs text-emerald-600">Created New</div>
                      <div className="text-base font-bold text-emerald-700">{bulkResult.createdCount}</div>
                    </div>
                    <div className="bg-white/80 p-2 rounded-lg border border-emerald-200">
                      <div className="text-xs text-blue-600">Updated</div>
                      <div className="text-base font-bold text-blue-700">{bulkResult.updatedCount}</div>
                    </div>
                  </div>
                  {bulkResult.errors && bulkResult.errors.length > 0 && (
                    <div className="mt-2 text-rose-700 bg-rose-50 p-2 rounded border border-rose-200">
                      <strong className="block mb-1">Warnings / Errors:</strong>
                      <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                        {bulkResult.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Parsed Rows Preview Table */}
              {parsedRows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 text-xs">
                      Parsed Spreadsheet Preview ({parsedRows.length} Rows)
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {parsedRows.filter((r) => r.isValid).length} ready to import •{" "}
                      {parsedRows.filter((r) => !r.isValid).length} invalid
                    </span>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0">
                        <tr className="border-b border-slate-200">
                          <th className="py-2 px-3">#</th>
                          <th className="py-2 px-3">Name</th>
                          <th className="py-2 px-3">department</th>
                          <th className="py-2 px-3">Staff code</th>
                          <th className="py-2 px-3">year</th>
                          <th className="py-2 px-3">mail</th>
                          <th className="py-2 px-3">password</th>
                          <th className="py-2 px-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsedRows.map((r) => (
                          <tr key={r.rowNumber} className={r.isValid ? "hover:bg-slate-50" : "bg-rose-50/50"}>
                            <td className="py-1.5 px-3 font-mono text-slate-400">{r.rowNumber}</td>
                            <td className="py-1.5 px-3 font-semibold text-slate-900">{r.fullName || "—"}</td>
                            <td className="py-1.5 px-3 text-slate-700">{r.department || "—"}</td>
                            <td className="py-1.5 px-3 font-mono font-bold text-slate-800">{r.staffCode || "—"}</td>
                            <td className="py-1.5 px-3 text-slate-700">{r.year || "—"}</td>
                            <td className="py-1.5 px-3 font-mono text-slate-700">{r.email || "—"}</td>
                            <td className="py-1.5 px-3 font-mono text-slate-600">
                              {r.password ? "••••••••" : <span className="text-slate-400 italic">Default</span>}
                            </td>
                            <td className="py-1.5 px-3 whitespace-nowrap">
                              {r.isValid ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full text-[10px] border border-emerald-200">
                                  ✓ Valid
                                  {r.note && <span className="text-[9px] text-emerald-600 font-normal">({r.note})</span>}
                                </span>
                              ) : (
                                <span className="inline-flex items-center text-rose-700 font-semibold bg-rose-50 px-2 py-0.5 rounded-full text-[10px] border border-rose-200">
                                  ✕ {r.validationError}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100 shrink-0">
              <span className="text-[11px] text-slate-400">
                Professors are registered with instant portal access and matched to their department.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 transition cursor-pointer text-xs font-semibold"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleImportBulk}
                  disabled={bulkSubmitting || (!bulkFile && parsedRows.length === 0)}
                  className="px-5 py-2 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 text-xs"
                >
                  {bulkSubmitting ? (
                    <>
                      <span className="animate-spin">🔄</span> Importing…
                    </>
                  ) : (
                    `Import ${parsedRows.filter((r) => r.isValid).length || ""} Professors`
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
