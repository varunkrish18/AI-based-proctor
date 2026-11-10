import type { StudentUser } from "../types";

export const CLASS_SECTIONS_STORAGE_KEY = "proctor_class_sections_registry_v2";

export interface ClassSectionItem {
  id: string;
  className: string;
  department?: string;
  year?: string;
  startReg: string;
  endReg: string;
}

// Convert year string to Roman numeral (1st Year -> I, 2nd Year -> II, etc.)
export function getYearRoman(yearStr?: string | null): string {
  if (!yearStr) return "I";
  const y = yearStr.trim().toUpperCase();
  if (y.includes("4") || y.includes("IV") || y.includes("FOURTH")) return "IV";
  if (y.includes("3") || y.includes("III") || y.includes("THIRD")) return "III";
  if (y.includes("2") || y.includes("II") || y.includes("SECOND")) return "II";
  if (y.includes("1") || y.includes("I") || y.includes("FIRST")) return "I";
  return y;
}

// Convert department name to standard short code (Computer Science -> CSE, Information Tech -> IT, etc.)
export function getDeptShortCode(dept?: string | null): string {
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

export function matchesYear(studentYear?: string | null, targetYear?: string | null): boolean {
  if (!targetYear || targetYear === "ALL") return true;
  const r1 = getYearRoman(studentYear);
  const r2 = getYearRoman(targetYear);
  return r1 === r2;
}

// Get matching students for a ClassSectionItem
export function getStudentsForClassSection(sec: ClassSectionItem, pool: StudentUser[]): StudentUser[] {
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

// Default class sections matching user sketch and registered students
export function generateDefaultSections(studs: StudentUser[]): ClassSectionItem[] {
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
export function loadSavedClassSections(studs?: StudentUser[]): ClassSectionItem[] {
  try {
    const saved = localStorage.getItem(CLASS_SECTIONS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Failed to load saved class sections", e);
  }

  return generateDefaultSections(studs || []);
}

export function saveClassSections(updated: ClassSectionItem[]): void {
  try {
    localStorage.setItem(CLASS_SECTIONS_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn("Failed to persist class sections", e);
  }
}
