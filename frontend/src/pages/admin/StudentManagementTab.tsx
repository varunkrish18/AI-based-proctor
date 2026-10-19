import React, { useState, useEffect, useMemo, useRef, Fragment } from "react";
import * as XLSX from "xlsx";
import { api, downloadFile, downloadFilePost } from "../../api/client";
import type { StudentUser, CreateStudentPayload, UpdateStudentPayload, BulkStudentUploadResult } from "../../types";

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
];

export default function StudentManagementTab() {
  const [students, setStudents] = useState<StudentUser[]>([]);
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

  // Create Student Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateStudentPayload>({
    fullName: "",
    department: "Computer Science & Engineering",
    registerNumber: "",
    year: "3rd Year",
    email: "",
    password: "",
  });
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showCreatePassword, setShowCreatePassword] = useState(false);

  // Edit Student Modal state
  const [editingStudent, setEditingStudent] = useState<StudentUser | null>(null);
  const [editForm, setEditForm] = useState<UpdateStudentPayload>({
    fullName: "",
    department: "",
    registerNumber: "",
    year: "",
    email: "",
    password: "",
  });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [showEditPassword, setShowEditPassword] = useState(false);

  // Delete Student Modal state
  const [studentToDelete, setStudentToDelete] = useState<StudentUser | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Bulk Upload Modal state
  interface ParsedStudentRow {
    rowNumber: number;
    fullName: string;
    department: string;
    registerNumber: string;
    year: string;
    email: string;
    password?: string;
    isValid: boolean;
    validationError?: string;
    note?: string;
  }

  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedStudentRow[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkStudentUploadResult | null>(null);
  const [downloadingSample, setDownloadingSample] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Section Grouping & PDF state
  interface SectionConfig {
    id: string;
    name: string;
    startReg: string;
    endReg: string;
    department?: string;
    year?: string;
  }

  interface ClassSectionItem {
    id: string;
    className: string;
    department?: string;
    year?: string;
    startReg: string;
    endReg: string;
  }

  const [activeSubTab, setActiveSubTab] = useState<"credentials" | "sections">("credentials");
  const [classSections, setClassSections] = useState<ClassSectionItem[]>([]);
  const [sectionSearchQuery, setSectionSearchQuery] = useState("");
  const [sectionYearFilter, setSectionYearFilter] = useState("ALL");
  const [sectionDeptFilter, setSectionDeptFilter] = useState("ALL");

  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editSectionForm, setEditSectionForm] = useState<{
    className: string;
    startReg: string;
    endReg: string;
    department?: string;
    year?: string;
  }>({
    className: "",
    startReg: "",
    endReg: "",
  });

  const [showAddSectionModal, setShowAddSectionModal] = useState(false);
  const [addSectionForm, setAddSectionForm] = useState<{
    className: string;
    department: string;
    year: string;
    startReg: string;
    endReg: string;
  }>({
    className: "",
    department: "Computer Science & Engineering",
    year: "1st Year",
    startReg: "",
    endReg: "",
  });

  const [previewingSectionId, setPreviewingSectionId] = useState<string | null>(null);

  const [showGroupingModal, setShowGroupingModal] = useState(false);
  const [groupDept, setGroupDept] = useState<string>("");
  const [numSections, setNumSections] = useState<number>(2);
  const [sections, setSections] = useState<SectionConfig[]>([]);
  const [includePasswordsInPdf, setIncludePasswordsInPdf] = useState<boolean>(true);
  const [downloadingSectionId, setDownloadingSectionId] = useState<string | null>(null);
  const [downloadingZip, setDownloadingZip] = useState<boolean>(false);
  const [groupingError, setGroupingError] = useState<string | null>(null);
  const [previewSectionId, setPreviewSectionId] = useState<string | null>(null);

  async function fetchStudents() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<StudentUser[]>("/api/admin/students", "admin");
      setStudents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load student credentials.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStudents();
  }, []);

  function togglePasswordVisibility(studentId: number) {
    setVisiblePasswords((prev) => ({
      ...prev,
      [studentId]: !prev[studentId],
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

  function copyAllCredentials() {
    if (filteredStudents.length === 0) return;
    const header = "Name\tDepartment\tRegister Number\tYear\tEmail\tPassword";
    const rows = filteredStudents.map((s) =>
      `${s.fullName}\t${s.department || "—"}\t${s.registerNumber || "—"}\t${s.year || "—"}\t${s.email}\t${s.displayPassword || "—"}`
    );
    const content = [header, ...rows].join("\n");
    navigator.clipboard.writeText(content);
    setSuccessMsg(`Copied credentials for ${filteredStudents.length} students to clipboard!`);
    setTimeout(() => setSuccessMsg(null), 4000);
  }

  function exportCredentialsCsv() {
    if (filteredStudents.length === 0) return;
    const header = "Name,Department,Register Number,Year,Email,Password";
    const escape = (val: string) => `"${(val || "").replace(/"/g, '""')}"`;
    const rows = filteredStudents.map((s) =>
      [
        escape(s.fullName),
        escape(s.department || ""),
        escape(s.registerNumber || ""),
        escape(s.year || ""),
        escape(s.email),
        escape(s.displayPassword || ""),
      ].join(",")
    );
    const csvContent = "data:text/csv;charset=utf-8," + [header, ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `student_credentials_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function handleCreateStudent(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreateSubmitting(true);
    try {
      const newStudent = await api.post<StudentUser>("/api/admin/students", createForm, "admin");
      setStudents((prev) => [newStudent, ...prev]);
      setShowCreateModal(false);
      setSuccessMsg(`Student '${newStudent.fullName}' (${newStudent.registerNumber}) registered successfully!`);
      setCreateForm({
        fullName: "",
        department: "Computer Science & Engineering",
        registerNumber: "",
        year: "3rd Year",
        email: "",
        password: "",
      });
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to add student.");
    } finally {
      setCreateSubmitting(false);
    }
  }

  function openEditModal(student: StudentUser) {
    setEditingStudent(student);
    setEditForm({
      fullName: student.fullName,
      department: student.department || "",
      registerNumber: student.registerNumber || "",
      year: student.year || "",
      email: student.email,
      password: student.displayPassword || "",
    });
    setEditError(null);
    setShowEditPassword(false);
  }

  async function handleUpdateStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!editingStudent) return;
    setEditError(null);
    setEditSubmitting(true);
    try {
      const updated = await api.put<StudentUser>(
        `/api/admin/students/${editingStudent.id}`,
        editForm,
        "admin"
      );
      setStudents((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setEditingStudent(null);
      setSuccessMsg(`Student credentials for '${updated.fullName}' updated successfully!`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update student credentials.");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDeleteStudent() {
    if (!studentToDelete) return;
    setDeleteError(null);
    setDeleteSubmitting(true);
    try {
      await api.delete(`/api/admin/students/${studentToDelete.id}`, "admin");
      setStudents((prev) => prev.filter((s) => s.id !== studentToDelete.id));
      const deletedName = studentToDelete.fullName;
      setStudentToDelete(null);
      setSuccessMsg(`Student '${deletedName}' removed successfully.`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete student.");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  async function downloadSampleTemplate(format: "csv" | "excel") {
    setDownloadingSample(format);
    const filename =
      format === "excel" ? "sample_student_credentials.xlsx" : "sample_student_credentials.csv";
    try {
      await downloadFile(`/api/admin/students/sample-template?format=${format}`, filename, "admin");
    } catch {
      // Client-side fallback using SheetJS
      const sampleData = [
        {
          Name: "Aarav Sharma",
          department: "Computer Science & Engineering",
          "Register number": "21CS101",
          year: "3rd Year",
          mail: "aarav.sharma@example.com",
          password: "student123",
        },
        {
          Name: "Bhavya Patel",
          department: "Information Technology",
          "Register number": "21IT102",
          year: "3rd Year",
          mail: "bhavya.patel@example.com",
          password: "student123",
        },
        {
          Name: "Chirag Reddy",
          department: "Electronics & Communication Engineering",
          "Register number": "22EC103",
          year: "2nd Year",
          mail: "chirag.reddy@example.com",
          password: "student123",
        },
        {
          Name: "Divya Krishnan",
          department: "Artificial Intelligence & Data Science",
          "Register number": "23AD104",
          year: "1st Year",
          mail: "divya.krishnan@example.com",
          password: "student123",
        },
        {
          Name: "Kavya Iyer",
          department: "Electrical & Electronics Engineering",
          "Register number": "20EE105",
          year: "4th Year",
          mail: "kavya.iyer@example.com",
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
        XLSX.utils.book_append_sheet(wb, ws, "Students");
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
          if (norm === "name" || norm === "fullname" || norm === "studentname") {
            colMap["name"] = idx;
          } else if (norm === "department" || norm === "dept" || norm === "branch") {
            colMap["department"] = idx;
          } else if (
            norm === "registernumber" ||
            norm === "regnumber" ||
            norm === "regno" ||
            norm === "registrationnumber"
          ) {
            colMap["registerNumber"] = idx;
          } else if (norm === "year" || norm === "academicyear" || norm === "batch") {
            colMap["year"] = idx;
          } else if (norm === "mail" || norm === "email" || norm === "emailaddress") {
            colMap["email"] = idx;
          } else if (norm === "password" || norm === "pwd" || norm === "pass") {
            colMap["password"] = idx;
          }
        });

        const rows: ParsedStudentRow[] = [];
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
          const registerNumber = getVal("registerNumber");
          const year = getVal("year");
          let email = getVal("email");
          const password = getVal("password");

          if (!name && !department && !registerNumber && !year && !email && !password) continue;

          // Skip ghost rows from Excel where both Name and Register Number are empty
          if (!name && !registerNumber) continue;

          let isValid = true;
          let validationError = "";
          let note = "";

          if (!registerNumber) {
            isValid = false;
            validationError = "Register number is required";
          }

          if (!email) {
            const domain = "example.com";
            const cleanReg = (registerNumber || `student${r}`).toLowerCase().replace(/[^a-z0-9]/g, "");
            const cleanName = (name || "").toLowerCase().replace(/[^a-z0-9]/g, ".");
            email = cleanName && cleanName !== "student" ? `${cleanName}.${cleanReg}@${domain}` : `${cleanReg}@${domain}`;
            note = "Auto-assigned unique email";
          } else if (!email.includes("@")) {
            isValid = false;
            validationError = "Invalid email format";
          } else if (seenEmailsInFile.has(email.toLowerCase())) {
            // Duplicate email dragged down in Excel! Auto-disambiguate so every row becomes a distinct student
            const domain = email.includes("@") ? email.split("@")[1] : "example.com";
            const cleanReg = (registerNumber || `st${r}`).toLowerCase().replace(/[^a-z0-9]/g, "");
            const cleanName = (name || "").toLowerCase().replace(/[^a-z0-9]/g, ".");
            let candidate = cleanName && cleanName !== "student" ? `${cleanName}.${cleanReg}@${domain}` : `${cleanReg}@${domain}`;
            let count = 1;
            while (seenEmailsInFile.has(candidate.toLowerCase())) {
              candidate = `${cleanReg}.${count}@${domain}`;
              count++;
            }
            email = candidate;
            note = "Auto-assigned unique email (duplicate in file)";
          }

          seenEmailsInFile.add(email.toLowerCase());

          rows.push({
            rowNumber: r,
            fullName: name || (registerNumber ? `Student ${registerNumber}` : (email ? email.split("@")[0] : `Student ${r}`)),
            department,
            registerNumber,
            year,
            email,
            password,
            isValid,
            validationError,
            note,
          });
        }

        if (rows.length === 0) {
          setBulkError("No student data rows found below the header row.");
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
      let result: BulkStudentUploadResult;
      const validRows = parsedRows.filter((r) => r.isValid);

      // If we parsed the rows in the browser and disambiguated duplicate emails, post them directly so
      // the exact disambiguated preview list is saved in DB!
      if (validRows.length > 0) {
        const requests: CreateStudentPayload[] = validRows.map((r) => ({
          fullName: r.fullName,
          department: r.department,
          registerNumber: r.registerNumber,
          year: r.year,
          email: r.email,
          password: r.password,
        }));
        result = await api.post<BulkStudentUploadResult>(
          "/api/admin/students/bulk",
          requests,
          "admin"
        );
      } else if (bulkFile) {
        const formData = new FormData();
        formData.append("file", bulkFile);
        result = await api.uploadMultipart<BulkStudentUploadResult>(
          "/api/admin/students/upload",
          formData,
          "admin"
        );
      } else {
        throw new Error("No valid student records found to import.");
      }

      setBulkResult(result);
      await fetchStudents();
      setSuccessMsg(`Bulk import complete: ${result.createdCount} created, ${result.updatedCount} updated.`);
      setTimeout(() => setSuccessMsg(null), 6000);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Bulk upload failed.");
    } finally {
      setBulkSubmitting(false);
    }
  }

  function calculateEvenSections(count: number, deptStuds: StudentUser[]) {
    const n = Math.max(1, Math.min(26, count));
    const newSecs: SectionConfig[] = [];

    if (deptStuds.length === 0) {
      for (let i = 0; i < n; i++) {
        const char = String.fromCharCode(65 + i);
        newSecs.push({
          id: `sec-${i}`,
          name: `Section ${char}`,
          startReg: "",
          endReg: "",
        });
      }
      return newSecs;
    }

    const chunkSize = Math.ceil(deptStuds.length / n);
    for (let i = 0; i < n; i++) {
      const char = String.fromCharCode(65 + i);
      const startIdx = i * chunkSize;
      const endIdx = Math.min((i + 1) * chunkSize - 1, deptStuds.length - 1);

      let startReg = "";
      let endReg = "";
      if (startIdx < deptStuds.length) {
        startReg = deptStuds[startIdx].registerNumber || "";
        endReg = deptStuds[endIdx].registerNumber || "";
      }

      newSecs.push({
        id: `sec-${i}`,
        name: `Section ${char}`,
        startReg,
        endReg,
      });
    }
    return newSecs;
  }

  function getStudentsForSection(sec: SectionConfig, pool: StudentUser[]) {
    const start = (sec.startReg || "").trim();
    const end = (sec.endReg || "").trim();

    if (!start && !end) return [];

    const parseParts = (str: string) => {
      const i = str.search(/\d+$/);
      if (i === -1) return null;
      return {
        prefix: str.substring(0, i).toLowerCase(),
        num: parseInt(str.substring(i), 10),
      };
    };

    const sParts = parseParts(start);
    const eParts = parseParts(end);

    return pool.filter((s) => {
      const reg = (s.registerNumber || "").trim();
      if (!reg) return false;

      const rParts = parseParts(reg);
      if (rParts && (sParts || eParts)) {
        let prefixOk = true;
        if (sParts && sParts.prefix !== rParts.prefix) prefixOk = false;
        if (eParts && eParts.prefix !== rParts.prefix) prefixOk = false;

        if (prefixOk) {
          const min = sParts ? sParts.num : -Infinity;
          const max = eParts ? eParts.num : Infinity;
          return rParts.num >= min && rParts.num <= max;
        }
      }

      if (start && reg.localeCompare(start, undefined, { sensitivity: "base" }) < 0) return false;
      if (end && reg.localeCompare(end, undefined, { sensitivity: "base" }) > 0) return false;
      return true;
    });
  }

  const departmentStudents = useMemo(() => {
    if (!groupDept || groupDept === "ALL") {
      return [...students].sort((a, b) =>
        (a.registerNumber || "").localeCompare(b.registerNumber || "", undefined, { numeric: true, sensitivity: "base" })
      );
    }
    return students
      .filter((s) => s.department === groupDept)
      .sort((a, b) =>
        (a.registerNumber || "").localeCompare(b.registerNumber || "", undefined, { numeric: true, sensitivity: "base" })
      );
  }, [students, groupDept]);

  function handleDeptChange(dept: string) {
    setGroupDept(dept);
    const studs = (dept && dept !== "ALL")
      ? students.filter((s) => s.department === dept)
      : students;
    const sorted = [...studs].sort((a, b) =>
      (a.registerNumber || "").localeCompare(b.registerNumber || "", undefined, { numeric: true, sensitivity: "base" })
    );
    setSections(calculateEvenSections(numSections, sorted));
  }

  function handleNumSectionsChange(n: number) {
    const validN = Math.max(1, Math.min(26, n));
    setNumSections(validN);
    setSections(calculateEvenSections(validN, departmentStudents));
  }

  function updateSectionField(id: string, field: "name" | "startReg" | "endReg", val: string) {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: val } : s))
    );
  }

  async function downloadSingleSectionPdf(sec: SectionConfig) {
    const matched = getStudentsForSection(sec, departmentStudents);
    setDownloadingSectionId(sec.id);
    setGroupingError(null);
    try {
      const safeSec = (sec.name || "Section").replace(/[^a-zA-Z0-9_-]/g, "_");
      const safeDept = (groupDept || "All").replace(/[^a-zA-Z0-9_-]/g, "_");
      const filename = `${safeSec}_${safeDept}_Students.pdf`;

      await downloadFilePost(
        "/api/admin/students/sections/pdf",
        {
          department: groupDept,
          sectionName: sec.name,
          startRegisterNumber: sec.startReg,
          endRegisterNumber: sec.endReg,
          includePasswords: includePasswordsInPdf,
          studentIds: matched.map((s) => s.id),
        },
        filename,
        "admin"
      );

      setSuccessMsg(`Downloaded PDF for ${sec.name} (${matched.length} students)!`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      setGroupingError(err instanceof Error ? err.message : "Failed to download section PDF.");
    } finally {
      setDownloadingSectionId(null);
    }
  }

  async function downloadAllSectionsZip() {
    setDownloadingZip(true);
    setGroupingError(null);
    try {
      const requests = sections.map((sec) => {
        const matched = getStudentsForSection(sec, departmentStudents);
        return {
          department: groupDept,
          sectionName: sec.name,
          startRegisterNumber: sec.startReg,
          endRegisterNumber: sec.endReg,
          includePasswords: includePasswordsInPdf,
          studentIds: matched.map((s) => s.id),
        };
      });

      const safeDept = (groupDept || "All").replace(/[^a-zA-Z0-9_-]/g, "_");
      const filename = `Student_Sections_${safeDept}.zip`;

      await downloadFilePost(
        "/api/admin/students/sections/zip",
        requests,
        filename,
        "admin"
      );

      setSuccessMsg(`Downloaded all ${sections.length} section PDFs in ZIP!`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      setGroupingError(err instanceof Error ? err.message : "Failed to download ZIP of section PDFs.");
    } finally {
      setDownloadingZip(false);
    }
  }

  // Convert year string to Roman numeral (1st Year -> I, 2nd Year -> II, etc.)
  function getYearRoman(yearStr?: string | null): string {
    if (!yearStr) return "I";
    const y = yearStr.trim().toUpperCase();
    if (y.includes("4") || y.includes("IV") || y.includes("FOURTH")) return "IV";
    if (y.includes("3") || y.includes("III") || y.includes("THIRD")) return "III";
    if (y.includes("2") || y.includes("II") || y.includes("SECOND")) return "II";
    if (y.includes("1") || y.includes("I") || y.includes("FIRST")) return "I";
    return y;
  }

  // Convert department name to standard short code (Computer Science -> CSE, Information Tech -> IT, etc.)
  function getDeptShortCode(dept?: string | null): string {
    if (!dept) return "CSE";
    const d = dept.trim().toUpperCase();
    if (d.includes("COMPUTER") || d.includes("CSE")) return "CSE";
    if (d.includes("INFORMATION") || d.includes("IT")) return "IT";
    if (d.includes("ELECTRONICS & COMM") || d.includes("ECE")) return "ECE";
    if (d.includes("ELECTRICAL") || d.includes("EEE")) return "EEE";
    if (d.includes("MECHANICAL") || d.includes("MECH")) return "MECH";
    if (d.includes("CIVIL")) return "CIVIL";
    if (d.includes("ARTIFICIAL") || d.includes("DATA") || d.includes("AI") || d.includes("AIDS")) return "AIDS";
    const words = dept.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      return words.map((w) => w[0].toUpperCase()).join("");
    }
    return dept.substring(0, 4).toUpperCase();
  }

  function matchesYear(studentYear?: string | null, targetYear?: string | null): boolean {
    if (!targetYear || targetYear === "ALL") return true;
    const r1 = getYearRoman(studentYear);
    const r2 = getYearRoman(targetYear);
    return r1 === r2;
  }

  // Get matching students for a ClassSectionItem
  function getStudentsForClassSection(sec: ClassSectionItem, pool: StudentUser[]) {
    const start = (sec.startReg || "").trim();
    const end = (sec.endReg || "").trim();

    const parseParts = (str: string) => {
      const i = str.search(/\d+$/);
      if (i === -1) return null;
      return {
        prefix: str.substring(0, i).toLowerCase(),
        num: parseInt(str.substring(i), 10),
      };
    };

    const sParts = parseParts(start);
    const eParts = parseParts(end);

    return pool.filter((s) => {
      // 1. Department match if specified
      if (sec.department && sec.department !== "ALL") {
        const itemDeptShort = getDeptShortCode(sec.department);
        const sDeptShort = getDeptShortCode(s.department);
        if (itemDeptShort !== sDeptShort && s.department !== sec.department) {
          return false;
        }
      }

      // 2. Year match if specified
      if (sec.year && sec.year !== "ALL") {
        if (!matchesYear(s.year, sec.year)) {
          return false;
        }
      }

      // 3. Register number range match
      const reg = (s.registerNumber || "").trim();
      if (!start && !end) return true;
      if (!reg) return false;

      const rParts = parseParts(reg);
      if (rParts && (sParts || eParts)) {
        let prefixOk = true;
        if (sParts && sParts.prefix !== rParts.prefix) prefixOk = false;
        if (eParts && eParts.prefix !== rParts.prefix) prefixOk = false;

        if (prefixOk) {
          const min = sParts ? sParts.num : -Infinity;
          const max = eParts ? eParts.num : Infinity;
          return rParts.num >= min && rParts.num <= max;
        }
      }

      if (start && reg.localeCompare(start, undefined, { sensitivity: "base" }) < 0) return false;
      if (end && reg.localeCompare(end, undefined, { sensitivity: "base" }) > 0) return false;
      return true;
    });
  }

  // Generate initial or default sections matching user sketch
  function generateDefaultSections(studs: StudentUser[]): ClassSectionItem[] {
    const defaultList: ClassSectionItem[] = [
      {
        id: "cls-1",
        className: "I CSE A",
        department: "Computer Science & Engineering",
        year: "1st Year",
        startReg: "24CS001",
        endReg: "24CS060",
      },
      {
        id: "cls-2",
        className: "I CSE B",
        department: "Computer Science & Engineering",
        year: "1st Year",
        startReg: "24CS061",
        endReg: "24CS120",
      },
      {
        id: "cls-3",
        className: "II CSE A",
        department: "Computer Science & Engineering",
        year: "2nd Year",
        startReg: "23CS001",
        endReg: "23CS060",
      },
      {
        id: "cls-4",
        className: "II CSE B",
        department: "Computer Science & Engineering",
        year: "2nd Year",
        startReg: "23CS061",
        endReg: "23CS120",
      },
      {
        id: "cls-5",
        className: "III CSE A",
        department: "Computer Science & Engineering",
        year: "3rd Year",
        startReg: "22CS001",
        endReg: "22CS060",
      },
      {
        id: "cls-6",
        className: "IV CSE A",
        department: "Computer Science & Engineering",
        year: "4th Year",
        startReg: "21CS001",
        endReg: "21CS060",
      },
      {
        id: "cls-7",
        className: "I IT A",
        department: "Information Technology",
        year: "1st Year",
        startReg: "24IT001",
        endReg: "24IT060",
      },
      {
        id: "cls-8",
        className: "II IT A",
        department: "Information Technology",
        year: "2nd Year",
        startReg: "23IT001",
        endReg: "23IT060",
      },
    ];

    if (!studs || studs.length === 0) {
      return defaultList;
    }

    // Auto-align with actual students registered in DB
    const byDeptYear: Record<string, StudentUser[]> = {};
    studs.forEach((s) => {
      const d = s.department || "Computer Science & Engineering";
      const y = s.year || "1st Year";
      const key = `${getDeptShortCode(d)}_${getYearRoman(y)}`;
      if (!byDeptYear[key]) byDeptYear[key] = [];
      byDeptYear[key].push(s);
    });

    const generated: ClassSectionItem[] = [];
    let idx = 1;

    Object.values(byDeptYear).forEach((group) => {
      const sorted = [...group].sort((a, b) =>
        (a.registerNumber || "").localeCompare(b.registerNumber || "", undefined, {
          numeric: true,
          sensitivity: "base",
        })
      );
      const sample = sorted[0];
      const deptName = sample.department || "Computer Science & Engineering";
      const yearName = sample.year || "1st Year";
      const deptCode = getDeptShortCode(deptName);
      const roman = getYearRoman(yearName);

      const chunkSize = 60;
      const count = Math.max(1, Math.ceil(sorted.length / chunkSize));
      for (let c = 0; c < count; c++) {
        const secLetter = String.fromCharCode(65 + c);
        const sIdx = c * chunkSize;
        const eIdx = Math.min((c + 1) * chunkSize - 1, sorted.length - 1);
        const startReg = sorted[sIdx]?.registerNumber || "";
        const endReg = sorted[eIdx]?.registerNumber || "";

        generated.push({
          id: `cls-auto-${idx++}`,
          className: `${roman} ${deptCode} ${secLetter}`,
          department: deptName,
          year: yearName,
          startReg,
          endReg,
        });
      }
    });

    return generated.length > 0 ? generated : defaultList;
  }

  // Load class sections from localStorage or students
  useEffect(() => {
    try {
      const saved = localStorage.getItem("proctor_class_sections_registry_v2");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setClassSections(parsed);
          return;
        }
      }
    } catch (e) {
      console.warn("Failed to load saved class sections", e);
    }

    setClassSections(generateDefaultSections(students));
  }, [students.length]);

  function saveClassSections(updated: ClassSectionItem[]) {
    setClassSections(updated);
    try {
      localStorage.setItem("proctor_class_sections_registry_v2", JSON.stringify(updated));
    } catch (e) {
      console.warn("Failed to persist class sections", e);
    }
  }

  function startEditSection(item: ClassSectionItem) {
    setEditingSectionId(item.id);
    setEditSectionForm({
      className: item.className,
      startReg: item.startReg,
      endReg: item.endReg,
      department: item.department,
      year: item.year,
    });
  }

  function saveEditSection() {
    if (!editingSectionId) return;
    const updated = classSections.map((c) =>
      c.id === editingSectionId
        ? {
            ...c,
            className: editSectionForm.className.trim() || c.className,
            startReg: editSectionForm.startReg.trim(),
            endReg: editSectionForm.endReg.trim(),
          }
        : c
    );
    saveClassSections(updated);
    setEditingSectionId(null);
    setSuccessMsg(`Class section '${editSectionForm.className}' updated successfully!`);
    setTimeout(() => setSuccessMsg(null), 4000);
  }

  function cancelEditSection() {
    setEditingSectionId(null);
  }

  function deleteSection(id: string, name: string) {
    if (!window.confirm(`Are you sure you want to delete class section '${name}'?`)) return;
    const updated = classSections.filter((c) => c.id !== id);
    saveClassSections(updated);
    setSuccessMsg(`Class section '${name}' removed.`);
    setTimeout(() => setSuccessMsg(null), 4000);
  }

  function handleAddSection(e: React.FormEvent) {
    e.preventDefault();
    if (!addSectionForm.className.trim()) return;

    const newItem: ClassSectionItem = {
      id: `cls-${Date.now()}`,
      className: addSectionForm.className.trim(),
      department: addSectionForm.department,
      year: addSectionForm.year,
      startReg: addSectionForm.startReg.trim(),
      endReg: addSectionForm.endReg.trim(),
    };

    const updated = [newItem, ...classSections];
    saveClassSections(updated);
    setShowAddSectionModal(false);
    setAddSectionForm({
      className: "",
      department: "Computer Science & Engineering",
      year: "1st Year",
      startReg: "",
      endReg: "",
    });
    setSuccessMsg(`Class section '${newItem.className}' added successfully!`);
    setTimeout(() => setSuccessMsg(null), 4000);
  }

  function handleAutoGenerateFromStudents() {
    const generated = generateDefaultSections(students);
    saveClassSections(generated);
    setSuccessMsg(`Auto-generated ${generated.length} class sections from current student database!`);
    setTimeout(() => setSuccessMsg(null), 5000);
  }

  async function downloadClassSectionPdf(sec: ClassSectionItem) {
    const matched = getStudentsForClassSection(sec, students);
    setDownloadingSectionId(sec.id);
    try {
      const safeSec = (sec.className || "Section").replace(/[^a-zA-Z0-9_-]/g, "_");
      const filename = `${safeSec}_Students.pdf`;

      await downloadFilePost(
        "/api/admin/students/sections/pdf",
        {
          department: sec.department || "All Departments",
          sectionName: sec.className,
          startRegisterNumber: sec.startReg,
          endRegisterNumber: sec.endReg,
          includePasswords: true,
          studentIds: matched.map((s) => s.id),
        },
        filename,
        "admin"
      );

      setSuccessMsg(`Downloaded PDF for ${sec.className} (${matched.length} students)!`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to download section PDF.");
    } finally {
      setDownloadingSectionId(null);
    }
  }

  async function downloadFilteredSectionsZip() {
    if (filteredClassSections.length === 0) return;
    setDownloadingZip(true);
    try {
      const requests = filteredClassSections.map((sec) => {
        const matched = getStudentsForClassSection(sec, students);
        return {
          department: sec.department || "All",
          sectionName: sec.className,
          startRegisterNumber: sec.startReg,
          endRegisterNumber: sec.endReg,
          includePasswords: true,
          studentIds: matched.map((s) => s.id),
        };
      });

      const filename = `Class_Sections_${sectionYearFilter !== "ALL" ? sectionYearFilter : "All"}.zip`;
      await downloadFilePost("/api/admin/students/sections/zip", requests, filename, "admin");

      setSuccessMsg(`Downloaded all ${filteredClassSections.length} section PDFs in ZIP!`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to download ZIP of sections.");
    } finally {
      setDownloadingZip(false);
    }
  }

  // Filter class sections by Search Option (section, departement) and Filter Year
  const filteredClassSections = useMemo(() => {
    return classSections.filter((item) => {
      // 1. Filter Year
      if (sectionYearFilter !== "ALL") {
        const itemRoman = getYearRoman(item.year || item.className);
        const filterRoman = getYearRoman(sectionYearFilter);
        if (itemRoman !== filterRoman) {
          return false;
        }
      }

      // 2. Department Filter dropdown (if set)
      if (sectionDeptFilter !== "ALL") {
        const itemDeptCode = getDeptShortCode(item.department || item.className);
        const filterDeptCode = getDeptShortCode(sectionDeptFilter);
        const deptFull = (item.department || "").toLowerCase();
        if (itemDeptCode !== filterDeptCode && !deptFull.includes(sectionDeptFilter.toLowerCase())) {
          return false;
        }
      }

      // 3. Search Option: (section, departement)
      if (sectionSearchQuery.trim()) {
        const q = sectionSearchQuery.toLowerCase().trim();
        const className = item.className.toLowerCase();
        const deptName = (item.department || "").toLowerCase();
        const deptCode = getDeptShortCode(item.department || item.className).toLowerCase();
        const startReg = item.startReg.toLowerCase();
        const endReg = item.endReg.toLowerCase();

        // Extract section letter from className (e.g. "I CSE A" -> "a")
        const parts = item.className.trim().split(/\s+/);
        const secLetter = parts.length > 0 ? parts[parts.length - 1].toLowerCase() : "";

        const matchClass = className.includes(q);
        const matchDept = deptName.includes(q) || deptCode.includes(q);
        const matchSec = secLetter === q || `section ${secLetter}` === q || `sec ${secLetter}` === q;
        const matchReg = startReg.includes(q) || endReg.includes(q);

        if (!matchClass && !matchDept && !matchSec && !matchReg) {
          return false;
        }
      }

      return true;
    });
  }, [classSections, sectionYearFilter, sectionDeptFilter, sectionSearchQuery]);

  // Collect distinct departments and years
  const allDepartments = useMemo(() => {
    const set = new Set<string>(PRESET_DEPARTMENTS);
    students.forEach((s) => {
      if (s.department && s.department.trim()) set.add(s.department.trim());
    });
    return Array.from(set).sort();
  }, [students]);

  const allYears = useMemo(() => {
    const set = new Set<string>(PRESET_YEARS);
    students.forEach((s) => {
      if (s.year && s.year.trim()) set.add(s.year.trim());
    });
    return Array.from(set).sort();
  }, [students]);

  // Filter students by query (name or register number), department, and year
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      // 1. Search Query (Name or Register Number)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = (s.fullName || "").toLowerCase().includes(q);
        const regMatch = (s.registerNumber || "").toLowerCase().includes(q);
        const emailMatch = (s.email || "").toLowerCase().includes(q);
        if (!nameMatch && !regMatch && !emailMatch) {
          return false;
        }
      }

      // 2. Department filter
      if (selectedDeptFilter !== "ALL") {
        if (selectedDeptFilter === "NONE") {
          if (s.department) return false;
        } else if (s.department !== selectedDeptFilter) {
          return false;
        }
      }

      // 3. Year filter
      if (selectedYearFilter !== "ALL") {
        if (selectedYearFilter === "NONE") {
          if (s.year) return false;
        } else if (s.year !== selectedYearFilter) {
          return false;
        }
      }

      return true;
    });
  }, [students, searchQuery, selectedDeptFilter, selectedYearFilter]);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner / Actions Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎓</span>
            <h2 className="text-xl font-bold text-slate-900">Student User Credentials</h2>
            <span className="bg-emerald-50 text-emerald-700 font-bold text-xs px-2.5 py-0.5 rounded-full border border-emerald-200">
              {students.length} {students.length === 1 ? "Student" : "Students"}
            </span>
          </div>
          <p className="text-slate-500 text-xs mt-1 max-w-2xl leading-relaxed">
            Manage student records, department assignments, academic years, and examination login credentials. Search by student name or register number.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={fetchStudents}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
            title="Reload student credentials"
          >
            <span className={loading ? "animate-spin" : ""}>🔄</span> Refresh
          </button>
          <button
            onClick={copyAllCredentials}
            disabled={filteredStudents.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
            title="Copy visible credentials table to clipboard"
          >
            <span>📋</span> Copy All
          </button>
          <button
            onClick={exportCredentialsCsv}
            disabled={filteredStudents.length === 0}
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
            title="Bulk import students from Excel or CSV spreadsheet"
          >
            <span>📤</span> Bulk Upload (Excel / CSV)
          </button>
          <button
            onClick={() => {
              setActiveSubTab("sections");
            }}
            className="bg-purple-600 hover:bg-purple-500 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5 cursor-pointer"
            title="Group students by register number into classes and sections"
          >
            <span>📑</span> Group by Section
          </button>
          <button
            onClick={() => {
              setCreateForm({
                fullName: "",
                department: "Computer Science & Engineering",
                registerNumber: "",
                year: "3rd Year",
                email: "",
                password: generateRandomPassword(),
              });
              setCreateError(null);
              setShowCreatePassword(true);
              setShowCreateModal(true);
            }}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            <span>+</span> Add Student
          </button>
        </div>
      </div>

      {/* Sub-tab Navigation: Student Credentials vs Group by Section */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3 gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSubTab("credentials")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer ${
              activeSubTab === "credentials"
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            <span>🎓</span>
            <span>Student Login Credentials</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeSubTab === "credentials" ? "bg-slate-800 text-emerald-400" : "bg-slate-100 text-slate-600"
              }`}
            >
              {students.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("sections")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer ${
              activeSubTab === "sections"
                ? "bg-purple-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            <span>📑</span>
            <span>Group by Section</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeSubTab === "sections" ? "bg-purple-700 text-purple-100" : "bg-purple-50 text-purple-700"
              }`}
            >
              {classSections.length} Classes
            </span>
          </button>
        </div>
      </div>

      {activeSubTab === "credentials" && (
        <div className="space-y-6 animate-fadeIn">

      {/* Search and Filters Toolbar (search by name, register number & filter by department, year) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Search by Name & Register Number */}
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              🔍
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, register number..."
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-none transition"
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
              className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50"
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

          {/* Year Filter */}
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-500">Year:</span>
            <select
              value={selectedYearFilter}
              onChange={(e) => setSelectedYearFilter(e.target.value)}
              className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50"
            >
              <option value="ALL">All Years</option>
              <option value="NONE">No Year</option>
              {allYears.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="text-slate-400 font-medium whitespace-nowrap">
          Showing <span className="font-bold text-slate-700">{filteredStudents.length}</span> of {students.length} students
        </div>
      </div>

      {/* Success Notification */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 px-4 py-3 rounded-xl text-xs font-semibold flex items-center justify-between animate-fadeIn">
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
        <div className="bg-rose-50 border border-rose-300 text-rose-800 px-4 py-3 rounded-xl text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button onClick={() => fetchStudents()} className="underline text-rose-700 hover:text-rose-900 font-bold">
            Retry
          </button>
        </div>
      )}

      {/* Student user credentials Table matching diagram */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 tracking-tight">
            Student user credentials:
          </h3>
          <span className="text-xs text-slate-400 font-medium">
            Passwords remain securely accessible for faculty and exam coordinators
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">department</th>
                <th className="py-3 px-4">Register number</th>
                <th className="py-3 px-4">year</th>
                <th className="py-3 px-4">mail</th>
                <th className="py-3 px-4">password</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && students.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <span className="inline-block animate-spin text-lg mb-2">🔄</span>
                    <p className="font-medium">Loading student credentials…</p>
                  </td>
                </tr>
              ) : filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <span className="text-3xl block mb-2">🎓</span>
                    <p className="font-semibold text-slate-600">No students found matching current filters.</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {searchQuery || selectedDeptFilter !== "ALL" || selectedYearFilter !== "ALL"
                        ? "Try clearing your search query or filters."
                        : "Click '+ Add Student' above to register your first student."}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredStudents.map((st) => {
                  const isPwdVisible = !!visiblePasswords[st.id];
                  const rawPwd = st.displayPassword || "";

                  return (
                    <tr
                      key={st.id}
                      className="hover:bg-slate-50/70 transition-colors group"
                    >
                      {/* Name */}
                      <td className="py-3 px-4 font-semibold text-slate-800 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-[11px] shrink-0">
                            {(st.fullName || "S").charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block">{st.fullName || "—"}</span>
                          </div>
                        </div>
                      </td>

                      {/* Department */}
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                        {st.department ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            {st.department}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Not Assigned</span>
                        )}
                      </td>

                      {/* Register number */}
                      <td className="py-3 px-4 font-mono font-bold text-slate-800 whitespace-nowrap">
                        {st.registerNumber ? (
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700 border border-slate-200">
                            {st.registerNumber}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Year */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {st.year ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            {st.year}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Mail */}
                      <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>{st.email}</span>
                          <button
                            onClick={() => copyToClipboard(st.email, `email-${st.id}`)}
                            className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition cursor-pointer"
                            title="Copy email"
                          >
                            {copiedField === `email-${st.id}` ? (
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
                                onClick={() => togglePasswordVisibility(st.id)}
                                className="text-slate-500 hover:text-slate-800 transition p-0.5 cursor-pointer text-xs"
                                title={isPwdVisible ? "Hide password" : "Show password"}
                              >
                                {isPwdVisible ? "👁️‍🗨️" : "👁️"}
                              </button>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(rawPwd, `pwd-${st.id}`)}
                                className="text-slate-500 hover:text-slate-800 transition p-0.5 cursor-pointer text-xs"
                                title="Copy password"
                              >
                                {copiedField === `pwd-${st.id}` ? (
                                  <span className="text-emerald-600 font-bold text-[10px]">✓</span>
                                ) : (
                                  <span>📋</span>
                                )}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Not set</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEditModal(st)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition cursor-pointer"
                            title="Edit student credentials"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => setStudentToDelete(st)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                            title="Delete student"
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
      </div>
      )}

      {/* ===================== GROUP BY SECTION VIEW ===================== */}
      {activeSubTab === "sections" && (
        <div className="space-y-4 animate-fadeIn">
          {/* Group by Section Toolbar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
              {/* Search Option: (section, departement) */}
              <div className="relative flex-1 min-w-[240px] max-w-md">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  🔍
                </span>
                <input
                  type="text"
                  value={sectionSearchQuery}
                  onChange={(e) => setSectionSearchQuery(e.target.value)}
                  placeholder="Search section (e.g. A, B, I CSE A) or department (e.g. CSE, IT)..."
                  className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 focus:outline-none transition"
                />
                {sectionSearchQuery && (
                  <button
                    onClick={() => setSectionSearchQuery("")}
                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Filter Year */}
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-600">Filter Year:</span>
                <select
                  value={sectionYearFilter}
                  onChange={(e) => setSectionYearFilter(e.target.value)}
                  className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-semibold focus:ring-2 focus:ring-purple-500 focus:outline-none bg-slate-50 cursor-pointer"
                >
                  <option value="ALL">All Years</option>
                  <option value="I">1st Year (I)</option>
                  <option value="II">2nd Year (II)</option>
                  <option value="III">3rd Year (III)</option>
                  <option value="IV">4th Year (IV)</option>
                </select>
              </div>

              {/* Filter Department */}
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-600">Department:</span>
                <select
                  value={sectionDeptFilter}
                  onChange={(e) => setSectionDeptFilter(e.target.value)}
                  className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-semibold focus:ring-2 focus:ring-purple-500 focus:outline-none bg-slate-50 cursor-pointer"
                >
                  <option value="ALL">All Departments</option>
                  {allDepartments.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setAddSectionForm({
                    className: "",
                    department: allDepartments[0] || "Computer Science & Engineering",
                    year: "1st Year",
                    startReg: "",
                    endReg: "",
                  });
                  setShowAddSectionModal(true);
                }}
                className="bg-purple-600 hover:bg-purple-500 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                title="Add a new class and section"
              >
                <span>+</span> Add Class / Section
              </button>

              <button
                type="button"
                onClick={handleAutoGenerateFromStudents}
                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                title="Automatically calculate sections based on registered students"
              >
                <span>⚡</span> Auto-Generate
              </button>

              <button
                type="button"
                onClick={downloadFilteredSectionsZip}
                disabled={downloadingZip || filteredClassSections.length === 0}
                className="bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Download all filtered sections as PDFs in a ZIP archive"
              >
                {downloadingZip ? (
                  <>
                    <span className="animate-spin">🔄</span>
                    <span>Creating ZIP…</span>
                  </>
                ) : (
                  <>
                    <span>📦</span>
                    <span>Download All (ZIP)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Group by Section Table matching User Sketch */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800 tracking-tight flex items-center gap-2">
                  <span>Class & Section Register Ranges</span>
                  <span className="bg-purple-100 text-purple-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                    Table View
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Organized by Class name, Starting number, and Ending number. Edit ranges inline or download individual section PDFs.
                </p>
              </div>
              <span className="text-xs text-slate-500 font-medium bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
                Showing <strong className="text-purple-700 font-bold">{filteredClassSections.length}</strong> of {classSections.length} Classes
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3.5 px-6 text-left w-1/4">Class</th>
                    <th className="py-3.5 px-6 text-left w-1/4">Starting number</th>
                    <th className="py-3.5 px-6 text-left w-1/4">Ending number</th>
                    <th className="py-3.5 px-6 text-center w-1/4">Edit/delete</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredClassSections.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-slate-400">
                        <span className="text-3xl block mb-2">📑</span>
                        <p className="font-semibold text-slate-600">No classes found matching criteria.</p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Try searching a different section or department, or switch the Year filter to "All Years".
                        </p>
                        <div className="mt-3 flex justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSectionSearchQuery("");
                              setSectionYearFilter("ALL");
                              setSectionDeptFilter("ALL");
                            }}
                            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                          >
                            Reset Filters
                          </button>
                          <button
                            type="button"
                            onClick={handleAutoGenerateFromStudents}
                            className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs cursor-pointer"
                          >
                            Auto-Generate from Students
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredClassSections.map((item) => {
                      const matched = getStudentsForClassSection(item, students);
                      const isEditing = editingSectionId === item.id;
                      const isPreviewOpen = previewingSectionId === item.id;
                      const isDownloading = downloadingSectionId === item.id;

                      return (
                        <Fragment key={item.id}>
                          <tr className={`transition-colors ${isEditing ? "bg-indigo-50/40" : "hover:bg-slate-50/80"}`}>
                            {/* 1. Class */}
                            <td className="py-4 px-6 whitespace-nowrap">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editSectionForm.className}
                                  onChange={(e) =>
                                    setEditSectionForm((prev) => ({ ...prev, className: e.target.value }))
                                  }
                                  placeholder="e.g. I CSE A"
                                  className="w-full max-w-[200px] px-3 py-1.5 border border-indigo-400 rounded-lg font-bold text-xs text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                />
                              ) : (
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-slate-900 text-sm tracking-tight">
                                      {item.className}
                                    </span>
                                    <span
                                      className={`px-2 py-0.5 rounded-full font-bold text-[10px] border ${
                                        matched.length > 0
                                          ? "bg-purple-50 text-purple-700 border-purple-200"
                                          : "bg-amber-50 text-amber-700 border-amber-200"
                                      }`}
                                    >
                                      {matched.length} {matched.length === 1 ? "Student" : "Students"}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-400 mt-0.5">
                                    {item.department || "All Departments"} {item.year ? `• ${item.year}` : ""}
                                  </div>
                                </div>
                              )}
                            </td>

                            {/* 2. Starting number */}
                            <td className="py-4 px-6 whitespace-nowrap">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editSectionForm.startReg}
                                  onChange={(e) =>
                                    setEditSectionForm((prev) => ({ ...prev, startReg: e.target.value }))
                                  }
                                  placeholder="e.g. 24CS001"
                                  className="w-full max-w-[160px] px-3 py-1.5 border border-indigo-400 rounded-lg font-mono font-bold text-xs text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                />
                              ) : (
                                <span className="font-mono font-bold text-slate-800 bg-slate-100 border border-slate-200/90 px-3 py-1.5 rounded-lg text-xs tracking-wider">
                                  {item.startReg || "—"}
                                </span>
                              )}
                            </td>

                            {/* 3. Ending number */}
                            <td className="py-4 px-6 whitespace-nowrap">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editSectionForm.endReg}
                                  onChange={(e) =>
                                    setEditSectionForm((prev) => ({ ...prev, endReg: e.target.value }))
                                  }
                                  placeholder="e.g. 24CS060"
                                  className="w-full max-w-[160px] px-3 py-1.5 border border-indigo-400 rounded-lg font-mono font-bold text-xs text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                />
                              ) : (
                                <span className="font-mono font-bold text-slate-800 bg-slate-100 border border-slate-200/90 px-3 py-1.5 rounded-lg text-xs tracking-wider">
                                  {item.endReg || "—"}
                                </span>
                              )}
                            </td>

                            {/* 4. Edit/delete */}
                            <td className="py-4 px-6 whitespace-nowrap text-center">
                              {isEditing ? (
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    type="button"
                                    onClick={saveEditSection}
                                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition cursor-pointer flex items-center gap-1 shadow-2xs"
                                  >
                                    <span>💾</span> Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEditSection}
                                    className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs transition cursor-pointer"
                                  >
                                    <span>✕</span> Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-2">
                                  {/* Edit Button */}
                                  <button
                                    type="button"
                                    onClick={() => startEditSection(item)}
                                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-indigo-300 bg-white hover:bg-indigo-50 text-indigo-700 font-bold text-xs transition cursor-pointer flex items-center gap-1 shadow-2xs"
                                    title="Edit section name and register number range"
                                  >
                                    <span>✏️</span>
                                    <span>Edit</span>
                                  </button>

                                  {/* Delete Button */}
                                  <button
                                    type="button"
                                    onClick={() => deleteSection(item.id, item.className)}
                                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-rose-300 bg-white hover:bg-rose-50 text-rose-700 font-bold text-xs transition cursor-pointer flex items-center gap-1 shadow-2xs"
                                    title="Delete class section"
                                  >
                                    <span>🗑️</span>
                                    <span>Delete</span>
                                  </button>

                                  {/* PDF Download Button */}
                                  <button
                                    type="button"
                                    onClick={() => downloadClassSectionPdf(item)}
                                    disabled={isDownloading || matched.length === 0}
                                    className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition cursor-pointer flex items-center gap-1 shadow-2xs disabled:opacity-40"
                                    title={`Download official PDF for ${item.className}`}
                                  >
                                    {isDownloading ? (
                                      <>
                                        <span className="animate-spin">🔄</span>
                                        <span>PDF…</span>
                                      </>
                                    ) : (
                                      <>
                                        <span>📥</span>
                                        <span>PDF</span>
                                      </>
                                    )}
                                  </button>

                                  {/* Preview Student Drawer Toggle */}
                                  <button
                                    type="button"
                                    onClick={() => setPreviewingSectionId(isPreviewOpen ? null : item.id)}
                                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-semibold transition cursor-pointer"
                                    title="Preview enrolled students in this range"
                                  >
                                    {isPreviewOpen ? "▲ Hide" : "▼ List"}
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>

                          {/* Expandable Preview of Enrolled Students */}
                          {isPreviewOpen && (
                            <tr className="bg-slate-50/70 border-b border-slate-200 animate-fadeIn">
                              <td colSpan={4} className="p-4 px-6">
                                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className="text-base">🎓</span>
                                      <h4 className="font-bold text-slate-800 text-xs">
                                        Students matching {item.className}
                                        <span className="text-slate-400 font-normal ml-1.5 font-mono">
                                          ({item.startReg || "Start"} to {item.endReg || "End"})
                                        </span>
                                      </h4>
                                    </div>
                                    <span className="font-bold text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-md border border-purple-200 text-xs">
                                      {matched.length} {matched.length === 1 ? "Student" : "Students"} Matched
                                    </span>
                                  </div>

                                  {matched.length > 0 ? (
                                    <div className="max-h-56 overflow-y-auto">
                                      <table className="w-full text-left text-xs border-collapse">
                                        <thead>
                                          <tr className="bg-slate-100/80 text-slate-600 font-bold border-b border-slate-200">
                                            <th className="py-2 px-3">#</th>
                                            <th className="py-2 px-3">Name</th>
                                            <th className="py-2 px-3">Register Number</th>
                                            <th className="py-2 px-3">Department</th>
                                            <th className="py-2 px-3">Year</th>
                                            <th className="py-2 px-3">Email</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {matched.map((s, idx) => (
                                            <tr key={s.id} className="hover:bg-purple-50/40">
                                              <td className="py-1.5 px-3 font-mono text-slate-400">{idx + 1}</td>
                                              <td className="py-1.5 px-3 font-semibold text-slate-800">{s.fullName}</td>
                                              <td className="py-1.5 px-3 font-mono font-bold text-slate-700">
                                                {s.registerNumber || "—"}
                                              </td>
                                              <td className="py-1.5 px-3 text-slate-600">{s.department || "—"}</td>
                                              <td className="py-1.5 px-3 text-slate-600">{s.year || "—"}</td>
                                              <td className="py-1.5 px-3 font-mono text-slate-500">{s.email}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <div className="py-4 text-center text-slate-500 bg-slate-50 rounded-lg">
                                      <p className="font-medium text-amber-700">No students match this register range.</p>
                                      <p className="text-[11px] text-slate-400 mt-0.5">
                                        Check starting ({item.startReg}) and ending ({item.endReg}) register numbers or click Edit to update them.
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================== ADD CLASS / SECTION MODAL ===================== */}
      {showAddSectionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">📑</span>
                <h3 className="text-base font-bold text-slate-900">Add Class / Section</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddSectionModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddSection} className="space-y-4 text-xs">
              {/* Class Name */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Class Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={addSectionForm.className}
                  onChange={(e) => setAddSectionForm((prev) => ({ ...prev, className: e.target.value }))}
                  placeholder="e.g. I CSE A, II CSE B, III IT A"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Suggested format: &lt;Year Roman&gt; &lt;Dept Code&gt; &lt;Section&gt; (e.g. I CSE A)
                </p>
              </div>

              {/* Department */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">Department</label>
                <select
                  value={addSectionForm.department}
                  onChange={(e) => setAddSectionForm((prev) => ({ ...prev, department: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-800 font-semibold focus:ring-2 focus:ring-purple-500 focus:outline-none bg-white"
                >
                  {allDepartments.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              {/* Year */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">Academic Year</label>
                <select
                  value={addSectionForm.year}
                  onChange={(e) => setAddSectionForm((prev) => ({ ...prev, year: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-800 font-semibold focus:ring-2 focus:ring-purple-500 focus:outline-none bg-white"
                >
                  <option value="1st Year">1st Year (I)</option>
                  <option value="2nd Year">2nd Year (II)</option>
                  <option value="3rd Year">3rd Year (III)</option>
                  <option value="4th Year">4th Year (IV)</option>
                </select>
              </div>

              {/* Register Range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Starting Number</label>
                  <input
                    type="text"
                    value={addSectionForm.startReg}
                    onChange={(e) => setAddSectionForm((prev) => ({ ...prev, startReg: e.target.value }))}
                    placeholder="e.g. 24CS001"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold text-slate-800 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Ending Number</label>
                  <input
                    type="text"
                    value={addSectionForm.endReg}
                    onChange={(e) => setAddSectionForm((prev) => ({ ...prev, endReg: e.target.value }))}
                    placeholder="e.g. 24CS060"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold text-slate-800 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Matched Count Preview */}
              <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-xl flex items-center justify-between">
                <span className="text-[11px] text-purple-900 font-medium">Currently enrolled students in DB:</span>
                <span className="font-extrabold text-purple-700 text-xs">
                  {
                    getStudentsForClassSection(
                      {
                        id: "temp",
                        className: addSectionForm.className,
                        department: addSectionForm.department,
                        year: addSectionForm.year,
                        startReg: addSectionForm.startReg,
                        endReg: addSectionForm.endReg,
                      },
                      students
                    ).length
                  }{" "}
                  Students
                </span>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddSectionModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-bold hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <span>+</span> Add Class Section
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== ADD STUDENT MODAL ===================== */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎓</span>
                <h3 className="text-base font-bold text-slate-900">Add New Student</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateStudent} className="space-y-4 text-xs">
              {createError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl font-medium">
                  {createError}
                </div>
              )}

              {/* Full Name */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Student Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  value={createForm.fullName}
                  onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Register Number */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Register Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 21CS101"
                  value={createForm.registerNumber}
                  onChange={(e) => setCreateForm({ ...createForm, registerNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 font-mono font-bold focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Department & Year in 2 Columns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Department</label>
                  <select
                    value={createForm.department || ""}
                    onChange={(e) => setCreateForm({ ...createForm, department: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    {PRESET_DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Academic Year</label>
                  <select
                    value={createForm.year || ""}
                    onChange={(e) => setCreateForm({ ...createForm, year: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    {PRESET_YEARS.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Email / Mail */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Mail (Email Address) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. student@college.edu"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-700 font-bold">
                    Login Password <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setCreateForm({ ...createForm, password: generateRandomPassword() })}
                    className="text-emerald-600 hover:text-emerald-700 text-[11px] font-semibold cursor-pointer"
                  >
                    🎲 Generate Random
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showCreatePassword ? "text" : "password"}
                    required
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    className="w-full px-3 py-2 pr-9 border border-slate-300 rounded-xl bg-slate-50 font-mono focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePassword(!showCreatePassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    {showCreatePassword ? "👁️‍🗨️" : "👁️"}
                  </button>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {createSubmitting ? "Adding…" : "Add Student"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== EDIT STUDENT MODAL ===================== */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">✏️</span>
                <h3 className="text-base font-bold text-slate-900">Edit Student Credentials</h3>
              </div>
              <button
                onClick={() => setEditingStudent(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateStudent} className="space-y-4 text-xs">
              {editError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl font-medium">
                  {editError}
                </div>
              )}

              {/* Full Name */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">Student Name</label>
                <input
                  type="text"
                  required
                  value={editForm.fullName}
                  onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Register Number */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">Register Number</label>
                <input
                  type="text"
                  required
                  value={editForm.registerNumber}
                  onChange={(e) => setEditForm({ ...editForm, registerNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 font-mono font-bold focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Department & Year */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Department</label>
                  <select
                    value={editForm.department || ""}
                    onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="">No Department</option>
                    {allDepartments.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Academic Year</label>
                  <select
                    value={editForm.year || ""}
                    onChange={(e) => setEditForm({ ...editForm, year: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="">No Year</option>
                    {allYears.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Mail */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">Mail (Email Address)</label>
                <input
                  type="email"
                  required
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-700 font-bold">Password</label>
                  <button
                    type="button"
                    onClick={() => setEditForm({ ...editForm, password: generateRandomPassword() })}
                    className="text-emerald-600 hover:text-emerald-700 text-[11px] font-semibold cursor-pointer"
                  >
                    🎲 Generate New
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showEditPassword ? "text" : "password"}
                    value={editForm.password || ""}
                    onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                    className="w-full px-3 py-2 pr-9 border border-slate-300 rounded-xl bg-slate-50 font-mono focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    {showEditPassword ? "👁️‍🗨️" : "👁️"}
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {editSubmitting ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== DELETE CONFIRMATION MODAL ===================== */}
      {studentToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200 animate-scaleUp text-xs">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-xl shrink-0">
                ⚠️
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Delete Student Record?</h3>
                <p className="text-slate-500 text-[11px] mt-0.5">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-slate-600 mb-4 leading-relaxed">
              Are you sure you want to delete student{" "}
              <strong className="text-slate-800">{studentToDelete.fullName}</strong> (
              <span className="font-mono font-bold text-slate-700">{studentToDelete.registerNumber}</span>)?
            </p>

            {deleteError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl font-medium mb-3">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setStudentToDelete(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold hover:bg-slate-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteStudent}
                disabled={deleteSubmitting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                {deleteSubmitting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== BULK UPLOAD MODAL ===================== */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-scaleUp text-xs">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-xl">
                  📤
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Bulk Upload Student Credentials
                    <span className="bg-indigo-500/30 text-indigo-200 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-indigo-400/30">
                      Excel & CSV
                    </span>
                  </h3>
                  <p className="text-slate-300 text-[11px] mt-0.5">
                    Import multiple students with registration numbers, department allocations, and auto-generated passwords.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBulkModal(false)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center text-sm font-bold transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Sample Template Download Card */}
              <div className="bg-gradient-to-br from-indigo-50/80 via-blue-50/50 to-white border border-indigo-200/80 rounded-2xl p-5 shadow-xs">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📥</span>
                      <h4 className="font-bold text-slate-900 text-sm">Download Official Sample Files</h4>
                    </div>
                    <p className="text-slate-600 text-xs leading-relaxed max-w-xl">
                      Download the pre-formatted template with standard headers to easily populate student records. Both Excel (<span className="font-semibold text-slate-800">.xlsx</span>) and CSV (<span className="font-semibold text-slate-800">.csv</span>) formats are provided below:
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                      <span className="text-slate-500 font-semibold">Expected Columns:</span>
                      <span className="bg-white px-2 py-0.5 rounded-md border border-slate-200 font-mono text-slate-700 font-medium">Name</span>
                      <span className="bg-white px-2 py-0.5 rounded-md border border-slate-200 font-mono text-slate-700 font-medium">department</span>
                      <span className="bg-white px-2 py-0.5 rounded-md border border-slate-200 font-mono text-slate-700 font-medium">Register number</span>
                      <span className="bg-white px-2 py-0.5 rounded-md border border-slate-200 font-mono text-slate-700 font-medium">year</span>
                      <span className="bg-white px-2 py-0.5 rounded-md border border-indigo-300 font-mono text-indigo-700 font-bold">mail *</span>
                      <span className="bg-white px-2 py-0.5 rounded-md border border-slate-200 font-mono text-slate-700 font-medium">password</span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5 shrink-0 w-full md:w-auto">
                    <button
                      type="button"
                      onClick={() => downloadSampleTemplate("csv")}
                      disabled={downloadingSample !== null}
                      className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-bold text-xs shadow-xs hover:border-slate-400 transition cursor-pointer disabled:opacity-50"
                    >
                      <span>📄</span>
                      {downloadingSample === "csv" ? "Downloading…" : "Sample CSV (.csv)"}
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadSampleTemplate("excel")}
                      disabled={downloadingSample !== null}
                      className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition cursor-pointer disabled:opacity-50"
                    >
                      <span>📊</span>
                      {downloadingSample === "excel" ? "Downloading…" : "Sample Excel (.xlsx)"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Upload Dropzone */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv, text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelected(file);
                  }}
                />

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleFileSelected(file);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-7 text-center transition cursor-pointer flex flex-col items-center justify-center gap-3 ${
                    isDragging
                      ? "border-indigo-500 bg-indigo-50/70 scale-[0.99]"
                      : bulkFile
                      ? "border-emerald-300 bg-emerald-50/30 hover:bg-emerald-50/50"
                      : "border-slate-300 bg-slate-50/60 hover:bg-slate-50 hover:border-slate-400"
                  }`}
                >
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl transition ${
                    bulkFile ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700"
                  }`}>
                    {bulkFile ? "📋" : "📁"}
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm">
                      {bulkFile ? bulkFile.name : "Choose an Excel or CSV file or drag & drop here"}
                    </p>
                    <p className="text-slate-500 text-xs mt-1">
                      {bulkFile
                        ? `${(bulkFile.size / 1024).toFixed(1)} KB — Click to change or drop another file`
                        : "Supports .xlsx, .xls, and .csv files up to 10MB"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-slate-600 font-semibold text-[11px] shadow-2xs">
                      Excel (.xlsx, .xls)
                    </span>
                    <span className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-slate-600 font-semibold text-[11px] shadow-2xs">
                      CSV (.csv)
                    </span>
                  </div>
                </div>
              </div>

              {/* Error Message */}
              {bulkError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl font-medium flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span>⚠️</span>
                    <span>{bulkError}</span>
                  </div>
                  <button onClick={() => setBulkError(null)} className="text-rose-500 hover:text-rose-700 font-bold">
                    ✕
                  </button>
                </div>
              )}

              {/* Result Summary */}
              {bulkResult && (
                <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-emerald-900 text-sm">
                      <span>🎉</span>
                      <span>Bulk Upload Successful</span>
                    </div>
                    <span className="text-[11px] bg-emerald-200/80 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                      {bulkResult.totalProcessed} Processed
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-200 text-center">
                      <div className="text-slate-500 text-[10px] uppercase font-bold">Total</div>
                      <div className="text-base font-extrabold text-slate-800">{bulkResult.totalProcessed}</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-200 text-center">
                      <div className="text-emerald-600 text-[10px] uppercase font-bold">Created</div>
                      <div className="text-base font-extrabold text-emerald-700">+{bulkResult.createdCount}</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-200 text-center">
                      <div className="text-blue-600 text-[10px] uppercase font-bold">Updated</div>
                      <div className="text-base font-extrabold text-blue-700">{bulkResult.updatedCount}</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-200 text-center">
                      <div className="text-rose-600 text-[10px] uppercase font-bold">Errors</div>
                      <div className="text-base font-extrabold text-rose-700">{bulkResult.errors.length}</div>
                    </div>
                  </div>

                  {bulkResult.errors.length > 0 && (
                    <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs">
                      <div className="font-bold mb-1">Warnings / Skipped Rows:</div>
                      <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                        {bulkResult.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Live Preview Table */}
              {parsedRows.length > 0 && (
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800">Spreadsheet Live Preview</span>
                      <span className="bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded-full text-[10px]">
                        {parsedRows.length} Rows
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-md">
                        ✓ {parsedRows.filter((r) => r.isValid).length} Ready
                      </span>
                      {parsedRows.some((r) => !r.isValid) && (
                        <span className="bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-md">
                          ⚠ {parsedRows.filter((r) => !r.isValid).length} Issues
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="max-h-[260px] overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="sticky top-0 bg-white shadow-2xs border-b border-slate-200 text-[11px] text-slate-600 font-bold uppercase">
                        <tr>
                          <th className="py-2.5 px-3">#</th>
                          <th className="py-2.5 px-3">Name</th>
                          <th className="py-2.5 px-3">department</th>
                          <th className="py-2.5 px-3">Register number</th>
                          <th className="py-2.5 px-3">year</th>
                          <th className="py-2.5 px-3">mail</th>
                          <th className="py-2.5 px-3">password</th>
                          <th className="py-2.5 px-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[11px]">
                        {parsedRows.slice(0, 100).map((row) => (
                          <tr
                            key={row.rowNumber}
                            className={`transition hover:bg-slate-50/80 ${
                              !row.isValid ? "bg-rose-50/40" : ""
                            }`}
                          >
                            <td className="py-2 px-3 text-slate-400 font-mono">{row.rowNumber}</td>
                            <td className="py-2 px-3 font-semibold text-slate-800">{row.fullName}</td>
                            <td className="py-2 px-3 text-slate-600">{row.department || <span className="text-slate-400">—</span>}</td>
                            <td className="py-2 px-3 font-mono font-bold text-slate-700">{row.registerNumber || <span className="text-slate-400 font-normal">—</span>}</td>
                            <td className="py-2 px-3 text-slate-600">{row.year || <span className="text-slate-400">—</span>}</td>
                            <td className="py-2 px-3 font-mono text-slate-800">{row.email}</td>
                            <td className="py-2 px-3">
                              {row.password ? (
                                <span className="font-mono text-slate-700 font-medium">••••••</span>
                              ) : (
                                <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded text-[10px] font-semibold border border-amber-200">
                                  🎲 Auto-gen
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {row.isValid ? (
                                <div className="inline-flex items-center gap-1.5 justify-end">
                                  <span className="text-emerald-600 font-bold">✓ Valid</span>
                                  {row.note && (
                                    <span
                                      className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-[10px] font-semibold border border-indigo-200"
                                      title={row.note}
                                    >
                                      🎲 Unique Email
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-rose-600 font-bold" title={row.validationError}>
                                  ⚠ {row.validationError}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {parsedRows.length > 100 && (
                    <div className="p-2 bg-slate-50 text-center text-slate-500 text-[11px] border-t border-slate-200">
                      Showing first 100 of {parsedRows.length} records. All valid records will be imported.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
              <div className="text-[11px] text-slate-500">
                {parsedRows.length > 0 ? (
                  <span>
                    Ready to import <strong className="text-slate-800">{parsedRows.filter((r) => r.isValid).length}</strong> student accounts.
                  </span>
                ) : (
                  <span>Upload an Excel or CSV file to start previewing.</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold hover:bg-slate-100 transition cursor-pointer"
                >
                  {bulkResult ? "Close" : "Cancel"}
                </button>
                <button
                  type="button"
                  onClick={handleImportBulk}
                  disabled={
                    bulkSubmitting ||
                    (parsedRows.length === 0 && !bulkFile) ||
                    (parsedRows.length > 0 && parsedRows.filter((r) => r.isValid).length === 0)
                  }
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {bulkSubmitting ? (
                    <>
                      <span className="animate-spin">🔄</span>
                      <span>Importing…</span>
                    </>
                  ) : (
                    <>
                      <span>🚀</span>
                      <span>
                        Import {parsedRows.filter((r) => r.isValid).length > 0 ? `${parsedRows.filter((r) => r.isValid).length} Students` : "File"}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== SECTION GROUPING & PDF MODAL ===================== */}
      {showGroupingModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-scaleUp text-xs">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center text-xl">
                  📑
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Group Students by Register Number
                    <span className="bg-purple-500/30 text-purple-200 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-purple-400/30">
                      Section PDF Generator
                    </span>
                  </h3>
                  <p className="text-slate-300 text-[11px] mt-0.5">
                    Select department → Enter number of sections → Enter register ranges → Download separate PDF for each section.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowGroupingModal(false)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center text-sm font-bold transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Step 1 & 2 Controls Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Step 1: Ask Department */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 font-extrabold text-[11px] flex items-center justify-center">
                        1
                      </span>
                      <span>Department</span>
                    </label>
                    <span className="text-[11px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                      {departmentStudents.length} Students
                    </span>
                  </div>

                  <select
                    value={groupDept}
                    onChange={(e) => handleDeptChange(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-slate-800 font-semibold focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  >
                    <option value="ALL">All Departments ({students.length} students)</option>
                    {allDepartments.map((dept) => {
                      const count = students.filter((s) => s.department === dept).length;
                      return (
                        <option key={dept} value={dept}>
                          {dept} ({count} {count === 1 ? "student" : "students"})
                        </option>
                      );
                    })}
                  </select>

                  <div className="text-[11px] text-slate-500 leading-relaxed">
                    {departmentStudents.length > 0 ? (
                      <span>
                        Register number range spans from{" "}
                        <strong className="font-mono text-slate-700">
                          {departmentStudents[0].registerNumber || "—"}
                        </strong>{" "}
                        to{" "}
                        <strong className="font-mono text-slate-700">
                          {departmentStudents[departmentStudents.length - 1].registerNumber || "—"}
                        </strong>
                      </span>
                    ) : (
                      <span className="text-amber-600 font-medium">No students registered in this department.</span>
                    )}
                  </div>
                </div>

                {/* Step 2: Number of Sections */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 font-extrabold text-[11px] flex items-center justify-center">
                        2
                      </span>
                      <span>Number of Sections</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setSections(calculateEvenSections(numSections, departmentStudents))}
                      className="text-[11px] text-purple-600 hover:text-purple-700 font-bold flex items-center gap-1 cursor-pointer"
                      title="Evenly distribute register numbers across sections"
                    >
                      <span>⚡</span> Auto-Balance Ranges
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={26}
                      value={numSections}
                      onChange={(e) => handleNumSectionsChange(parseInt(e.target.value) || 1)}
                      className="w-20 px-3 py-2 border border-slate-300 rounded-xl bg-white font-mono font-bold text-center text-slate-800 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    />

                    <div className="flex items-center gap-1.5 flex-1">
                      {[2, 3, 4, 5].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => handleNumSectionsChange(preset)}
                          className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${
                            numSections === preset
                              ? "bg-purple-600 text-white shadow-2xs"
                              : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          {preset} Sec
                        </button>
                      ))}
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500">
                    Calculates ~{Math.ceil(departmentStudents.length / Math.max(1, numSections))} students per section.
                  </p>
                </div>
              </div>

              {/* Error Alert */}
              {groupingError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl font-medium flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span>⚠️</span>
                    <span>{groupingError}</span>
                  </div>
                  <button onClick={() => setGroupingError(null)} className="text-rose-500 hover:text-rose-700 font-bold">
                    ✕
                  </button>
                </div>
              )}

              {/* Step 3: Enter Range of Each Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 font-extrabold text-[11px] flex items-center justify-center">
                      3
                    </span>
                    <span>Enter Register Number Range & Download Separate PDF for Each Section:</span>
                  </h4>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includePasswordsInPdf}
                      onChange={(e) => setIncludePasswordsInPdf(e.target.checked)}
                      className="rounded text-purple-600 focus:ring-purple-500"
                    />
                    <span>Include Passwords in PDF</span>
                  </label>
                </div>

                <div className="space-y-3">
                  {sections.map((sec, idx) => {
                    const matched = getStudentsForSection(sec, departmentStudents);
                    const isPreviewOpen = previewSectionId === sec.id;
                    const isDownloadingThis = downloadingSectionId === sec.id;

                    return (
                      <div
                        key={sec.id}
                        className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs hover:border-purple-200 transition space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 flex-1 w-full sm:w-auto">
                            <span className="w-7 h-7 rounded-lg bg-purple-100 text-purple-800 font-bold text-xs flex items-center justify-center shrink-0">
                              {String.fromCharCode(65 + idx)}
                            </span>
                            <input
                              type="text"
                              value={sec.name}
                              onChange={(e) => updateSectionField(sec.id, "name", e.target.value)}
                              placeholder="Section Name"
                              className="font-bold text-slate-800 text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-purple-500 focus:outline-none w-36"
                            />
                            <span
                              className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] border ${
                                matched.length > 0
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-amber-50 text-amber-700 border-amber-200"
                              }`}
                            >
                              {matched.length} {matched.length === 1 ? "Student" : "Students"} Matched
                            </span>
                          </div>

                          {/* Individual Section PDF Download Button */}
                          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                            <button
                              type="button"
                              onClick={() => setPreviewSectionId(isPreviewOpen ? null : sec.id)}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium text-[11px] cursor-pointer"
                            >
                              {isPreviewOpen ? "Hide Preview" : "Preview List"}
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadSingleSectionPdf(sec)}
                              disabled={isDownloadingThis || matched.length === 0}
                              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition shadow-xs cursor-pointer disabled:opacity-50"
                              title={`Download official PDF for ${sec.name}`}
                            >
                              {isDownloadingThis ? (
                                <>
                                  <span className="animate-spin">🔄</span>
                                  <span>Generating…</span>
                                </>
                              ) : (
                                <>
                                  <span>📥</span>
                                  <span>Download {sec.name} PDF</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Range Inputs */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              Start Register Number:
                            </label>
                            <input
                              type="text"
                              value={sec.startReg}
                              onChange={(e) => updateSectionField(sec.id, "startReg", e.target.value)}
                              placeholder="e.g. 21CS001"
                              className="w-full px-3 py-1.5 border border-slate-300 rounded-xl font-mono text-slate-800 font-bold text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              End Register Number:
                            </label>
                            <input
                              type="text"
                              value={sec.endReg}
                              onChange={(e) => updateSectionField(sec.id, "endReg", e.target.value)}
                              placeholder="e.g. 21CS060"
                              className="w-full px-3 py-1.5 border border-slate-300 rounded-xl font-mono text-slate-800 font-bold text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                            />
                          </div>
                        </div>

                        {/* Expandable Preview of Matched Students */}
                        {isPreviewOpen && (
                          <div className="pt-2 border-t border-slate-100 space-y-2 animate-fadeIn">
                            <div className="flex items-center justify-between text-[11px] text-slate-500">
                              <span>Students in this range:</span>
                              <span className="font-bold text-slate-700">{matched.length} students</span>
                            </div>

                            {matched.length > 0 ? (
                              <div className="max-h-40 overflow-y-auto space-y-1">
                                <table className="w-full text-left text-[11px] border-collapse">
                                  <thead>
                                    <tr className="bg-slate-100 text-slate-600 font-bold">
                                      <th className="py-1 px-2">#</th>
                                      <th className="py-1 px-2">Name</th>
                                      <th className="py-1 px-2">Register Number</th>
                                      <th className="py-1 px-2">Year</th>
                                      <th className="py-1 px-2">Email</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {matched.map((s, sIdx) => (
                                      <tr key={s.id} className="hover:bg-purple-50/50">
                                        <td className="py-1 px-2 text-slate-400 font-mono">{sIdx + 1}</td>
                                        <td className="py-1 px-2 font-semibold text-slate-800">{s.fullName}</td>
                                        <td className="py-1 px-2 font-mono font-bold text-slate-700">{s.registerNumber || "—"}</td>
                                        <td className="py-1 px-2 text-slate-600">{s.year || "—"}</td>
                                        <td className="py-1 px-2 font-mono text-slate-600">{s.email}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div className="p-3 bg-amber-50 text-amber-800 rounded-lg text-center font-medium">
                                No students match this register range. Check the start and end values.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="text-[11px] text-slate-500">
                <span>
                  Total Cohort: <strong className="text-slate-800">{departmentStudents.length}</strong> | Allocated across sections:{" "}
                  <strong className="text-purple-700">
                    {sections.reduce((acc, sec) => acc + getStudentsForSection(sec, departmentStudents).length, 0)}
                  </strong>
                </span>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setShowGroupingModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold hover:bg-slate-100 transition cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={downloadAllSectionsZip}
                  disabled={downloadingZip || departmentStudents.length === 0}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  title="Download all section PDFs bundled in a single ZIP file"
                >
                  {downloadingZip ? (
                    <>
                      <span className="animate-spin">🔄</span>
                      <span>Creating ZIP…</span>
                    </>
                  ) : (
                    <>
                      <span>📦</span>
                      <span>Download All Sections (ZIP)</span>
                    </>
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
