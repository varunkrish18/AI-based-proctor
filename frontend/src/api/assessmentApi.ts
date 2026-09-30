export interface TestCase {
  input: any;
  expected: any;
  isHidden: boolean;
}

export interface Question {
  id: string;
  title: string;
  description: string;
  hint: string;
  useCase: string;
  rfConfidence: number;
  rfFeatures?: Record<string, number>;
  difficulty: "Easy" | "Medium" | "Hard";
  functionName: string;
  starterCode: string;
  testCases: TestCase[];
  tags: string[];
}

export interface TestCaseResult {
  testIndex: number;
  passed: boolean;
  actualOutput?: any;
  expectedOutput?: any;
  runtimeMs: number;
  error?: string;
  isHidden: boolean;
}

export interface CodeExecutionResponse {
  success: boolean;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  score: number;
  results: TestCaseResult[];
  totalRuntimeMs: number;
  compilationError?: string;
}

export interface AssessmentReportItem {
  submissionId: string;
  submittedAt: string;
  candidateId: string;
  candidateName: string;
  questionId: string;
  questionTitle: string;
  questionHint: string;
  useCase: string;
  difficulty: string;
  answers: string;
  timeConsumedSec: number;
  timeConsumedFormatted: string;
  evaluations: {
    scorePercent: number;
    passedCases: number;
    totalCases: number;
    failedCases: number;
    totalRuntimeMs: number;
    status: string;
    testResults?: any[];
    evalNotes?: string;
  };
}

const AI_BASE_URL = (import.meta.env.VITE_AI_URL as string) || "http://localhost:8000";

export async function fetchQuestions(params?: { useCase?: string; difficulty?: string; search?: string }): Promise<Question[]> {
  const query = new URLSearchParams();
  if (params?.useCase) query.append("useCase", params.useCase);
  if (params?.difficulty) query.append("difficulty", params.difficulty);
  if (params?.search) query.append("search", params.search);

  const res = await fetch(`${AI_BASE_URL}/v1/assessment/questions?${query.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch assessment questions");
  return res.json();
}

export async function generateNewQuestions(problemHint: string, count: number = 65, apiKey?: string): Promise<Question[]> {
  const res = await fetch(`${AI_BASE_URL}/v1/assessment/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ problemHint, count, apiKey }),
  });
  if (!res.ok) throw new Error("Failed to generate questions via AI");
  return res.json();
}

export async function executeCode(questionId: string, code: string): Promise<CodeExecutionResponse> {
  const res = await fetch(`${AI_BASE_URL}/v1/assessment/run-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questionId, code }),
  });
  if (!res.ok) throw new Error("Code execution failed on server");
  return res.json();
}

export async function submitAssessmentSolution(data: {
  questionId: string;
  candidateId?: string;
  candidateName?: string;
  code: string;
  timeConsumedSec: number;
}): Promise<AssessmentReportItem> {
  const res = await fetch(`${AI_BASE_URL}/v1/assessment/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to submit assessment solution");
  return res.json();
}

export async function fetchAdminReports(): Promise<AssessmentReportItem[]> {
  const res = await fetch(`${AI_BASE_URL}/v1/assessment/reports`);
  if (!res.ok) throw new Error("Failed to fetch admin assessment reports");
  return res.json();
}

export async function fetchRfMetrics(): Promise<any> {
  const res = await fetch(`${AI_BASE_URL}/v1/assessment/rf-metrics`);
  if (!res.ok) throw new Error("Failed to fetch Random Forest metrics");
  return res.json();
}
